"""phase8_sso

Revision ID: 83595bf15f78
Revises: 5d24484b7271
Create Date: 2026-09-06 09:14:53.461582+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '83595bf15f78'
down_revision: Union[str, None] = '5d24484b7271'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. sso_providers
    op.create_table(
        'sso_providers',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('slug', sa.String(length=64), nullable=False),
        sa.Column('protocol', sa.String(length=32), nullable=False, server_default='OIDC'),
        sa.Column('issuer_url', sa.String(length=255), nullable=True),
        sa.Column('authorization_endpoint', sa.String(length=255), nullable=False),
        sa.Column('token_endpoint', sa.String(length=255), nullable=False),
        sa.Column('userinfo_endpoint', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("protocol IN ('OIDC', 'SAML2', 'OAuth2')", name='ck_sso_provider_protocol'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sso_providers_slug'), 'sso_providers', ['slug'], unique=True)

    # 2. tenant_sso_configs
    op.create_table(
        'tenant_sso_configs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('provider_id', sa.UUID(), nullable=False),
        sa.Column('client_id', sa.String(length=255), nullable=False),
        sa.Column('encrypted_client_secret', sa.Text(), nullable=False),
        sa.Column('domain_hint', sa.String(length=128), nullable=True),
        sa.Column('role_mapping', sa.Text(), nullable=True),
        sa.Column('default_role', sa.String(length=32), nullable=False, server_default='Guest'),
        sa.Column('enforce_sso_only', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("default_role IN ('Super_Admin', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest')", name='ck_tenant_sso_default_role'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['provider_id'], ['sso_providers.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tenant_sso_active', 'tenant_sso_configs', ['company_id', 'is_active'], unique=False)
    op.create_index(op.f('ix_tenant_sso_configs_company_id'), 'tenant_sso_configs', ['company_id'], unique=True)
    op.create_index(op.f('ix_tenant_sso_configs_provider_id'), 'tenant_sso_configs', ['provider_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_tenant_sso_configs_provider_id'), table_name='tenant_sso_configs')
    op.drop_index(op.f('ix_tenant_sso_configs_company_id'), table_name='tenant_sso_configs')
    op.drop_index('ix_tenant_sso_active', table_name='tenant_sso_configs')
    op.drop_table('tenant_sso_configs')
    op.drop_index(op.f('ix_sso_providers_slug'), table_name='sso_providers')
    op.drop_table('sso_providers')
