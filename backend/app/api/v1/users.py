"""
Tenant-Scoped User Management API Router (the IAM Control Panel backend).
Filename: backend/app/api/v1/users.py

Authoritative endpoints for Tenant Admins to list users, edit access, force password resets,
suspend/reactivate accounts and invite *external* identities, strictly isolated within their tenant
workspace.

Provisioning of internal staff is handled exclusively by the HR module
(``backend.app.domains.iam.provisioning``); the invite flow here can only create the external
identities listed in ``role_catalog.EXTERNAL_INVITE_ROLES``.

Security invariants:
  * ``company_id`` is enforced server-side on every target lookup; failures are audited.
  * Authority is evaluated from the freshly loaded ``res_users`` row, never from token claims or the
    in-memory role that ``get_current_user`` normalises (which aliases e.g. Data_Entry -> Admin).
  * Platform-wide ``Super_Admin`` is never writable here: the standardized ``Super_Admin`` role is stored
    as legacy role ``CEO`` + ``iam_role='Super_Admin'`` (tenant-scoped) and may only be granted by a
    tenant Owner/CEO or a platform Super Admin.
  * No plain-text password is ever generated for display, returned, logged or audited.
  * Every role change, suspension, reactivation, reset, invite and access denial is written to
    ``platform_audit_logs`` with the trusted-proxy-aware client IP.
"""

import dataclasses
import logging
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import inspect as sa_inspect, or_
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.database import PlatformSessionLocal, get_db
from backend.models import ResCompany, ResUser, TenantUser, User
from backend.api.dependencies import (
    TenantContext,
    get_current_user,
    get_tenant_context,
)
from backend.app.domains.hr.audit import AuditContext, append_audit_from_context, build_audit_context
from backend.app.services.notification_service import (
    NotificationDeliveryError,
    dispatch_temporary_credentials,
)
from backend.app.domains.iam.role_catalog import (
    EXTERNAL_INVITE_ROLES,
    WORKSPACE_ASSIGNABLE_ROLES,
    HR_REGISTRATION_REQUIRED_MESSAGE,
    PLATFORM_WIDE_LEGACY_ROLES,
    PRIVILEGED_IAM_ROLES,
    is_internal_or_privileged_role_name,
    legacy_role_for,
    normalize_role_token,
    resolve_external_role,
    resolve_internal_role,
)
from backend.two_tier_auth import hash_password, verify_password

logger = logging.getLogger("oxengl.api.users")

router = APIRouter(prefix="/api/v1/users", tags=["Tenant User Management"])
AVATAR_STORAGE_DIR = Path(__file__).resolve().parents[3] / "static" / "avatars"
MAX_AVATAR_BYTES = 5 * 1024 * 1024
_AVATAR_FORMATS = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
}

# ABAC keys that only make sense for external identities; dropped when an account is moved to an internal role.
_EXTERNAL_ONLY_ABAC_KEYS = ("external_identity", "read_only", "audit_scope_only")

# Authority levels (evaluated from the DB row).
LEVEL_NONE, LEVEL_ADMIN, LEVEL_OWNER, LEVEL_PLATFORM = 0, 1, 2, 3
_EMAIL_PATTERN = re.compile(
    r"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$",
    re.IGNORECASE,
)
_SMS_PLACEHOLDER_DOMAIN = "sms-invite.oxengl.invalid"


def _is_valid_invite_email(email: str) -> bool:
    local, separator, domain = email.rpartition("@")
    return bool(
        separator
        and len(email) <= 255
        and len(local) <= 64
        and not local.startswith(".")
        and not local.endswith(".")
        and ".." not in local
        and _EMAIL_PATTERN.fullmatch(email)
    )


def _normalize_invite_phone(value: str) -> str:
    phone = re.sub(r"[\s().-]", "", value)
    if phone.startswith("00"):
        phone = "+" + phone[2:]
    elif re.fullmatch(r"05\d{8}", phone):
        phone = "+966" + phone[1:]
    elif re.fullmatch(r"5\d{8}", phone):
        phone = "+966" + phone
    elif phone.startswith("966"):
        phone = "+" + phone

    if not re.fullmatch(r"\+[1-9]\d{7,14}", phone):
        raise ValueError("Enter a valid phone number in E.164 format (for example, +9665XXXXXXXX).")
    if phone.startswith("+966") and not re.fullmatch(r"\+9665\d{8}", phone):
        raise ValueError("Enter a valid Saudi mobile number, such as +9665XXXXXXXX or 05XXXXXXXX.")
    return phone


def _is_sms_placeholder_email(email: str) -> bool:
    return email.lower().endswith(f"@{_SMS_PLACEHOLDER_DOMAIN}")


def _sms_placeholder_email(user_id: uuid.UUID) -> str:
    return f"invite-{user_id.hex}@{_SMS_PLACEHOLDER_DOMAIN}"


class UserResponse(BaseModel):
    id: str
    email: str
    phone: Optional[str] = None
    sync_reference_id: Optional[str] = None
    avatar_url: Optional[str] = None
    full_name: str
    role: str
    iam_role: Optional[str] = None
    must_change_password: bool = False
    is_active: bool
    status: str = "active"
    created_at: Optional[datetime] = None
    tenant_id: str

    class Config:
        from_attributes = True


class InviteUserRequest(BaseModel):
    email: Optional[str] = Field(None, description="Email address of the external invitee")
    phone: Optional[str] = Field(None, description="E.164 phone number for SMS delivery")
    channel: Literal["email", "sms", "manual"] = Field(
        "email", description="Temporary credential delivery channel; 'manual' returns the password once to the admin"
    )
    role: str = Field("Guest", description="External identity type: Guest or External_Auditor")
    full_name: Optional[str] = Field(None, description="Full name of user")

    @field_validator("channel", mode="before")
    @classmethod
    def _normalize_channel(cls, value: Any) -> Any:
        return value.strip().lower() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _validate_delivery_address(self):
        if self.channel == "email":
            email = (self.email or "").strip().lower()
            if not _is_valid_invite_email(email):
                raise ValueError("A valid email address is required for email delivery.")
            self.email = email
            self.phone = None
            return self

        if self.channel == "manual":
            email = (self.email or "").strip().lower()
            phone = (self.phone or "").strip()
            if not email and not phone:
                raise ValueError("An email address or phone number is required to identify the account.")
            if email and not _is_valid_invite_email(email):
                raise ValueError("Enter a valid email address.")
            self.email = email or None
            self.phone = _normalize_invite_phone(phone) if phone else None
            return self

        phone = (self.phone or "").strip()
        if not phone:
            raise ValueError("A phone number is required for SMS delivery.")
        self.phone = _normalize_invite_phone(phone)
        if self.email:
            email = self.email.strip().lower()
            if not _is_valid_invite_email(email):
                raise ValueError("Enter a valid email address when providing an optional email.")
            self.email = email
        return self


