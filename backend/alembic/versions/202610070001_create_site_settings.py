"""create site_settings for admin-editable landing page and footer contact details

Revision ID: 202610070001
Revises: 202610060006
"""
from alembic import op

revision = "202610070001"
down_revision = "202610060006"
branch_labels = None
depends_on = None

DEFAULTS = {
    "landing_headline": "Sovereign Multi-Tenant ERP Architecture for the Kingdom of Saudi Arabia",
    "landing_subheadline": "Sub-millisecond query isolation, cryptographic ZATCA Phase 2 compliance, and raw quarry logistics orchestration—engineered on bare-metal PostgreSQL 16 and FastAPI.",
    "contact_email": "ops@oxengl.me",
    "contact_phone": "+966 11 000 0000",
    "contact_address": "Riyadh, Saudi Arabia",
}


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS site_settings (
            id SERIAL PRIMARY KEY,
            key VARCHAR(100) UNIQUE NOT NULL,
            value TEXT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    bind = op.get_bind()
    from sqlalchemy import text

    for key, value in DEFAULTS.items():
        bind.execute(
            text("INSERT INTO site_settings (key, value) VALUES (:k, :v) ON CONFLICT (key) DO NOTHING"),
            {"k": key, "v": value},
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS site_settings")
