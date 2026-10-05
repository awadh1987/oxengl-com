"""
OxenGL ERP - Password Recovery Roadmap Scaffold (Phase A).
Filename: backend/app/api/v1/auth_recovery.py

SCAFFOLD ONLY - this router is intentionally NOT mounted in ``backend/app/main.py``. Every endpoint
returns ``501 Not Implemented``. It sets out the API surface, request/response contracts and
authorisation boundaries for the three recovery tiers described in
``docs/architecture/password-reset-and-backup-strategy.md``:

1. Self-service user recovery    - anonymous; dual channel (email link / SMS-WhatsApp OTP)
2. Tenant admin management       - authenticated tenant Admin/Owner, own tenant only
3. Super admin platform rescue   - platform Super_Admin only, always audited

The live recovery endpoints remain ``backend/app/api/v1/auth.py`` (``/forgot-password``,
``/reset-password``) and ``backend/two_tier_auth.py`` (``/api/auth/recover-password``,
``/api/auth/reset-password``). Hardened 2026-10-04 (incident Addendum D). This module will replace them
once Phase A is implemented.

Security invariants (non-negotiable, learned from incident 2026-10-04 Addendum D):
  * Initiation responses are IDENTICAL whether or not the account exists, and NEVER contain the
    OTP, the reset token, or the recovery link. Secrets travel only over the out-of-band channel.
  * OTPs / tokens are generated with ``secrets`` (CSPRNG), stored only as hashes, are single-use,
    short-lived (OTP 5 min, link 15 min) and destroyed after ``MAX_VERIFY_ATTEMPTS`` failed guesses.
  * OTPs / tokens / temporary passwords are NEVER written to logs.
  * A completed reset revokes every active session and refresh token of the account.
  * The tenant is ALWAYS derived from the authenticated caller, never from headers / query / body.
  * Every admin / super-admin credential action is written to the audit trail.
"""

from __future__ import annotations

import enum
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.app.core.auth import get_authenticated_user, require_super_admin

# FastAPI dependency aliases (Annotated form keeps call expressions out of argument defaults).
AuthenticatedUser = Annotated[Any, Depends(get_authenticated_user)]
SuperAdminUser = Annotated[Any, Depends(require_super_admin)]

# Recovery policy constants (Phase A will read these from settings).
OTP_TTL_SECONDS = 5 * 60
LINK_TTL_SECONDS = 15 * 60
MAX_VERIFY_ATTEMPTS = 5
TEMP_PASSWORD_LENGTH = 16

router = APIRouter(prefix="/api/v1/auth/recovery", tags=["Password Recovery (roadmap scaffold)"])

_NOT_IMPLEMENTED = "Password recovery v2 is on the Phase A roadmap and not implemented yet."


def _not_implemented() -> HTTPException:
    return HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_NOT_IMPLEMENTED)


# =============================================================================================
# Contracts
# =============================================================================================


class RecoveryChannel(str, enum.Enum):
    EMAIL = "email"  # tokenised link (+ OTP fallback) via SMTP / SendGrid
    SMS = "sms"  # 6-digit OTP via Twilio / Vonage
    WHATSAPP = "whatsapp"  # 6-digit OTP via WhatsApp Business API


class RecoveryInitiateRequest(BaseModel):
    identifier: str = Field(..., description="Registered email address or E.164 mobile number")
    channel: RecoveryChannel = Field(RecoveryChannel.EMAIL, description="Out-of-band delivery channel")
    workspace_slug: str | None = Field(None, description="Tenant workspace; omitted for platform accounts")


class RecoveryInitiateResponse(BaseModel):
    """Uniform acknowledgement. MUST NOT reveal account existence or carry any secret."""

    status: str = "RECOVERY_REQUESTED"
    message: str = "If an account matches the details provided, a verification code has been sent."
    expires_in_seconds: int = OTP_TTL_SECONDS


class RecoveryVerifyRequest(BaseModel):
    identifier: str
    workspace_slug: str | None = None
    code: str | None = Field(None, min_length=6, max_length=6, description="6-digit OTP (SMS / WhatsApp / email)")
    link_token: str | None = Field(None, description="Token from the emailed recovery link")


class RecoveryVerifyResponse(BaseModel):
    """Short-lived, single-purpose grant that can ONLY be exchanged for a password change."""

    reset_grant: str
    expires_in_seconds: int = 300


class RecoveryCompleteRequest(BaseModel):
    reset_grant: str
    new_password: str = Field(..., min_length=10, description="Must satisfy the platform password policy")


class AdminResetMode(str, enum.Enum):
    SEND_LINK = "send_link"  # dispatch a recovery link / OTP to the user
    TEMPORARY_PASSWORD = "temporary_password"  # one-time temporary password, forced change on next login


class TenantAdminResetRequest(BaseModel):
    mode: AdminResetMode = AdminResetMode.SEND_LINK
    channel: RecoveryChannel = RecoveryChannel.EMAIL
    reveal_on_screen: bool = Field(
        False,
        description="TEMPORARY_PASSWORD only: show the one-time password once to the admin instead of sending it",
    )


class AdminResetResponse(BaseModel):
    status: str
    must_change_password: bool = True
    # Present ONLY for mode=temporary_password with reveal_on_screen=true; shown once, never logged or stored.
    temporary_password: str | None = None


