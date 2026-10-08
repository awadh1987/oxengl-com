"""phase9_ai_governance

Revision ID: 442840b43675
Revises: 52854abb5c87
Create Date: 2026-09-06 09:34:01.100401+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '442840b43675'
down_revision: Union[str, None] = '52854abb5c87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_model_configs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('model_name', sa.String(length=64), nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('endpoint_url', sa.String(length=255), nullable=True),
        sa.Column('encrypted_api_key', sa.String(length=512), nullable=True),
        sa.Column('rate_limit_rpm', sa.Integer(), nullable=False),
        sa.Column('rate_limit_tpm', sa.Integer(), nullable=False),
        sa.Column('permission_tier', sa.String(length=32), nullable=False),
        sa.Column('max_risk_tier_allowed', sa.String(length=16), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("max_risk_tier_allowed IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", name='ck_ai_model_config_risk'),
        sa.CheckConstraint("permission_tier IN ('READ_ONLY', 'ASSISTANT', 'OPERATIONAL_PROPOSER', 'SUPER_USER')", name='ck_ai_model_config_permission'),
        sa.CheckConstraint('rate_limit_rpm > 0 AND rate_limit_tpm > 0', name='ck_ai_model_config_limits'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_model_configs_company_id'), 'ai_model_configs', ['company_id'], unique=False)
    op.create_index('uq_ai_model_configs_company_model', 'ai_model_configs', ['company_id', 'model_name'], unique=True)

    op.create_table(
        'ai_governance_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('model_config_id', sa.UUID(), nullable=True),
        sa.Column('agent_name', sa.String(length=64), nullable=False),
        sa.Column('prompt_hash', sa.String(length=64), nullable=False),
        sa.Column('prompt_tokens', sa.Integer(), nullable=False),
        sa.Column('completion_tokens', sa.Integer(), nullable=False),
        sa.Column('total_tokens', sa.Integer(), nullable=False),
        sa.Column('confidence_score', sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column('safety_validation_status', sa.String(length=32), nullable=False),
        sa.Column('risk_level', sa.String(length=16), nullable=False),
        sa.Column('action_type', sa.String(length=64), nullable=False),
        sa.Column('proposal_payload', sa.Text(), nullable=False),
        sa.Column('validation_errors', sa.Text(), nullable=True),
        sa.Column('hitl_required', sa.Boolean(), nullable=False),
        sa.Column('hitl_approved', sa.Boolean(), nullable=False),
        sa.Column('hitl_approved_by', sa.UUID(), nullable=True),
        sa.Column('hitl_approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('hitl_approval_token', sa.String(length=128), nullable=True),
        sa.Column('execution_status', sa.String(length=32), nullable=False),
        sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("execution_status IN ('PROPOSED', 'APPROVED', 'EXECUTED', 'REJECTED', 'BLOCKED')", name='ck_ai_gov_log_execution_status'),
        sa.CheckConstraint("risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", name='ck_ai_gov_log_risk_level'),
        sa.CheckConstraint("safety_validation_status IN ('PASSED', 'BLOCKED', 'FLAGGED', 'PENDING_APPROVAL')", name='ck_ai_gov_log_safety_status'),
        sa.CheckConstraint('confidence_score >= 0.0 AND confidence_score <= 1.0', name='ck_ai_gov_log_confidence'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['hitl_approved_by'], ['res_users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['model_config_id'], ['ai_model_configs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['res_users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_ai_gov_log_company_created', 'ai_governance_logs', ['company_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_ai_governance_logs_agent_name'), 'ai_governance_logs', ['agent_name'], unique=False)
    op.create_index(op.f('ix_ai_governance_logs_company_id'), 'ai_governance_logs', ['company_id'], unique=False)
    op.create_index(op.f('ix_ai_governance_logs_model_config_id'), 'ai_governance_logs', ['model_config_id'], unique=False)
    op.create_index(op.f('ix_ai_governance_logs_prompt_hash'), 'ai_governance_logs', ['prompt_hash'], unique=False)
    op.create_index(op.f('ix_ai_governance_logs_user_id'), 'ai_governance_logs', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_ai_governance_logs_user_id'), table_name='ai_governance_logs')
    op.drop_index(op.f('ix_ai_governance_logs_prompt_hash'), table_name='ai_governance_logs')
    op.drop_index(op.f('ix_ai_governance_logs_model_config_id'), table_name='ai_governance_logs')
    op.drop_index(op.f('ix_ai_governance_logs_company_id'), table_name='ai_governance_logs')
    op.drop_index(op.f('ix_ai_governance_logs_agent_name'), table_name='ai_governance_logs')
    op.drop_index('ix_ai_gov_log_company_created', table_name='ai_governance_logs')
    op.drop_table('ai_governance_logs')

    op.drop_index('uq_ai_model_configs_company_model', table_name='ai_model_configs')
    op.drop_index(op.f('ix_ai_model_configs_company_id'), table_name='ai_model_configs')
    op.drop_table('ai_model_configs')
