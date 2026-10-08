"""add_hrms_ledger_models

Revision ID: 4456e6e15186
Revises: 9efc5b559a0a
Create Date: 2026-09-24 21:32:23.900205+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4456e6e15186'
down_revision: Union[str, None] = '9efc5b559a0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # 1. hrms_attendance_logs table
    if 'hrms_attendance_logs' not in existing_tables:
        op.create_table(
            'hrms_attendance_logs',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('tenant_id', sa.UUID(), nullable=False),
            sa.Column('employee_id', sa.UUID(), nullable=False),
            sa.Column('device_id', sa.String(length=100), nullable=True),
            sa.Column('check_in', sa.DateTime(timezone=True), nullable=False),
            sa.Column('check_out', sa.DateTime(timezone=True), nullable=True),
            sa.Column('biometric_hash', sa.String(length=255), nullable=True),
            sa.Column('verification_mode', sa.String(length=50), nullable=False, server_default='BIOMETRIC_FINGERPRINT'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_hrms_attendance_logs_tenant_id'), 'hrms_attendance_logs', ['tenant_id'], unique=False)
        op.create_index(op.f('ix_hrms_attendance_logs_employee_id'), 'hrms_attendance_logs', ['employee_id'], unique=False)
        op.create_index(op.f('ix_hrms_attendance_logs_check_in'), 'hrms_attendance_logs', ['check_in'], unique=False)

    # 2. finance_journal_entries table
    if 'finance_journal_entries' not in existing_tables:
        op.create_table(
            'finance_journal_entries',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('tenant_id', sa.UUID(), nullable=False),
            sa.Column('company_id', sa.UUID(), nullable=True),
            sa.Column('entry_number', sa.String(length=64), nullable=False),
            sa.Column('entry_date', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('description', sa.String(length=255), nullable=False),
            sa.Column('total_debit', sa.Numeric(precision=18, scale=4), nullable=False, server_default='0.0000'),
            sa.Column('total_credit', sa.Numeric(precision=18, scale=4), nullable=False, server_default='0.0000'),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='POSTED'),
            sa.Column('posted_by', sa.UUID(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint('total_debit = total_credit', name='ck_finance_journal_entries_balanced'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('entry_number')
        )
        op.create_index(op.f('ix_finance_journal_entries_tenant_id'), 'finance_journal_entries', ['tenant_id'], unique=False)
        op.create_index(op.f('ix_finance_journal_entries_company_id'), 'finance_journal_entries', ['company_id'], unique=False)
        op.create_index(op.f('ix_finance_journal_entries_entry_date'), 'finance_journal_entries', ['entry_date'], unique=False)

    # 3. finance_journal_lines table
    if 'finance_journal_lines' not in existing_tables:
        op.create_table(
            'finance_journal_lines',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('tenant_id', sa.UUID(), nullable=False),
            sa.Column('entry_id', sa.UUID(), nullable=False),
            sa.Column('account_code', sa.String(length=50), nullable=False),
            sa.Column('account_id', sa.UUID(), nullable=True),
            sa.Column('description', sa.String(length=255), nullable=True),
            sa.Column('debit', sa.Numeric(precision=18, scale=4), nullable=False, server_default='0.0000'),
            sa.Column('credit', sa.Numeric(precision=18, scale=4), nullable=False, server_default='0.0000'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint('debit >= 0 AND credit >= 0', name='ck_finance_journal_lines_non_negative'),
            sa.ForeignKeyConstraint(['entry_id'], ['finance_journal_entries.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_finance_journal_lines_tenant_id'), 'finance_journal_lines', ['tenant_id'], unique=False)
        op.create_index(op.f('ix_finance_journal_lines_entry_id'), 'finance_journal_lines', ['entry_id'], unique=False)
        op.create_index(op.f('ix_finance_journal_lines_account_code'), 'finance_journal_lines', ['account_code'], unique=False)


def downgrade() -> None:
    pass
