"""
Centralized Security and System Protections for OxenGL Core Entities.
Guards system anchor companies, root tenants, and critical infrastructure against
accidental or malicious administrative deletion, offboarding, or suspension.
"""

from typing import Any, Optional, Union
import uuid
from fastapi import HTTPException, status

SYSTEM_ANCHOR_COMPANY_ID = "65e675a7-17fe-47fa-993d-25cb57e40ea4"
SYSTEM_ANCHOR_COMPANY_UUID = uuid.UUID(SYSTEM_ANCHOR_COMPANY_ID)
SYSTEM_ANCHOR_SLUG = "oxengl-platform"
PROTECTED_SLUGS = {
    "oxengl-platform",
    "oxengl_platform",
    "platform",
    "system-platform",
}


def is_protected_tenant(
    tenant_id: Optional[Union[str, uuid.UUID]] = None,
    slug: Optional[str] = None,
    name: Optional[str] = None,
) -> bool:
    """Check if the provided identifiers correspond to the system anchor entity."""
    if tenant_id:
        tid_str = str(tenant_id).strip().lower()
        if tid_str == SYSTEM_ANCHOR_COMPANY_ID.lower():
            return True
        try:
            tid_uuid = uuid.UUID(tid_str)
            if tid_uuid == SYSTEM_ANCHOR_COMPANY_UUID:
                return True
        except ValueError:
            pass
        if tid_str in PROTECTED_SLUGS:
            return True

    if slug and str(slug).strip().lower() in PROTECTED_SLUGS:
        return True

    if name:
        name_clean = str(name).strip().lower()
        if name_clean in {"oxengl system platform", "oxengl platform", "oxen platform", "system platform"}:
            return True

    return False


def assert_not_protected_tenant(
    tenant_id: Optional[Union[str, uuid.UUID]] = None,
    slug: Optional[str] = None,
    name: Optional[str] = None,
) -> None:
    """
    Centralized guard ensuring the system anchor company
    (65e675a7-17fe-47fa-993d-25cb57e40ea4 or slug oxengl-platform)
    can NEVER be suspended or offboarded under any circumstances.
    Raises HTTP 403 Forbidden if targeted.
    """
    if is_protected_tenant(tenant_id=tenant_id, slug=slug, name=name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: The system anchor company (oxengl-platform) is protected and cannot be suspended or offboarded.",
        )


EXECUTIVE_CONSOLE_ROLES = {
    "Admin",
    "admin",
    "ADMIN",
    "Super_Admin",
    "SUPER_ADMIN",
    "COO",
    "coo",
    "CEO",
    "ceo",
    "EXECUTIVE",
    "Owner",
    "owner",
    "OWNER",
    "COMPANY_OWNER",
    "TENANT_OWNER",
}


def is_executive_authorized(user: Any) -> bool:
    """Return True if the user holds an Executive/Owner/Admin/COO role."""
    if not user:
        return False
    if bool(getattr(user, "is_superuser", False)):
        return True
    for attr in ("role", "iam_role"):
        raw = str(getattr(user, attr, "") or "").strip()
        if not raw:
            continue
        if raw in EXECUTIVE_CONSOLE_ROLES or raw.upper().replace(" ", "_") in EXECUTIVE_CONSOLE_ROLES:
            return True
    return False


def require_executive(user: Any) -> Any:
    """Guard ensuring Executive Console access is permitted for Admin, COO, and Tenant Owner roles."""
    if not is_executive_authorized(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Restricted Area - Executive Admin Only (requires Owner, Admin, or COO role).",
        )
    return user

