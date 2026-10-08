"""add_invoice_public_token

Revision ID: 9efc5b559a0a
Revises: c65589474b2b
Create Date: 2026-09-24 20:46:16.039695+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9efc5b559a0a'
down_revision: Union[str, None] = 'c65589474b2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('public_token', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_invoices_public_token'), 'invoices', ['public_token'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_invoices_public_token'), table_name='invoices')
    op.drop_column('invoices', 'public_token')
