"""add_inventory_movement_ledger_link

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-24 23:55:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'inventory_movements' not in tables:
        op.create_table(
            'inventory_movements',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('tenant_id', sa.UUID(), nullable=False),
            sa.Column('company_id', sa.UUID(), nullable=True),
            sa.Column('movement_number', sa.String(length=64), nullable=False),
            sa.Column('movement_type', sa.String(length=32), nullable=False, server_default='ADJUSTMENT'),
            sa.Column('warehouse_id', sa.UUID(), nullable=False),
            sa.Column('product_id', sa.UUID(), nullable=True),
            sa.Column('quantity', sa.Numeric(precision=18, scale=4), nullable=False),
            sa.Column('unit_cost', sa.Numeric(precision=18, scale=4), nullable=False, server_default='0.0000'),
            sa.Column('total_cost', sa.Numeric(precision=18, scale=4), nullable=False, server_default='0.0000'),
            sa.Column('reason', sa.String(length=255), nullable=True),
            sa.Column('reference', sa.String(length=128), nullable=True),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='COMPLETED'),
            sa.Column('is_posted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('journal_entry_id', sa.UUID(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['company_id'], ['res_companies.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['product_id'], ['product_products.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['journal_entry_id'], ['finance_journal_entries.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_inventory_movements_tenant_id'), 'inventory_movements', ['tenant_id'], unique=False)
        op.create_index(op.f('ix_inventory_movements_company_id'), 'inventory_movements', ['company_id'], unique=False)
        op.create_index(op.f('ix_inventory_movements_warehouse_id'), 'inventory_movements', ['warehouse_id'], unique=False)
        op.create_index(op.f('ix_inventory_movements_product_id'), 'inventory_movements', ['product_id'], unique=False)
        op.create_index(op.f('ix_inventory_movements_movement_number'), 'inventory_movements', ['movement_number'], unique=False)
        op.create_index(op.f('ix_inventory_movements_journal_entry_id'), 'inventory_movements', ['journal_entry_id'], unique=False)

    if 'stock_movements' in tables:
        sm_cols = [c['name'] for c in inspector.get_columns('stock_movements')]
        if 'journal_entry_id' not in sm_cols:
            op.add_column('stock_movements', sa.Column('journal_entry_id', sa.UUID(), nullable=True))
            op.create_foreign_key(
                'fk_stock_movements_journal_entry_id',
                'stock_movements', 'finance_journal_entries',
                ['journal_entry_id'], ['id'],
                ondelete='SET NULL'
            )
            op.create_index(op.f('ix_stock_movements_journal_entry_id'), 'stock_movements', ['journal_entry_id'], unique=False)
        if 'is_posted' not in sm_cols:
            op.add_column('stock_movements', sa.Column('is_posted', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if 'inventory_movements' in tables:
        op.drop_table('inventory_movements')
    if 'stock_movements' in tables:
        sm_cols = [c['name'] for c in inspector.get_columns('stock_movements')]
        if 'journal_entry_id' in sm_cols:
            op.drop_index(op.f('ix_stock_movements_journal_entry_id'), table_name='stock_movements')
            op.drop_constraint('fk_stock_movements_journal_entry_id', 'stock_movements', type_='foreignkey')
            op.drop_column('stock_movements', 'journal_entry_id')
        if 'is_posted' in sm_cols:
            op.drop_column('stock_movements', 'is_posted')
