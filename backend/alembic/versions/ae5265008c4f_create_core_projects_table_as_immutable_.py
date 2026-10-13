"""create core_projects table as immutable platform core

Revision ID: ae5265008c4f
Revises: 202610110002
Create Date: 2026-10-12 17:57:44.642603+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ae5265008c4f'
down_revision: Union[str, None] = '202610110002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS core_projects (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL,
            project_code VARCHAR(64) NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            project_type VARCHAR(50) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'planning',
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now(),
            created_by UUID,
            CONSTRAINT chk_valid_project_type CHECK (project_type IN ('logistics', 'epc', 'humanitarian', 'fuel', 'construction'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_core_projects_project_code ON core_projects (project_code);
        CREATE INDEX IF NOT EXISTS ix_core_projects_tenant_id ON core_projects (tenant_id);
        CREATE INDEX IF NOT EXISTS ix_core_projects_project_type ON core_projects (project_type);
        CREATE INDEX IF NOT EXISTS ix_core_projects_status ON core_projects (status);
        CREATE INDEX IF NOT EXISTS ix_core_projects_tenant_type ON core_projects (tenant_id, project_type);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS core_projects CASCADE;")
