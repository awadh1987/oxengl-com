"""deploy phase5 customs ledger

Revision ID: 202609140001
Revises: 202609130007
Create Date: 2026-09-14 03:05:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers used by Alembic.
revision = '202609140001'
down_revision = '202609130007'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. Provision the Immutable Electronic Ledger Table
    op.create_table(
        'electronic_ledger_blocks',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('journal_entry_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('block_index', sa.BigInteger(), nullable=False),
        sa.Column('payload_json', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('previous_hash', sa.String(length=64), nullable=False),
        sa.Column('current_hash', sa.String(length=64), nullable=False),
        sa.Column('digitally_signed_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['res_companies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    # Deploy unique composite index to enforce quick sequence lookup bounds
    op.create_index('idx_ledger_chain_sequence', 'electronic_ledger_blocks', ['tenant_id', 'block_index'], unique=True)

    # 2. Provision the Cross-Border Customs Manifests Table
    op.create_table(
        'customs_manifests',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('manifest_number', sa.String(length=100), nullable=False),
        sa.Column('declaration_type', sa.String(length=50), server_default='IMPORT', nullable=False),
        sa.Column('border_port_name', sa.String(length=150), nullable=False),
        sa.Column('hs_codes_json', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('clearance_status', sa.String(length=50), server_default='PENDING_DOCUMENTATION', nullable=False),
        sa.Column('zatca_compliance_status', sa.String(length=50), server_default='NOT_SUBMITTED', nullable=False),
        sa.Column('cryptographic_uuid', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['res_companies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('manifest_number'),
        sa.UniqueConstraint('cryptographic_uuid')
    )
    op.create_index('idx_customs_manifests_tenant', 'customs_manifests', ['tenant_id'], unique=False)

def downgrade() -> None:
    op.drop_index('idx_customs_manifests_tenant', table_name='customs_manifests')
    op.drop_table('customs_manifests')
    op.drop_index('idx_ledger_chain_sequence', table_name='electronic_ledger_blocks')
    op.drop_table('electronic_ledger_blocks')
