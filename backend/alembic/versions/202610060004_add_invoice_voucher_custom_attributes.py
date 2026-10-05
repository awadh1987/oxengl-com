"""add custom_attributes to customer invoices and journal vouchers

Revision ID: 202610060004
Revises: 202610060003
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "202610060004"
down_revision = "202610060003"
branch_labels = None
depends_on = None

TABLES = ("customer_invoices", "finance_journal_entries", "account_moves")


def upgrade() -> None:
    for table in TABLES:
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{{}}'::jsonb"
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS custom_attributes")
