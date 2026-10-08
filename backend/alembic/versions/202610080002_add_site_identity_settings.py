"""add site_logo, site_name, site_description and site_tagline to site_settings

Revision ID: 202610080002
Revises: 202610080001
"""
from alembic import op
from sqlalchemy import text

revision = "202610080002"
down_revision = "202610080001"
branch_labels = None
depends_on = None

DEFAULTS = {
    "site_name": "OxenGL",
    "site_logo": "/oxengl-wordmark.svg",
    "site_description": "Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.",
    "site_tagline": "Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.",
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
    for key, value in DEFAULTS.items():
        bind.execute(
            text("INSERT INTO site_settings (key, value) VALUES (:k, :v) ON CONFLICT (key) DO NOTHING"),
            {"k": key, "v": value},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for key in DEFAULTS.keys():
        bind.execute(
            text("DELETE FROM site_settings WHERE key = :k"),
            {"k": key},
        )
