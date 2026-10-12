"""phase8_data_residency

Revision ID: 5d24484b7271
Revises: 340b4e70ea84
Create Date: 2026-09-06 09:08:43.891148+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '5d24484b7271'
down_revision: Union[str, None] = '340b4e70ea84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. tenant_database_configs
    op.create_table(
        'tenant_database_configs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('database_name', sa.String(length=128), nullable=False),
        sa.Column('encrypted_connection_url', sa.Text(), nullable=False),
        sa.Column('residency_region', sa.String(length=64), nullable=False, server_default='sa-central-1'),
        sa.Column('isolation_level', sa.String(length=32), nullable=False, server_default='dedicated'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("isolation_level IN ('dedicated', 'shared', 'isolated')", name='ck_tenant_db_isolation'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tenant_database_configs_company_id'), 'tenant_database_configs', ['company_id'], unique=True)
    op.create_index('ix_tenant_db_active', 'tenant_database_configs', ['company_id', 'is_active'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_tenant_db_active', table_name='tenant_database_configs')
    op.drop_index(op.f('ix_tenant_database_configs_company_id'), table_name='tenant_database_configs')
    op.drop_table('tenant_database_configs')
