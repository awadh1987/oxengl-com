"""phase8_bi_reporting

Revision ID: 52854abb5c87
Revises: 83595bf15f78
Create Date: 2026-09-06 09:24:21.469902+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '52854abb5c87'
down_revision: Union[str, None] = '83595bf15f78'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'reporting_ledger_summaries',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('period', sa.String(length=7), nullable=False),
        sa.Column('fiscal_year', sa.Integer(), nullable=False),
        sa.Column('fiscal_month', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.UUID(), nullable=False),
        sa.Column('account_code', sa.String(length=32), nullable=False),
        sa.Column('account_name', sa.String(length=128), nullable=False),
        sa.Column('account_type', sa.String(length=32), nullable=False),
        sa.Column('total_debit', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('total_credit', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('balance', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('entry_count', sa.Integer(), nullable=False),
        sa.Column('last_extracted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['account_accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reporting_ledger_period', 'reporting_ledger_summaries', ['company_id', 'period'], unique=False)
    op.create_index(op.f('ix_reporting_ledger_summaries_account_id'), 'reporting_ledger_summaries', ['account_id'], unique=False)
    op.create_index(op.f('ix_reporting_ledger_summaries_company_id'), 'reporting_ledger_summaries', ['company_id'], unique=False)
    op.create_index(op.f('ix_reporting_ledger_summaries_period'), 'reporting_ledger_summaries', ['period'], unique=False)
    op.create_index('uq_reporting_ledger_company_period_account', 'reporting_ledger_summaries', ['company_id', 'period', 'account_id'], unique=True)

    op.create_table(
        'fleet_utilization_facts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('period', sa.String(length=7), nullable=False),
        sa.Column('vehicle_id', sa.UUID(), nullable=False),
        sa.Column('license_plate', sa.String(length=32), nullable=False),
        sa.Column('vehicle_type', sa.String(length=32), nullable=False),
        sa.Column('start_odometer', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('end_odometer', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('distance_traveled_km', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('fuel_liters', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('fuel_cost', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('maintenance_cost', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('work_order_count', sa.Integer(), nullable=False),
        sa.Column('operational_hours', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('last_extracted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_fleet_fact_period', 'fleet_utilization_facts', ['company_id', 'period'], unique=False)
    op.create_index(op.f('ix_fleet_utilization_facts_company_id'), 'fleet_utilization_facts', ['company_id'], unique=False)
    op.create_index(op.f('ix_fleet_utilization_facts_period'), 'fleet_utilization_facts', ['period'], unique=False)
    op.create_index(op.f('ix_fleet_utilization_facts_vehicle_id'), 'fleet_utilization_facts', ['vehicle_id'], unique=False)
    op.create_index('uq_fleet_fact_company_period_vehicle', 'fleet_utilization_facts', ['company_id', 'period', 'vehicle_id'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_fleet_fact_company_period_vehicle', table_name='fleet_utilization_facts')
    op.drop_index(op.f('ix_fleet_utilization_facts_vehicle_id'), table_name='fleet_utilization_facts')
    op.drop_index(op.f('ix_fleet_utilization_facts_period'), table_name='fleet_utilization_facts')
    op.drop_index(op.f('ix_fleet_utilization_facts_company_id'), table_name='fleet_utilization_facts')
    op.drop_index('ix_fleet_fact_period', table_name='fleet_utilization_facts')
    op.drop_table('fleet_utilization_facts')

    op.drop_index('uq_reporting_ledger_company_period_account', table_name='reporting_ledger_summaries')
    op.drop_index(op.f('ix_reporting_ledger_summaries_period'), table_name='reporting_ledger_summaries')
    op.drop_index(op.f('ix_reporting_ledger_summaries_company_id'), table_name='reporting_ledger_summaries')
    op.drop_index(op.f('ix_reporting_ledger_summaries_account_id'), table_name='reporting_ledger_summaries')
    op.drop_index('ix_reporting_ledger_period', table_name='reporting_ledger_summaries')
    op.drop_table('reporting_ledger_summaries')
