-- ==============================================================================
-- OxenGL Multi-Tenant Platform Architecture: Database-per-Tenant & RLS Blueprint
-- ==============================================================================
-- Enables strict multi-tenant data isolation with PostgreSQL Row-Level Security (RLS).
-- All queries are guaranteed tenant-scoped via current_setting('app.current_tenant_id').

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Master Tenants Control Plane Registry
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    commercial_registration VARCHAR(32),
    vat_number VARCHAR(32),
    plan_tier VARCHAR(32) NOT NULL DEFAULT 'standard' CHECK (plan_tier IN ('starter', 'standard', 'growth', 'enterprise')),
    max_users INT NOT NULL DEFAULT 15,
    max_storage_gb NUMERIC(10, 2) NOT NULL DEFAULT 25.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    primary_color VARCHAR(16) DEFAULT '#F05627',
    secondary_color VARCHAR(16) DEFAULT '#1E3A8A',
    theme_mode VARCHAR(16) DEFAULT 'CUSTOM',
    logo_url TEXT,
    rls_schema VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_tenants_slug ON master_tenants(slug);

-- ------------------------------------------------------------------------------
-- 2. Tenant Custom Domains & SSL Management
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES master_tenants(id) ON DELETE CASCADE,
    domain_name VARCHAR(255) UNIQUE NOT NULL,
    verification_token VARCHAR(128) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    cname_target VARCHAR(255) NOT NULL DEFAULT 'domains.oxengl.me',
    ssl_status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'validating_dns', 'issuing', 'active', 'failed')),
    ssl_issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_domain ON tenant_domains(domain_name);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant_id ON tenant_domains(tenant_id);

-- ------------------------------------------------------------------------------
-- 3. Tenant Members & RBAC (Tenant Plane)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES master_tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'coo', 'accountant', 'data_entry', 'driver', 'guest_user')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_users_tenant_email UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_email ON tenant_users(email);

-- ------------------------------------------------------------------------------
-- 4. Tenant Progressive Settings (Webhooks, API Keys, SAML SSO)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID UNIQUE NOT NULL REFERENCES master_tenants(id) ON DELETE CASCADE,
    webhook_url TEXT,
    webhook_secret VARCHAR(128),
    api_key_public VARCHAR(64),
    api_key_secret_hash VARCHAR(255),
    sso_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    sso_provider VARCHAR(64),
    sso_metadata_url TEXT,
    sso_entity_id VARCHAR(255),
    zatca_environment VARCHAR(32) DEFAULT 'sandbox' CHECK (zatca_environment IN ('sandbox', 'simulation', 'production')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. Tenant Feature Flags
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES master_tenants(id) ON DELETE CASCADE,
    flag_key VARCHAR(64) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_feature_flags UNIQUE(tenant_id, flag_key)
);

