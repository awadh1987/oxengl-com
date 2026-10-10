"""Platform payment gateway settings (Stripe / Moyasar / offline bank & wallet instructions).

Revision ID: 202610110001
Revises: 202610100001
Create Date: 2026-10-11 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = '202610110001'
down_revision: Union[str, None] = '202610100001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.get_bind().execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS public.platform_payment_gateway_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                stripe_secret_key_encrypted TEXT NULL,
                stripe_publishable_key_encrypted TEXT NULL,
                stripe_webhook_secret_encrypted TEXT NULL,
                is_stripe_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                moyasar_api_key_encrypted TEXT NULL,
                moyasar_publishable_key_encrypted TEXT NULL,
                is_moyasar_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                local_bank_instructions JSON NOT NULL DEFAULT '[]',
                digital_wallet_instructions JSON NOT NULL DEFAULT '[]',
                version INTEGER NOT NULL DEFAULT 1,
                updated_by VARCHAR(255) NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT ck_platform_payment_gateway_settings_singleton CHECK (id = 1)
            );

            COMMENT ON TABLE public.platform_payment_gateway_settings IS
                'Singleton (id=1). *_encrypted columns hold Fernet tokens keyed by BILLING_SETTINGS_ENCRYPTION_KEY.';
            """
        )
    )


def downgrade() -> None:
    op.get_bind().execute(text("DROP TABLE IF EXISTS public.platform_payment_gateway_settings;"))
