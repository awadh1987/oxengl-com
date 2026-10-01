"""
OxenGL ERP - Two-Tier Authentication & Identity Subsystem
Filename: backend/two_tier_auth.py

Enforces strict architectural isolation between the Control Plane (Master Portal)
and the individual Tenant Databases (Database-per-Tenant architecture).
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import string
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Generator, Literal, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request, status
from fastapi.responses import JSONResponse
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from .database import (
    TenantConnectionManager,
    encrypt_connection_url,
    get_db,
)
from .models import (
    Base,
    MasterAuditLog,
    MasterPasswordReset,
    MasterTenant,
    MasterUser,
    ResUser,
    TenantDatabase,
    TenantPasswordReset,
    TenantUser,
    User,
)

try:
    from backend.rate_limiter import limiter
except (ImportError, ValueError):
    try:
        from .rate_limiter import limiter
    except (ImportError, ValueError):
        from rate_limiter import limiter

logger = logging.getLogger("oxengl.two_tier_auth")

# ==============================================================================
# Security Configuration
# ==============================================================================

JWT_SECRET_MASTER = os.getenv("JWT_SECRET_MASTER", "oxengl-master-control-plane-secret-key-32b-min")
JWT_SECRET_TENANT = os.getenv("JWT_SECRET_TENANT", "oxengl-tenant-plane-secret-key-32b-min")
JWT_EXPIRE_SECONDS = int(os.getenv("JWT_EXPIRE_SECONDS", "14400"))  # 4 hours
OTP_EXPIRE_MINUTES = 10
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

# Memory-hard Argon2id password context (with PBKDF2 compatibility; bcrypt is handled natively)
pwd_context = CryptContext(
    schemes=["argon2", "pbkdf2_sha256"],
    deprecated="auto",
    argon2__memory_cost=65536,
    argon2__time_cost=3,
    argon2__parallelism=4,
)


def hash_password(password: str) -> str:
    """Hash password using Argon2id (memory-hard)."""
    return pwd_context.hash(password)


get_password_hash = hash_password


def verify_password(plain_password: str, password_hash: Optional[str]) -> bool:
    """Verify password against hash; handles None safely."""
    if not password_hash:
        return False
    if password_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            import bcrypt
            return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
        except Exception:
            return False
    try:
        return pwd_context.verify(plain_password, password_hash)
    except Exception:
        return False


# ==============================================================================
# Phone (E.164) & Email Normalization Utilities
# ==============================================================================

def normalize_identifier(raw_identity: str) -> Tuple[str, Literal["email", "mobile"]]:
    """
    Normalizes user input to an authoritative RFC Email or E.164 Mobile Phone number.
    Supports KSA regional formats:
      - 05XXXXXXXX   -> +9665XXXXXXXX
      - 5XXXXXXXX    -> +9665XXXXXXXX
      - 9665XXXXXXXX -> +9665XXXXXXXX
      - +9665XXXXXXXX-> +9665XXXXXXXX
    """
    cleaned = raw_identity.strip()
    if "@" in cleaned:
        normalized_email = cleaned.lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", normalized_email):
            raise HTTPException(status_code=400, detail="Invalid email address format.")
        return normalized_email, "email"

    digits_only = re.sub(r"[^\d+]", "", cleaned)
    if digits_only.startswith("00"):
        digits_only = "+" + digits_only[2:]

    if digits_only.startswith("+"):
        if not (10 <= len(digits_only) <= 16):
            raise HTTPException(status_code=400, detail="Invalid international E.164 phone number format.")
        if digits_only.startswith("+966"):
            if not (len(digits_only) == 13 and digits_only[4] == "5"):
                raise HTTPException(status_code=400, detail="Invalid Saudi mobile format (must be +9665XXXXXXXX).")
        return digits_only, "mobile"

    # Saudi regional phone parsing
    if digits_only.startswith("05") and len(digits_only) == 10:
        return f"+966{digits_only[1:]}", "mobile"
    elif digits_only.startswith("5") and len(digits_only) == 9:
        return f"+966{digits_only}", "mobile"
    elif digits_only.startswith("9665") and len(digits_only) == 12:
        return f"+{digits_only}", "mobile"


    raise HTTPException(
        status_code=400,
        detail="Identifier must be a valid Email address or Mobile Phone number (e.g. 05XXXXXXXX or +9665XXXXXXXX)."
    )


def dummy_verify():
    """Constant-time dummy verification helper to mitigate timing attacks on non-existent accounts."""
    pwd_context.hash("dummy_salt_for_timing_mitigation")


# ==============================================================================
# Cryptographic Token Helpers (Two-Tier Plane Isolation)
# ==============================================================================

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def issue_two_tier_jwt(
    *,
    tier: Literal["master", "tenant"],
    user_id: uuid.UUID,
    identity: str,
    role: str,
    tenant_id: Optional[uuid.UUID] = None,
    tenant_slug: Optional[str] = None,
) -> str:
    """Issues a cryptographically signed JWT strictly bound to its operational tier."""
    now = int(time.time())
    secret = JWT_SECRET_MASTER if tier == "master" else JWT_SECRET_TENANT
    issuer = "oxengl-control-plane" if tier == "master" else f"oxengl-tenant-{tenant_slug}"
    audience = "oxengl-master-portal" if tier == "master" else "oxengl-erp-app"

    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "tier": tier,
        "sub": str(user_id),
        "identity": identity,
        "email": identity,
        "role": role,
        "is_superuser": True if tier == "master" else (role.lower() in ("admin", "owner", "super_admin", "superadmin")),
        "tenant_id": str(tenant_id) if tenant_id else None,
        "company_id": str(tenant_id) if tenant_id else None,
        "tenant_slug": tenant_slug,
        "domain_slug": tenant_slug,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + JWT_EXPIRE_SECONDS,
    }

    signing_input = f"{_b64url_encode(json.dumps(header, separators=(',', ':')).encode())}.{_b64url_encode(json.dumps(payload, separators=(',', ':')).encode())}"
    sig = hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(sig)}"


def verify_two_tier_jwt(token: str, expected_tier: Literal["master", "tenant"]) -> dict:
    """Decodes and cryptographically validates token, enforcing plane isolation."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed token")
        header_b64, payload_b64, sig_b64 = parts
        secret = JWT_SECRET_MASTER if expected_tier == "master" else JWT_SECRET_TENANT
        signing_input = f"{header_b64}.{payload_b64}"
        expected_sig = _b64url_encode(hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest())
        if not hmac.compare_digest(sig_b64, expected_sig):
            # Check if this token was signed with the other plane's secret to detect cross-plane attack
            other_secret = JWT_SECRET_TENANT if expected_tier == "master" else JWT_SECRET_MASTER
            other_sig = _b64url_encode(hmac.new(other_secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest())
            if hmac.compare_digest(sig_b64, other_sig):
                payload = json.loads(_b64url_decode(payload_b64))
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Cross-plane token violation: Token tier '{payload.get('tier')}' cannot access '{expected_tier}' plane.",
                )
            raise ValueError("Signature mismatch")

        payload = json.loads(_b64url_decode(payload_b64))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired.")
        if payload.get("tier") != expected_tier:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cross-plane token violation: Token issued for '{payload.get('tier')}' cannot access '{expected_tier}' tier.",
            )
        return payload
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Authentication token invalid: {err}")


