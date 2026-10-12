"""Add sovereignty and compliance policy fields to platform_master_settings.

Revision ID: 202610090003
Revises: 202610090002
Create Date: 2026-10-09 22:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = '202610090003'
down_revision: Union[str, None] = '202610090002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            ALTER TABLE platform_master_settings 
            ADD COLUMN IF NOT EXISTS enable_sovereignty_badge BOOLEAN DEFAULT TRUE NOT NULL;

            ALTER TABLE platform_master_settings 
            ADD COLUMN IF NOT EXISTS sovereignty_badge_title VARCHAR(255) DEFAULT 'Data Sovereignty & Infrastructure Policy' NOT NULL;

            ALTER TABLE platform_master_settings 
            ADD COLUMN IF NOT EXISTS sovereignty_badge_text TEXT DEFAULT 'All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure.' NOT NULL;
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            ALTER TABLE platform_master_settings DROP COLUMN IF EXISTS enable_sovereignty_badge;
            ALTER TABLE platform_master_settings DROP COLUMN IF EXISTS sovereignty_badge_title;
            ALTER TABLE platform_master_settings DROP COLUMN IF EXISTS sovereignty_badge_text;
            """
        )
    )
