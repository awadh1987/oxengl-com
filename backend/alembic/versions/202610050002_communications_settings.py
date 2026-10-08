"""Tenant and platform outbound communications settings.

Revision ID: 202610050002
Revises: 202610050001
"""

from typing import Sequence, Union

from alembic import op


revision: str = "202610050002"
down_revision: Union[str, Sequence[str], None] = "202610050001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS communication_settings (
            id UUID PRIMARY KEY,
            tenant_id UUID REFERENCES res_companies(id) ON DELETE CASCADE,
            channel VARCHAR(8) NOT NULL,
            provider VARCHAR(16) NOT NULL,
            sender_identity VARCHAR(255) NOT NULL,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            credentials_encrypted TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by UUID,
            last_test_at TIMESTAMPTZ,
            last_test_status VARCHAR(16),
            last_test_error VARCHAR(500),
            CONSTRAINT ck_communication_settings_channel
                CHECK (channel IN ('email', 'sms')),
            CONSTRAINT ck_communication_settings_provider
                CHECK (provider IN ('smtp', 'sendgrid', 'twilio', 'unifonic', 'taqnyat')),
            CONSTRAINT ck_communication_settings_channel_provider CHECK (
                (channel = 'email' AND provider IN ('smtp', 'sendgrid')) OR
                (channel = 'sms' AND provider IN ('twilio', 'unifonic', 'taqnyat'))
            ),
            CONSTRAINT ck_communication_settings_test_status
                CHECK (last_test_status IS NULL OR last_test_status IN ('success', 'failed'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_communication_settings_tenant_channel "
        "ON communication_settings (tenant_id, channel)"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_settings_active_tenant_channel "
        "ON communication_settings (tenant_id, channel) WHERE is_active = true AND tenant_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_settings_active_platform_channel "
        "ON communication_settings (channel) WHERE is_active = true AND tenant_id IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS communication_settings")