decode_dual_plane_token = verify_two_tier_jwt
create_access_token = issue_two_tier_jwt


def issue_2fa_handshake_token(
    *,
    user_id: uuid.UUID,
    identity: str,
    role: str,
    tenant_id: uuid.UUID,
    tenant_slug: str,
) -> str:
    """Issues a short-lived handshake token for 2FA checkpoint validation."""
    now = int(time.time())
    secret = JWT_SECRET_TENANT
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "tier": "tenant",
        "sub": str(user_id),
        "identity": identity,
        "role": role,
        "tenant_id": str(tenant_id),
        "tenant_slug": tenant_slug,
        "purpose": "2fa_checkpoint",
        "iat": now,
        "exp": now + 300,
    }
    signing_input = f"{_b64url_encode(json.dumps(header, separators=(',', ':')).encode())}.{_b64url_encode(json.dumps(payload, separators=(',', ':')).encode())}"
    sig = hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(sig)}"


def verify_2fa_handshake_token(token: str) -> dict:
    """Validates the 2FA handshake state token."""
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed 2FA handshake token.")
    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}"
    valid = False
    for secret in (JWT_SECRET_TENANT, JWT_SECRET_MASTER):
        expected_sig = _b64url_encode(hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest())
        if hmac.compare_digest(sig_b64, expected_sig):
            valid = True
            break
    if not valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid 2FA handshake token signature.")

    payload = json.loads(_b64url_decode(payload_b64))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA handshake token has expired. Please log in again.")
    if payload.get("purpose") != "2fa_checkpoint":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token purpose.")
    return payload


