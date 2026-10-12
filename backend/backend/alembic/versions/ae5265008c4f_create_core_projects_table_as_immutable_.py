"""create core_projects table as immutable platform core

Revision ID: ae5265008c4f
Revises: 
Create Date: 2026-10-12 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'ae5265008c4f'
down_revision = None  # Update to point to your latest previous migration if needed
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create core_projects table anchoring the planning-first architecture
    op.create_table(
        'core_projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_code', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('project_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='planning'),
        sa.Column('metadata_json', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            "project_type IN ('logistics', 'epc', 'humanitarian', 'fuel', 'construction')",
            name='chk_valid_project_type'
        )
    )

    # Create indexes for performance and multi-tenant isolation
    op.create_index(op.f('ix_core_projects_id'), 'core_projects', ['id'], unique=False)
    op.create_index(op.f('ix_core_projects_tenant_id'), 'core_projects', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_core_projects_project_code'), 'core_projects', ['project_code'], unique=True)
    op.create_index(op.f('ix_core_projects_project_type'), 'core_projects', ['project_type'], unique=False)
    op.create_index(op.f('ix_core_projects_status'), 'core_projects', ['status'], unique=False)
    op.create_index('ix_core_projects_tenant_type', 'core_projects', ['tenant_id', 'project_type'], unique=False)


def downgrade() -> None:
    # Drop indexes and core_projects table cleanly
    op.drop_index('ix_core_projects_tenant_type', table_name='core_projects')
    op.drop_index(op.f('ix_core_projects_status'), table_name='core_projects')
    op.drop_index(op.f('ix_core_projects_project_type'), table_name='core_projects')
    op.drop_index(op.f('ix_core_projects_project_code'), table_name='core_projects')
    op.drop_index(op.f('ix_core_projects_tenant_id'), table_name='core_projects')
    op.drop_index(op.f('ix_core_projects_id'), table_name='core_projects')
    op.drop_table('core_projects')