class PlatformRescueRequest(BaseModel):
    mode: AdminResetMode = AdminResetMode.SEND_LINK
    channel: RecoveryChannel = RecoveryChannel.EMAIL
    reason: str = Field(..., min_length=10, description="Mandatory justification recorded in the platform audit trail")


# =============================================================================================
# Provider hooks (Phase A wires SMTP/SendGrid + Twilio/WhatsApp behind these interfaces)
# =============================================================================================


class RecoveryDeliveryProvider:
    """Out-of-band delivery hook. Implementations must never log the secret they deliver."""

    channel: RecoveryChannel

    async def send(self, destination: str, secret: str, *, locale: str = "en", workspace_name: str = "") -> None:
        raise NotImplementedError


class ConfiguredRecoveryDeliveryProvider(RecoveryDeliveryProvider):
    def __init__(self, channel: RecoveryChannel, tenant_id: uuid.UUID | None = None) -> None:
        self.channel = channel
        self.tenant_id = tenant_id

    async def send(self, destination: str, secret: str, *, locale: str = "en", workspace_name: str = "") -> None:
        from backend.app.services.communication_service import CommunicationError, send_message

        if self.channel not in {RecoveryChannel.EMAIL, RecoveryChannel.SMS}:
            raise CommunicationError("WhatsApp recovery delivery is not configured.")
        content = f"Your OxenGL password recovery code is {secret}. It expires shortly."
        await send_message(self.channel.value, destination, content, tenant_id=self.tenant_id)


def get_delivery_provider(
    channel: RecoveryChannel, tenant_id: uuid.UUID | None = None
) -> RecoveryDeliveryProvider:
    """Resolve the native tenant override or platform default for recovery delivery."""
    if channel not in {RecoveryChannel.EMAIL, RecoveryChannel.SMS}:
        raise ValueError("Unsupported recovery delivery channel.")
    return ConfiguredRecoveryDeliveryProvider(channel, tenant_id)


# =============================================================================================
# Authorisation helpers
# =============================================================================================

_TENANT_ADMIN_ROLES = {"ADMIN", "OWNER"}


def require_tenant_admin(current_user: AuthenticatedUser):
    """Authenticated tenant Admin/Owner bound to a tenant. Platform super admins use the rescue tier."""
    role = str(getattr(current_user, "role", "") or "").strip().upper().replace(" ", "_").replace("-", "_")
    if getattr(current_user, "company_id", None) is None or role not in _TENANT_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant Admin or Owner role required.")
    return current_user


TenantAdminUser = Annotated[Any, Depends(require_tenant_admin)]


# =============================================================================================
# Tier 1 - Self-service user recovery (anonymous)
# =============================================================================================


@router.post("/initiate", response_model=RecoveryInitiateResponse)
async def initiate_recovery(payload: RecoveryInitiateRequest, request: Request):
    """Issue an OTP / link over the chosen channel. Always returns the uniform acknowledgement.

    Phase A: rate-limit per IP + identifier; resolve account (email or phone) inside the workspace;
    hash + store the secret (CSPRNG); dispatch via ``get_delivery_provider``; no enumeration.
    """
    raise _not_implemented()


@router.post("/verify", response_model=RecoveryVerifyResponse)
async def verify_recovery(payload: RecoveryVerifyRequest, request: Request):
    """Exchange a valid OTP / link token for a short-lived ``reset_grant``.

    Phase A: constant-time compare; single use; destroy after ``MAX_VERIFY_ATTEMPTS`` failures.
    """
    raise _not_implemented()


@router.post("/complete")
async def complete_recovery(payload: RecoveryCompleteRequest, request: Request):
    """Set the new password with a valid ``reset_grant``.

    Phase A: enforce password policy; Argon2id hash; revoke ALL sessions + refresh tokens of the account;
    notify the user over the other channel that their password changed.
    """
    raise _not_implemented()


# =============================================================================================
# Tier 2 - Tenant admin management (own tenant only)
# =============================================================================================


@router.post("/tenant/users/{user_id}/reset", response_model=AdminResetResponse)
async def tenant_admin_reset_user(
    user_id: uuid.UUID,
    payload: TenantAdminResetRequest,
    request: Request,
    admin: TenantAdminUser,
):
    """Reset a user's password inside the caller's tenant.

    Phase A: target must belong to ``admin.company_id`` (else 404); cannot target Super_Admin / platform
    accounts; sets ``must_change_password``; revokes the target's sessions; writes tenant audit log.
    """
    raise _not_implemented()


# =============================================================================================
# Tier 3 - Super admin platform rescue
# =============================================================================================


@router.post("/platform/tenants/{tenant_id}/users/{user_id}/rescue", response_model=AdminResetResponse)
async def platform_rescue_tenant_admin(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: PlatformRescueRequest,
    request: Request,
    super_admin: SuperAdminUser,
):
    """Re-issue credentials / dispatch a recovery for a locked-out tenant Owner or Admin.

    Phase A: verify the user belongs to ``tenant_id``; mandatory ``reason``; platform audit record
    (actor, target, tenant, mode, IP, request id); notify the tenant's other owners.
    """
    raise _not_implemented()
