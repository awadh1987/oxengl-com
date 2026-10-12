"""add features_override to master_tenants

Revision ID: 202610020002
Revises: 202610020001
Create Date: 2026-10-02 20:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '202610020002'
down_revision: Union[str, None] = '202610020001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE master_tenants 
        ADD COLUMN IF NOT EXISTS features_override JSONB NOT NULL DEFAULT '{}'::jsonb;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE master_tenants 
        DROP COLUMN IF EXISTS features_override;
    """)
