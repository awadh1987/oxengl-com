"""Add payment_proof_url to saas_invoices and extend status check constraint.

Revision ID: 202610110002
Revises: 202610110001
Create Date: 2026-10-11 01:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = '202610110002'
down_revision: Union[str, None] = '202610110001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.get_bind().execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'saas_invoices' AND column_name = 'payment_proof_url'
                ) THEN
                    ALTER TABLE saas_invoices ADD COLUMN payment_proof_url VARCHAR(512) NULL;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'ck_saas_invoice_status'
                ) THEN
                    ALTER TABLE saas_invoices DROP CONSTRAINT ck_saas_invoice_status;
                END IF;

                ALTER TABLE saas_invoices ADD CONSTRAINT ck_saas_invoice_status 
                    CHECK (status IN ('paid', 'pending', 'pending_verification', 'overdue', 'cancelled', 'rejected', 'failed'));
            END $$;
            """
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'saas_invoices' AND column_name = 'payment_proof_url'
                ) THEN
                    ALTER TABLE saas_invoices DROP COLUMN payment_proof_url;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'ck_saas_invoice_status'
                ) THEN
                    ALTER TABLE saas_invoices DROP CONSTRAINT ck_saas_invoice_status;
                END IF;

                ALTER TABLE saas_invoices ADD CONSTRAINT ck_saas_invoice_status 
                    CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled'));
            END $$;
            """
        )
    )
