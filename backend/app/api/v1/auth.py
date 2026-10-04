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
from typing import Optional

import pyotp
from jinja2 import Environment, FileSystemLoader

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.database import get_db

try:
    from backend.app.services.notification_service import VerificationService
except ImportError:
    from app.services.notification_service import VerificationService

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
    email: str = Field(..., description="Registered account email address")
    workspace_slug: Optional[str] = Field("master", description="Target tenant workspace identifier")


class ResetPasswordConfirmRequest(BaseModel):
    token: Optional[str] = Field(None, description="Cryptographically signed reset token or 6-digit OTP")
    otp_code: Optional[str] = Field(None, description="6-digit Redis OTP verification code")
    code: Optional[str] = Field(None, description="Alias for 6-digit OTP verification code")
    email: Optional[str] = Field(None, description="Registered account email address")
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
        logger.warning(f"Note on password_resets table verification: {err}")


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
):
    """
    Password Recovery Initiation Endpoint with Redis 6-Digit OTP.
    Verifies user presence across the workspace partition, generates a 6-digit OTP
    via VerificationService stored in Redis (5-min TTL), persists backward-compatible token,
    dispatches email/SMS notifications, and returns response.
    """
    ensure_password_resets_table(db)

    norm_email = payload.email.strip().lower()
    raw_slug = (payload.workspace_slug or "master").strip().lower()

    slug_variants = list(dict.fromkeys([
        raw_slug,
        raw_slug.replace("-", "_"),
        raw_slug.replace("_", "-"),
    ]))

    company_name = "OxenGL Enterprise"
    if raw_slug in ("master", "platform", "system", "superadmin", "super-admin"):
        tenant_row = {"id": "master", "slug": raw_slug, "name": "Platform Master Control Plane"}
        company_name = "OxenGL Platform Master"
    else:
        # 1. Verify workspace/tenant partition existence
        tenant_row = db.execute(
            text("SELECT id, slug, name FROM public.master_tenants WHERE slug = ANY(:slugs) LIMIT 1"),
            {"slugs": slug_variants},
        ).mappings().first()

        if not tenant_row:
            comp_row = db.execute(
                text("SELECT id, domain_slug AS slug, name FROM public.res_companies WHERE domain_slug = ANY(:slugs) OR slug = ANY(:slugs) LIMIT 1"),
                {"slugs": slug_variants},
            ).mappings().first()
            tenant_row = comp_row

        if not tenant_row:
            # Addendum D: the old fallback also probed public.users (absent) and raised HTTP 500 for unknown
            # accounts - itself an enumeration oracle. Any lookup failure now yields the uniform response.
            try:
                user_exists_anywhere = db.execute(
                    text("SELECT id FROM public.tenant_users WHERE LOWER(email) = :e LIMIT 1"),
                    {"e": norm_email},
                ).first()
            except Exception:
                db.rollback()
                user_exists_anywhere = None
            if not user_exists_anywhere:
                return _generic_recovery_response()  # no workspace / account enumeration
            tenant_row = {"id": raw_slug, "slug": raw_slug, "name": raw_slug.capitalize()}

        company_name = tenant_row.get("name", raw_slug)

    # 2. Verify user exists inside that partition
    sanitized_slug = re.sub(r"[^a-zA-Z0-9_]", "_", raw_slug)
    target_schemas = list(dict.fromkeys([
        sanitized_slug,
        raw_slug,
        tenant_row.get("slug", raw_slug),
        str(tenant_row.get("slug", raw_slug)).replace("-", "_"),
    ]))

    user_found = False
    user_phone = None
    for schema_name in target_schemas:
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
                text("SELECT id, email, phone FROM public.res_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": norm_email},
            ).mappings().first()
            if chk:
                user_found = True
                user_phone = chk.get("phone")
        except Exception:
            db.rollback()

    if not user_found:
        return _generic_recovery_response()  # no account enumeration

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

    # 4. Asynchronously dispatch verification notifications via Email and SMS
    background_tasks.add_task(VerificationService.dispatch_email_otp, norm_email, otp, str(company_name))
    if user_phone:
        background_tasks.add_task(VerificationService.dispatch_sms_otp, user_phone, otp)

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
        logger.error(f"Failed to record password reset token: {err}")

    recovery_link = f"https://{raw_slug}.oxengl.me/reset-password?email={norm_email}&otp={otp}" if raw_slug and raw_slug != "master" else f"https://oxengl.me/reset-password?email={norm_email}&otp={otp}"

    logger.info("[PASSWORD RECOVERY] verification code issued for a registered account (workspace=%s)", raw_slug)

    # Compile HTML recovery email template via Jinja2
    try:
        template = template_env.get_template("auth/forgot_password.html")
        html_payload = template.render(
            workspace_slug=payload.workspace_slug,
            recovery_url=recovery_link,
            otp_code=otp,
            expires_at=expires_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
        )
    except Exception as tmpl_err:
        logger.warning(f"Could not render recovery email template: {tmpl_err}")

    return _generic_recovery_response()


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@router.post("/auth/reset-password", status_code=status.HTTP_200_OK)
@router.post("/password-reset-verify", status_code=status.HTTP_200_OK)
@router.post("/auth/password-reset-verify", status_code=status.HTTP_200_OK)
async def confirm_password_reset(payload: ResetPasswordConfirmRequest, db: Session = Depends(get_db)):
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
    norm_email = (payload.email or "").strip().lower()
    raw_slug = (payload.workspace_slug or "").strip().lower()

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
        logger.error(f"Error purging reset token: {err}")

    logger.info(f"[PASSWORD RESET] Password successfully updated for {norm_email} across {updated_count} record(s).")
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

    logger.info("[2FA SETUP] provisioned a new TOTP secret for %s (workspace=%s)", norm_email, raw_slug)  # never log the secret/URI

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
    logger.info(f"[2FA VERIFIED] User {norm_email} successfully validated 2FA code.")

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

