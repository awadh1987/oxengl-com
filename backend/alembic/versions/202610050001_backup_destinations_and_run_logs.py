"""External backup destinations (gdrive / onedrive / sftp) and per-upload run logs.

Additive and idempotent (CREATE ... IF NOT EXISTS), chained from the HR/IAM head (202610040002).

* ``backup_destinations`` - ``tenant_id`` NULL = platform-wide destination. ``config`` is NON-secret only;
  secrets live AES-256-GCM encrypted in ``credentials_encrypted`` (never plain text) or are referenced by
  ``credential_ref`` (``db:<id>`` or an OXENGL_BACKUP_CRED_<REF> environment reference).
* ``backup_run_logs`` - one row per upload attempt per destination; ``destination_id`` is SET NULL on delete
  so history survives (``destination_name`` / ``provider_type`` are snapshotted on each row).

Revision ID: 202610050001
Revises: 202610040002
"""

from typing import Sequence, Union

from alembic import op


revision: str = "202610050001"
down_revision: Union[str, Sequence[str], None] = "202610040002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS backup_destinations (
            id UUID PRIMARY KEY,
            tenant_id UUID REFERENCES res_companies(id) ON DELETE CASCADE,
            provider_type VARCHAR(16) NOT NULL,
            name VARCHAR(120) NOT NULL,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            credential_ref VARCHAR(128),
            credentials_encrypted TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            created_by UUID,
            CONSTRAINT ck_backup_destinations_provider
                CHECK (provider_type IN ('gdrive', 'onedrive', 'sftp')),
            CONSTRAINT ck_backup_destinations_credential_ref
                CHECK (credential_ref IS NULL OR credential_ref ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_backup_destinations_tenant_id ON backup_destinations (tenant_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS backup_run_logs (
            id UUID PRIMARY KEY,
            destination_id UUID REFERENCES backup_destinations(id) ON DELETE SET NULL,
            tenant_id UUID REFERENCES res_companies(id) ON DELETE CASCADE,
            destination_name VARCHAR(120),
            provider_type VARCHAR(16),
            status VARCHAR(16) NOT NULL,
            file_size_bytes BIGINT,
            error_message VARCHAR(500),
            started_at TIMESTAMP WITH TIME ZONE NOT NULL,
            completed_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT ck_backup_run_logs_status CHECK (status IN ('success', 'failed', 'running'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_backup_run_logs_tenant_started ON backup_run_logs (tenant_id, started_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_backup_run_logs_destination_id ON backup_run_logs (destination_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS backup_run_logs")
    op.execute("DROP TABLE IF EXISTS backup_destinations")
