"""add_procurement_bill_ledger_link

Revision ID: a1b2c3d4e5f6
Revises: 4456e6e15186
Create Date: 2026-09-24 22:50:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '4456e6e15186'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns('vendor_bills')]
    if 'journal_entry_id' not in cols:
        op.add_column('vendor_bills', sa.Column('journal_entry_id', sa.UUID(), nullable=True))
        op.create_foreign_key(
            'fk_vendor_bills_journal_entry_id',
            'vendor_bills', 'finance_journal_entries',
            ['journal_entry_id'], ['id'],
            ondelete='SET NULL'
        )
        op.create_index(op.f('ix_vendor_bills_journal_entry_id'), 'vendor_bills', ['journal_entry_id'], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns('vendor_bills')]
    if 'journal_entry_id' in cols:
        op.drop_index(op.f('ix_vendor_bills_journal_entry_id'), table_name='vendor_bills')
        op.drop_constraint('fk_vendor_bills_journal_entry_id', 'vendor_bills', type_='foreignkey')
        op.drop_column('vendor_bills', 'journal_entry_id')
