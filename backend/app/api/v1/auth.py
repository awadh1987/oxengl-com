"""
OxenGL ERP - Authentication & Password Recovery Subsystem.
Filename: backend/app/api/v1/auth.py

Provides self-service password recovery initiation, cryptographic token validation,
and secure Argon2id password reset across isolated tenant partition schemas.
"""

import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, Union
from urllib.parse import urlparse

import pyotp
from jinja2 import Environment, FileSystemLoader

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.database import get_db

try:
    from backend.app.services.notification_service import NotificationService, VerificationService
except ImportError:
    from app.services.notification_service import NotificationService, VerificationService
from backend.app.domains.hr.audit import build_audit_context
from backend.app.services import account_lookup
from backend.app.core.middleware import resolve_tenant_from_host

logger = logging.getLogger("oxengl.auth.recovery")

# Set up the template compiler environment
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
template_env = Environment(loader=FileSystemLoader(os.path.join(BASE_DIR, "templates")))

router = APIRouter(tags=["Password Recovery & Authentication"])

# Argon2id password hashing context matrix
pwd_context = CryptContext(
    schemes=["argon2", "pbkdf2_sha256"],
    deprecated="auto",
    argon2__memory_cost=65536,
    argon2__time_cost=3,
    argon2__parallelism=4,
)


class ForgotPasswordRequest(BaseModel):
    email: Optional[str] = Field(None, description="Registered account email address (or mobile number)")
    identifier: Optional[str] = Field(None, description="Account email address or mobile number")
    workspace_slug: Optional[str] = Field("master", description="Target tenant workspace identifier")
    tenant_id: Optional[Union[uuid.UUID, str]] = Field(None, description="Direct tenant identifier override")
    channel: Optional[Literal["auto", "email", "sms"]] = Field(
        "auto", description="OTP delivery channel; sms falls back to email when no phone is on file"
    )
    otp_only: bool = Field(False, description="Whether to only dispatch OTP notification and skip redundant link email")

    @property
    def resolved_identifier(self) -> str:
        return (self.identifier or self.email or "").strip()


class ResetPasswordConfirmRequest(BaseModel):
    token: Optional[str] = Field(None, description="Cryptographically signed reset token or 6-digit OTP")
    otp_code: Optional[str] = Field(None, description="6-digit Redis OTP verification code")
    code: Optional[str] = Field(None, description="Alias for 6-digit OTP verification code")
    email: Optional[str] = Field(None, description="Registered account email address (or mobile number)")
    identifier: Optional[str] = Field(None, description="Account email address or mobile number")
    workspace_slug: Optional[str] = Field(None, description="Target tenant workspace identifier")
    new_password: str = Field(..., min_length=8, description="New secret passphrase (min 8 chars)")


class TwoFactorSetupRequest(BaseModel):
    email: str = Field(..., description="Registered account email address")
    workspace_slug: Optional[str] = Field(None, description="Target tenant workspace identifier")


class TwoFactorVerifyRequest(BaseModel):
    code: str = Field(..., description="6-digit rolling TOTP code")
    two_factor_token: Optional[str] = Field(None, description="Handshake token from login")
    email: Optional[str] = Field(None, description="User email for setup verification")
    workspace_slug: Optional[str] = Field(None, description="Workspace slug for setup verification")
    tenant: Optional[str] = Field(None, description="Tenant workspace slug identifier")
    tenant_slug: Optional[str] = Field(None, description="Tenant workspace slug identifier")


def _masked_identifier(identifier: str) -> str:
    return f"***{identifier[-3:]}" if identifier else "***"


