"""link_invoices_to_ledger

Revision ID: 3965e9597d98
Revises: b2c3d4e5f6a7
Create Date: 2026-09-25 00:02:25.840577+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3965e9597d98'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Update invoices table
    inv_cols = [c['name'] for c in inspector.get_columns('invoices')]
    if 'journal_entry_id' not in inv_cols:
        op.add_column('invoices', sa.Column('journal_entry_id', sa.UUID(), nullable=True))
        op.create_foreign_key(
            'fk_invoices_journal_entry_id',
            'invoices', 'finance_journal_entries',
            ['journal_entry_id'], ['id'],
            ondelete='SET NULL'
        )
        op.create_index(op.f('ix_invoices_journal_entry_id'), 'invoices', ['journal_entry_id'], unique=False)
    if 'is_posted' not in inv_cols:
        op.add_column('invoices', sa.Column('is_posted', sa.Boolean(), server_default=sa.text('false'), nullable=False))

    # 2. Update customer_invoices table for parity
    ci_cols = [c['name'] for c in inspector.get_columns('customer_invoices')]
    if 'journal_entry_id' not in ci_cols:
        op.add_column('customer_invoices', sa.Column('journal_entry_id', sa.UUID(), nullable=True))
        op.create_foreign_key(
            'fk_customer_invoices_journal_entry_id',
            'customer_invoices', 'finance_journal_entries',
            ['journal_entry_id'], ['id'],
            ondelete='SET NULL'
        )
        op.create_index(op.f('ix_customer_invoices_journal_entry_id'), 'customer_invoices', ['journal_entry_id'], unique=False)
    if 'is_posted' not in ci_cols:
        op.add_column('customer_invoices', sa.Column('is_posted', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    inv_cols = [c['name'] for c in inspector.get_columns('invoices')]
    if 'journal_entry_id' in inv_cols:
        op.drop_index(op.f('ix_invoices_journal_entry_id'), table_name='invoices')
        op.drop_constraint('fk_invoices_journal_entry_id', 'invoices', type_='foreignkey')
        op.drop_column('invoices', 'journal_entry_id')
    if 'is_posted' in inv_cols:
        op.drop_column('invoices', 'is_posted')

    ci_cols = [c['name'] for c in inspector.get_columns('customer_invoices')]
    if 'is_posted' in ci_cols:
        op.drop_column('customer_invoices', 'is_posted')
    if 'journal_entry_id' in ci_cols:
        op.drop_index(op.f('ix_customer_invoices_journal_entry_id'), table_name='customer_invoices')
        op.drop_constraint('fk_customer_invoices_journal_entry_id', 'customer_invoices', type_='foreignkey')
        op.drop_column('customer_invoices', 'journal_entry_id')
