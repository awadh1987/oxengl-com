"""add_tfa_and_company_fields

Revision ID: e7f8a9b0c1d2
Revises: 3965e9597d98
Create Date: 2026-09-25 15:16:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = '3965e9597d98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Update res_companies
    comp_cols = [c['name'] for c in inspector.get_columns('res_companies')]
    if 'wallpaper_url' not in comp_cols:
        op.add_column('res_companies', sa.Column('wallpaper_url', sa.Text(), nullable=True))
    if 'background_url' not in comp_cols:
        op.add_column('res_companies', sa.Column('background_url', sa.Text(), nullable=True))

    # 2. Update tenant_users
    tu_cols = [c['name'] for c in inspector.get_columns('tenant_users')]
    if 'tfa_secret' not in tu_cols:
        op.add_column('tenant_users', sa.Column('tfa_secret', sa.String(length=32), nullable=True))
    if 'tfa_enabled' not in tu_cols:
        op.add_column('tenant_users', sa.Column('tfa_enabled', sa.Boolean(), server_default='false', nullable=False))

    # 3. Update master_users
    mu_cols = [c['name'] for c in inspector.get_columns('master_users')]
    if 'tfa_secret' not in mu_cols:
        op.add_column('master_users', sa.Column('tfa_secret', sa.String(length=32), nullable=True))
    if 'tfa_enabled' not in mu_cols:
        op.add_column('master_users', sa.Column('tfa_enabled', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('master_users', 'tfa_enabled')
    op.drop_column('master_users', 'tfa_secret')
    op.drop_column('tenant_users', 'tfa_enabled')
    op.drop_column('tenant_users', 'tfa_secret')
    op.drop_column('res_companies', 'background_url')
    op.drop_column('res_companies', 'wallpaper_url')
