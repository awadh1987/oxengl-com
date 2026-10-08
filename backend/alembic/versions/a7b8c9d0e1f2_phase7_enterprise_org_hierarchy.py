"""phase7_enterprise_org_hierarchy

Revision ID: a7b8c9d0e1f2
Revises: f8a9b0c1d2e3
Create Date: 2026-09-25 21:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f8a9b0c1d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    try:
        inspector = sa.inspect(conn)
        existing_tables = inspector.get_table_names()
        is_mock = False
    except Exception:
        inspector = None
        existing_tables = []
        is_mock = True

    # 1. Gracefully handle res_companies self-referential parent_id
    if not is_mock and 'res_companies' in existing_tables:
        comp_cols = [c['name'] for c in inspector.get_columns('res_companies')]
        if 'parent_id' not in comp_cols:
            op.add_column(
                'res_companies',
                sa.Column(
                    'parent_id',
                    postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('res_companies.id', ondelete='SET NULL'),
                    nullable=True,
                )
            )
            op.create_index(op.f('ix_res_companies_parent_id'), 'res_companies', ['parent_id'], unique=False)
        else:
            comp_fks = [fk['name'] for fk in inspector.get_foreign_keys('res_companies')]
            if 'fk_res_companies_parent' not in comp_fks and 'res_companies_parent_id_fkey' not in comp_fks:
                try:
                    op.create_foreign_key(
                        'fk_res_companies_parent',
                        'res_companies',
                        'res_companies',
                        ['parent_id'],
                        ['id'],
                        ondelete='SET NULL',
                    )
                except Exception:
                    pass
    elif is_mock:
        op.execute("ALTER TABLE res_companies ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES res_companies(id) ON DELETE SET NULL;")
        op.execute("CREATE INDEX IF NOT EXISTS ix_res_companies_parent_id ON res_companies(parent_id);")

    # 2. Ensure cost_centers table and fields exist
    if not is_mock:
        if 'cost_centers' not in existing_tables:
            op.create_table(
                'cost_centers',
                sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
                sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('res_companies.id', ondelete='CASCADE'), nullable=False),
                sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('cost_centers.id', ondelete='SET NULL'), nullable=True),
                sa.Column('code', sa.String(length=32), nullable=False),
                sa.Column('name', sa.String(length=255), nullable=False),
                sa.Column('description', sa.Text(), nullable=True),
                sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
                sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
                sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            )
            op.create_index('ix_cost_centers_company_id', 'cost_centers', ['company_id'], unique=False)
            op.create_index('ix_cost_centers_parent_id', 'cost_centers', ['parent_id'], unique=False)
            op.create_index('uq_cost_centers_company_code', 'cost_centers', ['company_id', 'code'], unique=True)
        else:
            cc_cols = [c['name'] for c in inspector.get_columns('cost_centers')]
            if 'description' not in cc_cols:
                op.add_column('cost_centers', sa.Column('description', sa.Text(), nullable=True))
    else:
        op.execute("ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS description TEXT;")

    # 3. Create purchasing_organizations table
    if is_mock or 'purchasing_organizations' not in existing_tables:
        op.create_table(
            'purchasing_organizations',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('res_companies.id', ondelete='CASCADE'), nullable=False),
            sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('purchasing_organizations.id', ondelete='SET NULL'), nullable=True),
            sa.Column('code', sa.String(length=32), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('currency', sa.String(length=3), nullable=False, server_default='SAR'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_purchasing_organizations_company_id', 'purchasing_organizations', ['company_id'], unique=False)
        op.create_index('ix_purchasing_organizations_parent_id', 'purchasing_organizations', ['parent_id'], unique=False)
        op.create_index('uq_purchasing_organizations_company_code', 'purchasing_organizations', ['company_id', 'code'], unique=True)
        op.create_index('ix_purchasing_organizations_company_active', 'purchasing_organizations', ['company_id', 'is_active'], unique=False)

    # 4. Update purchase_orders table to support purchasing_organization_id
    if not is_mock and 'purchase_orders' in existing_tables:
        po_cols = [c['name'] for c in inspector.get_columns('purchase_orders')]
        if 'purchasing_organization_id' not in po_cols:
            op.add_column(
                'purchase_orders',
                sa.Column(
                    'purchasing_organization_id',
                    postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('purchasing_organizations.id', ondelete='SET NULL'),
                    nullable=True,
                )
            )
            op.create_index(
                op.f('ix_purchase_orders_purchasing_organization_id'),
                'purchase_orders',
                ['purchasing_organization_id'],
                unique=False,
            )
    elif is_mock:
        op.execute("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchasing_organization_id UUID REFERENCES purchasing_organizations(id) ON DELETE SET NULL;")
        op.execute("CREATE INDEX IF NOT EXISTS ix_purchase_orders_purchasing_organization_id ON purchase_orders(purchasing_organization_id);")


def downgrade() -> None:
    conn = op.get_bind()
    try:
        inspector = sa.inspect(conn)
        existing_tables = inspector.get_table_names()
        is_mock = False
    except Exception:
        inspector = None
        existing_tables = []
        is_mock = True

    if not is_mock and 'purchase_orders' in existing_tables:
        po_cols = [c['name'] for c in inspector.get_columns('purchase_orders')]
        if 'purchasing_organization_id' in po_cols:
            op.drop_index(op.f('ix_purchase_orders_purchasing_organization_id'), table_name='purchase_orders')
            op.drop_column('purchase_orders', 'purchasing_organization_id')
    elif is_mock:
        op.execute("DROP INDEX IF EXISTS ix_purchase_orders_purchasing_organization_id;")
        op.execute("ALTER TABLE purchase_orders DROP COLUMN IF EXISTS purchasing_organization_id;")

    if not is_mock and 'purchasing_organizations' in existing_tables:
        op.drop_index('ix_purchasing_organizations_company_active', table_name='purchasing_organizations')
        op.drop_index('uq_purchasing_organizations_company_code', table_name='purchasing_organizations')
        op.drop_index('ix_purchasing_organizations_parent_id', table_name='purchasing_organizations')
        op.drop_index('ix_purchasing_organizations_company_id', table_name='purchasing_organizations')
        op.drop_table('purchasing_organizations')
    elif is_mock:
        op.execute("DROP TABLE IF EXISTS purchasing_organizations CASCADE;")

    if not is_mock and 'cost_centers' in existing_tables:
        cc_cols = [c['name'] for c in inspector.get_columns('cost_centers')]
        if 'description' in cc_cols:
            op.drop_column('cost_centers', 'description')
    elif is_mock:
        op.execute("ALTER TABLE cost_centers DROP COLUMN IF EXISTS description;")
