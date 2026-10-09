"""Add tenant email branding and custom smtp settings fields.

Revision ID: 202610090001
Revises: 202610080004
Create Date: 2026-10-09 15:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '202610090001'
down_revision: Union[str, None] = '202610080004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update tenants table
    op.execute("""
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS workspace_domain VARCHAR(100);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS signature_name VARCHAR(100) DEFAULT 'Executive Administration';
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS signature_title VARCHAR(100) DEFAULT 'Operations Team';
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS support_email VARCHAR(255);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_smtp_settings JSONB DEFAULT NULL;
    """)

    # 2. Update res_companies table for tenant plane compatibility
    op.execute("""
        ALTER TABLE res_companies ADD COLUMN IF NOT EXISTS workspace_domain VARCHAR(100);
        ALTER TABLE res_companies ADD COLUMN IF NOT EXISTS signature_name VARCHAR(100) DEFAULT 'Executive Administration';
        ALTER TABLE res_companies ADD COLUMN IF NOT EXISTS signature_title VARCHAR(100) DEFAULT 'Operations Team';
        ALTER TABLE res_companies ADD COLUMN IF NOT EXISTS support_email VARCHAR(255);
        ALTER TABLE res_companies ADD COLUMN IF NOT EXISTS custom_smtp_settings JSONB DEFAULT NULL;
    """)

    # 3. Update master_tenants table for control plane compatibility
    op.execute("""
        ALTER TABLE master_tenants ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255);
        ALTER TABLE master_tenants ADD COLUMN IF NOT EXISTS workspace_domain VARCHAR(100);
        ALTER TABLE master_tenants ADD COLUMN IF NOT EXISTS signature_name VARCHAR(100) DEFAULT 'Executive Administration';
        ALTER TABLE master_tenants ADD COLUMN IF NOT EXISTS signature_title VARCHAR(100) DEFAULT 'Operations Team';
        ALTER TABLE master_tenants ADD COLUMN IF NOT EXISTS support_email VARCHAR(255);
        ALTER TABLE master_tenants ADD COLUMN IF NOT EXISTS custom_smtp_settings JSONB DEFAULT NULL;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE tenants DROP COLUMN IF EXISTS custom_smtp_settings;
        ALTER TABLE tenants DROP COLUMN IF EXISTS support_email;
        ALTER TABLE tenants DROP COLUMN IF EXISTS signature_title;
        ALTER TABLE tenants DROP COLUMN IF EXISTS signature_name;
        ALTER TABLE tenants DROP COLUMN IF EXISTS workspace_domain;

        ALTER TABLE res_companies DROP COLUMN IF EXISTS custom_smtp_settings;
        ALTER TABLE res_companies DROP COLUMN IF EXISTS support_email;
        ALTER TABLE res_companies DROP COLUMN IF EXISTS signature_title;
        ALTER TABLE res_companies DROP COLUMN IF EXISTS signature_name;
        ALTER TABLE res_companies DROP COLUMN IF EXISTS workspace_domain;

        ALTER TABLE master_tenants DROP COLUMN IF EXISTS custom_smtp_settings;
        ALTER TABLE master_tenants DROP COLUMN IF EXISTS support_email;
        ALTER TABLE master_tenants DROP COLUMN IF EXISTS signature_title;
        ALTER TABLE master_tenants DROP COLUMN IF EXISTS signature_name;
        ALTER TABLE master_tenants DROP COLUMN IF EXISTS workspace_domain;
        ALTER TABLE master_tenants DROP COLUMN IF EXISTS logo_url;
    """)
