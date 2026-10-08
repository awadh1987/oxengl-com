"""add_paddle_and_moyasar_payment_fields

Revision ID: c65589474b2b
Revises: 202609220001
Create Date: 2026-09-24 16:43:35.844027+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c65589474b2b'
down_revision: Union[str, None] = '202609220001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Moyasar Invoices Table ---
    op.create_table(
        'invoices',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('invoice_number', sa.String(length=64), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='SAR'),
        sa.Column('payment_status', sa.String(length=32), nullable=False, server_default='pending'),
        sa.Column('moyasar_transaction_id', sa.String(length=128), nullable=True),
        sa.Column('payment_method', sa.String(length=32), nullable=True),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_invoices_id'), 'invoices', ['id'], unique=False)
    op.create_index(op.f('ix_invoices_invoice_number'), 'invoices', ['invoice_number'], unique=True)
    op.create_index(op.f('ix_invoices_moyasar_transaction_id'), 'invoices', ['moyasar_transaction_id'], unique=True)
    op.create_index(op.f('ix_invoices_payment_status'), 'invoices', ['payment_status'], unique=False)

    # --- Paddle SaaS Subscription Fields on MasterTenant ---
    op.add_column('master_tenants', sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False))
    op.add_column('master_tenants', sa.Column('subscription_plan', sa.String(length=64), server_default=sa.text("'trial'"), nullable=True))
    op.add_column('master_tenants', sa.Column('subscription_status', sa.String(length=32), server_default=sa.text("'trialing'"), nullable=False))
    op.add_column('master_tenants', sa.Column('paddle_customer_id', sa.String(length=128), nullable=True))
    op.add_column('master_tenants', sa.Column('paddle_subscription_id', sa.String(length=128), nullable=True))
    op.add_column('master_tenants', sa.Column('license_expiry_date', sa.DateTime(), nullable=True))
    op.create_index(op.f('ix_master_tenants_paddle_customer_id'), 'master_tenants', ['paddle_customer_id'], unique=True)
    op.create_index(op.f('ix_master_tenants_paddle_subscription_id'), 'master_tenants', ['paddle_subscription_id'], unique=True)


def downgrade() -> None:
    # --- Revert MasterTenant Paddle Fields ---
    op.drop_index(op.f('ix_master_tenants_paddle_subscription_id'), table_name='master_tenants')
    op.drop_index(op.f('ix_master_tenants_paddle_customer_id'), table_name='master_tenants')
    op.drop_column('master_tenants', 'license_expiry_date')
    op.drop_column('master_tenants', 'paddle_subscription_id')
    op.drop_column('master_tenants', 'paddle_customer_id')
    op.drop_column('master_tenants', 'subscription_status')
    op.drop_column('master_tenants', 'subscription_plan')
    op.drop_column('master_tenants', 'is_active')

    # --- Revert Moyasar Invoices Table ---
    op.drop_index(op.f('ix_invoices_payment_status'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_moyasar_transaction_id'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_invoice_number'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_id'), table_name='invoices')
    op.drop_table('invoices')
