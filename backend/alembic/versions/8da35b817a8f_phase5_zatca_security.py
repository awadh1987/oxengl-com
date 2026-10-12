"""phase5_zatca_security

Revision ID: 8da35b817a8f
Revises: 46eaf23a1431
Create Date: 2026-09-06 05:53:44.794350+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8da35b817a8f'
down_revision: Union[str, None] = '46eaf23a1431'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. tax_profiles
    op.create_table(
        'tax_profiles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('tax_id', sa.String(length=64), nullable=False),
        sa.Column('legal_name', sa.String(length=255), nullable=False),
        sa.Column('trade_name', sa.String(length=255), nullable=True),
        sa.Column('branch_name', sa.String(length=128), nullable=True),
        sa.Column('branch_number', sa.String(length=32), nullable=True),
        sa.Column('street_name', sa.String(length=255), nullable=True),
        sa.Column('building_number', sa.String(length=32), nullable=True),
        sa.Column('postal_zone', sa.String(length=32), nullable=True),
        sa.Column('city', sa.String(length=128), nullable=True),
        sa.Column('district', sa.String(length=128), nullable=True),
        sa.Column('country_code', sa.String(length=2), nullable=False),
        sa.Column('zatca_stage', sa.String(length=32), nullable=False),
        sa.Column('zatca_environment', sa.String(length=32), nullable=False),
        sa.Column('csid', sa.Text(), nullable=True),
        sa.Column('secret_key', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("zatca_environment IN ('sandbox', 'simulation', 'production')", name='ck_tax_profile_zatca_env'),
        sa.CheckConstraint("zatca_stage IN ('developer_portal', 'simulation', 'production')", name='ck_tax_profile_zatca_stage'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tax_profiles_company_id'), 'tax_profiles', ['company_id'], unique=False)
    op.create_index(op.f('ix_tax_profiles_tax_id'), 'tax_profiles', ['tax_id'], unique=False)
    op.create_index('uq_tax_profiles_company_tax_id', 'tax_profiles', ['company_id', 'tax_id'], unique=True)

    # 2. tax_rules
    op.create_table(
        'tax_rules',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('tax_profile_id', sa.UUID(), nullable=True),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('rate', sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column('tax_type', sa.String(length=32), nullable=False),
        sa.Column('start_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("tax_type IN ('vat', 'withholding', 'excise', 'customs', 'other')", name='ck_tax_rule_type'),
        sa.CheckConstraint('rate >= 0', name='ck_tax_rule_rate_non_negative'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['tax_profile_id'], ['tax_profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tax_rules_code'), 'tax_rules', ['code'], unique=False)
    op.create_index(op.f('ix_tax_rules_company_id'), 'tax_rules', ['company_id'], unique=False)
    op.create_index(op.f('ix_tax_rules_tax_profile_id'), 'tax_rules', ['tax_profile_id'], unique=False)
    op.create_index('uq_tax_rules_company_code', 'tax_rules', ['company_id', 'code'], unique=True)

    # 3. zatca_logs
    op.create_table(
        'zatca_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('tax_profile_id', sa.UUID(), nullable=True),
        sa.Column('invoice_id', sa.UUID(), nullable=True),
        sa.Column('invoice_uuid', sa.String(length=64), nullable=True),
        sa.Column('invoice_hash', sa.String(length=128), nullable=True),
        sa.Column('previous_invoice_hash', sa.String(length=128), nullable=True),
        sa.Column('xml_payload', sa.Text(), nullable=True),
        sa.Column('qr_code_payload', sa.Text(), nullable=True),
        sa.Column('cryptographic_stamp', sa.Text(), nullable=True),
        sa.Column('submission_status', sa.String(length=32), nullable=False),
        sa.Column('clearance_status', sa.String(length=32), nullable=True),
        sa.Column('reporting_status', sa.String(length=32), nullable=True),
        sa.Column('validation_errors', sa.Text(), nullable=True),
        sa.Column('warning_messages', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False),
        sa.Column('last_attempt_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('response_payload', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("submission_status IN ('PENDING', 'CLEARED', 'REPORTED', 'REJECTED', 'FAILED')", name='ck_zatca_submission_status'),
        sa.CheckConstraint('retry_count >= 0', name='ck_zatca_retry_count_non_negative'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['invoice_id'], ['customer_invoices.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tax_profile_id'], ['tax_profiles.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_zatca_logs_clearance_status'), 'zatca_logs', ['clearance_status'], unique=False)
    op.create_index('ix_zatca_logs_company_created', 'zatca_logs', ['company_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_zatca_logs_company_id'), 'zatca_logs', ['company_id'], unique=False)
    op.create_index(op.f('ix_zatca_logs_created_at'), 'zatca_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_zatca_logs_invoice_hash'), 'zatca_logs', ['invoice_hash'], unique=False)
    op.create_index(op.f('ix_zatca_logs_invoice_id'), 'zatca_logs', ['invoice_id'], unique=False)
    op.create_index(op.f('ix_zatca_logs_invoice_uuid'), 'zatca_logs', ['invoice_uuid'], unique=False)
    op.create_index(op.f('ix_zatca_logs_reporting_status'), 'zatca_logs', ['reporting_status'], unique=False)
    op.create_index(op.f('ix_zatca_logs_submission_status'), 'zatca_logs', ['submission_status'], unique=False)
    op.create_index(op.f('ix_zatca_logs_tax_profile_id'), 'zatca_logs', ['tax_profile_id'], unique=False)

    # 4. security_events
    op.create_table(
        'security_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('actor_email', sa.String(length=255), nullable=True),
        sa.Column('event_type', sa.String(length=64), nullable=False),
        sa.Column('severity', sa.String(length=16), nullable=False),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
        sa.Column('request_path', sa.String(length=255), nullable=True),
        sa.Column('request_method', sa.String(length=16), nullable=True),
        sa.Column('resource_id', sa.String(length=128), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", name='ck_security_event_severity'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['res_users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_security_events_actor_email'), 'security_events', ['actor_email'], unique=False)
    op.create_index(op.f('ix_security_events_company_id'), 'security_events', ['company_id'], unique=False)
    op.create_index(op.f('ix_security_events_created_at'), 'security_events', ['created_at'], unique=False)
    op.create_index('ix_security_events_event_created', 'security_events', ['event_type', 'created_at'], unique=False)
    op.create_index(op.f('ix_security_events_event_type'), 'security_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_security_events_ip_address'), 'security_events', ['ip_address'], unique=False)
    op.create_index(op.f('ix_security_events_severity'), 'security_events', ['severity'], unique=False)
    op.create_index(op.f('ix_security_events_user_id'), 'security_events', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('security_events')
    op.drop_table('zatca_logs')
    op.drop_table('tax_rules')
    op.drop_table('tax_profiles')