-- ------------------------------------------------------------------------------
-- 6. System Telemetry & Audit Logs (DevOps & SuperAdmin Cockpit)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID,
    actor_email VARCHAR(255),
    actor_plane VARCHAR(16) NOT NULL DEFAULT 'master',
    tenant_id UUID REFERENCES master_tenants(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource VARCHAR(64) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_audit_logs_tenant_id ON master_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_master_audit_logs_timestamp ON master_audit_logs(timestamp DESC);

-- ==============================================================================
-- 7. Row-Level Security (RLS) Policies Configuration
-- ==============================================================================

-- Enable RLS on Tenant-Scoped Tables
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;

-- Safeguard 2: Force RLS even for table owners / pooled superuser sessions
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains FORCE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS rls_tenant_users_isolation ON tenant_users;
DROP POLICY IF EXISTS rls_tenant_settings_isolation ON tenant_settings;
DROP POLICY IF EXISTS rls_tenant_feature_flags_isolation ON tenant_feature_flags;
DROP POLICY IF EXISTS rls_tenant_domains_isolation ON tenant_domains;

-- Policy 1: tenant_users
CREATE POLICY rls_tenant_users_isolation ON tenant_users
    FOR ALL
    USING (
        current_setting('app.is_master_admin', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_master_admin', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- Policy 2: tenant_settings
CREATE POLICY rls_tenant_settings_isolation ON tenant_settings
    FOR ALL
    USING (
        current_setting('app.is_master_admin', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_master_admin', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- Policy 3: tenant_feature_flags
CREATE POLICY rls_tenant_feature_flags_isolation ON tenant_feature_flags
    FOR ALL
    USING (
        current_setting('app.is_master_admin', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_master_admin', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- Policy 4: tenant_domains
CREATE POLICY rls_tenant_domains_isolation ON tenant_domains
    FOR ALL
    USING (
        current_setting('app.is_master_admin', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_master_admin', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- ==============================================================================
-- 8. Connection Pool Scoping Helper Functions (Safeguard 2)
-- ==============================================================================
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID, p_is_master BOOLEAN DEFAULT FALSE)
RETURNS VOID AS $$
BEGIN
    -- Using is_local = true ensures settings are transaction-local and automatically reset on commit/rollback
    PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
    IF p_is_master THEN
        PERFORM set_config('app.is_master_admin', 'true', true);
    ELSE
        PERFORM set_config('app.is_master_admin', 'false', true);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION clear_tenant_context()
RETURNS VOID AS $$
BEGIN
    -- Clear current tenant context immediately post-query to prevent context leaks across pooled connections
    PERFORM set_config('app.current_tenant_id', '', true);
    PERFORM set_config('app.is_master_admin', 'false', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 9. Seed Default Master Tenants & Custom Domains
-- ==============================================================================
INSERT INTO master_tenants (id, slug, name, commercial_registration, vat_number, plan_tier, max_users, max_storage_gb, primary_color, secondary_color, theme_mode, rls_schema)
VALUES
    ('6ab52593-ab47-4eee-8779-0cdfbb2762da', 'horizon-logistics', 'شركة هورايزون للخدمات اللوجستية (Horizon Logistics)', '1010776543', '300099999900003', 'enterprise', 999999, 1000.00, '#F05627', '#1E3A8A', 'CUSTOM', 'tenant_horizon_logistics'),
    ('317f6c7c-7842-4db1-a464-ea9d5f924e22', 'meayon-transport', 'شركة ميون للنقل والخدمات اللوجستية', '1010824619', '310892019400003', 'growth', 50, 100.00, '#F59E0B', '#10B981', 'LIGHT', 'tenant_meayon_transport'),
    ('8a3e9c12-5b6d-4f7e-9123-0c4b6e8f1a23', 'riyadh-aggregates', 'مؤسسة الرياض لتجارة ونقل البحص والرمل', '1010654321', '300088888800003', 'standard', 15, 25.00, '#8B5CF6', '#06B6D4', 'DARK', 'tenant_riyadh_aggregates')
ON CONFLICT (slug) DO UPDATE SET
    plan_tier = EXCLUDED.plan_tier,
    max_users = EXCLUDED.max_users,
    max_storage_gb = EXCLUDED.max_storage_gb;

-- Seed Domains
INSERT INTO tenant_domains (tenant_id, domain_name, verification_token, is_verified, ssl_status)
VALUES
    ('6ab52593-ab47-4eee-8779-0cdfbb2762da', 'transport.horizon.sa', 'oxengl_verify_7f9c21b', TRUE, 'active'),
    ('317f6c7c-7842-4db1-a464-ea9d5f924e22', 'fleet.meayon.com', 'oxengl_verify_3b2a88e', TRUE, 'active'),
    ('8a3e9c12-5b6d-4f7e-9123-0c4b6e8f1a23', 'portal.riyadh-aggregates.sa', 'oxengl_verify_1e4d99c', FALSE, 'validating_dns')
ON CONFLICT (domain_name) DO NOTHING;