def ensure_password_resets_table(db: Session):
    """Ensure the public.password_resets table is available."""
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS public.password_resets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL,
                workspace_slug VARCHAR(255) NOT NULL,
                token VARCHAR(255) NOT NULL UNIQUE,
                expires_at TIMESTAMPTZ NOT NULL,
                is_used BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS ix_password_resets_token ON public.password_resets (token);
            CREATE INDEX IF NOT EXISTS ix_password_resets_email_slug ON public.password_resets (email, workspace_slug);
        """))
        db.commit()
    except Exception as err:
        db.rollback()
        logger.warning("Password reset table verification failed (%s)", type(err).__name__)


# SECURITY (2026-10-04, incident Addendum D): the recovery-initiation response is IDENTICAL whether or not
# the account / workspace exists, and it NEVER contains the OTP, the reset token or the recovery link.
# (Previously all three were returned to any anonymous caller = account takeover of any user, incl.
# the platform super admin.) Codes are delivered only out-of-band (email / SMS provider).
_GENERIC_RECOVERY_MESSAGE = (
    "If an account matches the details provided, a verification code has been sent to its "
    "registered email address or mobile number. The code expires in 5 minutes."
)


def _generic_recovery_response() -> dict:
    return {"status": "OTP_DISPATCHED", "message": _GENERIC_RECOVERY_MESSAGE, "expires_in_seconds": 300}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@router.post("/auth/forgot-password", status_code=status.HTTP_200_OK)
@router.post("/password-reset-init", status_code=status.HTTP_200_OK)
@router.post("/auth/password-reset-init", status_code=status.HTTP_200_OK)
async def request_password_reset(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """
    Password Recovery Initiation Endpoint with Redis 6-Digit OTP.
    Verifies user presence across the workspace partition, generates a 6-digit OTP
    via VerificationService stored in Redis (5-min TTL), persists backward-compatible token,
    dispatches email/SMS notifications, and returns response.
    """
    ensure_password_resets_table(db)

    identifier = payload.resolved_identifier
    if not identifier:
        return _generic_recovery_response()
    is_phone = account_lookup.looks_like_phone(identifier)
    norm_email = "" if is_phone else identifier.lower()

    # 1. Resolve tenant context through explicit tenant_id, request headers, custom domain, or workspace slug
    tenant_row = None
    company_name = "OxenGL Enterprise"
    raw_slug = (payload.workspace_slug or "").strip().lower()
    if raw_slug in ("master", "platform", "system", "superadmin", "super-admin"):
        raw_slug = ""

    # Extract host / domain from request context (X-Tenant-Domain, X-Tenant-Slug, X-Forwarded-Host, Host, Origin, Referer)
    request_host = ""
    if request is not None and hasattr(request, "headers"):
        request_host = (
            request.headers.get("x-tenant-domain")
            or request.headers.get("x-tenant-slug")
            or request.headers.get("x-forwarded-host")
            or request.headers.get("host")
            or ""
        ).split(":")[0].strip().lower()
        if not request_host or request_host in ("localhost", "127.0.0.1", "oxengl.me", "oxengl.com", "api.oxengl.me"):
            origin = request.headers.get("origin") or request.headers.get("referer") or ""
            if origin:
                request_host = (urlparse(origin).hostname or "").strip().lower()

    # Priority A: Explicit payload tenant_id (e.g. from admin force reset)
    if getattr(payload, "tenant_id", None):
        try:
            tid_uuid = uuid.UUID(str(payload.tenant_id))
            comp_row = db.execute(
                text("SELECT id, slug, domain_slug, name, custom_domain FROM public.res_companies WHERE id = :tid LIMIT 1"),
                {"tid": tid_uuid},
            ).mappings().first()
            if comp_row:
                tenant_row = comp_row
                company_name = comp_row.get("name") or company_name
                raw_slug = comp_row.get("slug") or comp_row.get("domain_slug") or raw_slug
        except (ValueError, TypeError):
            pass

    # Priority B: Resolve via custom domain or slug from payload if specified
    if not tenant_row and raw_slug:
        resolved_from_slug = resolve_tenant_from_host(raw_slug, db=db)
        if resolved_from_slug:
            tenant_row = {
                "id": resolved_from_slug["company_id"] or resolved_from_slug["tenant_id"],
                "slug": resolved_from_slug["tenant_slug"],
                "name": resolved_from_slug["name"],
            }
            company_name = resolved_from_slug["name"]
            raw_slug = resolved_from_slug["tenant_slug"]
        else:
            slug_variants = list(dict.fromkeys([
                raw_slug,
                raw_slug.replace("-", "_"),
                raw_slug.replace("_", "-"),
            ]))
            tenant_row = db.execute(
                text("SELECT id, slug, name FROM public.master_tenants WHERE slug = ANY(:slugs) OR custom_domain = ANY(:slugs) LIMIT 1"),
                {"slugs": slug_variants},
            ).mappings().first()
            if not tenant_row:
                tenant_row = db.execute(
                    text("SELECT id, domain_slug AS slug, name FROM public.res_companies WHERE domain_slug = ANY(:slugs) OR slug = ANY(:slugs) OR custom_domain = ANY(:slugs) LIMIT 1"),
                    {"slugs": slug_variants},
                ).mappings().first()
            if tenant_row:
                company_name = tenant_row.get("name", raw_slug)

    # Priority C: Public flow custom domain resolution from HTTP request host (e.g. myon-contract.cloud)
    if not tenant_row and request_host and request_host not in ("localhost", "127.0.0.1", "oxengl.me", "oxengl.com", "api.oxengl.me"):
        resolved_from_host = resolve_tenant_from_host(request_host, db=db)
        if resolved_from_host:
            tenant_row = {
                "id": resolved_from_host["company_id"] or resolved_from_host["tenant_id"],
                "slug": resolved_from_host["tenant_slug"],
                "name": resolved_from_host["name"],
            }
            company_name = resolved_from_host["name"]
            raw_slug = resolved_from_host["tenant_slug"]

    # Priority D: Fallback for explicit master plane
    if not tenant_row:
        if not raw_slug or raw_slug in ("master", "platform", "system", "superadmin", "super-admin"):
            tenant_row = {"id": "master", "slug": "master", "name": "Platform Master Control Plane"}
            company_name = "OxenGL Platform Master"
            raw_slug = "master"
        else:
            # Check if user exists anywhere to avoid account enumeration
            try:
                if is_phone:
                    user_exists_anywhere = account_lookup.find_account_by_phone(db, [], identifier)
                else:
                    user_exists_anywhere = db.execute(
                        text("SELECT id FROM public.tenant_users WHERE LOWER(email) = :e LIMIT 1"),
                        {"e": norm_email},
                    ).first()
                    if not user_exists_anywhere:
                        user_exists_anywhere = db.execute(
                            text("SELECT id FROM public.res_users WHERE LOWER(email) = :e LIMIT 1"),
                            {"e": norm_email},
                        ).first()
            except Exception:
                db.rollback()
                user_exists_anywhere = None
            if not user_exists_anywhere:
                return _generic_recovery_response()
            tenant_row = {"id": raw_slug, "slug": raw_slug, "name": raw_slug.capitalize()}
            company_name = raw_slug.capitalize()

    # 2. Verify user exists inside that partition or across active tenants
    sanitized_slug = re.sub(r"[^a-zA-Z0-9_]", "_", raw_slug)
    tenant_slug_val = tenant_row.get("slug", raw_slug) if hasattr(tenant_row, "get") else getattr(tenant_row, "slug", raw_slug)
    target_schemas = list(dict.fromkeys([
        sanitized_slug,
        raw_slug,
        str(tenant_slug_val),
        str(tenant_slug_val).replace("-", "_"),
    ]))

    user_found = False
    user_phone = None
    user_company_id = None
    if is_phone:
        resolved_account = account_lookup.find_account_by_phone(db, target_schemas, identifier)
        if not resolved_account:
            return _generic_recovery_response()
        norm_email = resolved_account["email"]
        user_phone = resolved_account["phone"]
        user_found = True
    for schema_name in ([] if is_phone else target_schemas):
        try:
            tbl_exists = db.execute(text("SELECT to_regclass(:t)"), {"t": f'"{schema_name}".users'}).scalar()
            if tbl_exists:
                chk = db.execute(
                    text(f'SELECT id, email FROM "{schema_name}".users WHERE LOWER(email) = :e LIMIT 1'),
                    {"e": norm_email},
                ).mappings().first()
                if chk:
                    user_found = True
                    break
        except Exception:
            db.rollback()

    if not user_found:
        try:
            chk = db.execute(
                text("SELECT id, email, mobile_number FROM public.tenant_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": norm_email},
            ).mappings().first()
            if chk:
                user_found = True
                user_phone = chk.get("mobile_number")
        except Exception:
            db.rollback()

    if not user_found:
        try:
            chk = db.execute(
                text("SELECT id, email, mobile_number FROM public.master_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": norm_email},
            ).mappings().first()
            if chk:
                user_found = True
                user_phone = chk.get("mobile_number")
        except Exception:
            db.rollback()

    if not user_found:
        try:
            chk = db.execute(
                text("SELECT id, email, phone, company_id FROM public.res_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": norm_email},
            ).mappings().first()
            if chk:
                user_found = True
                user_phone = chk.get("phone")
                user_company_id = chk.get("company_id")
        except Exception:
            db.rollback()

    if not user_found:
        return _generic_recovery_response()  # no account enumeration

    if not user_phone:
        user_phone = account_lookup.find_phone_for_email(db, target_schemas, norm_email)

    # 3. Generate 6-Digit OTP via VerificationService stored in Redis (5-minute TTL)
    # Reset namespace ONLY: the bare "otp:{email}" key belongs to tenant registration (Addendum D).
    otp = await VerificationService.generate_and_store_otp(f"reset:{norm_email}")
    # Cache recovery metadata in Redis
    await VerificationService.store_registration_payload(
        f"reset:{norm_email}",
        {
            "email": norm_email,
            "workspace_slug": raw_slug,
            "company_name": company_name,
        },
        expire_seconds=900,
    )
    # Phone-keyed pointer so the confirm step can verify with a phone number regardless of the start channel.
    phone_keys = {account_lookup.phone_digits(identifier)} if is_phone else set()
    if user_phone:
        phone_keys.add(account_lookup.phone_digits(user_phone))
    for digits in filter(None, phone_keys):
        await VerificationService.store_registration_payload(
            f"reset:phone:{digits}",
            {"email": norm_email, "workspace_slug": raw_slug},
            expire_seconds=900,
        )

    # 4. Asynchronously dispatch through the resolved tenant (or platform default).
    reset_tenant_id = None
    if getattr(payload, "tenant_id", None):
        try:
            reset_tenant_id = uuid.UUID(str(payload.tenant_id))
        except (ValueError, TypeError):
            reset_tenant_id = None

    if not reset_tenant_id and tenant_row is not None:
        raw_tid = tenant_row.get("id") if hasattr(tenant_row, "get") else getattr(tenant_row, "id", None)
        if raw_tid is not None and str(raw_tid).lower() not in ("master", "platform", "system", "none", ""):
            try:
                reset_tenant_id = uuid.UUID(str(raw_tid))
            except (ValueError, TypeError):
                reset_tenant_id = None

    if not reset_tenant_id and user_company_id is not None:
        try:
            reset_tenant_id = uuid.UUID(str(user_company_id))
        except (ValueError, TypeError):
            reset_tenant_id = None

    if reset_tenant_id and (not company_name or company_name in ("OxenGL Enterprise", "OxenGL Platform Master")):
        try:
            c_name = db.execute(
                text("SELECT name FROM public.res_companies WHERE id = :id LIMIT 1"),
                {"id": reset_tenant_id},
            ).scalar()
            if c_name:
                company_name = c_name
        except Exception:
            db.rollback()

    logger.info(
        "Request password reset: user=%s, resolved_tenant_id=%s, company_name=%s, channel=%s",
        _masked_identifier(norm_email or identifier),
        reset_tenant_id,
        company_name,
        payload.channel,
    )

    background_tasks.add_task(
        NotificationService.send_password_reset_otp,
        NotificationService.select_channels(payload.channel, bool(user_phone)),
        email=norm_email,
        phone=user_phone,
        otp=otp,
        company_name=str(company_name),
        tenant_id=reset_tenant_id,
        audit_context=build_audit_context(request, actor_id=None, actor_identifier=norm_email) if request is not None else None,
    )

    # 5. Maintain legacy cryptographic token for backward compatibility
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    try:
        db.execute(
            text("UPDATE public.password_resets SET is_used = TRUE WHERE LOWER(email) = :e AND workspace_slug = :s AND is_used = FALSE"),
            {"e": norm_email, "s": raw_slug},
        )
        db.execute(
            text("""
                INSERT INTO public.password_resets (id, email, workspace_slug, token, expires_at, is_used, created_at)
                VALUES (gen_random_uuid(), :e, :s, :t, :exp, FALSE, NOW())
            """),
            {"e": norm_email, "s": raw_slug, "t": reset_token, "exp": expires_at},
        )
        db.commit()
    except Exception as err:
        db.rollback()
        logger.error("Failed to record password reset token (%s)", type(err).__name__)

    recovery_link = f"https://{raw_slug}.oxengl.me/reset-password?email={norm_email}&otp={otp}" if raw_slug and raw_slug != "master" else f"https://oxengl.me/reset-password?email={norm_email}&otp={otp}"

    logger.info("[PASSWORD RECOVERY] verification code issued for a registered account (workspace=%s)", raw_slug)

    # Dispatch standard password reset notification email
    from app.services.email_service import dispatch_password_reset, resolve_tenant_branding

    first_name = "there"
    if 'chk' in locals() and chk:
        name_val = chk.get("name") or chk.get("first_name") or chk.get("full_name") or ""
        if name_val:
            first_name = name_val.split()[0]

    is_platform = (raw_slug == "master" or not raw_slug or reset_tenant_id is None)
    tenant_obj = None
    if not is_platform and reset_tenant_id:
        try:
            from backend.models import ResCompany
            tenant_obj = db.query(ResCompany).filter(ResCompany.id == reset_tenant_id).first()
        except Exception:
            tenant_obj = None

    tenant_brand = resolve_tenant_branding(tenant_obj) if tenant_obj else resolve_tenant_branding({
        "name": company_name or "OxenGL Enterprise",
        "slug": raw_slug or "master",
    })

    client_ip = request.client.host if (request and request.client) else "Undisclosed"
    custom_smtp = getattr(tenant_obj, "custom_smtp_settings", None) if tenant_obj else None

    if not getattr(payload, "otp_only", False):
        background_tasks.add_task(
            dispatch_password_reset,
            recipient_email=norm_email,
            first_name=first_name,
            reset_url=recovery_link,
            request_ip=client_ip,
            tenant=tenant_brand,
            expiry_minutes=30,
            custom_smtp=custom_smtp,
        )

    # Compile HTML recovery email template via Jinja2 (legacy fallback)
    try:
        template = template_env.get_template("auth/forgot_password.html")
        html_payload = template.render(
            workspace_slug=payload.workspace_slug,
            recovery_url=recovery_link,
            otp_code=otp,
            expires_at=expires_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
        )
    except Exception as tmpl_err:
        logger.warning("Could not render recovery email template (%s)", type(tmpl_err).__name__)

    return _generic_recovery_response()


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@router.post("/auth/reset-password", status_code=status.HTTP_200_OK)
@router.post("/password-reset-verify", status_code=status.HTTP_200_OK)
@router.post("/auth/password-reset-verify", status_code=status.HTTP_200_OK)
async def confirm_password_reset(
    payload: ResetPasswordConfirmRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Password Reset Confirmation Endpoint.
    Validates either dynamic 6-digit Redis OTP (via VerificationService) or
    legacy cryptographic token from password_resets, hashes new password with Argon2id,
    and updates target user record in tenant partition schema.
    """
    ensure_password_resets_table(db)
    now = datetime.now(timezone.utc)

    raw_token = (payload.token or "").strip()
    raw_otp = (payload.otp_code or payload.code or "").strip()
    raw_identifier = (payload.identifier or payload.email or "").strip()
    norm_email = raw_identifier.lower()
    raw_slug = (payload.workspace_slug or "").strip().lower()
    phone_pointer_key = None
    if account_lookup.looks_like_phone(raw_identifier):
        phone_pointer_key = f"reset:phone:{account_lookup.phone_digits(raw_identifier)}"
        pointer = await VerificationService.get_registration_payload(phone_pointer_key)
        norm_email = str((pointer or {}).get("email") or "").strip().lower()
        if not norm_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification code."
            )

    # Determine candidate 6-digit OTP
    candidate_otp = None
    if raw_otp and len(raw_otp) == 6 and raw_otp.isdigit():
        candidate_otp = raw_otp
    elif raw_token and len(raw_token) == 6 and raw_token.isdigit():
        candidate_otp = raw_token

    validated_via_otp = False

    # 1. Attempt Redis OTP Validation via VerificationService
    if candidate_otp and norm_email:
        # SECURITY (Addendum D): only the reset-namespaced OTP is accepted; the bare "otp:{email}" key is
        # the tenant-registration OTP and must never authorise a password change.
        is_valid = await VerificationService.verify_otp(f"reset:{norm_email}", candidate_otp)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification code."
            )
        validated_via_otp = True

        # Retrieve cached payload to resolve workspace_slug if missing
        cached = await VerificationService.get_registration_payload(f"reset:{norm_email}")
        if cached and not raw_slug:
            raw_slug = cached.get("workspace_slug", "")
        await VerificationService.delete_registration_payload(f"reset:{norm_email}")
        if phone_pointer_key:
            await VerificationService.delete_registration_payload(phone_pointer_key)

    # 2. If not validated via OTP, validate via legacy cryptographic token
    if not validated_via_otp:
        if not raw_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email and 6-digit verification code, or a valid reset token is required."
            )

        token_row = db.execute(
            text("SELECT id, email, workspace_slug, token, expires_at, is_used FROM public.password_resets WHERE token = :t LIMIT 1"),
            {"t": raw_token},
        ).mappings().first()

        if not token_row:
            # SECURITY (Addendum D): tenant_password_resets tokens are handed to the client by
            # /api/auth/recover-password as a flow handle and must be redeemed TOGETHER WITH the OTP via
            # /api/auth/reset-password. They are no longer accepted here as a standalone bearer credential.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid, unknown, or revoked password reset token."
            )

        if token_row.get("is_used"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password reset token has already been consumed."
            )

        if token_row["expires_at"] <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password reset token has expired. Request a fresh recovery link."
            )

        norm_email = token_row["email"].strip().lower()
        if not raw_slug:
            raw_slug = (token_row.get("workspace_slug") or "").strip().lower()

    # 3. Hash new password natively with Argon2id
    argon2_hash = pwd_context.hash(payload.new_password)

    # 4. Commit new hash onto target profile in the isolated tenant partition schema
    target_schemas = list(dict.fromkeys([
        re.sub(r"[^a-zA-Z0-9_]", "_", raw_slug),
        raw_slug,
        raw_slug.replace("-", "_"),
    ])) if raw_slug else ["myon", "way_ye"]

    updated_count = 0
    for schema_name in target_schemas:
        try:
            tbl_exists = db.execute(text("SELECT to_regclass(:t)"), {"t": f'"{schema_name}".users'}).scalar()
            if tbl_exists:
                res = db.execute(
                    text(f'UPDATE "{schema_name}".users SET password_hash = :h, updated_at = NOW() WHERE LOWER(email) = :e'),
                    {"h": argon2_hash, "e": norm_email},
                )
                updated_count += res.rowcount
        except Exception:
            db.rollback()

    try:
        res = db.execute(
            text("UPDATE public.tenant_users SET password_hash = :h, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE LOWER(email) = :e"),
            {"h": argon2_hash, "e": norm_email},
        )
        updated_count += res.rowcount
    except Exception:
        db.rollback()

    try:
        res = db.execute(
            text("UPDATE public.users SET password_hash = :h WHERE LOWER(email) = :e"),
            {"h": argon2_hash, "e": norm_email},
        )
        updated_count += res.rowcount
    except Exception:
        db.rollback()

    try:
        res = db.execute(
            text("UPDATE public.res_users SET password_hash = :h, must_change_password = FALSE WHERE LOWER(email) = :e"),
            {"h": argon2_hash, "e": norm_email},
        )
        updated_count += res.rowcount
    except Exception:
        db.rollback()

    try:
        res = db.execute(
            text("UPDATE public.master_users SET password_hash = :h, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE LOWER(email) = :e"),
            {"h": argon2_hash, "e": norm_email},
        )
        updated_count += res.rowcount
    except Exception:
        db.rollback()

    # 5. Invalidate / delete database tokens to prevent reuse
    try:
        if raw_token:
            db.execute(
                text("DELETE FROM public.password_resets WHERE token = :t"),
                {"t": raw_token},
            )
            try:
                db.execute(
                    text("DELETE FROM public.tenant_password_resets WHERE reset_token = :t"),
                    {"t": raw_token},
                )
            except Exception:
                pass
        if norm_email:
            db.execute(
                text("UPDATE public.password_resets SET is_used = TRUE WHERE LOWER(email) = :e"),
                {"e": norm_email},
            )
        db.commit()
    except Exception as err:
        db.rollback()
        logger.error("Error purging reset token (%s)", type(err).__name__)

    # 6. Dispatch Security Alert via BackgroundTasks
    try:
        try:
            from backend.app.services.email_service import dispatch_security_alert, resolve_tenant_branding
        except ImportError:
            from app.services.email_service import dispatch_security_alert, resolve_tenant_branding
        from backend.models import ResCompany, ResUser

        client_ip = request.headers.get("x-forwarded-for")
        if client_ip:
            client_ip = client_ip.split(",")[0].strip()
        elif request.client:
            client_ip = request.client.host
        else:
            client_ip = "127.0.0.1"

        user_agent = request.headers.get("user-agent", "Unknown Device/Browser")

        session_info = {
            "user_agent": user_agent,
            "ip_address": client_ip,
            "location": "Detected IP Session",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        }

        # Resolve tenant branding
        company = None
        if raw_slug and raw_slug != "master":
            company = db.query(ResCompany).filter(
                (ResCompany.schema_name == raw_slug) | (ResCompany.domain_slug == raw_slug)
            ).first()
        if not company and norm_email:
            user_row = db.query(ResUser).filter(ResUser.email.ilike(norm_email)).first()
            if user_row and user_row.company_id:
                company = db.query(ResCompany).filter(ResCompany.id == user_row.company_id).first()

        tenant_brand = resolve_tenant_branding(company)
        domain = getattr(company, "workspace_domain", None) or getattr(tenant_brand, "workspace_domain", None) or "portal.oxengl.com"
        base_domain = f"https://{domain}" if not str(domain).startswith("http") else str(domain)
        secure_account_url = f"{base_domain}/settings/security"
        custom_smtp = getattr(company, "custom_smtp_settings", None) if company else None

        background_tasks.add_task(
            dispatch_security_alert,
            recipient_email=norm_email,
            session=session_info,
            secure_account_url=secure_account_url,
            tenant=tenant_brand,
            custom_smtp=custom_smtp,
        )
    except Exception as sec_err:
        logger.warning("Failed to queue security alert for %s: %s", _masked_identifier(norm_email), sec_err)

    logger.info("[PASSWORD RESET] Password updated for recipient %s across %s record(s).", _masked_identifier(norm_email), updated_count)
    return {
        "status": "SUCCESS",
        "message": "Password reset completed successfully. You may now log in with your new credentials.",
        "email": norm_email,
        "records_updated": updated_count,
    }


