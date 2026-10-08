"""align customs manifests schema

Revision ID: 202609181230
Revises: 202609150210
Create Date: 2026-09-18 12:30:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '202609181230'
down_revision = '202609150210'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add company_id and align fields with CustomsManifest specification
    op.add_column('customs_manifests', sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('customs_manifests', sa.Column('declaration_number', sa.String(length=100), nullable=True))
    op.add_column('customs_manifests', sa.Column('port_of_entry', sa.String(length=150), nullable=True))
    op.add_column('customs_manifests', sa.Column('carrier_name', sa.String(length=150), nullable=True))
    op.add_column('customs_manifests', sa.Column('status', sa.String(length=50), server_default='DRAFT', nullable=False))
    op.add_column('customs_manifests', sa.Column('duty_amount', sa.Numeric(precision=18, scale=4), server_default='0.0000', nullable=False))
    op.add_column('customs_manifests', sa.Column('vat_amount', sa.Numeric(precision=18, scale=4), server_default='0.0000', nullable=False))
    op.add_column('customs_manifests', sa.Column('total_customs_amount', sa.Numeric(precision=18, scale=4), server_default='0.0000', nullable=False))
    op.add_column('customs_manifests', sa.Column('payload_hash', sa.String(length=64), nullable=True))
    op.add_column('customs_manifests', sa.Column('previous_hash', sa.String(length=64), server_default='0000000000000000000000000000000000000000000000000000000000000000', nullable=False))
    op.add_column('customs_manifests', sa.Column('block_index', sa.BigInteger(), server_default='1', nullable=False))
    op.add_column('customs_manifests', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False))

    op.create_foreign_key('fk_customs_manifests_company_id', 'customs_manifests', 'res_companies', ['company_id'], ['id'], ondelete='CASCADE')
    op.create_index('idx_customs_manifests_company_id', 'customs_manifests', ['company_id'], unique=False)
    op.create_index('idx_customs_manifests_status', 'customs_manifests', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_customs_manifests_status', table_name='customs_manifests')
    op.drop_index('idx_customs_manifests_company_id', table_name='customs_manifests')
    op.drop_constraint('fk_customs_manifests_company_id', 'customs_manifests', type_='foreignkey')
    op.drop_column('customs_manifests', 'created_at')
    op.drop_column('customs_manifests', 'block_index')
    op.drop_column('customs_manifests', 'previous_hash')
    op.drop_column('customs_manifests', 'payload_hash')
    op.drop_column('customs_manifests', 'total_customs_amount')
    op.drop_column('customs_manifests', 'vat_amount')
    op.drop_column('customs_manifests', 'duty_amount')
    op.drop_column('customs_manifests', 'status')
    op.drop_column('customs_manifests', 'carrier_name')
    op.drop_column('customs_manifests', 'port_of_entry')
    op.drop_column('customs_manifests', 'declaration_number')
    op.drop_column('customs_manifests', 'company_id')
