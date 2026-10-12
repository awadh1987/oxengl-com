"""ORG master data and RBAC expansion

Revision ID: 202609060002
Revises: 202609060001
Create Date: 2026-09-06 00:00:02 UTC
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202609060002"
down_revision: Union[str, None] = "202609060001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("res_companies", sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("res_companies", sa.Column("fiscal_calendar", sa.String(length=64), nullable=False, server_default="gregorian"))
    op.add_column("res_companies", sa.Column("fiscal_year_start_month", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("res_companies", sa.Column("tax_regime", sa.String(length=64), nullable=False, server_default="KSA_VAT"))
    op.create_index(op.f("ix_res_companies_parent_id"), "res_companies", ["parent_id"], unique=False)
    op.create_foreign_key("fk_res_companies_parent", "res_companies", "res_companies", ["parent_id"], ["id"], ondelete="SET NULL")

    op.add_column("res_users", sa.Column("role_ids", sa.Text(), nullable=True))
    op.add_column("res_users", sa.Column("branch_scope_ids", sa.Text(), nullable=True))
    op.add_column("res_users", sa.Column("warehouse_scope_ids", sa.Text(), nullable=True))
    op.add_column("res_users", sa.Column("access_control_list", sa.Text(), nullable=True))

    op.add_column("res_partners", sa.Column("branch_scope_ids", sa.Text(), nullable=True))
    op.add_column("res_partners", sa.Column("warehouse_scope_ids", sa.Text(), nullable=True))
    op.add_column("res_partners", sa.Column("access_control_list", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("res_partners", "access_control_list")
    op.drop_column("res_partners", "warehouse_scope_ids")
    op.drop_column("res_partners", "branch_scope_ids")

    op.drop_column("res_users", "access_control_list")
    op.drop_column("res_users", "warehouse_scope_ids")
    op.drop_column("res_users", "branch_scope_ids")
    op.drop_column("res_users", "role_ids")

    op.drop_constraint("fk_res_companies_parent", "res_companies", type_="foreignkey")
    op.drop_index(op.f("ix_res_companies_parent_id"), table_name="res_companies")
    op.drop_column("res_companies", "tax_regime")
    op.drop_column("res_companies", "fiscal_year_start_month")
    op.drop_column("res_companies", "fiscal_calendar")
    op.drop_column("res_companies", "parent_id")
