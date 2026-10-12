"""add custom_attributes to procurement, inventory and HR tables

Revision ID: 202610060005
Revises: 202610060004
"""
from alembic import op

revision = "202610060005"
down_revision = "202610060004"
branch_labels = None
depends_on = None

TABLES = (
    "purchase_orders",
    "purchase_requisitions",
    "stock_items",
    "stock_lots",
    "employees",
    "payroll_runs",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{{}}'::jsonb"
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS custom_attributes")
