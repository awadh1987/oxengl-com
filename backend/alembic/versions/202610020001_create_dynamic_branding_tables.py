"""create platform_settings, organizations and tenant_branding tables

Revision ID: 202610020001
Revises: f3a4b5c6d7e8
Create Date: 2026-10-02 20:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '202610020001'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Ensure features_override and custom_domain columns exist on res_companies
    op.execute("""
        ALTER TABLE res_companies 
        ADD COLUMN IF NOT EXISTS features_override JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE res_companies 
        ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) UNIQUE;
        CREATE INDEX IF NOT EXISTS ix_res_companies_custom_domain ON res_companies(custom_domain);
    """)

    # 1. Create organizations table if not exists
    op.execute("""
        CREATE TABLE IF NOT EXISTS organizations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) UNIQUE,
            company_id UUID UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_organizations_slug ON organizations (slug);
        CREATE INDEX IF NOT EXISTS ix_organizations_company_id ON organizations (company_id);
    """)

    # 2. Seed organizations from existing res_companies
    op.execute("""
        INSERT INTO organizations (name, slug, company_id)
        SELECT name, COALESCE(slug, domain_slug, 'company-' || id::text), id 
        FROM res_companies
        ON CONFLICT (company_id) DO NOTHING;
    """)

    # 3. Create platform_settings table matching spec
    op.execute("""
        CREATE TABLE IF NOT EXISTS platform_settings (
            id SERIAL PRIMARY KEY,
            setting_key VARCHAR(100) UNIQUE NOT NULL,
            setting_value JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_platform_settings_key ON platform_settings (setting_key);
    """)

    # 4. Seed default global branding into platform_settings
    op.execute("""
        INSERT INTO platform_settings (setting_key, setting_value, updated_at)
        VALUES (
            'global_branding',
            '{"platform_name": "OxenGL Enterprise", "brand_name": "OxenGL Enterprise", "default_logo": "/oxengl-logo.svg", "logo_url": "/oxengl-logo.svg", "default_favicon": "/favicon.ico", "favicon_url": "/favicon.ico", "primary_color": "#f97316", "accent_color": "#0f172a", "company_name_ar": "منظومة أوكسن السحابية", "company_name_en": "OxenGL Enterprise Cloud", "support_email": "contact@oxengl.me", "support_phone": "+966 50 123 4567"}'::jsonb,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (setting_key) DO NOTHING;
    """)

    # 5. Create tenant_branding table matching spec
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant_branding (
            id SERIAL PRIMARY KEY,
            tenant_id INT REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
            brand_name VARCHAR(255) NOT NULL,
            logo_url TEXT NOT NULL,
            favicon_url TEXT,
            primary_color VARCHAR(50) DEFAULT '#f97316',
            accent_color VARCHAR(50) DEFAULT '#0f172a',
            custom_domain VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_tenant_branding_tenant_id ON tenant_branding (tenant_id);
        CREATE INDEX IF NOT EXISTS ix_tenant_branding_custom_domain ON tenant_branding (custom_domain);
    """)

    # 6. Seed tenant_branding from existing organizations and res_companies
    op.execute("""
        INSERT INTO tenant_branding (tenant_id, brand_name, logo_url, primary_color, accent_color, custom_domain)
        SELECT 
            o.id,
            c.name,
            COALESCE(c.ui_logo_url, c.logo_url, '/oxengl-logo.svg'),
            COALESCE(c.ui_primary_color, c.primary_color, '#f97316'),
            COALESCE(c.secondary_color, '#0f172a'),
            COALESCE(c.custom_domain, c.domain_slug, c.slug)
        FROM organizations o
        JOIN res_companies c ON o.company_id = c.id
        ON CONFLICT (tenant_id) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant_branding CASCADE;")
    op.execute("DROP TABLE IF EXISTS platform_settings CASCADE;")
    op.execute("DROP TABLE IF EXISTS organizations CASCADE;")
