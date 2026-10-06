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
-- 7a. Tenant-owned ORM tables
-- ==============================================================================
-- Apply these policies after the application/Alembic schema has created its tables.
-- Missing tables are skipped so this bootstrap script remains usable on a fresh
-- database; rerun it after schema migrations to cover tables created afterwards.
-- Directly scoped tables use their tenant_id/company_id column. res_companies is
-- scoped by its own id. Tables without a direct key inherit scope through their
-- parent foreign key below.
DO $tenant_rls$
DECLARE
    table_scope RECORD;
    child_scope RECORD;
    scope_predicate TEXT;
    policy_predicate TEXT;
    table_oid REGCLASS;
    has_tenant_id BOOLEAN;
    has_company_id BOOLEAN;
BEGIN
    FOR table_scope IN
        SELECT * FROM (VALUES
            ('res_companies', 'id'),
            ('tenant_audit_logs', 'tenant_id'),
            ('platform_audit_logs', 'both'),
            ('custom_field_definitions', 'company_id'),
            ('backup_destinations', 'tenant_id'),
            ('backup_run_logs', 'tenant_id'),
            ('communication_settings', 'tenant_id'),
            ('res_users', 'company_id'),
            ('res_partners', 'company_id'),
            ('stock_locations', 'company_id'),
            ('product_products', 'company_id'),
            ('stock_pickings', 'company_id'),
            ('stock_moves', 'company_id'),
            ('stock_quants', 'company_id'),
            ('weighbridge_tickets', 'company_id'),
            ('operation_attachments', 'company_id'),
            ('tenant_documents', 'company_id'),
            ('transporter_ledger', 'company_id'),
            ('account_accounts', 'company_id'),
            ('account_journals', 'company_id'),
            ('fiscal_years', 'company_id'),
            ('cost_centers', 'company_id'),
            ('purchasing_organizations', 'company_id'),
            ('account_moves', 'company_id'),
            ('account_move_lines', 'company_id'),
            ('customer_invoices', 'company_id'),
            ('supplier_settlements', 'company_id'),
            ('vehicles', 'both'),
            ('maintenance_work_orders', 'company_id'),
            ('part_requirements', 'company_id'),
            ('fuel_transactions', 'company_id'),
            ('seasonal_crop_cycles', 'company_id'),
            ('harvest_batches', 'company_id'),
            ('farm_gate_weighments', 'company_id'),
            ('purchase_orders', 'company_id'),
            ('goods_receipts', 'company_id'),
            ('supplier_invoices', 'company_id'),
            ('tax_profiles', 'company_id'),
            ('tax_rules', 'company_id'),
            ('zatca_logs', 'company_id'),
            ('security_events', 'company_id'),
            ('device_registrations', 'company_id'),
            ('sync_queue_events', 'company_id'),
            ('warehouses', 'company_id'),
            ('warehouse_zones', 'company_id'),
            ('stock_items', 'company_id'),
            ('stock_lots', 'company_id'),
            ('stock_movements', 'company_id'),
            ('yard_gate_appointments', 'company_id'),
            ('tenant_database_configs', 'company_id'),
            ('tenant_database_migrations', 'company_id'),
            ('tenant_sso_configs', 'company_id'),
            ('reporting_ledger_summaries', 'company_id'),
            ('fleet_utilization_facts', 'company_id'),
            ('ai_model_configs', 'company_id'),
            ('ai_governance_logs', 'company_id'),
            ('fleet_trips', 'company_id'),
            ('delivery_proofs', 'company_id'),
            ('trip_inspection_logs', 'company_id'),
            ('organizations', 'company_id'),
            ('tenant_databases', 'tenant_id'),
            ('saas_invoices', 'tenant_id'),
            ('system_sequences', 'tenant_id'),
            ('tenant_branding', 'tenant_id'),
            ('approval_rules', 'tenant_id'),
            ('workflow_instances', 'tenant_id'),
            ('vendors', 'tenant_id'),
            ('supplier_contracts', 'tenant_id'),
            ('purchase_requisitions', 'tenant_id'),
            ('vendor_bills', 'both'),
            ('procurement_tenders', 'company_id'),
            ('vendor_portal_users', 'company_id'),
            ('project_charters', 'tenant_id'),
            ('execution_tasks', 'tenant_id'),
            ('strategic_hazards', 'tenant_id'),
            ('electronic_ledger_blocks', 'tenant_id'),
            ('customs_manifests', 'tenant_id'),
            ('ai_knowledge_documents', 'tenant_id'),
            ('ai_knowledge_chunks', 'tenant_id'),
            ('materials', 'both'),
            ('stock_balances', 'tenant_id'),
            ('landed_cost_allocations', 'tenant_id'),
            ('inventory_movements', 'both'),
            ('employees', 'tenant_id'),
            ('employee_documents', 'tenant_id'),
            ('attendance_logs', 'tenant_id'),
            ('payroll_allowances', 'tenant_id'),
            ('payroll_runs', 'tenant_id'),
            ('hrms_attendance_logs', 'tenant_id'),
            ('user_sessions', 'tenant_id'),
            ('drivers', 'tenant_id'),
            ('gps_events', 'tenant_id'),
            ('waybills', 'tenant_id'),
            ('tenant_subscriptions', 'tenant_id'),
            ('accounts', 'both'),
            ('finance_journal_entries', 'both'),
            ('finance_journal_lines', 'tenant_id'),
            ('journal_entries', 'both')
        ) AS scoped_tables(table_name, scope_kind)
    LOOP
        table_oid := to_regclass(format('public.%I', table_scope.table_name));
        IF table_oid IS NULL THEN
            CONTINUE;
        END IF;

        SELECT EXISTS (
                   SELECT 1 FROM pg_attribute
                   WHERE attrelid = table_oid AND attname = 'tenant_id' AND NOT attisdropped
               ),
               EXISTS (
                   SELECT 1 FROM pg_attribute
                   WHERE attrelid = table_oid AND attname = 'company_id' AND NOT attisdropped
               )
        INTO has_tenant_id, has_company_id;

        IF table_scope.scope_kind = 'id' THEN
            scope_predicate := 'id::text = NULLIF(current_setting(''app.current_tenant_id'', true), '''')';
        ELSIF table_scope.scope_kind = 'both' AND has_tenant_id AND has_company_id THEN
            scope_predicate := 'tenant_id::text = NULLIF(current_setting(''app.current_tenant_id'', true), '''') '
                'AND (company_id IS NULL OR company_id::text = NULLIF(current_setting(''app.current_tenant_id'', true), ''''))';
        ELSIF table_scope.scope_kind = 'tenant_id' AND has_tenant_id THEN
            scope_predicate := 'tenant_id::text = NULLIF(current_setting(''app.current_tenant_id'', true), '''')';
        ELSIF table_scope.scope_kind = 'company_id' AND has_company_id THEN
            scope_predicate := 'company_id::text = NULLIF(current_setting(''app.current_tenant_id'', true), '''')';
        ELSE
            RAISE EXCEPTION 'RLS scope column mismatch for public.%', table_scope.table_name;
        END IF;

        policy_predicate := format(
            '(current_setting(''app.is_master_admin'', true) = ''true'' OR (%s))',
            scope_predicate
        );

        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_oid);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', table_oid);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                       'rls_' || table_scope.table_name || '_select', table_oid);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                       'rls_' || table_scope.table_name || '_insert', table_oid);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                       'rls_' || table_scope.table_name || '_update', table_oid);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                       'rls_' || table_scope.table_name || '_delete', table_oid);

        EXECUTE format('CREATE POLICY %I ON %s FOR SELECT USING (%s)',
                       'rls_' || table_scope.table_name || '_select', table_oid, policy_predicate);
        EXECUTE format('CREATE POLICY %I ON %s FOR INSERT WITH CHECK (%s)',
                       'rls_' || table_scope.table_name || '_insert', table_oid, policy_predicate);
        EXECUTE format('CREATE POLICY %I ON %s FOR UPDATE USING (%s) WITH CHECK (%s)',
                       'rls_' || table_scope.table_name || '_update', table_oid,
                       policy_predicate, policy_predicate);
        EXECUTE format('CREATE POLICY %I ON %s FOR DELETE USING (%s)',
                       'rls_' || table_scope.table_name || '_delete', table_oid, policy_predicate);
    END LOOP;

    -- Child records without tenant columns inherit the tenant boundary from a
    -- directly scoped parent. The parent tables above also have FORCE RLS.
    FOR child_scope IN
        SELECT * FROM (VALUES
            ('journal_lines', 'entry_id', 'journal_entries', 'tenant_id'),
            ('purchase_requisition_lines', 'requisition_id', 'purchase_requisitions', 'tenant_id'),
            ('purchase_order_lines', 'purchase_order_id', 'purchase_orders', 'company_id'),
            ('goods_receipt_batch_logs', 'goods_receipt_id', 'goods_receipts', 'company_id'),
            ('workflow_steps', 'instance_id', 'workflow_instances', 'tenant_id'),
            ('tender_rfq_lines', 'tender_id', 'procurement_tenders', 'company_id'),
            ('procurement_bids', 'tender_id', 'procurement_tenders', 'company_id'),
            ('procurement_bid_lines', 'bid_id', 'procurement_bids', 'inherited'),
            ('landed_cost_items', 'allocation_id', 'landed_cost_allocations', 'tenant_id'),
            ('refresh_tokens', 'session_id', 'user_sessions', 'tenant_id'),
            ('security_tokens', 'user_id', 'res_users', 'company_id'),
            ('invoices', 'journal_entry_id', 'finance_journal_entries', 'tenant_id')
        ) AS child_tables(table_name, child_column, parent_table, parent_scope_column)
    LOOP
        table_oid := to_regclass(format('public.%I', child_scope.table_name));
        IF table_oid IS NULL
           OR to_regclass(format('public.%I', child_scope.parent_table)) IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_attribute
            WHERE attrelid = table_oid
              AND attname = child_scope.child_column
              AND NOT attisdropped
        ) THEN
            RAISE EXCEPTION 'RLS child key mismatch for public.%.%',
                child_scope.table_name, child_scope.child_column;
        END IF;

        IF child_scope.parent_scope_column = 'inherited' THEN
            scope_predicate := format(
                'EXISTS (SELECT 1 FROM public.%I parent_row WHERE parent_row.id = %I.%I)',
                child_scope.parent_table, child_scope.table_name, child_scope.child_column
            );
        ELSE
            scope_predicate := format(
                'EXISTS (SELECT 1 FROM public.%I parent_row WHERE parent_row.id = %I.%I AND '
                '(%s))',
                child_scope.parent_table, child_scope.table_name, child_scope.child_column,
                format(
                    '(current_setting(''app.is_master_admin'', true) = ''true'' OR parent_row.%I::text = NULLIF(current_setting(''app.current_tenant_id'', true), ''''))',
                    child_scope.parent_scope_column
                )
            );
        END IF;

        policy_predicate := format(
            '(current_setting(''app.is_master_admin'', true) = ''true'' OR (%s))',
            scope_predicate
        );

        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_oid);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', table_oid);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                       'rls_' || child_scope.table_name || '_select', table_oid);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                       'rls_' || child_scope.table_name || '_insert', table_oid);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                       'rls_' || child_scope.table_name || '_update', table_oid);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                       'rls_' || child_scope.table_name || '_delete', table_oid);

        EXECUTE format('CREATE POLICY %I ON %s FOR SELECT USING (%s)',
                       'rls_' || child_scope.table_name || '_select', table_oid, policy_predicate);
        EXECUTE format('CREATE POLICY %I ON %s FOR INSERT WITH CHECK (%s)',
                       'rls_' || child_scope.table_name || '_insert', table_oid, policy_predicate);
        EXECUTE format('CREATE POLICY %I ON %s FOR UPDATE USING (%s) WITH CHECK (%s)',
                       'rls_' || child_scope.table_name || '_update', table_oid,
                       policy_predicate, policy_predicate);
        EXECUTE format('CREATE POLICY %I ON %s FOR DELETE USING (%s)',
                       'rls_' || child_scope.table_name || '_delete', table_oid, policy_predicate);
    END LOOP;
END;
$tenant_rls$;

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
