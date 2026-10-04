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
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ResCompany, ResUser, TenantUser, User
from backend.api.dependencies import (
    TenantContext,
    get_current_user,
    get_tenant_context,
)
from backend.app.domains.hr.audit import AuditContext, append_audit_from_context, build_audit_context
from backend.app.domains.iam.role_catalog import (
    EXTERNAL_INVITE_ROLES,
    HR_PROVISIONED_ROLES,
    HR_REGISTRATION_REQUIRED_MESSAGE,
    PLATFORM_WIDE_LEGACY_ROLES,
    PRIVILEGED_IAM_ROLES,
    is_internal_or_privileged_role_name,
    legacy_role_for,
    normalize_role_token,
    resolve_external_role,
    resolve_internal_role,
)
from backend.two_tier_auth import hash_password

logger = logging.getLogger("oxengl.api.users")

router = APIRouter(prefix="/api/v1/users", tags=["Tenant User Management"])

# ABAC keys that only make sense for external identities; dropped when an account is moved to an internal role.
_EXTERNAL_ONLY_ABAC_KEYS = ("external_identity", "read_only", "audit_scope_only")

# Authority levels (evaluated from the DB row).
LEVEL_NONE, LEVEL_ADMIN, LEVEL_OWNER, LEVEL_PLATFORM = 0, 1, 2, 3


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    iam_role: Optional[str] = None
    must_change_password: bool = False
    is_active: bool
    created_at: Optional[datetime] = None
    tenant_id: str

    class Config:
        from_attributes = True


class InviteUserRequest(BaseModel):
    email: str = Field(..., description="Email address of the external invitee")
    role: str = Field("Guest", description="External identity type: Guest or External_Auditor")
    full_name: Optional[str] = Field(None, description="Full name of user")


class InviteUserResponse(BaseModel):
    status: str
    user_id: str
    email: str
    full_name: str
    role: str
    reset_dispatched: bool
    message: str


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    scope = _tenant_scope(db, actor)
    if scope is not None and target.company_id not in scope:
        _commit_audit(db, actor.audit, f"IAM_TENANT_ACCESS_DENIED:{action}", "DENIED", actor.company_id, target_uuid)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant violation: You do not have permission to modify users from another tenant.",
        )

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
        await request_password_reset(ForgotPasswordRequest(email=email, workspace_slug=slug), background_tasks, db)
        return True
    except Exception as err:
        db.rollback()
        logger.warning("Existing reset flow could not be started (%s)", type(err).__name__)
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
        roles=[RoleCatalogItem(value=r, privileged=r in PRIVILEGED_IAM_ROLES) for r in HR_PROVISIONED_ROLES],
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
            query = query.filter(ResUser.company_id == context.company_id)
        else:
            query = query.filter(ResUser.company_id.in_(accessible_cids))
    else:
        scope = _tenant_scope(db, actor) or []
        query = query.filter(ResUser.company_id.in_(scope))

    users = query.order_by(ResUser.created_at.desc()).all()
    return [
        UserResponse(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name or u.email.split("@")[0],
            role=u.role,
            iam_role=u.iam_role,
            must_change_password=bool(u.must_change_password),
            is_active=u.is_active,
            created_at=u.created_at,
            tenant_id=str(u.company_id),
        )
        for u in users
    ]


