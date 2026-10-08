"""HR-to-IAM provisioning: ABAC context, blueprint role, first-login password gate.

Additive and chained from the HR advanced registration head (202610040001).

Revision ID: 202610040002
Revises: 202610040001
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "202610040002"
down_revision: Union[str, Sequence[str], None] = "202610040001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Frozen copies (migrations must not follow later edits to the live catalogue).
LEGACY_RES_USER_ROLES = (
    "Super_Admin", "super_admin", "SUPER_ADMIN", "SUPERADMIN",
    "Owner", "owner", "OWNER",
    "Admin", "admin", "ADMIN",
    "User", "user", "USER",
    "COO", "CEO", "Accountant", "Data_Entry", "Guest",
)
HR_PROVISIONED_ROLES = (
    "Super_Admin", "Operations_Admin", "Finance_Admin", "System_Admin", "General_Manager",
    "Ops_Manager", "Finance_Manager", "HR_Manager", "Fleet_Manager", "Procurement_Manager",
    "Warehouse_Manager", "Dispatch_Manager", "Finance_Editor", "Ops_Editor", "HR_Editor",
    "Procurement_Editor", "IT_Support", "Admin_Viewer", "Data_Entry", "Dispatch_Operator",
    "Field_Operator", "WMS_Operator", "Maintenance_Operator", "Security_Operator",
    "Employee_Self_Serve",
)


def _sql_list(values) -> str:
    return ", ".join(f"'{value}'" for value in dict.fromkeys(values))


def upgrade() -> None:
    op.add_column("res_users", sa.Column("iam_role", sa.String(length=48), nullable=True))
    op.add_column("res_users", sa.Column("abac_context", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column(
        "res_users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.execute("ALTER TABLE res_users DROP CONSTRAINT IF EXISTS ck_res_user_role")
    op.create_check_constraint(
        "ck_res_user_role",
        "res_users",
        f"role IN ({_sql_list(LEGACY_RES_USER_ROLES + HR_PROVISIONED_ROLES)})",
    )


def downgrade() -> None:
    # Fails loudly if any user still holds a provisioned-only role; reassign those users
    # deliberately rather than having a downgrade silently change privileges.
    op.execute("ALTER TABLE res_users DROP CONSTRAINT IF EXISTS ck_res_user_role")
    op.create_check_constraint(
        "ck_res_user_role",
        "res_users",
        f"role IN ({_sql_list(LEGACY_RES_USER_ROLES)})",
    )
    op.drop_column("res_users", "must_change_password")
    op.drop_column("res_users", "abac_context")
    op.drop_column("res_users", "iam_role")
