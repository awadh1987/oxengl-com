"""create tenant audit logs table

Revision ID: 202609150145
Revises: 202609141123
Create Date: 2026-09-15 01:45:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '202609150145'
down_revision = '202609141123'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'tenant_audit_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('actor', sa.String(length=100), nullable=True),
        sa.Column('details', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['res_companies.id'], ondelete='SET NULL')
    )
    op.create_index('ix_tenant_audit_logs_id', 'tenant_audit_logs', ['id'], unique=False)
    op.create_index('ix_tenant_audit_logs_action_type', 'tenant_audit_logs', ['action_type'], unique=False)
    op.create_index('ix_tenant_audit_logs_created_at', 'tenant_audit_logs', ['created_at'], unique=False)

def downgrade() -> None:
    op.drop_table('tenant_audit_logs')
