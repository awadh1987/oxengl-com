"""
FastAPI Authentication & RBAC Dependencies.
Filename: backend/app/dependencies.py

Provides robust JWT authentication, tenant isolation resolution,
and role-based access control (RBAC) enforcement dependencies.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ResCompany, ResUser, TenantUser, User

logger = logging.getLogger("oxengl.dependencies")

# Security and secret configuration
from backend.secret_env import require_secret  # strict, no fallbacks

JWT_SECRET_MASTER = require_secret("JWT_SECRET_MASTER")
JWT_SECRET_TENANT = require_secret("JWT_SECRET_TENANT")
JWT_SECRET_DEFAULT = require_secret("JWT_SECRET")

security_bearer = HTTPBearer(auto_error=False)


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def decode_jwt_token(token: str) -> Dict[str, Any]:
    """
    Decodes and cryptographically validates a JWT token across all supported secrets.
    Verifies signature and expiration time.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}"

    # Try validating signature against known signing secrets
    candidate_secrets = [
        JWT_SECRET_TENANT,
        JWT_SECRET_MASTER,
        JWT_SECRET_DEFAULT,
        os.getenv("JWT_SECRET_KEY", ""),
    ]
    candidate_secrets = [s for s in candidate_secrets if s]
    valid_sig = False

    for secret in candidate_secrets:
        expected_sig = _b64url_encode(
            hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
        )
        if hmac.compare_digest(sig_b64, expected_sig):
            valid_sig = True
            break

    if not valid_sig:
        # Check standard PyJWT if available as fallback
        try:
            import jwt
            for secret in candidate_secrets:
                try:
                    payload = jwt.decode(token, secret, algorithms=["HS256"])
                    return payload
                except jwt.InvalidTokenError:
                    continue
        except Exception:
            pass

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as parse_err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to parse token claims.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    exp = payload.get("exp")
    if exp is not None and int(exp) < int(time.time()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


async def get_current_user(
    request: Request,
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Decodes the JWT access token, resolves the user entity,
    and extracts their tenant_id and role.
    """
    token = None
    if auth_header and auth_header.credentials:
        token = auth_header.credentials
    else:
        raw_header = request.headers.get("Authorization") or request.headers.get("x-auth-token")
        if raw_header:
            token = raw_header.replace("Bearer ", "").strip()
        elif "token" in request.query_params:
            token = request.query_params.get("token")
        elif "access_token" in request.cookies:
            token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_jwt_token(token)

    sub = payload.get("sub") or payload.get("user_id")
    email = payload.get("email") or payload.get("identity") or (str(sub) if (sub and "@" in str(sub)) else None)
    token_role = payload.get("role")
    token_tenant_id = payload.get("tenant_id") or payload.get("company_id")

    user: Optional[User] = None

    is_master_tier = (
        payload.get("tier") == "master"
        or str(payload.get("iss", "")).endswith("control-plane")
        or str(payload.get("role", "")).lower() in ("super_admin", "superadmin")
    )

    def _lookup_master(session) -> Optional[Any]:
        from backend.models import MasterUser
        found = None
        if sub:
            try:
                found = session.query(MasterUser).filter(MasterUser.id == uuid.UUID(str(sub))).first()
            except (ValueError, TypeError):
                pass
        if not found and email:
            found = session.query(MasterUser).filter(func.lower(MasterUser.email) == email.strip().lower()).first()
        return found

    def _resolve_master() -> Optional[Any]:
        try:
            found = _lookup_master(db)
            if found:
                return found
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
        try:
            from backend.database import PlatformSessionLocal
            if PlatformSessionLocal is not None:
                with PlatformSessionLocal() as p_db:
                    found = _lookup_master(p_db)
                    if found:
                        p_db.expunge(found)
                        return found
        except Exception:
            pass
        return None

    # Master-plane superadmins are authoritative in master_users; res_users is never required for them.
    if is_master_tier:
        master_user = _resolve_master()
        if master_user is not None and getattr(master_user, "is_superuser", False) is True:
            user = master_user
        elif master_user is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Master account lacks superadmin privileges.",
            )

    # Tenant-scoped users: res_users lookup is only required here.
    if not user and not is_master_tier:
        if sub:
            try:
                user_uuid = uuid.UUID(str(sub))
                user = db.query(ResUser).filter(ResUser.id == user_uuid).first()
            except (ValueError, TypeError):
                pass

        if not user and email:
            user = db.query(ResUser).filter(ResUser.email.ilike(email.strip())).first()

    # SECURITY (2026-10-04, incident Addendum C): no account is ever created -- persisted or
    # in-memory -- for a token whose subject is not a registered res_users account. Previously this
    # dependency (a) bridged tenant_users rows into res_users with a header-chosen company and
    # (b) returned an in-memory "envelope" user with the token's role for any unknown subject.
    if not user and not is_master_tier and sub and not email:
        # Read-only compatibility: a tenant_users id may be mapped to its existing res_users account.
        try:
            t_user = db.query(TenantUser).filter(TenantUser.id == uuid.UUID(str(sub))).first()
        except Exception:
            t_user = None
        if t_user is not None and t_user.email:
            user = db.query(ResUser).filter(ResUser.email.ilike(t_user.email.strip())).first()

    # Untagged tokens of a master superadmin still bypass the tenant user requirement.
    if not user and not is_master_tier:
        master_user = _resolve_master()
        if master_user is not None and getattr(master_user, "is_superuser", False) is True:
            user = master_user
            is_master_tier = True

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated subject is not a registered user.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if is_master_tier:
        setattr(user, "_tier", "master")
        setattr(user, "is_superuser", True)
        setattr(user, "is_super_admin", True)
        if not hasattr(user, "company_id") or getattr(user, "company_id", None) is None:
            setattr(user, "company_id", None)
        user.role = "Super_Admin"

    # Validate active status
    if not getattr(user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account has been deactivated.",
        )

    if token_tenant_id and not getattr(user, "is_superuser", False):
        try:
            claimed_company_id = uuid.UUID(str(token_tenant_id))
        except (ValueError, TypeError) as error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session company claim is invalid.",
            ) from error
        if getattr(user, "company_id", None) != claimed_company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Session company does not match the authenticated user's membership.",
            )

    # Attach contextual metadata to request state
    request.state.current_user = user
    request.state.tenant_id = str(getattr(user, "company_id", "") or "")
    request.state.role = user.role
    request.state.is_platform_admin = bool(is_master_tier or getattr(user, "is_superuser", False))
    db.execute(
        text(
            "SELECT set_config('app.current_tenant_id', :tenant_id, true), "
            "set_config('app.current_company_id', :company_id, true)"
        ),
        {
            "tenant_id": str(user.company_id or ""),
            "company_id": str(user.company_id or ""),
        },
    )

    return user


class RoleChecker:
    """
    FastAPI dependency that validates the current user's role against allowed roles.
    Rejects unauthorized requests with HTTP 403 Forbidden.
    """

    def __init__(self, allowed_roles: List[str]):
        # Normalize allowed roles to lowercase for case-insensitive matching
        self.allowed_roles = [r.lower().replace(" ", "_") for r in allowed_roles]
        self.raw_allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        user_role_str = str(getattr(current_user, "role", "")).lower().replace(" ", "_")

        # Super_Admin, Owner, Admin, and CEO roles have full executive clearance
        if (
            getattr(current_user, "is_superuser", False) is True
            or getattr(current_user, "is_super_admin", False) is True
            or user_role_str in ["super_admin", "superadmin", "owner", "tenant_owner", "company_owner", "admin", "ceo", "executive"]
        ):
            return current_user

        if user_role_str in self.allowed_roles:
            return current_user

        # Match case-variations (e.g. 'admin' vs 'Admin')
        if any(user_role_str == r or user_role_str.replace("_", "") == r.replace("_", "") for r in self.allowed_roles):
            return current_user

        # If Admin is allowed, Owner and CEO are also authorized
        if ("admin" in self.allowed_roles or "super_admin" in self.allowed_roles) and user_role_str in ["owner", "tenant_owner", "company_owner", "admin", "ceo", "executive"]:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access forbidden: User role '{getattr(current_user, 'role', '')}' is not authorized. Allowed: {', '.join(self.raw_allowed_roles)}",
        )


def require_role(allowed_roles: List[str]) -> RoleChecker:
    """Convenience factory returning a RoleChecker dependency instance."""
    return RoleChecker(allowed_roles)


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Validates that the authenticated user account is active."""
    if not getattr(current_user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account has been deactivated.",
        )
    return current_user


def get_active_company_id(
    request: Request,
    x_company_id: Optional[str] = Header(default=None),
    x_tenant_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> uuid.UUID:
    """
    Extracts and validates the active tenant company UUID.
    Supports Super Admin bypass, graceful fallback for NULL company IDs,
    and dynamic context injection into request.state.
    """
    user_role = str(getattr(current_user, "role", "")).lower().replace(" ", "_")
    is_super_admin = (
        getattr(current_user, "is_superuser", False) is True
        or getattr(current_user, "is_super_admin", False) is True
        or user_role in ["super_admin", "superadmin", "root", "master"]
    )
    if not is_super_admin:
        try:
            from backend.app.core.auth import is_super_admin_authorized
            is_super_admin = is_super_admin_authorized(current_user, request)
        except Exception:
            pass

    cid_str = (
        x_company_id
        or x_tenant_id
        or request.headers.get("x-company-id")
        or request.headers.get("x-tenant-id")
        or request.headers.get("x-target-company-id")
        or request.query_params.get("company_id")
        or request.query_params.get("tenant_id")
        or (str(getattr(request.state, "company_id", None)) if getattr(request.state, "company_id", None) else None)
        or (str(getattr(request.state, "tenant_company_id", None)) if getattr(request.state, "tenant_company_id", None) else None)
    )

    requested_uuid: Optional[uuid.UUID] = None
    if cid_str:
        try:
            requested_uuid = uuid.UUID(str(cid_str).strip())
        except (ValueError, TypeError) as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Company-ID must be a valid UUID",
            ) from err

    # Graceful fallback for NULL user.company_id
    if current_user.company_id is None:
        target_to_assign = requested_uuid
        if not target_to_assign:
            raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
            if raw_host:
                try:
                    from backend.app.core.middleware import resolve_tenant_from_host
                    tmeta = resolve_tenant_from_host(raw_host, db=db)
                    if tmeta and tmeta.get("company_id"):
                        target_to_assign = uuid.UUID(str(tmeta["company_id"]))
                except Exception:
                    pass
        if not target_to_assign:
            first_comp = db.query(ResCompany).order_by(ResCompany.created_at.asc()).first()
            if first_comp:
                target_to_assign = first_comp.id

        if target_to_assign:
            comp_obj = db.get(ResCompany, target_to_assign)
            if comp_obj:
                try:
                    current_user.company_id = comp_obj.id
                    db.commit()
                    db.refresh(current_user)
                except Exception:
                    db.rollback()
                    current_user.company_id = comp_obj.id

    if requested_uuid:
        comp = db.get(ResCompany, requested_uuid)
        if comp is None:
            if is_super_admin:
                first_row = db.query(ResCompany.id).order_by(ResCompany.created_at.asc()).first()
                effective_id = current_user.company_id or (first_row[0] if first_row else None)
                if not effective_id:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Active company was not found",
                    )
                cid = effective_id
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Active company was not found",
                )
        else:
            cid = comp.id
    else:
        if current_user.company_id:
            cid = current_user.company_id
        else:
            first_comp = db.query(ResCompany).order_by(ResCompany.created_at.asc()).first()
            if first_comp:
                current_user.company_id = first_comp.id
                try:
                    db.commit()
                    db.refresh(current_user)
                except Exception:
                    db.rollback()
                cid = first_comp.id
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="X-Company-ID or X-Tenant-ID header is required",
                )

    is_exec_role = (
        is_super_admin
        or user_role in ["super_admin", "superadmin", "owner", "tenant_owner", "company_owner", "admin", "ceo", "executive"]
    )
    if not is_exec_role and current_user.company_id and cid != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user is not authorized for this company",
        )

    # Dynamic Context Injection into request.state
    request.state.company_id = cid
    request.state.tenant_company_id = cid
    request.state.tenant_id = str(cid)

    return cid
