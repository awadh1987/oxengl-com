"""Dependency-free catalogue of IAM roles that HR-to-IAM provisioning may assign.

Kept import-free so that ``backend.models`` (the ``ck_res_user_role`` CHECK constraint) and
``backend.app.domains.iam.provisioning`` can share one source of truth without a circular import.
The Alembic migration carries its own frozen copy; a test asserts they stay in sync.
"""

from __future__ import annotations

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