def _require_session_user(request: Request, db: Session):
    """Resolve the authenticated res_users account (401 if anonymous / unknown subject)."""
    from backend.app.core.auth import get_authenticated_user as _get_authenticated_user
    return _get_authenticated_user(request, db)


@router.post("/auth/2fa/setup", status_code=status.HTTP_200_OK)
@router.post("/2fa/setup", status_code=status.HTTP_200_OK)
def setup_two_factor(payload: TwoFactorSetupRequest, request: Request, db: Session = Depends(get_db)):
    """
    TOTP 2FA Setup Endpoint.
    Generates a random base32 key via pyotp.random_base32() and returns
    an absolute provisioning URI formatted for authenticator apps.
    """
    # SECURITY (2026-10-04, incident Addendum D): previously ANY anonymous caller could overwrite any user's
    # TOTP secret (and reset tfa_enabled=FALSE) just by naming their email, and received the new secret.
    # Setup now requires an authenticated session and only ever targets the caller's own account.
    me = _require_session_user(request, db)
    norm_email = str(me.email or "").strip().lower()
    if payload.email and payload.email.strip().lower() != norm_email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="2FA can only be configured for your own account.")
    raw_slug = (payload.workspace_slug or "myon").strip().lower()

    # Generate random base32 key
    secret = pyotp.random_base32()
    totp_auth_url = pyotp.totp.TOTP(secret).provisioning_uri(
        name=norm_email,
        issuer_name="OxenGL",
    )

    target_schemas = list(dict.fromkeys([
        re.sub(r"[^a-zA-Z0-9_]", "_", raw_slug),
        raw_slug,
        raw_slug.replace("-", "_"),
        "myon",
    ]))

    updated = False
    for s in target_schemas:
        try:
            tbl = db.execute(text("SELECT to_regclass(:t)"), {"t": f'"{s}".users'}).scalar()
            if tbl:
                res = db.execute(
                    text(f'UPDATE "{s}".users SET tfa_secret = :sec, tfa_enabled = FALSE, updated_at = NOW() WHERE LOWER(email) = :e'),
                    {"sec": secret, "e": norm_email},
                )
                if res.rowcount > 0:
                    updated = True
        except Exception:
            db.rollback()

    try:
        res = db.execute(
            text("UPDATE public.tenant_users SET tfa_secret = :sec, tfa_enabled = FALSE, updated_at = NOW() WHERE LOWER(email) = :e"),
            {"sec": secret, "e": norm_email},
        )
        if res.rowcount > 0:
            updated = True
    except Exception:
        db.rollback()

    try:
        res = db.execute(
            text("UPDATE public.users SET tfa_secret = :sec, tfa_enabled = FALSE WHERE LOWER(email) = :e"),
            {"sec": secret, "e": norm_email},
        )
        if res.rowcount > 0:
            updated = True
    except Exception:
        db.rollback()

    try:
        res = db.execute(
            text("UPDATE public.master_users SET tfa_secret = :sec, tfa_enabled = FALSE, updated_at = NOW() WHERE LOWER(email) = :e"),
            {"sec": secret, "e": norm_email},
        )
        if res.rowcount > 0:
            updated = True
    except Exception:
        db.rollback()

    db.commit()

    logger.info("[2FA SETUP] provisioned a new TOTP secret for %s (workspace=%s)", _masked_identifier(norm_email), raw_slug)

    return {
        "status": "SETUP_INITIATED",
        "secret": secret,
        "totp_auth_url": totp_auth_url,
        "provisioning_uri": totp_auth_url,
        "email": norm_email,
        "workspace_slug": raw_slug,
    }