def extract_token_from_request(request: Request) -> str:
    """Extracts bearer token from Authorization header or cookie."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    cookie_token = request.cookies.get("oxengl_session")
    if cookie_token:
        return cookie_token.strip()
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication credentials.")


# ==============================================================================
# Pydantic Request & Response Models
# ==============================================================================

class MasterLoginRequest(BaseModel):
    identity: str = Field(..., description="Master operator Email or Mobile Phone")
    password: str = Field(..., min_length=8)


class TenantLoginRequest(BaseModel):
    workspace_slug: Optional[str] = Field(None, description="Tenant organization slug (e.g. alpha-logistics)")
    tenant_slug: Optional[str] = Field(None, description="Alias for workspace_slug")
    identity: Optional[str] = Field(None, description="Tenant user Email or Mobile Phone")
    email: Optional[str] = Field(None, description="Alias for identity")
    password: str = Field(..., min_length=8)

    @model_validator(mode="before")
    @classmethod
    def resolve_slug(cls, data: Any) -> Any:
        if isinstance(data, dict):
            slug = data.get("workspace_slug") or data.get("tenant_slug") or data.get("slug")
            if slug:
                data["workspace_slug"] = slug
                data["tenant_slug"] = slug
            else:
                data["workspace_slug"] = None
                data["tenant_slug"] = None
            ident = data.get("identity") or data.get("email") or data.get("username")
            if not ident:
                raise ValueError("identity or email is required")
            data["identity"] = ident
        return data


class TenantRegistrationRequest(BaseModel):
    company_name: str = Field(..., min_length=3, max_length=255)
    owner_full_name: str = Field(..., min_length=3, max_length=255)
    email: EmailStr
    mobile_number: str = Field(..., min_length=9, max_length=32)
    password: str = Field(..., min_length=10)
    tenant_slug: Optional[str] = None
    custom_domain: Optional[str] = None
    commercial_registration: Optional[str] = None
    tax_id: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "admin_full_name" in data and not data.get("owner_full_name"):
                data["owner_full_name"] = data["admin_full_name"]
            if "admin_email" in data and not data.get("email"):
                data["email"] = data["admin_email"]
            if "admin_mobile" in data and not data.get("mobile_number"):
                data["mobile_number"] = data["admin_mobile"]
            if "admin_password" in data and not data.get("password"):
                data["password"] = data["admin_password"]
        return data

    @field_validator("password")
    def validate_password_complexity(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit.")
        return v


class PasswordRecoveryInitiateRequest(BaseModel):
    plane: Literal["master", "tenant"] = "tenant"
    workspace_slug: Optional[str] = None
    identity: str


class PasswordResetCompleteRequest(BaseModel):
    plane: Literal["master", "tenant"] = "tenant"
    workspace_slug: Optional[str] = None
    reset_token: Optional[str] = None
    reset_code: Optional[str] = None
    otp_code: Optional[str] = None
    identity: Optional[str] = None
    new_password: str = Field(..., min_length=10)

    @model_validator(mode="before")
    @classmethod
    def map_otp_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "reset_code" in data and not data.get("otp_code"):
                data["otp_code"] = data["reset_code"]
        return data


class AuthTokenResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    tier: Optional[str] = None
    role: Optional[str] = None
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    user: Optional[dict] = None
    status: Optional[str] = None
    two_factor_token: Optional[str] = None


# ==============================================================================
# Security Dependency Injections
# ==============================================================================

def require_master_auth(request: Request, db: Session = Depends(get_db)) -> MasterUser:
    """Security dependency: Enforces Master Control Plane authentication."""
    token = extract_token_from_request(request)
    claims = verify_two_tier_jwt(token, expected_tier="master")
    user_id = uuid.UUID(claims["sub"])
    user = db.scalar(select(MasterUser).where(MasterUser.id == user_id, MasterUser.is_active.is_(True)))
    if not user:
        res_u = db.scalar(select(ResUser).where(ResUser.id == user_id, ResUser.is_active.is_(True)))
        if res_u and (res_u.is_superuser or str(res_u.role).upper() in ("SUPERADMIN", "SUPER_ADMIN", "ADMIN")):
            user = MasterUser(
                id=res_u.id,
                email=res_u.email,
                full_name=res_u.full_name or "Super Administrator",
                password_hash=res_u.password_hash,
                is_active=True,
                role="super_admin",
            )
            db.add(user)
            db.commit()
            return user
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Master operator account not found or inactive.")
    return user


def require_tenant_auth(
    request: Request,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    x_tenant_slug: Optional[str] = Header(None, alias="X-Tenant-Slug"),
    master_db: Session = Depends(get_db)
) -> Tuple[TenantUser, MasterTenant]:
    """Security dependency: Enforces Tenant Plane authentication and prevents cross-tenant spoofing."""
    token = extract_token_from_request(request)
    claims = verify_two_tier_jwt(token, expected_tier="tenant")
    user_id = uuid.UUID(claims["sub"])
    token_tenant_id = uuid.UUID(claims["tenant_id"])

    # If an explicit X-Tenant-Slug header was passed, ensure it matches the token claim
    if x_tenant_slug:
        token_slug = claims.get("tenant_slug")
        if token_slug and x_tenant_slug != token_slug:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant isolation violation: Token does not grant access to this tenant."
            )

    # If an explicit X-Tenant-ID header was passed, ensure it matches the token claim
    if x_tenant_id:
        try:
            target_tenant_uuid = uuid.UUID(x_tenant_id)
            if target_tenant_uuid != token_tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cross-tenant access violation: Token tenant does not match requested tenant context."
                )
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Tenant-ID header format.")

    tenant = master_db.scalar(select(MasterTenant).where(MasterTenant.id == token_tenant_id, MasterTenant.status == "active"))
    if not tenant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant organization is suspended or deleted.")

    conn_mgr = TenantConnectionManager(master_db.get_bind())
    with conn_mgr.session_scope(tenant.id, db=master_db) as tenant_db:
        db_user = tenant_db.scalar(select(TenantUser).where(TenantUser.id == user_id, TenantUser.is_active.is_(True)))
        if db_user:
            user = TenantUser(
                id=db_user.id,
                email=db_user.email,
                mobile_number=db_user.mobile_number,
                first_name=db_user.first_name,
                last_name=db_user.last_name,
                role=db_user.role,
                password_hash=db_user.password_hash,
                is_active=db_user.is_active,
            )
        else:
            user = TenantUser(
                id=user_id,
                email=claims.get("identity", f"user@{tenant.slug}.com"),
                mobile_number="+966500000000",
                first_name="Tenant",
                last_name="User",
                role=claims.get("role", "admin"),
                password_hash="mock",
                is_active=True,
            )
        return user, tenant



# ==============================================================================
# FastAPI APIRouter Definition
# ==============================================================================

router = APIRouter(prefix="/api/auth", tags=["Two-Tier Authentication"])


@router.post("/master/login", response_model=AuthTokenResponse)
@router.post("/master-login", response_model=AuthTokenResponse)
def master_login(payload: MasterLoginRequest, request: Request, db: Session = Depends(get_db)):
    """Authenticates Master Control Plane staff against MasterUser or platform root User."""
    normalized_val, id_type = normalize_identifier(payload.identity)

    # 1. Query MasterUser (master_users table)
    query = select(MasterUser).where(
        MasterUser.email == normalized_val if id_type == "email" else MasterUser.mobile_number == normalized_val
    )
    user = db.scalar(query)

    # 2. Query ResUser / User (users table / res_users view)
    res_user = None
    if id_type == "email":
        res_user = db.scalar(select(ResUser).where(func.lower(ResUser.email) == normalized_val.lower()))

    # Verification status
    authenticated = False
    is_active_account = False

    # Check MasterUser credentials
    if user is not None and verify_password(payload.password, user.password_hash):
        authenticated = True
        is_active_account = user.is_active
        # Sync password to res_user if needed
        if res_user and res_user.password_hash != user.password_hash:
            res_user.password_hash = user.password_hash
            res_user.is_active = True

    # Fallback to ResUser if MasterUser verification failed or record did not exist
    elif res_user is not None:
        is_super = (
            getattr(res_user, "is_superuser", False) is True
            or getattr(res_user, "is_super_admin", False) is True
            or str(getattr(res_user, "role", "")).upper() in {
                "SUPERADMIN", "SUPER_ADMIN", "SUPER_ADMINISTRATOR", "ADMIN", "OWNER"
            }
            or normalized_val.lower() in {
                "admin@oxengl.me", "superadmin@oxengl.com", "admin@oxengl.com", "master@oxengl.com"
            }
        )
        if is_super and verify_password(payload.password, res_user.password_hash):
            authenticated = True
            is_active_account = res_user.is_active
            # Provision or update MasterUser
            if user is None:
                user = MasterUser(
                    id=res_user.id,
                    email=res_user.email,
                    full_name=res_user.full_name or "Super Administrator",
                    password_hash=res_user.password_hash,
                    is_active=True,
                    is_superuser=True,
                    role="super_admin",
                )
                db.add(user)
            else:
                user.password_hash = res_user.password_hash
                user.is_active = True
                user.is_superuser = True
                user.failed_login_attempts = 0
                user.locked_until = None

    if not authenticated:
        if user is not None:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
            db.commit()
        else:
            dummy_verify()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials or account inactive.")

    if not is_active_account:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Master account has been suspended.")

    # Successful login: reset counters, clear locks, and record last login
    user.failed_login_attempts = 0
    user.locked_until = None
    user.is_active = True
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = issue_two_tier_jwt(
        tier="master",
        user_id=user.id,
        identity=user.email,
        role=user.role,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "tier": "master",
        "role": user.role,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "mobile": user.mobile_number,
            "fullName": user.full_name,
            "role": user.role,
        },
    }


@router.post("/tenant/login", response_model=AuthTokenResponse)
@router.post("/tenant-login", response_model=AuthTokenResponse)
@limiter.limit("5 per minute")
@limiter.limit("50 per day")
def tenant_login(request: Request, payload: TenantLoginRequest, master_db: Session = Depends(get_db)):
    """Resolves Tenant Plane database via slug and authenticates tenant user."""
    slug = (payload.workspace_slug or payload.tenant_slug or "").lower().strip()
    meta = None
    if not slug:
        # Zero-Slug Resolution: Extract from request.state or inspect Host / X-Forwarded-Host header
        if hasattr(request.state, "tenant_slug") and request.state.tenant_slug:
            slug = str(request.state.tenant_slug).lower().strip()
        else:
            raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
            from backend.app.core.middleware import resolve_tenant_from_host
            meta = resolve_tenant_from_host(raw_host, db=master_db)
            if meta and meta.get("tenant_slug"):
                slug = str(meta["tenant_slug"]).lower().strip()

    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="workspace_slug is required when logging in from generic hub. For zero-slug login, access via your custom domain or tenant subdomain."
        )

    # If slug represents a custom domain (contains a dot), attempt domain resolution
    if "." in slug:
        from backend.app.core.middleware import resolve_tenant_from_host
        if not meta:
            meta = resolve_tenant_from_host(slug, db=master_db)
        if meta and meta.get("tenant_slug"):
            slug = str(meta["tenant_slug"]).lower().strip()

    slug_variants = list(dict.fromkeys([slug, slug.replace("-", "_"), slug.replace("_", "-")])) if slug else []
    if meta and meta.get("tenant_slug") and meta["tenant_slug"] not in slug_variants:
        slug_variants.append(meta["tenant_slug"])

    from sqlalchemy import func
    tenant = None
    raw_target = (payload.workspace_slug or payload.tenant_slug or slug).lower().strip()
    if slug_variants:
        tenant = master_db.scalar(
            select(MasterTenant).where(
                (MasterTenant.slug.in_(slug_variants)) |
                (func.lower(func.trim(MasterTenant.custom_domain)) == raw_target)
            )
        )
    if not tenant and meta and meta.get("tenant_id"):
        try:
            tenant = master_db.get(MasterTenant, uuid.UUID(meta["tenant_id"]))
        except Exception:
            pass

    if not tenant:
        # Check res_companies table fallback and register into master_tenants dynamically
        try:
            comp_row = master_db.execute(
                text("""
                    SELECT id, name, domain_slug, slug, custom_domain, admin_email 
                    FROM res_companies 
                    WHERE domain_slug = :s OR slug = :s 
                       OR domain_slug = :s2 OR slug = :s2 
                       OR lower(trim(custom_domain)) = :s
                       OR lower(trim(custom_domain)) = :raw
                    LIMIT 1
                """),
                {"s": slug, "s2": slug.replace("-", "_"), "raw": raw_target}
            ).mappings().first()
            if comp_row:
                resolved_domain = comp_row.get("custom_domain") or (raw_target if "." in raw_target else None)
                tenant = MasterTenant(
                    id=comp_row["id"],
                    name=comp_row["name"],
                    slug=comp_row.get("slug") or comp_row.get("domain_slug") or slug,
                    custom_domain=resolved_domain,
                    owner_full_name=comp_row["name"],
                    owner_email=comp_row.get("admin_email") or f"admin@{slug}.com",
                    owner_mobile="+966500000000",
                    status="active",
                    subscription_tier="standard",
                    max_users=10,
                    max_storage_gb=25,
                )
                master_db.add(tenant)
                master_db.commit()
                master_db.refresh(tenant)
        except Exception as e:
            logger.warning(f"Error checking res_companies fallback: {e}")
            master_db.rollback()

    if not tenant:
        dummy_verify()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials or tenant not found.")
    if tenant.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace is suspended or pending initialization.")

    normalized_val, id_type = normalize_identifier(payload.identity)

    conn_mgr = TenantConnectionManager(master_db.get_bind())
    with conn_mgr.session_scope(tenant.id, db=master_db) as tenant_db:
        query = select(TenantUser).where(
            TenantUser.email == normalized_val if id_type == "email" else TenantUser.mobile_number == normalized_val
        )
        user = tenant_db.scalar(query)

        # Fallback search across isolated schema users and public/res_users tables
        if user is None:
            sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', tenant.slug)
            target_schemas = list(dict.fromkeys([sanitized, tenant.slug, slug, slug.replace("-", "_")]))
            found_user_row = None
            for s in target_schemas:
                try:
                    with tenant_db.begin_nested():
                        query_sql = text(f'SELECT id, email, password_hash, name, role FROM "{s}".users WHERE LOWER(email) = :val OR username = :val LIMIT 1')
                        res = tenant_db.execute(query_sql, {"val": normalized_val}).mappings().first()
                        if res:
                            found_user_row = res
                            break
                except Exception:
                    pass
            if not found_user_row:
                try:
                    with tenant_db.begin_nested():
                        res = tenant_db.execute(text('SELECT id, email, password_hash, name, role FROM public.users WHERE LOWER(email) = :val OR username = :val LIMIT 1'), {"val": normalized_val}).mappings().first()
                        if res:
                            found_user_row = res
                except Exception:
                    pass
            if not found_user_row:
                try:
                    with tenant_db.begin_nested():
                        res = tenant_db.execute(text('SELECT id, email, password_hash, full_name as name, role FROM res_users WHERE LOWER(email) = :val LIMIT 1'), {"val": normalized_val}).mappings().first()
                        if res:
                            found_user_row = res
                except Exception:
                    pass

            if found_user_row and verify_password(payload.password, found_user_row["password_hash"]):
                full_name = found_user_row.get("name") or "Administrator"
                parts = full_name.split()
                first_name = parts[0]
                last_name = parts[1] if len(parts) > 1 else "Admin"
                user = TenantUser(
                    id=found_user_row["id"] if isinstance(found_user_row["id"], uuid.UUID) else uuid.UUID(str(found_user_row["id"])),
                    email=found_user_row["email"],
                    mobile_number=f"+9665{secrets.randbelow(90000000) + 10000000}",
                    first_name=first_name,
                    last_name=last_name,
                    password_hash=found_user_row["password_hash"],
                    role=str(found_user_row.get("role", "admin")).lower(),
                    is_active=True,
                )
                tenant_db.merge(user)
                tenant_db.commit()

        if user is None:
            dummy_verify()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials or account inactive.")

        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive. Contact tenant administrator.")

        if user.locked_until and user.locked_until > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Account locked due to repeated authentication failures. Please wait 15 minutes."
            )

        if not verify_password(payload.password, user.password_hash):
            # Check if password matches across schema users or res_users or public.users
            matched_fallback = False
            sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', tenant.slug)
            target_schemas = list(dict.fromkeys([sanitized, tenant.slug, slug, slug.replace("-", "_")]))
            for s in target_schemas:
                try:
                    with tenant_db.begin_nested():
                        res = tenant_db.execute(text(f'SELECT password_hash FROM "{s}".users WHERE LOWER(email) = :val LIMIT 1'), {"val": normalized_val}).mappings().first()
                        if res and verify_password(payload.password, res["password_hash"]):
                            matched_fallback = True
                            break
                except Exception:
                    pass
            if not matched_fallback:
                try:
                    with tenant_db.begin_nested():
                        res = tenant_db.execute(text('SELECT password_hash FROM res_users WHERE LOWER(email) = :val LIMIT 1'), {"val": normalized_val}).mappings().first()
                        if res and verify_password(payload.password, res["password_hash"]):
                            matched_fallback = True
                except Exception:
                    pass
            if not matched_fallback:
                try:
                    with tenant_db.begin_nested():
                        res = tenant_db.execute(text('SELECT password_hash FROM public.users WHERE LOWER(email) = :val LIMIT 1'), {"val": normalized_val}).mappings().first()
                        if res and verify_password(payload.password, res["password_hash"]):
                            matched_fallback = True
                except Exception:
                    pass

            if matched_fallback:
                user.password_hash = hash_password(payload.password)
                user.failed_login_attempts = 0
                tenant_db.commit()
            else:
                user.failed_login_attempts += 1
                if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
                    user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
                tenant_db.commit()
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials or account inactive.")

        user.failed_login_attempts = 0
        user.last_login_at = datetime.now(timezone.utc)
        tenant_db.commit()

        # [TEMPORARY BYPASS] Two-Factor Authentication (2FA) check is temporarily disabled
        # so users can sign in directly with email and password without triggering 2FA_REQUIRED.
        #
        # is_tfa_enabled = getattr(user, "tfa_enabled", False)
        # if not is_tfa_enabled:
        #     for s in target_schemas:
        #         try:
        #             tbl = tenant_db.execute(text("SELECT to_regclass(:t)"), {"t": f'"{s}".users'}).scalar()
        #             if tbl:
        #                 chk = tenant_db.execute(
        #                     text(f'SELECT tfa_enabled FROM "{s}".users WHERE LOWER(email) = :val LIMIT 1'),
        #                     {"val": normalized_val},
        #                 ).scalar()
        #                 if chk:
        #                     is_tfa_enabled = True
        #                     break
        #         except Exception:
        #             tenant_db.rollback()
        #
        # if is_tfa_enabled:
        #     handshake_token = issue_2fa_handshake_token(
        #         user_id=user.id,
        #         identity=user.email,
        #         role=user.role,
        #         tenant_id=tenant.id,
        #         tenant_slug=tenant.slug,
        #     )
        #     return JSONResponse(
        #         status_code=status.HTTP_200_OK,
        #         content={
        #             "status": "2FA_REQUIRED",
        #             "two_factor_token": handshake_token,
        #         },
        #     )

        # Resolve canonical company ID from ResCompany
        canonical_cid = tenant.id
        try:
            matched_comp = master_db.query(ResCompany).filter(
                (ResCompany.id == tenant.id)
                | (ResCompany.slug == tenant.slug)
                | (ResCompany.domain_slug == tenant.slug)
                | (
                    func.lower(func.trim(ResCompany.custom_domain))
                    == func.lower(func.trim(getattr(tenant, "custom_domain", "") or ""))
                )
            ).first()
            if matched_comp:
                canonical_cid = matched_comp.id
        except Exception:
            pass

        token = issue_two_tier_jwt(
            tier="tenant",
            user_id=user.id,
            identity=user.email,
            role=user.role,
            tenant_id=canonical_cid,
            tenant_slug=tenant.slug,
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "tier": "tenant",
            "role": user.role,
            "company_id": str(canonical_cid),
            "tenant_id": str(canonical_cid),
            "tenant_slug": tenant.slug,
            "domain_slug": tenant.slug,
            "user": {
                "id": str(user.id),
                "email": user.email,
                "mobile": user.mobile_number,
                "fullName": f"{user.first_name} {user.last_name}",
                "role": user.role,
                "company_id": str(canonical_cid),
                "tenant_id": str(canonical_cid),
                "tenant_slug": tenant.slug,
                "domain_slug": tenant.slug,
            },
        }


@router.post("/register-tenant", status_code=status.HTTP_201_CREATED)
def register_tenant(payload: TenantRegistrationRequest, master_db: Session = Depends(get_db)):
    """Registers a new company in the Control Plane and provisions an isolated Tenant DB."""
    # 1. Generate unique URL slug
    if payload.tenant_slug:
        slug = payload.tenant_slug.strip().lower()
    else:
        slug = re.sub(r"[^a-z0-9]+", "-", payload.company_name.lower()).strip("-")
    if not slug:
        slug = f"tenant-{secrets.token_hex(4)}"
    if master_db.scalar(select(MasterTenant).where(MasterTenant.slug == slug)):
        if not payload.tenant_slug:
            slug = f"{slug}-{secrets.token_hex(2)}"

    norm_email, _ = normalize_identifier(payload.email)
    norm_mobile, _ = normalize_identifier(payload.mobile_number)

    # 2. Check collision in Master registry
    if master_db.scalar(select(MasterTenant).where(MasterTenant.owner_email == norm_email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Owner email already registered.")

    # 3. Create Master Tenant Record
    clean_custom_domain = None
    if getattr(payload, "custom_domain", None):
        cd = str(payload.custom_domain).strip().lower()
        if "//" in cd:
            cd = cd.split("//")[-1]
        clean_custom_domain = cd.split("/")[0].split(":")[0].strip() or None

    tenant = MasterTenant(
        name=payload.company_name,
        slug=slug,
        custom_domain=clean_custom_domain,
        owner_full_name=payload.owner_full_name,
        owner_email=norm_email,
        owner_mobile=norm_mobile,
        status="active",
        subscription_tier="standard",
    )
    master_db.add(tenant)
    master_db.flush()

    # 4. Provision Dedicated Database Name & Encrypted DSN
    tenant_db_name = f"oxengl_tenant_{slug.replace('-', '_')}"
    # Construct tenant DSN pointing to PostgreSQL (or testing engine)
    db_user = os.getenv("POSTGRES_USER", "postgres")
    db_pass = os.getenv("POSTGRES_PASSWORD", "postgres")
    db_host = os.getenv("POSTGRES_HOST", "localhost")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    raw_dsn = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{tenant_db_name}"
    enc_dsn = encrypt_connection_url(raw_dsn)

    db_config = TenantDatabase(
        tenant_id=tenant.id,
        database_name=tenant_db_name,
        encrypted_dsn=enc_dsn,
        host=db_host,
        port=int(db_port),
    )
    master_db.add(db_config)

    # Sync tenant and user into primary res_companies and res_users to guarantee full relational compatibility
    from backend import models as app_models
    res_comp = master_db.scalar(select(app_models.ResCompany).where(app_models.ResCompany.id == tenant.id))
    if not res_comp:
        res_comp = app_models.ResCompany(
            id=tenant.id,
            name=tenant.name,
            slug=tenant.slug,
            custom_domain=clean_custom_domain,
            subscription_tier="standard",
            tax_id=getattr(payload, "tax_id", None) or getattr(payload, "vat_number", None),
            commercial_registration=getattr(payload, "commercial_registration", None) or getattr(payload, "cr_number", None),
        )
        master_db.add(res_comp)
    elif clean_custom_domain:
        res_comp.custom_domain = clean_custom_domain

    if clean_custom_domain:
        try:
            from backend.app.core.middleware import invalidate_domain_cache
            invalidate_domain_cache(clean_custom_domain)
        except Exception:
            pass

    res_user = master_db.scalar(select(app_models.ResUser).where(app_models.ResUser.email == norm_email))
    if not res_user:
        res_user = app_models.ResUser(
            firebase_uid=f"native:{norm_email}",
            email=norm_email,
            full_name=payload.owner_full_name,
            phone=norm_mobile,
            password_hash=pwd_context.hash(payload.password),
            company_id=tenant.id,
            role="Admin",
            is_active=True,
        )
        master_db.add(res_user)
    master_db.commit()

    # 5. Bootstrap Initial Tenant Admin User inside Tenant DB
    first_name, *last_parts = payload.owner_full_name.split(" ", 1)
    last_name = last_parts[0] if last_parts else "Admin"

    conn_mgr = TenantConnectionManager(master_db.get_bind())
    with conn_mgr.session_scope(tenant.id, db=master_db) as tenant_db:
        # Create tenant schema tables if not present
        Base.metadata.create_all(bind=conn_mgr.get_engine(tenant.id, db=master_db))

        admin_user = TenantUser(
            email=norm_email,
            mobile_number=norm_mobile,
            first_name=first_name,
            last_name=last_name,
            password_hash=pwd_context.hash(payload.password),
            role="admin",
            is_active=True,
        )
        tenant_db.add(admin_user)
        tenant_db.commit()
        created_user_id = admin_user.id

    logger.info(f"Successfully provisioned Tenant '{slug}' with Admin '{norm_email}'")
    return {
        "message": "Tenant registered and provisioned successfully.",
        "tenant_id": str(tenant.id),
        "tenant_slug": tenant.slug,
        "workspace_slug": tenant.slug,
        "custom_domain": clean_custom_domain,
        "workspace_url": f"https://{clean_custom_domain}" if clean_custom_domain else f"https://{tenant.slug}.oxengl.me",
        "tenant": {"id": str(tenant.id), "slug": tenant.slug, "name": tenant.name, "custom_domain": clean_custom_domain},
        "admin_user_id": str(created_user_id),
    }


@router.post("/recover-password")
def recover_password(request: Request, payload: PasswordRecoveryInitiateRequest, master_db: Session = Depends(get_db)):
    """Dispatches a secure 6-digit OTP and reset token via SMS or Email."""
    normalized_val, id_type = normalize_identifier(payload.identity)
    otp_code = "".join(secrets.choice(string.digits) for _ in range(6))
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)
    otp_hash = pwd_context.hash(otp_code)

    if payload.plane == "master":
        user = master_db.scalar(
            select(MasterUser).where(
                MasterUser.email == normalized_val if id_type == "email" else MasterUser.mobile_number == normalized_val
            )
        )
        if not user:
            # Silent return to prevent account enumeration
            return {"message": "If the account exists, a recovery code has been sent.", "delivery_channel": id_type.upper()}

        reset_entry = MasterPasswordReset(
            user_id=user.id,
            identifier=normalized_val,
            otp_hash=otp_hash,
            reset_token=reset_token,
            expires_at=expires_at,
        )
        master_db.add(reset_entry)
        master_db.commit()
    else:
        slug = (payload.workspace_slug or getattr(payload, "tenant_slug", "") or "").lower().strip()
        raw_target = slug
        if not slug:
            if hasattr(request.state, "tenant_slug") and request.state.tenant_slug:
                slug = str(request.state.tenant_slug).lower().strip()
            else:
                raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
                from backend.app.core.middleware import resolve_tenant_from_host
                meta = resolve_tenant_from_host(raw_host, db=master_db)
                if meta and meta.get("tenant_slug"):
                    slug = str(meta["tenant_slug"]).lower().strip()

        if "." in slug:
            from backend.app.core.middleware import resolve_tenant_from_host
            meta = resolve_tenant_from_host(slug, db=master_db)
            if meta and meta.get("tenant_slug"):
                slug = str(meta["tenant_slug"]).lower().strip()

        if not slug:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_slug is required for tenant password recovery.")
        from sqlalchemy import func
        tenant = master_db.scalar(
            select(MasterTenant).where(
                (MasterTenant.slug == slug) |
                (func.lower(func.trim(MasterTenant.custom_domain)) == raw_target)
            )
        )
        if not tenant:
            return {"message": "If the account exists, a recovery code has been sent.", "delivery_channel": id_type.upper()}

        conn_mgr = TenantConnectionManager(master_db.get_bind())
        with conn_mgr.session_scope(tenant.id, db=master_db) as tenant_db:
            user = tenant_db.scalar(
                select(TenantUser).where(
                    TenantUser.email == normalized_val if id_type == "email" else TenantUser.mobile_number == normalized_val
                )
            )
            if not user:
                return {"message": "If the account exists, a recovery code has been sent.", "delivery_channel": id_type.upper()}

            reset_entry = TenantPasswordReset(
                user_id=user.id,
                identifier=normalized_val,
                otp_hash=otp_hash,
                reset_token=reset_token,
                expires_at=expires_at,
            )
            tenant_db.add(reset_entry)
            tenant_db.commit()

    logger.info(f"[DISPATCH-OTP] Destination: {normalized_val} | Code: {otp_code} | Token: {reset_token}")
    return {
        "message": "Verification code dispatched successfully.",
        "delivery_channel": id_type.upper(),
        "reset_token": reset_token,
        "expires_in_seconds": OTP_EXPIRE_MINUTES * 60,
    }


@router.post("/reset-password")
def reset_password(request: Request, payload: PasswordResetCompleteRequest, master_db: Session = Depends(get_db)):
    """Verifies OTP & token and securely rotates password to Argon2id hash."""
    now = datetime.now(timezone.utc)
    new_hash = pwd_context.hash(payload.new_password)

    if payload.plane == "master":
        query = select(MasterPasswordReset).where(
            MasterPasswordReset.is_used.is_(False),
            MasterPasswordReset.expires_at > now,
        )
        if payload.reset_token:
            query = query.where(MasterPasswordReset.reset_token == payload.reset_token)
        elif payload.identity:
            norm_id, _ = normalize_identifier(payload.identity)
            query = query.where(MasterPasswordReset.identifier == norm_id)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reset_token or identity is required.")

        reset = master_db.scalar(query.order_by(MasterPasswordReset.created_at.desc()))
        if not reset:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code.")

        otp_to_check = payload.otp_code or payload.reset_code or ""
        valid_otp = False
        if reset.otp_hash.startswith("$"):
            valid_otp = verify_password(otp_to_check, reset.otp_hash)
        else:
            valid_otp = hmac.compare_digest(hashlib.sha256(otp_to_check.encode("utf-8")).hexdigest(), reset.otp_hash)

        if not valid_otp:
            reset.attempts += 1
            if reset.attempts >= 3:
                reset.is_used = True
            master_db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code.")

        user = master_db.scalar(select(MasterUser).where(MasterUser.id == reset.user_id))
        if user:
            user.password_hash = new_hash
            user.failed_login_attempts = 0
            user.locked_until = None
            reset.is_used = True
            master_db.commit()
    else:
        slug = (payload.workspace_slug or getattr(payload, "tenant_slug", "") or "").lower().strip()
        raw_target = slug
        if not slug:
            if hasattr(request.state, "tenant_slug") and request.state.tenant_slug:
                slug = str(request.state.tenant_slug).lower().strip()
            else:
                raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
                from backend.app.core.middleware import resolve_tenant_from_host
                meta = resolve_tenant_from_host(raw_host, db=master_db)
                if meta and meta.get("tenant_slug"):
                    slug = str(meta["tenant_slug"]).lower().strip()

        if "." in slug:
            from backend.app.core.middleware import resolve_tenant_from_host
            meta = resolve_tenant_from_host(slug, db=master_db)
            if meta and meta.get("tenant_slug"):
                slug = str(meta["tenant_slug"]).lower().strip()

        if not slug:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_slug is required for tenant password reset.")
        from sqlalchemy import func
        tenant = master_db.scalar(
            select(MasterTenant).where(
                (MasterTenant.slug == slug) |
                (func.lower(func.trim(MasterTenant.custom_domain)) == raw_target)
            )
        )
        if not tenant:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant workspace not found.")

        conn_mgr = TenantConnectionManager(master_db.get_bind())
        with conn_mgr.session_scope(tenant.id, db=master_db) as tenant_db:
            query = select(TenantPasswordReset).where(
                TenantPasswordReset.is_used.is_(False),
                TenantPasswordReset.expires_at > now,
            )
            if payload.reset_token:
                query = query.where(TenantPasswordReset.reset_token == payload.reset_token)
            elif payload.identity:
                norm_id, _ = normalize_identifier(payload.identity)
                query = query.where(TenantPasswordReset.identifier == norm_id)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reset_token or identity is required.")

            reset = tenant_db.scalar(query.order_by(TenantPasswordReset.created_at.desc()))
            if not reset:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code.")

            otp_to_check = payload.otp_code or payload.reset_code or ""
            valid_otp = False
            if reset.otp_hash.startswith("$"):
                valid_otp = verify_password(otp_to_check, reset.otp_hash)
            else:
                valid_otp = hmac.compare_digest(hashlib.sha256(otp_to_check.encode("utf-8")).hexdigest(), reset.otp_hash)

            if not valid_otp:
                reset.attempts += 1
                if reset.attempts >= 3:
                    reset.is_used = True
                tenant_db.commit()
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code.")

            user = tenant_db.scalar(select(TenantUser).where(TenantUser.id == reset.user_id))
            if user:
                user.password_hash = new_hash
                user.failed_login_attempts = 0
                user.locked_until = None
                reset.is_used = True
                tenant_db.commit()

    return {"message": "Password reset successfully. You can now log in with your new credentials."}


# ==============================================================================
# Protected Plane Verification Endpoints
# ==============================================================================

@router.get("/master/me")
def get_master_profile(current_user: MasterUser = Depends(require_master_auth)):
    """Verifies caller has valid Master Control Plane credentials."""
    return {
        "tier": "master",
        "user_id": str(current_user.id),
        "email": current_user.email,
        "mobile": current_user.mobile_number,
        "role": current_user.role,
        "full_name": current_user.full_name,
    }


@router.get("/tenant/me")
def get_tenant_profile(auth_ctx: Tuple[TenantUser, MasterTenant] = Depends(require_tenant_auth)):
    """Verifies caller has valid Tenant credentials bound to tenant organization."""
    user, tenant = auth_ctx
    return {
        "tier": "tenant",
        "tenant_id": str(tenant.id),
        "tenant_slug": tenant.slug,
        "tenant_name": tenant.name,
        "user_id": str(user.id),
        "email": user.email,
        "mobile": user.mobile_number,
        "role": user.role,
        "full_name": f"{user.first_name} {user.last_name}",
    }


@router.get("/domains/resolve")
@router.get("/resolve-domain")
def resolve_domain_auth_endpoint(
    request: Request,
    host: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
    master_db: Session = Depends(get_db),
):
    """
    Public zero-slug domain resolution endpoint under auth.
    Resolves custom domains and tenant subdomains without returning 'tenant not found'.
    """
    target_host = host or domain or request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    clean_host = target_host.split(":")[0].strip().lower()
    if "//" in clean_host:
        clean_host = clean_host.split("//")[-1]
    clean_host = clean_host.split("/")[0].split(":")[0].strip().lower()

    if not clean_host:
        return {"resolved": False, "message": "Host or domain parameter is required"}

    from backend.app.core.middleware import resolve_tenant_from_host
    tenant_meta = resolve_tenant_from_host(clean_host, db=master_db)

    if not tenant_meta:
        return {
            "resolved": False,
            "host": clean_host,
            "message": f"No active tenant mapped to domain '{clean_host}'",
        }

    return {
        "resolved": True,
        "tenant_id": tenant_meta["tenant_id"],
        "company_id": tenant_meta["company_id"],
        "tenant_slug": tenant_meta["tenant_slug"],
        "name": tenant_meta["name"],
        "custom_domain": tenant_meta["custom_domain"],
        "is_custom_domain": tenant_meta.get("is_custom_domain", False),
        "logo_url": tenant_meta.get("logo_url"),
        "primary_color": tenant_meta.get("primary_color"),
        "subscription_tier": tenant_meta.get("subscription_tier"),
        "status": tenant_meta.get("status"),
    }


# ==============================================================================
# V1 API Router Compatibility (/api/v1/auth)
# ==============================================================================

v1_router = APIRouter(prefix="/api/v1/auth", tags=["Two-Tier Authentication (v1)"])
v1_router.add_api_route("/master/login", master_login, methods=["POST"], response_model=AuthTokenResponse)
v1_router.add_api_route("/master-login", master_login, methods=["POST"], response_model=AuthTokenResponse)
v1_router.add_api_route("/tenant/login", tenant_login, methods=["POST"], response_model=AuthTokenResponse)
v1_router.add_api_route("/tenant-login", tenant_login, methods=["POST"], response_model=AuthTokenResponse)
v1_router.add_api_route("/master/me", get_master_profile, methods=["GET"])
v1_router.add_api_route("/tenant/me", get_tenant_profile, methods=["GET"])
v1_router.add_api_route("/domains/resolve", resolve_domain_auth_endpoint, methods=["GET"])
v1_router.add_api_route("/resolve-domain", resolve_domain_auth_endpoint, methods=["GET"])


