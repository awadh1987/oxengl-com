"""custom_http SMS provider and per-tenant recovery channel toggles.

Revision ID: 202610080001
Revises: 202610070001
"""

from alembic import op

revision = "202610080001"
down_revision = "202610070001"
branch_labels = None
depends_on = None

_OLD_PROVIDERS = "'smtp', 'sendgrid', 'twilio', 'unifonic', 'taqnyat'"
_NEW_PROVIDERS = _OLD_PROVIDERS + ", 'custom_http'"


def _constraints(providers_all: str, sms_providers: str) -> None:
    op.execute("ALTER TABLE communication_settings DROP CONSTRAINT IF EXISTS ck_communication_settings_provider")
    op.execute("ALTER TABLE communication_settings DROP CONSTRAINT IF EXISTS ck_communication_settings_channel_provider")
    op.execute(
        f"ALTER TABLE communication_settings ADD CONSTRAINT ck_communication_settings_provider "
        f"CHECK (provider IN ({providers_all}))"
    )
    op.execute(
        "ALTER TABLE communication_settings ADD CONSTRAINT ck_communication_settings_channel_provider CHECK ("
        f"(channel = 'email' AND provider IN ('smtp', 'sendgrid')) OR (channel = 'sms' AND provider IN ({sms_providers})))"
    )


def upgrade() -> None:
    _constraints(_NEW_PROVIDERS, "'twilio', 'unifonic', 'taqnyat', 'custom_http'")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS recovery_channel_settings (
            id UUID PRIMARY KEY,
            tenant_id UUID REFERENCES res_companies(id) ON DELETE CASCADE,
            email_enabled BOOLEAN NOT NULL DEFAULT true,
            sms_enabled BOOLEAN NOT NULL DEFAULT true,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by UUID
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_channel_settings_tenant "
        "ON recovery_channel_settings (tenant_id) WHERE tenant_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_channel_settings_platform "
        "ON recovery_channel_settings ((tenant_id IS NULL)) WHERE tenant_id IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS recovery_channel_settings")
    op.execute("DELETE FROM communication_settings WHERE provider = 'custom_http'")
    _constraints(_OLD_PROVIDERS, "'twilio', 'unifonic', 'taqnyat'")
