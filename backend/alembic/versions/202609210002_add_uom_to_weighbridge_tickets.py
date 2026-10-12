"""add uom to weighbridge tickets

Revision ID: 202609210002
Revises: 202609210001
Create Date: 2026-09-21 23:35:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "202609210002"
down_revision = "202609210001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "weighbridge_tickets",
        sa.Column("unit_of_measure", sa.String(length=32), nullable=False, server_default=sa.text("'MT طن'")),
    )


def downgrade() -> None:
    op.drop_column("weighbridge_tickets", "unit_of_measure")
