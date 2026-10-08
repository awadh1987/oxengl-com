"""alter tenant_branding tenant_id to uuid

Revision ID: 6519e4493fb6
Revises: 8f2c5cfa998e
Create Date: 2026-10-03 16:22:22.966050+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6519e4493fb6'
down_revision: Union[str, None] = '8f2c5cfa998e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    op.execute('ALTER TABLE tenant_branding DROP CONSTRAINT IF EXISTS tenant_branding_tenant_id_fkey')
    op.execute('ALTER TABLE tenant_branding ALTER COLUMN tenant_id DROP DEFAULT')
    op.execute('ALTER TABLE tenant_branding ALTER COLUMN tenant_id DROP NOT NULL')
    op.execute('ALTER TABLE tenant_branding ALTER COLUMN tenant_id TYPE UUID USING NULL::uuid')
    op.execute('''
        UPDATE tenant_branding tb
        SET tenant_id = o.company_id
        FROM organizations o
        WHERE tb.id = o.id
    ''')


def downgrade() -> None:
    op.execute('ALTER TABLE tenant_branding ALTER COLUMN tenant_id TYPE INTEGER USING NULL::integer')