# ==============================================================================
# 2. POST /api/v1/users/invite  (external / contractor identities ONLY)
# ==============================================================================
@router.post("/invite", response_model=InviteUserResponse, status_code=status.HTTP_201_CREATED)
async def invite_tenant_user(
    payload: InviteUserRequest,
    background_tasks: BackgroundTasks,
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    """
    Invite an external identity (Guest / External_Auditor) into the caller's own workspace.

    Internal staff must be registered through HR. The account is created with an unusable random
    credential and ``must_change_password``; the invitee sets their own password through the existing
    OTP reset flow. No password is generated for display or returned.
    """
    tenant_id = actor.company_id
    if tenant_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No workspace is bound to this account.")

    if is_internal_or_privileged_role_name(payload.role):
        _commit_audit(db, actor.audit, "IAM_INVITE_DENIED:internal_role", "DENIED", tenant_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=HR_REGISTRATION_REQUIRED_MESSAGE)

    external_role = resolve_external_role(payload.role or "Guest")
    if not external_role:
        _commit_audit(db, actor.audit, "IAM_INVITE_DENIED:unknown_role", "DENIED", tenant_id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid invite role. Allowed: {', '.join(EXTERNAL_INVITE_ROLES)}",
        )

    email_clean = (payload.email or "").strip().lower()
    if not email_clean or "@" not in email_clean or len(email_clean) > 255:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email address format.")

    if db.query(ResUser.id).filter(ResUser.email.ilike(email_clean)).first():
        # Generic message: never reveal whether the address exists in another workspace.
        _commit_audit(db, actor.audit, "IAM_INVITE_DENIED:duplicate_identity", "DENIED", tenant_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email address cannot be invited. It may already be registered.",
        )

    spec = EXTERNAL_INVITE_ROLES[external_role]
    user_id = uuid.uuid4()
    full_name = (payload.full_name or email_clean.split("@")[0].replace(".", " ").title()).strip()[:255]
    new_user = ResUser(
        id=user_id,
        email=email_clean,
        full_name=full_name,
        password_hash=_unusable_password_hash(),
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
        db, _with_target(actor.audit, user_id), action=f"IAM_USER_INVITED:{external_role}", outcome="SUCCESS", tenant_id=tenant_id
    )
    db.commit()

    dispatched = await _dispatch_existing_reset_flow(db, background_tasks, email_clean, tenant_id)
    logger.info("IAM invite created user=%s role=%s tenant=%s", user_id, external_role, tenant_id)

    return InviteUserResponse(
        status="invited",
        user_id=str(user_id),
        email=email_clean,
        full_name=full_name,
        role=external_role,
        reset_dispatched=dispatched,
        message=(
            "External user created. A one-time password-setup code was sent to the invitee."
            if dispatched
            else "External user created. Use Force Password Reset to send a password-setup code."
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


# ==============================================================================
# 4. PUT /api/v1/users/{user_id}/role  (Edit Access)
# ==============================================================================
@router.put("/{user_id}/role", status_code=status.HTTP_200_OK)
def update_tenant_user_role(
    user_id: str,
    payload: UpdateRoleRequest,
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
    actor: IamActor = Depends(require_iam_admin),
    db: Session = Depends(get_db),
):
    """
    Invalidate the current credential and require a new one. The stored hash is replaced with the hash of an
    unrecoverable random secret, ``must_change_password`` is set, sessions are revoked, and the existing OTP
    reset flow delivers a one-time code to the user. Nothing secret is returned.
    """
    target = _load_target(db, actor, user_id, "FORCE_RESET")
    new_hash = _unusable_password_hash()
    target.password_hash = new_hash
    target.must_change_password = True
    mirror = db.query(TenantUser).filter(TenantUser.id == target.id).first()
    if mirror is not None:
        mirror.password_hash = new_hash
    append_audit_from_context(
        db, _with_target(actor.audit, target.id), action="IAM_FORCE_PASSWORD_RESET", outcome="SUCCESS", tenant_id=target.company_id
    )
    target_id, email, company_id = target.id, target.email, target.company_id
    db.commit()
    _revoke_sessions(db, target_id, "forced_password_reset")

    dispatched = await _dispatch_existing_reset_flow(db, background_tasks, email, company_id)
    return UserActionResponse(
        status="reset_required",
        user_id=str(target_id),
        must_change_password=True,
        reset_dispatched=dispatched,
        message=(
            "Credentials invalidated. A one-time password-reset code was sent to the user."
            if dispatched
            else "Credentials invalidated. The user must complete the password reset flow (code delivery could not be started)."
        ),
    )
