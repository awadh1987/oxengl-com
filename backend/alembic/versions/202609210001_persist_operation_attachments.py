"""persist operation attachments

Revision ID: 202609210001
Revises: 202609181230
Create Date: 2026-09-21 00:01:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "202609210001"
down_revision = "202609181230"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "weighbridge_tickets",
        sa.Column("attachments", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column("weighbridge_tickets", sa.Column("scale_ticket_attachment", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("weighbridge_tickets", "scale_ticket_attachment")
    op.drop_column("weighbridge_tickets", "attachments")