class InviteUserResponse(BaseModel):
    status: str
    user_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    channel: Literal["email", "sms", "manual"]
    full_name: str
    role: str
    reset_dispatched: bool
    message: str
    temporary_password: Optional[str] = Field(None, description="Present ONLY for the manual channel")


class UpdateRoleRequest(BaseModel):
    role: str = Field(..., description="One of the standardized IAM roles (see GET /api/v1/users/roles)")


class RoleCatalogItem(BaseModel):
    value: str
    privileged: bool = False


class RoleCatalogResponse(BaseModel):
    roles: List[RoleCatalogItem]
    external_roles: List[RoleCatalogItem]
    can_assign_privileged: bool
    can_manage_users: bool


class UserActionResponse(BaseModel):
    status: str
    user_id: str
    is_active: Optional[bool] = None
    must_change_password: Optional[bool] = None
    reset_dispatched: Optional[bool] = None
    message: str


class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    sync_reference_id: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str
    iam_role: Optional[str] = None
    company_id: Optional[str] = None


class UserProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=64)

    @field_validator("full_name")
    @classmethod
    def _clean_full_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Full name cannot be empty.")
        return cleaned

    @field_validator("phone")
    @classmethod
    def _clean_phone(cls, value: Optional[str]) -> Optional[str]:
        cleaned = value.strip() if value is not None else None
        return cleaned or None


class ChangeOwnPasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=1024)
    new_password: str = Field(..., min_length=10, max_length=128)


class ForcePasswordResetRequest(BaseModel):
    require_password_change: bool = True


# ==============================================================================
# Authority & audit helpers
# ==============================================================================

@dataclass(frozen=True)
class IamActor:
    user: Any
    user_id: Optional[uuid.UUID]
    identifier: str
    company_id: Optional[uuid.UUID]
    level: int
    audit: AuditContext


def _authority_level(role: Optional[str], iam_role: Optional[str], is_superuser: bool) -> int:
    token = normalize_role_token(role).lower()
    if is_superuser or token in PLATFORM_WIDE_LEGACY_ROLES:
        return LEVEL_PLATFORM
    if token in ("owner", "ceo") or (iam_role or "") in PRIVILEGED_IAM_ROLES:
        return LEVEL_OWNER
    if token == "admin":
        return LEVEL_ADMIN
    return LEVEL_NONE


def _commit_audit(
    db: Session, ctx: AuditContext, action: str, outcome: str, tenant_id: Optional[uuid.UUID], target_id: Optional[uuid.UUID] = None
) -> None:
    """Persist an audit row immediately (used for decisions that end in an error response)."""
    append_audit_from_context(db, _with_target(ctx, target_id), action=action, outcome=outcome, tenant_id=tenant_id)
    db.commit()


def _with_target(ctx: AuditContext, target_id: Optional[uuid.UUID]) -> AuditContext:
    if not target_id:
        return ctx
    suffix = f"|target_user={target_id}"
    return dataclasses.replace(ctx, endpoint=(ctx.endpoint[: 255 - len(suffix)] + suffix)[:255])