@router.post("/auth/2fa/verify", status_code=status.HTTP_200_OK)
@router.post("/2fa/verify", status_code=status.HTTP_200_OK)
def verify_two_factor(payload: TwoFactorVerifyRequest, request: Request, db: Session = Depends(get_db)):
    """
    TOTP 2FA Verification Endpoint.
    Validates rolling 6-digit code via pyotp.TOTP(secret).verify(code).
    - If completing setup: activates 2FA (tfa_enabled = True).
    - If completing login handshake: returns full JWT access token.
    """
    clean_code = payload.code.strip()
    norm_email = payload.email.strip().lower() if payload.email else None
    raw_slug = (payload.tenant or payload.tenant_slug or payload.workspace_slug or "myon").strip().lower()
    claims = None

    # Check if two_factor_token was provided (login handshake completion)
    if payload.two_factor_token:
        try:
            from backend.two_tier_auth import verify_2fa_handshake_token
            claims = verify_2fa_handshake_token(payload.two_factor_token)
            norm_email = claims.get("identity", "").lower()
            raw_slug = claims.get("tenant_slug", raw_slug)
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid or expired 2FA handshake token: {e}")

    if not norm_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="email or two_factor_token is required for verification.",
        )

    if not payload.two_factor_token:
        # SECURITY (Addendum D): completing 2FA *setup* (email path, no login handshake token) requires an
        # authenticated session for the same account.
        me = _require_session_user(request, db)
        if str(me.email or "").strip().lower() != norm_email:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="2FA can only be configured for your own account.")

    # Locate user's tfa_secret
    target_schemas = list(dict.fromkeys([
        re.sub(r"[^a-zA-Z0-9_]", "_", raw_slug),
        raw_slug,
        raw_slug.replace("-", "_"),
        "myon",
    ]))

    user_secret = None

    for s in target_schemas:
        try:
            tbl = db.execute(text("SELECT to_regclass(:t)"), {"t": f'"{s}".users'}).scalar()
            if tbl:
                row = db.execute(
                    text(f'SELECT id, email, role, tfa_secret, tfa_enabled FROM "{s}".users WHERE LOWER(email) = :e LIMIT 1'),
                    {"e": norm_email},
                ).mappings().first()
                if row and row.get("tfa_secret"):
                    user_secret = row["tfa_secret"]
                    break
        except Exception:
            db.rollback()

    if not user_secret:
        try:
            row = db.execute(
                text("SELECT id, email, role, tfa_secret, tfa_enabled FROM public.tenant_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": norm_email},
            ).mappings().first()
            if row and row.get("tfa_secret"):
                user_secret = row["tfa_secret"]
        except Exception:
            db.rollback()

    if not user_secret:
        try:
            row = db.execute(
                text("SELECT id, email, role, tfa_secret, tfa_enabled FROM public.users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": norm_email},
            ).mappings().first()
            if row and row.get("tfa_secret"):
                user_secret = row["tfa_secret"]
        except Exception:
            db.rollback()

    if not user_secret:
        try:
            row = db.execute(
                text("SELECT id, email, role, tfa_secret, tfa_enabled FROM public.master_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": norm_email},
            ).mappings().first()
            if row and row.get("tfa_secret"):
                user_secret = row["tfa_secret"]
        except Exception:
            db.rollback()

    if not user_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA secret not found. Please initiate 2FA setup first.",
        )

    # Validate the 6-digit rolling code
    totp = pyotp.TOTP(user_secret)
    if not totp.verify(clean_code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid two-factor authentication code.",
        )

    # Mark 2FA as enabled in the database
    for s in target_schemas:
        try:
            tbl = db.execute(text("SELECT to_regclass(:t)"), {"t": f'"{s}".users'}).scalar()
            if tbl:
                db.execute(
                    text(f'UPDATE "{s}".users SET tfa_enabled = TRUE, updated_at = NOW() WHERE LOWER(email) = :e'),
                    {"e": norm_email},
                )
        except Exception:
            db.rollback()

    try:
        db.execute(
            text("UPDATE public.tenant_users SET tfa_enabled = TRUE, updated_at = NOW() WHERE LOWER(email) = :e"),
            {"e": norm_email},
        )
    except Exception:
        db.rollback()

    try:
        db.execute(
            text("UPDATE public.users SET tfa_enabled = TRUE WHERE LOWER(email) = :e"),
            {"e": norm_email},
        )
    except Exception:
        db.rollback()

    try:
        db.execute(
            text("UPDATE public.master_users SET tfa_enabled = TRUE, updated_at = NOW() WHERE LOWER(email) = :e"),
            {"e": norm_email},
        )
    except Exception:
        db.rollback()

    db.commit()
    logger.info("[2FA VERIFIED] User %s successfully validated 2FA code.", _masked_identifier(norm_email))

    # If verifying during login handshake, issue full access token
    if payload.two_factor_token and claims:
        from backend.two_tier_auth import issue_two_tier_jwt
        tier = claims.get("tier", "tenant")
        user_id = uuid.UUID(claims["sub"])
        token = issue_two_tier_jwt(
            tier=tier,
            user_id=user_id,
            identity=norm_email,
            role=claims.get("role", "admin"),
            tenant_id=uuid.UUID(claims["tenant_id"]) if claims.get("tenant_id") else None,
            tenant_slug=claims.get("tenant_slug"),
        )
        tenant_id_str = str(claims["tenant_id"]) if claims.get("tenant_id") else None
        tenant_slug_val = claims.get("tenant_slug", raw_slug)
        return {
            "status": "SUCCESS",
            "access_token": token,
            "token_type": "bearer",
            "tier": tier,
            "role": claims.get("role", "admin"),
            "tenant_slug": tenant_slug_val,
            "tenant_id": tenant_id_str,
            "user": {
                "id": str(user_id),
                "email": norm_email,
                "role": claims.get("role", "admin"),
                "fullName": f"{tenant_slug_val.upper()} Admin",
                "fullNameAr": f"مسؤول {tenant_slug_val}",
                "status": "Active",
                "company_id": tenant_id_str,
                "tenant_id": tenant_id_str,
            },
        }

    return {
        "status": "SUCCESS",
        "message": "Two-factor authentication successfully enabled and verified.",
        "tfa_enabled": True,
        "email": norm_email,
    }

