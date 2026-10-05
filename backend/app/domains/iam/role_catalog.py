"""Dependency-free catalogue of IAM roles that HR-to-IAM provisioning may assign.

Kept import-free so that ``backend.models`` (the ``ck_res_user_role`` CHECK constraint) and
``backend.app.domains.iam.provisioning`` can share one source of truth without a circular import.
The Alembic migration carries its own frozen copy; a test asserts they stay in sync.
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Any, Mapping, Optional, Tuple

# Roles that already existed in ck_res_user_role before HR provisioning.
LEGACY_RES_USER_ROLES: tuple[str, ...] = (
    "Super_Admin", "super_admin", "SUPER_ADMIN", "SUPERADMIN",
    "Owner", "owner", "OWNER",
    "Admin", "admin", "ADMIN",
    "User", "user", "USER",
    "COO", "CEO", "Accountant", "Data_Entry", "Guest",
)

# Base RBAC roles from docs/oxengl_hr_iam_provisioning_blueprint.md section 2.
HR_PROVISIONED_ROLES: tuple[str, ...] = (
    "Super_Admin",
    "Operations_Admin",
    "Finance_Admin",
    "System_Admin",
    "General_Manager",
    "Ops_Manager",
    "Finance_Manager",
    "HR_Manager",
    "Fleet_Manager",
    "Procurement_Manager",
    "Warehouse_Manager",
    "Dispatch_Manager",
    "Finance_Editor",
    "Ops_Editor",
    "HR_Editor",
    "Procurement_Editor",
    "IT_Support",
    "Admin_Viewer",
    "Data_Entry",
    "Dispatch_Operator",
    "Field_Operator",
    "WMS_Operator",
    "Maintenance_Operator",
    "Security_Operator",
    "Employee_Self_Serve",
)

# Every value res_users.role may hold (legacy values + provisioned matrix roles).
ALLOWED_RES_USER_ROLES: tuple[str, ...] = tuple(
    dict.fromkeys(LEGACY_RES_USER_ROLES + HR_PROVISIONED_ROLES)
)

ALLOWED_RES_USER_ROLES_SQL: str = ", ".join(f"'{role}'" for role in ALLOWED_RES_USER_ROLES)


# ------------------------------------------------------------------------------
# Legacy-column mapping (shared by HR provisioning and the IAM control panel)
# ------------------------------------------------------------------------------

# 'Super_Admin' in the legacy ``res_users.role`` column is interpreted platform-wide by
# ``is_super_admin_authorized`` (cross-tenant). A tenant CEO must never receive that, so the
# blueprint role is kept verbatim in ``res_users.iam_role`` while the legacy ``role`` column gets the
# tenant-scoped executive equivalent. Every other blueprint role is written to both columns.
LEGACY_ROLE_OVERRIDES: Mapping[str, str] = MappingProxyType({"Super_Admin": "CEO"})
# "Owner" is the workspace owner role: assignable in the control panel but not part of the 25-role HR matrix.
OWNER_ROLE = "Owner"
WORKSPACE_ASSIGNABLE_ROLES: tuple[str, ...] = HR_PROVISIONED_ROLES + (OWNER_ROLE,)
PRIVILEGED_IAM_ROLES = frozenset({"Super_Admin", OWNER_ROLE})

# Legacy ``role`` values that grant platform-wide (cross-tenant) authority. Never assignable by a
# tenant-scoped actor; stored only by the platform itself.
PLATFORM_WIDE_LEGACY_ROLES = frozenset({"super_admin", "superadmin", "root", "master"})


def normalize_role_token(raw: Optional[str]) -> str:
    return str(raw or "").strip().replace("-", "_").replace(" ", "_")


def resolve_internal_role(raw: Optional[str]) -> Optional[str]:
    """Return the canonical standardized role for ``raw`` (case-insensitive) or None if not in the catalogue."""
    token = normalize_role_token(raw).lower()
    for role in WORKSPACE_ASSIGNABLE_ROLES:
        if role.lower() == token:
            return role
    return None


def legacy_role_for(iam_role: str) -> str:
    """Value for the legacy ``res_users.role`` column for a standardized ``iam_role``."""
    return LEGACY_ROLE_OVERRIDES.get(iam_role, iam_role)


# ------------------------------------------------------------------------------
# External / contractor identities (the only roles the Master Data invite flow may assign)
# ------------------------------------------------------------------------------

# Least privilege: both map onto the existing read-only legacy role ``Guest`` (already allowed by
# ``ck_res_user_role``), so no schema migration is needed. ``iam_role`` carries the external identity
# type and ``abac_context`` pins the account to read-only external access.
EXTERNAL_INVITE_ROLES: Mapping[str, Mapping[str, Any]] = MappingProxyType({
    "Guest": MappingProxyType({
        "legacy_role": "Guest",
        "abac_context": MappingProxyType({
            "approval_limit": 0, "shift_locked": False, "ip_restricted": False, "requires_mfa": False,
            "external_identity": True, "read_only": True,
        }),
    }),
    "External_Auditor": MappingProxyType({
        "legacy_role": "Guest",
        "abac_context": MappingProxyType({
            "approval_limit": 0, "shift_locked": False, "ip_restricted": False, "requires_mfa": True,
            "external_identity": True, "read_only": True, "audit_scope_only": True,
        }),
    }),
})

HR_REGISTRATION_REQUIRED_MESSAGE = (
    "Internal staff must be registered via the HR module to generate payroll and compliance profiles."
)


def resolve_external_role(raw: Optional[str]) -> Optional[str]:
    """Canonical external invite role for ``raw`` (case-insensitive) or None."""
    token = normalize_role_token(raw).lower()
    for role in EXTERNAL_INVITE_ROLES:
        if role.lower() == token:
            return role
    return None


def is_internal_or_privileged_role_name(raw: Optional[str]) -> bool:
    """True for any standardized or legacy role name that denotes internal staff / elevated access."""
    token = normalize_role_token(raw).lower()
    if not token or resolve_external_role(raw):
        return False
    if resolve_internal_role(raw):
        return True
    return token in {r.lower() for r in LEGACY_RES_USER_ROLES} or token in PLATFORM_WIDE_LEGACY_ROLES