def require_iam_admin(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IamActor:
    """Admin-only gate based on the freshly loaded account (not on token claims / normalised aliases)."""
    user_id = getattr(current_user, "id", None)
    row = None
    if user_id is not None:
        row = db.execute(
            select(
                ResUser.role, ResUser.iam_role, ResUser.is_superuser, ResUser.is_active,
                ResUser.company_id, ResUser.email,
            ).where(ResUser.id == user_id)
        ).first()
        # get_current_user overwrites the in-memory role with a normalised/token role; make sure that
        # never gets flushed back to the database by a later commit in this request.
        try:
            if sa_inspect(current_user).persistent:
                db.refresh(current_user)
        except Exception:  # pragma: no cover - defensive
            pass

    identifier = (row.email if row else getattr(current_user, "email", None)) or f"user:{user_id}"
    audit = build_audit_context(request, actor_id=user_id, actor_identifier=identifier)
    level = (
        _authority_level(row.role, row.iam_role, bool(row.is_superuser)) if row is not None and row.is_active else LEVEL_NONE
    )
    company_id = row.company_id if row is not None else None
    if level == LEVEL_NONE:
        is_master = (
            getattr(current_user, "_tier", None) == "master"
            or getattr(current_user, "is_superuser", False) is True
            or getattr(current_user, "is_super_admin", False) is True
            or str(getattr(current_user, "role", "")).lower() in ("super_admin", "superadmin")
        )
        if is_master and getattr(current_user, "is_active", True):
            level = LEVEL_PLATFORM
            company_id = getattr(current_user, "company_id", None)
        else:
            _commit_audit(db, audit, "IAM_ACCESS_DENIED:insufficient_role", "DENIED", company_id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: only workspace administrators may manage users.",
            )
    return IamActor(
        user=current_user, user_id=user_id, identifier=identifier, company_id=company_id, level=level, audit=audit
    )


def _tenant_scope(db: Session, actor: IamActor) -> Optional[List[uuid.UUID]]:
    """Company ids the actor may touch (own company + descendant branches); None = platform-wide."""
    if actor.level >= LEVEL_PLATFORM:
        return None
    if actor.company_id is None:
        return []
    scope = {actor.company_id}
    queue = [actor.company_id]
    while queue:
        parent = queue.pop(0)
        for (child_id,) in db.query(ResCompany.id).filter(ResCompany.parent_id == parent).all():
            if child_id not in scope:
                scope.add(child_id)
                queue.append(child_id)
    return list(scope)


def _organization_scope(db: Session, company_id: Optional[uuid.UUID]) -> List[uuid.UUID]:
    """Every company in the caller's organization: climb to the root ancestor, then collect all descendants."""
    if company_id is None:
        return []
    root = company_id
    seen = {root}
    while True:
        parent = db.query(ResCompany.parent_id).filter(ResCompany.id == root).scalar()
        if parent is None or parent in seen:
            break
        seen.add(parent)
        root = parent
    scope = {root}
    queue = [root]
    while queue:
        current = queue.pop(0)
        for (child_id,) in db.query(ResCompany.id).filter(ResCompany.parent_id == current).all():
            if child_id not in scope:
                scope.add(child_id)
                queue.append(child_id)
    return list(scope)


def _load_target(
    db: Session, actor: IamActor, user_id: str, action: str, *, allow_self: bool = False
) -> ResUser:
    """Resolve a target account with tenant isolation + hierarchy checks; every refusal is audited."""
    try:
        target_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user UUID format.")

    target = db.query(ResUser).filter(ResUser.id == target_uuid).first()
    if not target:
        if PlatformSessionLocal is not None:
            with PlatformSessionLocal() as p_db:
                unscoped = p_db.query(ResUser).filter(ResUser.id == target_uuid).first()
                if unscoped is not None:
                    _commit_audit(db, actor.audit, f"IAM_TENANT_ACCESS_DENIED:{action}", "DENIED", actor.company_id, target_uuid)
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Cross-tenant violation: You do not have permission to modify users from another tenant.",
                    )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    scope = _tenant_scope(db, actor)
    if scope is not None and target.company_id not in scope:
        _commit_audit(db, actor.audit, f"IAM_TENANT_ACCESS_DENIED:{action}", "DENIED", actor.company_id, target_uuid)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant violation: You do not have permission to modify users from another tenant.",
        )
    if target.deleted_at is not None:
        _commit_audit(db, actor.audit, f"IAM_{action}_DENIED:soft_deleted", "DENIED", target.company_id, target_uuid)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if not allow_self and actor.user_id is not None and target.id == actor.user_id:
        _commit_audit(db, actor.audit, f"IAM_{action}_DENIED:self_target", "DENIED", target.company_id, target_uuid)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot perform this action on your own account.",
        )

    target_level = _authority_level(target.role, target.iam_role, bool(target.is_superuser))
    if target_level > actor.level:
        _commit_audit(db, actor.audit, f"IAM_{action}_DENIED:higher_authority_target", "DENIED", target.company_id, target_uuid)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot modify an account with higher authority than your own.",
        )
    return target


def _revoke_sessions(db: Session, user_id: uuid.UUID, reason: str) -> None:
    """Best effort: changes are already committed, so a failure here must not undo them."""
    try:
        from backend.app.domains.iam.services import revoke_all_user_sessions

        revoke_all_user_sessions(db, user_id, reason=reason)
    except Exception as err:  # pragma: no cover - depends on deployed session tables
        db.rollback()
        logger.warning("Session revocation for user %s skipped (%s)", user_id, type(err).__name__)


def _mirror_role(iam_role: str, legacy_role: str) -> str:
    """Value for the legacy tenant_users.role column (restricted by ck_tenant_user_role)."""
    if legacy_role == "Guest":
        return "guest_user"
    if iam_role == "Owner":
        return "Owner"
    if iam_role in PRIVILEGED_IAM_ROLES:
        return "ceo"
    return "user"


async def _dispatch_existing_reset_flow(
    db: Session, background_tasks: BackgroundTasks, email: str, company_id: Optional[uuid.UUID]
) -> bool:
    """Trigger the platform's existing OTP password-reset flow for ``email``.

    The flow delivers its code out-of-band (email/SMS) and returns a uniform acknowledgement; the code,
    token and link are never visible to the caller. Returns False if the flow could not be started.
    """
    try:
        from backend.app.api.v1.auth import ForgotPasswordRequest, request_password_reset

        company = db.get(ResCompany, company_id) if company_id else None
        slug = (company.domain_slug or company.slug) if company else "master"
        await request_password_reset(
            ForgotPasswordRequest(email=email, workspace_slug=slug, tenant_id=company_id, otp_only=True),
            background_tasks,
            db,
        )
        return True
    except Exception as err:
        db.rollback()
        logger.error(
            "Existing reset flow could not be started for email=%s, company_id=%s: %s",
            email, company_id, err, exc_info=True,
        )
        return False


def _unusable_password_hash() -> str:
    """Hash of a random secret nobody (including this process) retains: invalidates the old credential."""
    return hash_password(secrets.token_urlsafe(48))


