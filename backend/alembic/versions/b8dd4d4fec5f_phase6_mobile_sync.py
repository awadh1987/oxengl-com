"""phase6_mobile_sync

Revision ID: b8dd4d4fec5f
Revises: 8da35b817a8f
Create Date: 2026-09-06 07:32:24.886022+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8dd4d4fec5f'
down_revision: Union[str, None] = '8da35b817a8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. device_registrations
    op.create_table(
        'device_registrations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('device_token', sa.String(length=255), nullable=False),
        sa.Column('device_model', sa.String(length=128), nullable=True),
        sa.Column('os_version', sa.String(length=64), nullable=True),
        sa.Column('app_version', sa.String(length=32), nullable=True),
        sa.Column('is_revoked', sa.Boolean(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revocation_reason', sa.Text(), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['user_id'], ['res_users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_device_registrations_company_id'), 'device_registrations', ['company_id'], unique=False)
    op.create_index(op.f('ix_device_registrations_device_token'), 'device_registrations', ['device_token'], unique=False)
    op.create_index(op.f('ix_device_registrations_user_id'), 'device_registrations', ['user_id'], unique=False)
    op.create_index('uq_device_registrations_company_token', 'device_registrations', ['company_id', 'device_token'], unique=True)

    # 2. sync_queue_events
    op.create_table(
        'sync_queue_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('device_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('operation_id', sa.String(length=128), nullable=False),
        sa.Column('entity_type', sa.String(length=64), nullable=False),
        sa.Column('action', sa.String(length=32), nullable=False),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('sync_status', sa.String(length=32), nullable=False),
        sa.Column('is_conflict', sa.Boolean(), nullable=False),
        sa.Column('conflict_reason', sa.Text(), nullable=True),
        sa.Column('client_timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('server_response', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("action IN ('create', 'update', 'delete')", name='ck_sync_queue_event_action'),
        sa.CheckConstraint("sync_status IN ('PENDING', 'APPLIED', 'REJECTED_CONFLICT', 'FAILED')", name='ck_sync_queue_event_status'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['device_id'], ['device_registrations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['res_users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sync_queue_events_company_id'), 'sync_queue_events', ['company_id'], unique=False)
    op.create_index('ix_sync_queue_events_company_status', 'sync_queue_events', ['company_id', 'sync_status'], unique=False)
    op.create_index(op.f('ix_sync_queue_events_device_id'), 'sync_queue_events', ['device_id'], unique=False)
    op.create_index(op.f('ix_sync_queue_events_entity_type'), 'sync_queue_events', ['entity_type'], unique=False)
    op.create_index(op.f('ix_sync_queue_events_operation_id'), 'sync_queue_events', ['operation_id'], unique=False)
    op.create_index(op.f('ix_sync_queue_events_sync_status'), 'sync_queue_events', ['sync_status'], unique=False)
    op.create_index(op.f('ix_sync_queue_events_user_id'), 'sync_queue_events', ['user_id'], unique=False)
    op.create_index('uq_sync_queue_events_company_op', 'sync_queue_events', ['company_id', 'operation_id'], unique=True)

    # 3. farm_gate_weighments.status
    op.add_column('farm_gate_weighments', sa.Column('status', sa.String(length=32), server_default='draft', nullable=False))


def downgrade() -> None:
    op.drop_column('farm_gate_weighments', 'status')
    op.drop_index('uq_sync_queue_events_company_op', table_name='sync_queue_events')
    op.drop_index(op.f('ix_sync_queue_events_user_id'), table_name='sync_queue_events')
    op.drop_index(op.f('ix_sync_queue_events_sync_status'), table_name='sync_queue_events')
    op.drop_index(op.f('ix_sync_queue_events_operation_id'), table_name='sync_queue_events')
    op.drop_index(op.f('ix_sync_queue_events_entity_type'), table_name='sync_queue_events')
    op.drop_index(op.f('ix_sync_queue_events_device_id'), table_name='sync_queue_events')
    op.drop_index('ix_sync_queue_events_company_status', table_name='sync_queue_events')
    op.drop_index(op.f('ix_sync_queue_events_company_id'), table_name='sync_queue_events')
    op.drop_table('sync_queue_events')

    op.drop_index('uq_device_registrations_company_token', table_name='device_registrations')
    op.drop_index(op.f('ix_device_registrations_user_id'), table_name='device_registrations')
    op.drop_index(op.f('ix_device_registrations_device_token'), table_name='device_registrations')
    op.drop_index(op.f('ix_device_registrations_company_id'), table_name='device_registrations')
    op.drop_table('device_registrations')
