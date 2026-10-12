"""add accounts parent_id and weighbridge_tickets uom

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-09-25 18:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f8a9b0c1d2e3'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Update accounts table
    if 'accounts' in inspector.get_table_names():
        acc_cols = [c['name'] for c in inspector.get_columns('accounts')]
        if 'parent_id' not in acc_cols:
            op.add_column(
                'accounts',
                sa.Column('parent_id', sa.UUID(), sa.ForeignKey('accounts.id', ondelete='SET NULL'), nullable=True)
            )

        # Ensure unique constraint is on (tenant_id, code) rather than global code
        existing_cons = [c['name'] for c in inspector.get_unique_constraints('accounts')]
        if 'accounts_code_key' in existing_cons:
            op.drop_constraint('accounts_code_key', 'accounts', type_='unique')
        if 'uq_accounts_tenant_code' not in existing_cons:
            try:
                op.create_unique_constraint('uq_accounts_tenant_code', 'accounts', ['tenant_id', 'code'])
            except Exception:
                pass

    # 2. Update weighbridge_tickets table
    if 'weighbridge_tickets' in inspector.get_table_names():
        wt_cols = [c['name'] for c in inspector.get_columns('weighbridge_tickets')]
        if 'uom' not in wt_cols:
            op.add_column(
                'weighbridge_tickets',
                sa.Column('uom', sa.String(length=32), nullable=False, server_default='MT')
            )


def downgrade() -> None:
    op.drop_column('weighbridge_tickets', 'uom')
    op.drop_constraint('uq_accounts_tenant_code', 'accounts', type_='unique')
    op.drop_column('accounts', 'parent_id')