# ==============================================================================
# 0. GET /api/v1/users/roles  (single source of truth for every role dropdown)
# ==============================================================================
@router.get("/roles", response_model=RoleCatalogResponse)
def get_assignable_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Standardized roles from ``role_catalog`` (any authenticated user; carries no tenant data)."""
    row = db.execute(
        select(ResUser.role, ResUser.iam_role, ResUser.is_superuser, ResUser.is_active).where(
            ResUser.id == getattr(current_user, "id", None)
        )
    ).first()
    level = _authority_level(row.role, row.iam_role, bool(row.is_superuser)) if row is not None and row.is_active else LEVEL_NONE
    return RoleCatalogResponse(
        roles=[RoleCatalogItem(value=r, privileged=r in PRIVILEGED_IAM_ROLES) for r in WORKSPACE_ASSIGNABLE_ROLES],
        external_roles=[RoleCatalogItem(value=r) for r in EXTERNAL_INVITE_ROLES],
        can_assign_privileged=level >= LEVEL_OWNER,
        can_manage_users=level >= LEVEL_ADMIN,
    )


# ==============================================================================
# 1. GET /api/v1/users
# ==============================================================================
@router.get("", response_model=List[UserResponse])
@router.get("/", response_model=List[UserResponse])
def get_tenant_users(
    context: TenantContext = Depends(get_tenant_context),
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    """
    Fetch all users within the caller's tenant workspace.
    Strictly isolated: filtered by caller's company_id and accessible branch scopes via TenantContext.
    """
    accessible_cids = context.get_accessible_company_ids(db)
    if not accessible_cids:
        accessible_cids = [context.company_id]

    query = db.query(ResUser)
    if context.is_super_admin and actor.level >= LEVEL_PLATFORM:
        # A platform super admin may scope to an explicit target company.
        if context.company_id and str(context.company_id) != str(getattr(context.user, "company_id", "")):
            query = query.filter(ResUser.company_id == context.company_id).filter(ResUser.is_superuser.is_(False))
        else:
            query = query.filter(ResUser.company_id.in_(accessible_cids))
    else:
        # Organization-wide listing so invitees stay visible when switching workspace/branch views.
        scope = _organization_scope(db, actor.company_id)
        # Global super-admins never appear inside tenant matrices.
        query = query.filter(ResUser.company_id.in_(scope), ResUser.is_superuser.is_(False))

    users = query.filter(ResUser.deleted_at.is_(None)).order_by(ResUser.created_at.desc()).all()
    if not users and actor.user_id is not None:
        # Never render an empty matrix: seed the session owner's own record (already persisted) into the view.
        owner = db.query(ResUser).filter(ResUser.id == actor.user_id, ResUser.deleted_at.is_(None)).first()
        if owner is not None:
            users = [owner]
    return [
        UserResponse(
            id=str(u.id),
            email="" if _is_sms_placeholder_email(u.email) else u.email,
            phone=u.phone,
            sync_reference_id=u.sync_reference_id,
            avatar_url=u.avatar_url,
            full_name=u.full_name or u.email.split("@")[0],
            role=u.role,
            iam_role=u.iam_role,
            must_change_password=bool(u.must_change_password),
            is_active=u.is_active,
            status=("suspended" if not u.is_active else "pending" if u.must_change_password else "active"),
            created_at=u.created_at,
            tenant_id=str(u.company_id),
        )
        for u in users
    ]


def _load_own_profile(
    request: Request,
    current_user: User,
    db: Session,
) -> tuple[ResUser, AuditContext]:
    """Load only the authenticated account; callers cannot select another user's or tenant's identity."""
    try:
        user_id = uuid.UUID(str(current_user.id))
    except (AttributeError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authenticated user is unavailable.")

    target = db.query(ResUser).filter(ResUser.id == user_id).first()
    identifier = (target.email if target else getattr(current_user, "email", None)) or f"user:{user_id}"
    audit = build_audit_context(request, actor_id=user_id, actor_identifier=identifier)
    if target is None:
        _commit_audit(db, audit, "USER_PROFILE_ACCESS_DENIED:not_found", "DENIED", None, user_id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found.")
    if not target.is_active or target.deleted_at is not None:
        _commit_audit(
            db, audit, "USER_PROFILE_ACCESS_DENIED:inactive", "DENIED", target.company_id, target.id
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is suspended.")
    return target, audit


def _profile_response(user: ResUser) -> UserProfileResponse:
    return UserProfileResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        sync_reference_id=user.sync_reference_id,
        avatar_url=user.avatar_url,
        role=user.role,
        iam_role=user.iam_role,
        company_id=str(user.company_id) if user.company_id else None,
    )


@router.get("/me/profile", response_model=UserProfileResponse)
def get_own_user_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the caller's own safe profile fields, including the read-only sync reference."""
    user, _audit = _load_own_profile(request, current_user, db)
    return _profile_response(user)


@router.patch("/me/profile", response_model=UserProfileResponse)
def update_own_user_profile(
    payload: UserProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow only the authenticated user to edit their own display name and phone number."""
    user, audit = _load_own_profile(request, current_user, db)
    fields = payload.model_fields_set
    if not fields:
        _commit_audit(db, audit, "USER_PROFILE_UPDATE_DENIED:empty_payload", "DENIED", user.company_id, user.id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a profile field to update.")

    changed_fields = []
    if "full_name" in fields:
        if payload.full_name is None:
            _commit_audit(db, audit, "USER_PROFILE_UPDATE_DENIED:empty_name", "DENIED", user.company_id, user.id)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full name cannot be empty.")
        user.full_name = payload.full_name or ""
        changed_fields.append("full_name")
    if "phone" in fields:
        user.phone = payload.phone
        changed_fields.append("phone")

    append_audit_from_context(
        db,
        _with_target(audit, user.id),
        action=f"USER_PROFILE_UPDATED:fields={','.join(sorted(changed_fields))}",
        outcome="SUCCESS",
        tenant_id=user.company_id,
    )
    db.commit()
    db.refresh(user)
    return _profile_response(user)


@router.post("/me/avatar", response_model=UserProfileResponse)
async def upload_own_user_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store a bounded raster avatar for the authenticated user only."""
    user, audit = _load_own_profile(request, current_user, db)
    image_data = await file.read(MAX_AVATAR_BYTES + 1)
    if not image_data or len(image_data) > MAX_AVATAR_BYTES:
        _commit_audit(db, audit, "USER_AVATAR_UPLOAD_DENIED:invalid_size", "DENIED", user.company_id, user.id)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Avatar must be a non-empty image no larger than 5 MB.",
        )

    image_format = next(
        (
            (extension, media_type)
            for media_type, (extension, matches_signature) in _AVATAR_FORMATS.items()
            if matches_signature(image_data)
        ),
        None,
    )
    if image_format is None:
        _commit_audit(db, audit, "USER_AVATAR_UPLOAD_DENIED:unsupported_format", "DENIED", user.company_id, user.id)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a valid JPEG, PNG, or WebP image.",
        )

    extension, media_type = image_format
    filename = f"{uuid.uuid4().hex}{extension}"
    avatar_path = AVATAR_STORAGE_DIR / filename
    try:
        AVATAR_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        avatar_path.write_bytes(image_data)
    except OSError as exc:
        logger.exception("Could not persist user avatar for user %s", user.id)
        _commit_audit(db, audit, "USER_AVATAR_UPLOAD_FAILED:storage_error", "FAILURE", user.company_id, user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Avatar upload could not be saved.",
        ) from exc

    user.avatar_url = f"/api/v1/users/avatars/{filename}"
    try:
        append_audit_from_context(
            db,
            _with_target(audit, user.id),
            action=f"USER_AVATAR_UPDATED:format={media_type.split('/')[-1]}",
            outcome="SUCCESS",
            tenant_id=user.company_id,
        )
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        try:
            avatar_path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Could not clean up unreferenced avatar file for user %s", user.id)
        logger.exception("Could not update avatar record for user %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Avatar upload could not be saved.",
        ) from exc
    return _profile_response(user)


