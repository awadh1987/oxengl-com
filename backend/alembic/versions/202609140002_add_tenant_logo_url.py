"""add tenant logo url

Revision ID: 202609140002
Revises: 202609140001
Create Date: 2026-09-14 15:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# Revision identifiers used by Alembic.
revision = '202609140002'
down_revision = '202609140001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('master_tenants', sa.Column('logo_url', sa.String(length=500), nullable=True))
    op.add_column('res_companies', sa.Column('logo_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('res_companies', 'logo_url')
    op.drop_column('master_tenants', 'logo_url')
