"""alter system_sequences tenant_id to uuid

Revision ID: 8f2c5cfa998e
Revises: a0cb1dd5f4ad
Create Date: 2026-10-03 16:12:59.209796+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8f2c5cfa998e'
down_revision: Union[str, None] = 'a0cb1dd5f4ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('ALTER TABLE system_sequences ALTER COLUMN tenant_id TYPE UUID USING tenant_id::uuid')


def downgrade() -> None:
    op.execute('ALTER TABLE system_sequences ALTER COLUMN tenant_id TYPE VARCHAR USING tenant_id::varchar')
