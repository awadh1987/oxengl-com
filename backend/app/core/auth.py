"""
FastAPI Security & Authentication Dependencies for OxenGL Master Platform and Tenants.
Location: backend/app/core/auth.py
"""

from __future__ import annotations

import os
import hmac
from typing import Any, Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.database import get_db
import backend.models as models
from backend.api.dependencies import (
    ADMIN,
    ACCOUNTANT,
    READ_ONLY,
    STANDARD_ROLES,
    SUPER_ADMIN,
    RoleChecker,
    get_current_user,
    normalize_role,
    require_role,
)


def is_super_admin_authorized(user: Any, request: Optional[Request] = None) -> bool:
    """
    Verifies whether the current user or session is authorized as Super Admin.
    Accepts:
    1. Direct is_superuser == True or is_super_admin == True
    2. User role matches Super_Admin (case-insensitive, normalized e.g., 'Super_Admin', 'super_admin', 'SUPER_ADMIN')
    3. (Removed 2026-10-04, Addendum C) token claims / scopes / tier are NOT trusted for elevation
    4. User ACL or role_ids containing SUPER_ADMIN (database record)
    5. Permitted authenticated master admin / admin sessions during development or provisioning.
    """
    if user is None:
        return False

    # 1. is_superuser / is_super_admin boolean flag
    if getattr(user, "is_superuser", False) is True or getattr(user, "is_super_admin", False) is True:
        return True

    # 2. User role normalized
    raw_role = str(getattr(user, "role", "") or "").strip()
    normalized_role = raw_role.upper().replace(" ", "_").replace("-", "_")
    if normalized_role in {"SUPER_ADMIN", "SUPERADMIN", "ROOT", "MASTER"}:
        return True

    # 3. SECURITY (2026-10-04, incident Addendum C): token claims (role / tier / scopes / is_superuser)
    #    are NOT an authority source. Super-admin rights come only from the user's database record
    #    (checks 1, 2 and 4) or the configured MASTER_PLATFORM_KEY. Previously a tenant login token
    #    (tier/role/is_superuser claims) could satisfy this check.

    # 4. Check user ACL and role_ids
    acl = str(getattr(user, "access_control_list", "") or "").upper()
    role_ids = str(getattr(user, "role_ids", "") or "").upper()
    if "SUPER_ADMIN" in acl or "SUPER_ADMIN" in role_ids:
        return True

    # 5. Development / Provisioning Environment for Master Admin Sessions
    dev_env = (
        os.getenv("ENVIRONMENT", "development").lower() in ("development", "dev", "test", "staging", "provisioning")
        or os.getenv("OXENGL_DEV_MODE", "true").lower() in ("true", "1", "yes")
    )
    if dev_env:
        is_master_subject = (
            str(getattr(user, "email", "")).lower() in {"admin@oxengl.me", "admin@oxengl.com", "master@oxengl.com", "superadmin@oxengl.com", "devadmin@oxengl.com"}
            or getattr(user, "company_id", None) is None
        )
        if is_master_subject and normalized_role in {"ADMIN", "CEO", "EXECUTIVE", "OPERATOR"}:
            return True

    if request:
        # Provisioning bypass via X-Master-Admin-Key. Honoured ONLY when MASTER_PLATFORM_KEY is
        # explicitly configured: there is deliberately no hard-coded fallback key.
        expected_key = (os.getenv("MASTER_PLATFORM_KEY") or "").strip()
        prov_header = request.headers.get("X-Master-Admin-Key") or request.headers.get("x-master-admin-key")
        if expected_key and prov_header and hmac.compare_digest(prov_header.encode("utf-8"), expected_key.encode("utf-8")):
            return True

    return False


def has_record_super_admin_authority(user: Any) -> bool:
    """
    STRICT variant for credential-bearing endpoints (e.g. payment gateway keys).
    Honors ONLY authority persisted on the user's database record (checks 1, 2 and 4 above).
    Deliberately ignores the development/provisioning fallback (check 5, which is active
    whenever OXENGL_DEV_MODE is unset) and the X-Master-Admin-Key header.
    """
    if user is None:
        return False
    if getattr(user, "is_superuser", False) is True or getattr(user, "is_super_admin", False) is True:
        return True
    normalized_role = str(getattr(user, "role", "") or "").strip().upper().replace(" ", "_").replace("-", "_")
    if normalized_role in {"SUPER_ADMIN", "SUPERADMIN", "ROOT", "MASTER"}:
        return True
    acl = str(getattr(user, "access_control_list", "") or "").upper()
    role_ids = str(getattr(user, "role_ids", "") or "").upper()
    return "SUPER_ADMIN" in acl or "SUPER_ADMIN" in role_ids


def get_authenticated_user(request: Request, database: Session = Depends(get_db)) -> models.ResUser:
    """Delegates to primary get_authenticated_user in backend.app.main."""
    from backend.app.main import get_authenticated_user as _main_get_authenticated_user
    return _main_get_authenticated_user(request, database)


get_current_active_user = get_authenticated_user


def require_super_admin(
    request: Request,
    database: Session = Depends(get_db),
    current_user: models.ResUser = Depends(get_authenticated_user),
) -> models.ResUser:
    """Master platform security guard strictly verifying Super_Admin authority."""
    if not is_super_admin_authorized(current_user, request):
        from backend.app.main import record_platform_audit, resolve_client_ip, get_request_id
        record_platform_audit(
            database,
            actor_email=current_user.email,
            action="SUPER_ADMIN_DENIED",
            endpoint=request.url.path,
            ip_address=resolve_client_ip(request),
            company_id=getattr(current_user, "company_id", None),
            outcome="DENIED",
            request_id=get_request_id(request),
            user_agent=request.headers.get("user-agent"),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Master Platform Security requires Super_Admin role",
        )
    request.state.platform_db_authorized = True
    return current_user


# Security dependency aliases
get_current_active_superuser = require_super_admin
verify_super_admin_role = require_super_admin
verify_super_admin = require_super_admin

__all__ = [
    "require_super_admin",
    "get_current_active_superuser",
    "verify_super_admin_role",
    "verify_super_admin",
    "is_super_admin_authorized",
    "get_authenticated_user",
    "get_current_active_user",
    "get_current_user",
    "require_role",
    "RoleChecker",
    "STANDARD_ROLES",
    "SUPER_ADMIN",
    "ADMIN",
    "ACCOUNTANT",
    "READ_ONLY",
    "normalize_role",
]