@router.get("/avatars/{filename}", include_in_schema=False)
def get_user_avatar(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Serve a user's avatar only to that user or another authenticated tenant member."""
    match = re.fullmatch(r"([0-9a-f]{32})(\.jpg|\.png|\.webp)", filename)
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found.")
    try:
        current_user_id = uuid.UUID(str(current_user.id))
    except (AttributeError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authenticated user is unavailable.")
    avatar_url = f"/api/v1/users/avatars/{filename}"
    avatar_query = db.query(ResUser).filter(
        ResUser.avatar_url == avatar_url,
        ResUser.is_active.is_(True),
        ResUser.deleted_at.is_(None),
    )
    company_id = getattr(current_user, "company_id", None)
    if company_id is not None:
        avatar_query = avatar_query.filter(
            or_(
                ResUser.id == current_user_id,
                ResUser.company_id == company_id,
            )
        )
    else:
        avatar_query = avatar_query.filter(ResUser.id == current_user_id)
    if avatar_query.first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found.")
    avatar_path = AVATAR_STORAGE_DIR / filename
    if not avatar_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found.")
    media_type = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}[match.group(2)]
    return FileResponse(
        avatar_path,
        media_type=media_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/me/change-password", status_code=status.HTTP_200_OK)
def change_own_password(
    payload: ChangeOwnPasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the authenticated user's password using a backend-verified current password."""
    user, audit = _load_own_profile(request, current_user, db)
    if not verify_password(payload.current_password, user.password_hash):
        _commit_audit(
            db, audit, "USER_PASSWORD_CHANGE_DENIED:invalid_current_password", "DENIED", user.company_id, user.id
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect.")
    if verify_password(payload.new_password, user.password_hash):
        _commit_audit(
            db, audit, "USER_PASSWORD_CHANGE_DENIED:password_reuse", "DENIED", user.company_id, user.id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a new password that differs from the current password.",
        )

    password_hash = hash_password(payload.new_password)
    user.password_hash = password_hash
    user.must_change_password = False
    mirror = db.query(TenantUser).filter(TenantUser.id == user.id).first()
    if mirror is not None:
        mirror.password_hash = password_hash
    append_audit_from_context(
        db,
        _with_target(audit, user.id),
        action="USER_PASSWORD_CHANGED",
        outcome="SUCCESS",
        tenant_id=user.company_id,
    )
    user_id = user.id
    db.commit()
    _revoke_sessions(db, user_id, "user_password_changed")
    return {"status": "changed", "message": "Password updated. Sign in again with your new password."}


# ==============================================================================
def is_ghost_or_unverified_account(user: ResUser, tenant_id: uuid.UUID, db: Session) -> bool:
    """
    Determine if an existing user record is genuinely an unverified 'ghost' account
    eligible for safe re-invitation and credential regeneration.

    Security & State Validation rules:
    - Never overwrite platform superusers.
    - Strictly preserve tenant boundary: must belong to caller's workspace (or be orphaned).
    - If user is fully active, has deleted_at IS NULL, must_change_password IS FALSE,
      and has a valid password hash: this is an established user -> NOT a ghost (Conflict).
    - If user has a TenantUser mirror with last_login_at IS NOT NULL and must_change_password IS FALSE:
      -> established user -> NOT a ghost (Conflict).
    - An account IS a ghost if:
      1. Soft-deleted (deleted_at is not None), OR
      2. Missing password hash (None or empty), OR
      3. Still in initial unverified invite state (must_change_password is True and
         no record of actual login in TenantUser), OR
      4. Inactive (is_active is False) with must_change_password is True.
    """
    if getattr(user, "is_superuser", False) or str(getattr(user, "role", "")).lower() == "super_admin":
        return False

    if user.company_id is not None and user.company_id != tenant_id:
        return False

    # Soft-deleted record in this workspace is eligible for re-invite/upsert
    if getattr(user, "deleted_at", None) is not None:
        return True

    # Missing password hash
    pwd_hash = getattr(user, "password_hash", None)
    if not pwd_hash or not str(pwd_hash).strip():
        return True

    # Check if user ever logged in
    mirror = db.query(TenantUser).filter(TenantUser.id == user.id).first() if getattr(user, "id", None) else None
    has_logged_in = mirror is not None and getattr(mirror, "last_login_at", None) is not None

    if getattr(user, "must_change_password", False) and not has_logged_in:
        return True

    if not getattr(user, "is_active", True) and getattr(user, "must_change_password", False):
        return True

    return False


# ==============================================================================
# 2. POST /api/v1/users/invite  (external / contractor identities ONLY)
# ==============================================================================
@router.post(
    "/invite", response_model=InviteUserResponse, response_model_exclude_none=True, status_code=status.HTTP_201_CREATED
)
async def invite_tenant_user(
    payload: InviteUserRequest,
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
    response: Response = None,  # type: ignore[assignment]  # injected by FastAPI
):
    """
    Invite an external identity (Guest / External_Auditor) into the caller's own workspace.

    Internal staff must be registered through HR. A temporary password is sent out-of-band through
    the selected channel, stored only as a strong hash, and marked for change on first login.
    Credentials are never logged; they are returned once, only for the explicit manual channel.
    If an existing account is in an unverified or soft-deleted 'ghost' state, it is safely
    re-invited with newly generated temporary credentials.
    """
    tenant_id = actor.company_id
    if tenant_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No workspace is bound to this account.")

    if is_internal_or_privileged_role_name(payload.role):
        _commit_audit(db, actor.audit, f"IAM_INVITE_DENIED:internal_role:channel={payload.channel}", "DENIED", tenant_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=HR_REGISTRATION_REQUIRED_MESSAGE)

    external_role = resolve_external_role(payload.role or "Guest")
    if not external_role:
        _commit_audit(db, actor.audit, f"IAM_INVITE_DENIED:unknown_role:channel={payload.channel}", "DENIED", tenant_id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid invite role. Allowed: {', '.join(EXTERNAL_INVITE_ROLES)}",
        )

    email_clean = (payload.email or "").strip().lower() or None
    phone_clean = payload.phone if payload.channel in ("sms", "manual") else None

    existing_by_email = (
        db.query(ResUser).filter(ResUser.email.ilike(email_clean)).first()
        if email_clean
        else None
    )
    existing_by_phone = (
        db.query(ResUser)
        .filter(ResUser.company_id == tenant_id, ResUser.phone == phone_clean)
        .first()
        if phone_clean
        else None
    )

    target_user: Optional[ResUser] = None
    is_reinvite = False

    if existing_by_email or existing_by_phone:
        if existing_by_email and existing_by_phone and existing_by_email.id != existing_by_phone.id:
            _commit_audit(
                db,
                actor.audit,
                f"IAM_INVITE_DENIED:conflicting_identities:channel={payload.channel}",
                "DENIED",
                tenant_id,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This contact cannot be invited. Email and phone match separate existing records.",
            )

        candidate = existing_by_email or existing_by_phone
        if is_ghost_or_unverified_account(candidate, tenant_id, db):
            target_user = candidate
            is_reinvite = True
        else:
            _commit_audit(
                db,
                actor.audit,
                f"IAM_INVITE_DENIED:duplicate_identity:channel={payload.channel}",
                "DENIED",
                tenant_id,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This contact cannot be invited. It may already be registered.",
            )

    spec = EXTERNAL_INVITE_ROLES[external_role]
    user_id = target_user.id if (is_reinvite and target_user) else uuid.uuid4()
    name_fallback = email_clean.split("@")[0].replace(".", " ").title() if email_clean else "External User"
    full_name = ((payload.full_name or name_fallback).strip() or "External User")[:255]
    temporary_password = secrets.token_urlsafe(18)
    password_hash = hash_password(temporary_password)
    company = db.get(ResCompany, tenant_id)
    workspace_name = (company.name if company else None) or "Workspace"
    destination = email_clean if payload.channel == "email" else phone_clean

    try:
        if payload.channel == "email" and background_tasks is not None and email_clean:
            from backend.app.services.email_service import (
                dispatch_user_invitation,
                construct_workspace_login_url,
                resolve_tenant_logo_url,
                fetch_tenant_smtp_config,
            )
            tenant_logo = resolve_tenant_logo_url(company)
            action_url = construct_workspace_login_url(company)
            inviter_name = getattr(actor, "full_name", None) or getattr(actor, "email", None) or "Workspace Administrator"
            first_name = (full_name.strip().split()[0] if full_name else "Team Member")
            tenant_ctx = {
                "id": str(company.id) if company else str(tenant_id),
                "name": company.name if company else workspace_name,
                "slug": getattr(company, "slug", None),
                "logo_url": tenant_logo,
                "workspace_domain": (getattr(company, "workspace_domain", None) or "portal.oxengl.com"),
                "support_email": (getattr(company, "support_email", None) or "support@oxengl.com"),
                "signature_name": (getattr(company, "signature_name", None) or f"{company.name if company else 'OxenGL'} Administration"),
                "signature_title": (getattr(company, "signature_title", None) or "Workspace Operations"),
            }
            tenant_smtp = fetch_tenant_smtp_config(company, db=db)
            background_tasks.add_task(
                dispatch_user_invitation,
                recipient_email=email_clean,
                first_name=first_name,
                user_role=spec["legacy_role"],
                action_url=action_url,
                inviter_name=inviter_name,
                tenant=tenant_ctx,
                temp_password=temporary_password,
                expiry_hours=48,
                tenant_smtp_config=tenant_smtp,
                company=company,
            )
        elif payload.channel != "manual":
            await dispatch_temporary_credentials(
                payload.channel,
                destination,
                temporary_password,
                full_name=full_name,
                workspace_name=workspace_name,
                tenant_id=tenant_id,
                db=db,
            )
    except NotificationDeliveryError as exc:
        _commit_audit(
            db,
            actor.audit,
            f"IAM_INVITE_DELIVERY_FAILED:channel={payload.channel}",
            "FAILED",
            tenant_id,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{payload.channel.upper()} invite delivery failed; no account was created. {exc}",
        ) from None

    if is_reinvite and target_user:
        target_user.deleted_at = None
        target_user.is_active = True
        target_user.must_change_password = True
        target_user.password_hash = password_hash
        target_user.full_name = full_name
        if email_clean:
            target_user.email = email_clean
        if phone_clean:
            target_user.phone = phone_clean
        target_user.company_id = tenant_id
        target_user.role = spec["legacy_role"]
        target_user.iam_role = external_role
        target_user.abac_context = dict(spec["abac_context"])
        target_user.updated_at = datetime.now(timezone.utc)
        if not getattr(target_user, "firebase_uid", None) or not target_user.firebase_uid.startswith("native:"):
            target_user.firebase_uid = f"native:{target_user.id}"

        mirror = db.query(TenantUser).filter(TenantUser.id == target_user.id).first()
        if mirror is not None:
            mirror.is_active = True
            mirror.password_hash = password_hash
            parts = full_name.split()
            mirror.first_name = parts[0] if parts else "External"
            mirror.last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
            if email_clean:
                mirror.email = email_clean
            if phone_clean:
                mirror.mobile_number = phone_clean
            mirror.updated_at = datetime.now(timezone.utc)

        append_audit_from_context(
            db,
            _with_target(actor.audit, target_user.id),
            action=f"IAM_USER_REINVITED:{external_role}:channel={payload.channel}",
            outcome="SUCCESS",
            tenant_id=tenant_id,
        )
        db.commit()
        logger.info(
            "IAM invite refreshed ghost user=%s role=%s tenant=%s channel=%s",
            target_user.id,
            external_role,
            tenant_id,
            payload.channel,
        )
    else:
        new_user = ResUser(
            id=user_id,
            email=email_clean or _sms_placeholder_email(user_id),
            full_name=full_name,
            phone=phone_clean,
            password_hash=password_hash,
            company_id=tenant_id,
            role=spec["legacy_role"],
            iam_role=external_role,
            abac_context=dict(spec["abac_context"]),
            must_change_password=True,
            is_active=True,
            firebase_uid=f"native:{user_id}",
        )
        db.add(new_user)
        append_audit_from_context(
            db,
            _with_target(actor.audit, user_id),
            action=f"IAM_USER_INVITED:{external_role}:channel={payload.channel}",
            outcome="SUCCESS",
            tenant_id=tenant_id,
        )
        db.commit()
        logger.info(
            "IAM invite created user=%s role=%s tenant=%s channel=%s",
            user_id,
            external_role,
            tenant_id,
            payload.channel,
        )

    logger.info(
        "IAM invite created user=%s role=%s tenant=%s channel=%s",
        user_id,
        external_role,
        tenant_id,
        payload.channel,
    )

    manual = payload.channel == "manual"
    if manual and response is not None:
        response.headers["Cache-Control"] = "no-store"
    return InviteUserResponse(
        status="invited",
        user_id=str(user_id),
        email=email_clean,
        phone=phone_clean,
        channel=payload.channel,
        full_name=full_name,
        role=external_role,
        reset_dispatched=not manual,
        temporary_password=temporary_password if manual else None,
        message=(
            "External user created. Copy the temporary password now; it is shown only once and a "
            "password change is required on first login."
            if manual
            else f"External user created. Temporary credentials were sent via {payload.channel.upper()}; "
            "a password change is required on first login."
        ),
    )


# ==============================================================================
# 3. DELETE /api/v1/users/{user_id}  (kept for API compatibility; the IAM panel uses suspend instead)
# ==============================================================================
@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def delete_tenant_user(
    user_id: str,
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    """Delete a user from the workspace (tenant-scoped, admin-only, audited)."""
    target = _load_target(db, actor, user_id, "USER_DELETE")
    target_id, target_company = target.id, target.company_id

    db.query(TenantUser).filter(TenantUser.id == target_id).delete(synchronize_session=False)
    db.delete(target)
    append_audit_from_context(
        db, _with_target(actor.audit, target_id), action="IAM_USER_DELETED", outcome="SUCCESS", tenant_id=target_company
    )
    db.commit()
    _revoke_sessions(db, target_id, "user_deleted")
    return {"status": "deleted", "user_id": str(target_id), "message": "User deleted successfully."}


@router.post("/{user_id}/soft-delete", response_model=UserActionResponse)
def soft_delete_tenant_user(
    user_id: str,
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    """Hide a user from active workspace administration without deleting its record."""
    target = _load_target(db, actor, user_id, "USER_SOFT_DELETE")

    target.deleted_at = datetime.now(timezone.utc)
    target.is_active = False
    mirror = db.query(TenantUser).filter(TenantUser.id == target.id).first()
    if mirror is not None:
        mirror.is_active = False
    append_audit_from_context(
        db,
        _with_target(actor.audit, target.id),
        action="IAM_USER_SOFT_DELETED",
        outcome="SUCCESS",
        tenant_id=target.company_id,
    )
    target_id = target.id
    db.commit()
    _revoke_sessions(db, target_id, "user_soft_deleted")
    return UserActionResponse(
        status="soft_deleted",
        user_id=str(target_id),
        is_active=False,
        message="User was soft-deleted. The record is retained and hidden from active user lists.",
    )


# ==============================================================================
# 4. PUT /api/v1/users/{user_id}/role  (Edit Access)
# ==============================================================================
@router.put("/{user_id}/role", status_code=status.HTTP_200_OK)
def update_tenant_user_role(
    user_id: str,
    payload: UpdateRoleRequest,
    background_tasks: BackgroundTasks,
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    """
    Assign one of the 25 standardized roles. ``role`` (legacy column) and ``iam_role`` are written together;
    ``Super_Admin`` is stored as legacy ``CEO`` so it never grants cross-tenant platform access, and only an
    Owner/CEO/platform admin may grant it.
    """
    target = _load_target(db, actor, user_id, "ROLE_CHANGE")
    new_role = resolve_internal_role(payload.role)
    if not new_role:
        _commit_audit(db, actor.audit, "IAM_ROLE_CHANGE_DENIED:invalid_role", "DENIED", target.company_id, target.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Choose one of the standardized IAM roles (GET /api/v1/users/roles).",
        )

    if new_role in PRIVILEGED_IAM_ROLES and actor.level < LEVEL_OWNER:
        _commit_audit(db, actor.audit, f"IAM_PRIVILEGED_ROLE_DENIED:{new_role}", "DENIED", target.company_id, target.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only a workspace Owner or platform administrator may assign {new_role}.",
        )

    old_role = target.iam_role or target.role
    legacy = legacy_role_for(new_role)
    target.role = legacy
    target.iam_role = new_role
    # Moving off an external identity drops external-only restrictions but preserves everything else.
    abac = dict(target.abac_context or {})
    for key in _EXTERNAL_ONLY_ABAC_KEYS:
        abac.pop(key, None)
    target.abac_context = abac

    mirror = db.query(TenantUser).filter(TenantUser.id == target.id).first()
    if mirror is not None:
        mirror.role = _mirror_role(new_role, legacy)

    action = "IAM_ROLE_CHANGED" if new_role not in PRIVILEGED_IAM_ROLES else "IAM_PRIVILEGED_ROLE_ASSIGNED"
    append_audit_from_context(
        db,
        _with_target(actor.audit, target.id),
        action=f"{action}:{old_role}->{new_role}",
        outcome="SUCCESS",
        tenant_id=target.company_id,
    )
    target_id = target.id
    db.commit()
    _revoke_sessions(db, target_id, "role_changed")  # old tokens must not outlive the old privileges
    db.refresh(target)

    if str(old_role) != str(new_role) and target.email:
        try:
            try:
                from backend.app.services.email_service import dispatch_role_updated, resolve_tenant_branding
            except ImportError:
                from app.services.email_service import dispatch_role_updated, resolve_tenant_branding

            company = db.query(ResCompany).filter(ResCompany.id == target.company_id).first()
            tenant_brand = resolve_tenant_branding(company)
            first_name = (str(target.full_name or "").strip().split()[0] if target.full_name else "Team Member")
            modifier_name = str(getattr(actor.user, "full_name", None) or getattr(actor.user, "email", None) or actor.identifier or "Workspace Administrator")
            domain = getattr(company, "workspace_domain", None) or getattr(tenant_brand, "workspace_domain", None) or "portal.oxengl.com"
            workspace_url = f"https://{domain}" if not str(domain).startswith("http") else str(domain)
            effective_date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            custom_smtp = getattr(company, "custom_smtp_settings", None) if company else None

            background_tasks.add_task(
                dispatch_role_updated,
                recipient_email=str(target.email),
                first_name=first_name,
                modifier_name=modifier_name,
                new_role=str(new_role),
                workspace_url=workspace_url,
                tenant=tenant_brand,
                effective_date=effective_date,
                custom_smtp=custom_smtp,
            )
        except Exception as role_mail_err:
            logger.warning("Failed to queue role update email: %s", role_mail_err)

    return {
        "status": "updated",
        "user_id": str(target.id),
        "role": target.role,
        "iam_role": target.iam_role,
        "message": f"User role updated to {target.iam_role}.",
    }


# ==============================================================================
# 5. POST /api/v1/users/{user_id}/suspend | /reactivate
# ==============================================================================
def _set_active(db: Session, actor: IamActor, user_id: str, active: bool) -> UserActionResponse:
    verb = "REACTIVATE" if active else "SUSPEND"
    target = _load_target(db, actor, user_id, f"USER_{verb}")
    target.is_active = active
    mirror = db.query(TenantUser).filter(TenantUser.id == target.id).first()
    if mirror is not None:
        mirror.is_active = active
    append_audit_from_context(
        db,
        _with_target(actor.audit, target.id),
        action="IAM_USER_REACTIVATED" if active else "IAM_USER_SUSPENDED",
        outcome="SUCCESS",
        tenant_id=target.company_id,
    )
    target_id = target.id
    db.commit()
    if not active:
        _revoke_sessions(db, target_id, "account_suspended")
    return UserActionResponse(
        status="reactivated" if active else "suspended",
        user_id=str(target_id),
        is_active=active,
        message="Account reactivated." if active else "Account suspended and all active sessions revoked.",
    )


@router.post("/{user_id}/suspend", response_model=UserActionResponse)
def suspend_tenant_user(
    user_id: str,
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    return _set_active(db, actor, user_id, False)


@router.post("/{user_id}/reactivate", response_model=UserActionResponse)
def reactivate_tenant_user(
    user_id: str,
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    return _set_active(db, actor, user_id, True)


# ==============================================================================
# 6. POST /api/v1/users/{user_id}/force-password-reset
# ==============================================================================
@router.post("/{user_id}/force-password-reset", response_model=UserActionResponse)
async def force_password_reset(
    user_id: str,
    background_tasks: BackgroundTasks,
    payload: Optional[ForcePasswordResetRequest] = Body(default=None),
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    """
    Invalidate the current credential and require a new one. Email users receive the existing OTP reset flow;
    phone-only users receive a temporary password over SMS before the stored hash is replaced. Nothing secret is returned.
    """
    target = _load_target(db, actor, user_id, "FORCE_RESET")
    require_password_change = payload.require_password_change if payload is not None else True
    sms_delivery = _is_sms_placeholder_email(target.email)
    dispatched = False

    if sms_delivery:
        if not target.phone:
            _commit_audit(
                db,
                actor.audit,
                "IAM_FORCE_PASSWORD_RESET:channel=sms",
                "FAILED",
                target.company_id,
                target.id,
            )
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The SMS account has no registered phone number.")
        temporary_password = secrets.token_urlsafe(18)
        new_hash = hash_password(temporary_password)
        company = db.get(ResCompany, target.company_id) if target.company_id else None
        try:
            await dispatch_temporary_credentials(
                "sms",
                target.phone,
                temporary_password,
                full_name=target.full_name or "External User",
                workspace_name=(company.name if company else None) or "Workspace",
                tenant_id=target.company_id,
                db=db,
            )
        except NotificationDeliveryError as exc:
            _commit_audit(
                db,
                actor.audit,
                "IAM_FORCE_PASSWORD_RESET:channel=sms",
                "FAILED",
                target.company_id,
                target.id,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"SMS reset delivery failed; account credentials were not changed. {exc}",
            ) from None
        dispatched = True
    else:
        new_hash = _unusable_password_hash()

    target.password_hash = new_hash
    target.must_change_password = require_password_change
    mirror = db.query(TenantUser).filter(TenantUser.id == target.id).first()
    if mirror is not None:
        mirror.password_hash = new_hash
    audit_action = "IAM_FORCE_PASSWORD_RESET:channel=sms" if sms_delivery else "IAM_FORCE_PASSWORD_RESET"
    if not require_password_change:
        audit_action += ":require_change=false"
    append_audit_from_context(
        db,
        _with_target(actor.audit, target.id),
        action=audit_action,
        outcome="SUCCESS",
        tenant_id=target.company_id,
    )
    target_id, email, company_id = target.id, target.email, target.company_id
    db.commit()
    _revoke_sessions(db, target_id, "forced_password_reset")

    if not sms_delivery:
        dispatched = await _dispatch_existing_reset_flow(db, background_tasks, email, company_id)
    if sms_delivery:
        reset_message = (
            "Credentials invalidated. A temporary password was sent by SMS."
            + (" The user must change it at next sign-in." if require_password_change else "")
        )
    elif dispatched:
        reset_message = "Credentials invalidated. A one-time password-reset code was sent to the user."
    else:
        reset_message = "Credentials invalidated. The user must complete the password reset flow (code delivery could not be started)."

    return UserActionResponse(
        status="reset_required",
        user_id=str(target_id),
        must_change_password=require_password_change,
        reset_dispatched=dispatched,
        message=reset_message,
    )
