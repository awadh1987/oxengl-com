"""add tenant controls and themes
Revision ID: 202609150210
Revises: 202609150145
"""
from alembic import op
import sqlalchemy as sa

revision = '202609150210'
down_revision = '202609150145'

def upgrade() -> None:
    op.add_column('res_companies', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('res_companies', sa.Column('status', sa.String(length=20), server_default='ACTIVE', nullable=False))
    op.add_column('res_companies', sa.Column('primary_color', sa.String(length=7), server_default='#0ea5e9', nullable=False))
    op.add_column('res_companies', sa.Column('secondary_color', sa.String(length=7), server_default='#0f172a', nullable=False))

def downgrade() -> None:
    op.drop_column('res_companies', 'secondary_color')
    op.drop_column('res_companies', 'primary_color')
    op.drop_column('res_companies', 'status')
    op.drop_column('res_companies', 'is_active')
