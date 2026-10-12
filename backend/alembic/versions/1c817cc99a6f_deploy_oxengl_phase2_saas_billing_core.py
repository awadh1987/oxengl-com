"""deploy_oxengl_phase2_saas_billing_core

Revision ID: 1c817cc99a6f
Revises: b20551fbfd86
Create Date: 2026-09-13 13:31:52.493285+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '1c817cc99a6f'
down_revision: Union[str, None] = 'b20551fbfd86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'subscription_plans',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('stripe_price_id', sa.String(length=255), nullable=False),
        sa.Column('max_seats', sa.Integer(), nullable=False),
        sa.Column('max_vehicles', sa.Integer(), nullable=False),
        sa.Column('monthly_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.UniqueConstraint('stripe_price_id'),
    )
    op.create_table(
        'tenant_subscriptions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('plan_id', sa.UUID(), nullable=False),
        sa.Column('stripe_customer_id', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('current_seats_used', sa.Integer(), nullable=False),
        sa.Column('current_vehicles_used', sa.Integer(), nullable=False),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_tenant_subscriptions_stripe_customer_id'), 'tenant_subscriptions', ['stripe_customer_id'], unique=True)
    op.create_index(op.f('ix_tenant_subscriptions_tenant_id'), 'tenant_subscriptions', ['tenant_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_tenant_subscriptions_tenant_id'), table_name='tenant_subscriptions')
    op.drop_index(op.f('ix_tenant_subscriptions_stripe_customer_id'), table_name='tenant_subscriptions')
    op.drop_table('tenant_subscriptions')
    op.drop_table('subscription_plans')

