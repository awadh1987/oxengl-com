-- ==============================================================================
-- OxenGL Enterprise Multi-Tenant Hierarchical Chart of Accounts Bootstrap Seed
-- ==============================================================================
-- Complete 5-Level Hierarchical Chart of Accounts using PostgreSQL ltree.
-- Roots: 1 (Assets), 2 (Liabilities), 3 (Equity), 4 (Revenue), 5 (Expenses)
-- ==============================================================================

-- 1. Ensure required PostgreSQL extensions are enabled in public schema
CREATE EXTENSION IF NOT EXISTS ltree SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

-- 1b. Identity & Access Management (IAM) Core Tables
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    status VARCHAR(32) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Seed Master Roles & Admin User
INSERT INTO public.roles (id, tenant_id, name, description, is_system_role) VALUES 
('11111111-1111-1111-1111-111111111111'::uuid, 'a3b6c2d1-e4f5-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'SUPER_ADMIN', 'Master Gatekeeper', TRUE),
('22222222-2222-2222-2222-222222222222'::uuid, 'a3b6c2d1-e4f5-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'FINANCE_MANAGER', 'GL Lead', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, tenant_id, username, email, password_hash, mfa_enabled, status, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000000'::uuid, 'a3b6c2d1-e4f5-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'admin.oxengl', 'admin@oxengl.com', crypt('OxenGL@2026Secure!', gen_salt('bf', 10)), FALSE, 'ACTIVE', NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = EXCLUDED.status;

INSERT INTO public.user_roles (user_id, role_id) VALUES 
('00000000-0000-0000-0000-000000000000'::uuid, '11111111-1111-1111-1111-111111111111'::uuid)
ON CONFLICT DO NOTHING;

-- Synchronize res_companies & res_users
INSERT INTO public.res_companies (id, name, slug, currency, max_cost_centers, theme_mode, ui_primary_color, fiscal_calendar, fiscal_year_start_month, tax_regime, subscription_tier)
VALUES ('f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c', 'OxenGL Global Logistics', 'oxengl-global', 'SAR', 25, 'CUSTOM', '#1E3A8A', 'gregorian', 1, 'KSA_VAT', 'ENTERPRISE')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.res_users (id, firebase_uid, email, full_name, password_hash, company_id, role, is_active, mfa_enabled)
VALUES ('00000000-0000-0000-0000-000000000000', 'oxengl_admin_uid', 'admin@oxengl.com', 'OxenGL Administrator', crypt('OxenGL@2026Secure!', gen_salt('bf', 10)), 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c', 'Super_Admin', TRUE, FALSE)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = EXCLUDED.is_active;

-- Synchronize master_users
INSERT INTO public.master_users (id, email, mobile_number, full_name, password_hash, role, is_active)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'admin@oxengl.com', '+966500000002', 'OxenGL Administrator', crypt('OxenGL@2026Secure!', gen_salt('bf', 10)), 'super_admin', TRUE)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = EXCLUDED.is_active;


-- 2. Multi-Tenant Master Control Plane Registry
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(150) NOT NULL,
    schema_name VARCHAR(64) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.tenants (id, company_name, schema_name, is_active)
VALUES ('a3b6c2d1-e4f5-7a8b-9c0d-1e2f3a4b5c6d', 'Alpha Raw Materials Corp', 'tenant_company_alpha', true)
ON CONFLICT (schema_name) DO UPDATE 
SET company_name = EXCLUDED.company_name, is_active = EXCLUDED.is_active;

-- Synchronize master_tenants with tenants and res_companies
INSERT INTO public.master_tenants (id, name, slug, custom_domain, owner_full_name, owner_email, owner_mobile, status, subscription_tier, max_users, max_storage_gb)
VALUES
('a3b6c2d1-e4f5-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'Alpha Raw Materials Corp', 'alpha-logistics', 'alpha.oxengl.com', 'OxenGL Administrator', 'admin@oxengl.com', '+966500000002', 'active', 'enterprise', 100, 100),
('6ab52593-ab47-4eee-8779-0cdfbb2762da'::uuid, 'شركة هورايزون للخدمات اللوجستية (Horizon Logistics)', 'horizon-logistics', 'transport.horizon.sa', 'Horizon Admin', 'admin@horizon.sa', '+966500000011', 'active', 'enterprise', 999999, 1000),
('317f6c7c-7842-4db1-a464-ea9d5f924e22'::uuid, 'شركة ميون للنقل والخدمات اللوجستية', 'meayon-transport', 'fleet.meayon.com', 'Meayon Admin', 'admin@meayon.com', '+966500000012', 'active', 'growth', 50, 100)
ON CONFLICT (slug) DO UPDATE SET status = EXCLUDED.status;

-- 3. Currency Exchange Rates Reference
CREATE TABLE IF NOT EXISTS public.exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency VARCHAR(10) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    rate NUMERIC(18, 6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_exchange_rates_pair UNIQUE (from_currency, to_currency)
);

INSERT INTO public.exchange_rates (id, from_currency, to_currency, rate)
VALUES (gen_random_uuid(), 'USD', 'SAR', 3.750000)
ON CONFLICT (from_currency, to_currency) DO UPDATE 
SET rate = EXCLUDED.rate;

-- 4. Create Public Chart of Accounts Table with ltree Hierarchical Support
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(50) NOT NULL UNIQUE,
    account_name VARCHAR(150) NOT NULL,
    node_path ltree NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. GiST Indexing for High-Speed Hierarchical Tree Traversal & Lookups
CREATE INDEX IF NOT EXISTS idx_coa_node_path_gist ON public.chart_of_accounts USING GIST (node_path);
CREATE INDEX IF NOT EXISTS idx_coa_account_code ON public.chart_of_accounts (account_code);
CREATE INDEX IF NOT EXISTS idx_coa_account_type ON public.chart_of_accounts (account_type);

-- 6. Ensure Tenant Schema and Table Mirrors
CREATE SCHEMA IF NOT EXISTS tenant_company_alpha;

CREATE TABLE IF NOT EXISTS tenant_company_alpha.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(50) NOT NULL UNIQUE,
    account_name VARCHAR(150) NOT NULL,
    node_path ltree NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tca_coa_node_path_gist ON tenant_company_alpha.chart_of_accounts USING GIST (node_path);
CREATE INDEX IF NOT EXISTS idx_tca_coa_account_code ON tenant_company_alpha.chart_of_accounts (account_code);

-- 7. Seed Complete 5-Level Hierarchical Chart of Accounts into Public Schema
INSERT INTO public.chart_of_accounts (account_code, account_name, node_path, account_type) VALUES
    -- =========================================================================
    -- 1. ASSETS (الأصول)
    -- =========================================================================
    ('100000', 'Assets', '1', 'Asset'),
    -- Level 2: Current & Non-Current Assets
    ('110000', 'Current Assets', '1.1', 'Asset'),
    ('120000', 'Non-Current Assets', '1.2', 'Asset'),
    -- Level 3: Sub-Categories under Current Assets
    ('111000', 'Cash and Cash Equivalents', '1.1.1', 'Asset'),
    ('112000', 'Trade and Other Receivables', '1.1.2', 'Asset'),
    ('113000', 'Inventories and Stockpiles', '1.1.3', 'Asset'),
    -- Level 4: Control Accounts under Cash and Receivables
    ('111100', 'Operating Bank Accounts', '1.1.1.1', 'Asset'),
    ('111200', 'Petty Cash Funds', '1.1.1.2', 'Asset'),
    ('112100', 'Trade Accounts Receivable', '1.1.2.1', 'Asset'),
    ('112200', 'Allowance for Credit Losses', '1.1.2.2', 'Asset'),
    ('113100', 'Raw Materials & Bulk Commodities', '1.1.3.1', 'Asset'),
    ('113200', 'Goods in Inbound Transit', '1.1.3.2', 'Asset'),
    -- Level 5: Detailed Sub-Ledger Accounts under Current Assets
    ('111101', 'Main Operating Account - SAR', '1.1.1.1.1', 'Asset'),
    ('111102', 'Disbursement Treasury Account - USD', '1.1.1.1.2', 'Asset'),
    ('111201', 'Headquarters Petty Cash', '1.1.1.2.1', 'Asset'),
    ('111202', 'Field Depot Petty Cash', '1.1.1.2.2', 'Asset'),
    ('112101', 'Commercial Freight Customers', '1.1.2.1.1', 'Asset'),
    ('112102', 'Intercompany Receivables - Alpha', '1.1.2.1.2', 'Asset'),
    ('112201', 'General ECL Provision', '1.1.2.2.1', 'Asset'),
    ('113101', 'Grain & Crop Bulk Stockpiles', '1.1.3.1.1', 'Asset'),
    ('113102', 'Aggregates & Mineral Stock', '1.1.3.1.2', 'Asset'),
    ('113201', 'In-Transit Freight Stock', '1.1.3.2.1', 'Asset'),
    -- Level 3: Sub-Categories under Non-Current Assets
    ('121000', 'Property, Plant and Equipment', '1.2.1', 'Asset'),
    ('122000', 'Accumulated Depreciation', '1.2.2', 'Asset'),
    -- Level 4: Control Accounts under Fixed Assets
    ('121100', 'Heavy Transport Fleet', '1.2.1.1', 'Asset'),
    ('121200', 'Warehouse & Silo Infrastructure', '1.2.1.2', 'Asset'),
    ('122100', 'Fleet Accumulated Depreciation', '1.2.2.1', 'Asset'),
    -- Level 5: Detailed Sub-Ledger Accounts under Fixed Assets
    ('121101', 'Prime Mover Trucks', '1.2.1.1.1', 'Asset'),
    ('121102', 'Heavy Cargo Trailers', '1.2.1.1.2', 'Asset'),
    ('121201', 'Grain Silos & Storage Facilities', '1.2.1.2.1', 'Asset'),
    ('122101', 'Acc Depr - Prime Movers', '1.2.2.1.1', 'Asset'),

    -- =========================================================================
    -- 2. LIABILITIES (الالتزامات)
    -- =========================================================================
    ('200000', 'Liabilities', '2', 'Liability'),
    -- Level 2: Current & Non-Current Liabilities
    ('210000', 'Current Liabilities', '2.1', 'Liability'),
    ('220000', 'Non-Current Liabilities', '2.2', 'Liability'),
    -- Level 3: Sub-Categories under Current Liabilities
    ('211000', 'Trade Accounts Payable', '2.1.1', 'Liability'),
    ('212000', 'Accrued Payroll & Clearing', '2.1.2', 'Liability'),
    ('213000', 'Statutory & Tax Obligations', '2.1.3', 'Liability'),
    -- Level 4: Control Accounts under Current Liabilities
    ('211100', 'Domestic Trade Creditors', '2.1.1.1', 'Liability'),
    ('211200', 'Foreign Equipment Vendors', '2.1.1.2', 'Liability'),
    ('212100', 'Accrued Driver Wages', '2.1.2.1', 'Liability'),
    ('212200', 'End of Service Benefit Current', '2.1.2.2', 'Liability'),
    ('213100', 'Value Added Tax (ZATCA)', '2.1.3.1', 'Liability'),
    ('213200', 'Corporate Zakat Accrual', '2.1.3.2', 'Liability'),
    -- Level 5: Detailed Sub-Ledger Accounts under Current Liabilities
    ('211101', 'Fuel & Energy Suppliers Payable', '2.1.1.1.1', 'Liability'),
    ('211102', 'Fleet Maintenance Contractors', '2.1.1.1.2', 'Liability'),
    ('211201', 'Overseas Spare Parts Vendors', '2.1.1.2.1', 'Liability'),
    ('212101', 'Driver Overtime & Per Diem Accrual', '2.1.2.1.1', 'Liability'),
    ('212102', 'Accrued Operations Payroll Clearing', '2.1.2.1.2', 'Liability'),
    ('212201', 'Current Portion EOSB Provision', '2.1.2.2.1', 'Liability'),
    ('213101', 'Output VAT 15% Collected', '2.1.3.1.1', 'Liability'),
    ('213102', 'VAT Withholding Payable', '2.1.3.1.2', 'Liability'),
    ('213201', 'Annual Zakat Obligation Payable', '2.1.3.2.1', 'Liability'),
    -- Level 3: Non-Current Liabilities
    ('221000', 'Long-Term Borrowings & Financing', '2.2.1', 'Liability'),
    -- Level 4: Control Accounts under Non-Current Liabilities
    ('221100', 'Murabaha Fleet Facilities', '2.2.1.1', 'Liability'),
    -- Level 5: Detailed Sub-Ledger Accounts under Non-Current Liabilities
    ('221101', 'Commercial Vehicle Murabaha 5-Yr', '2.2.1.1.1', 'Liability'),

    -- =========================================================================
    -- 3. EQUITY (حقوق الملكية)
    -- =========================================================================
    ('300000', 'Equity', '3', 'Equity'),
    -- Level 2: Capital & Reserves
    ('310000', 'Share Capital', '3.1', 'Equity'),
    ('320000', 'Reserves & Retained Earnings', '3.2', 'Equity'),
    -- Level 3: Sub-Categories under Equity
    ('311000', 'Paid-In Capital', '3.1.1', 'Equity'),
    ('321000', 'Retained Earnings', '3.2.1', 'Equity'),
    ('322000', 'Statutory Reserves', '3.2.2', 'Equity'),
    -- Level 4: Control Accounts under Equity
    ('311100', 'Ordinary Share Capital', '3.1.1.1', 'Equity'),
    ('321100', 'Prior Years Retained Earnings', '3.2.1.1', 'Equity'),
    ('322100', 'Legal Statutory Reserve', '3.2.2.1', 'Equity'),
    -- Level 5: Detailed Sub-Ledger Accounts under Equity
    ('311101', 'Founder Equity Units (Class A)', '3.1.1.1.1', 'Equity'),
    ('311102', 'Strategic Investor Shares (Class B)', '3.1.1.1.2', 'Equity'),
    ('321101', 'Unappropriated Retained Earnings', '3.2.1.1.1', 'Equity'),
    ('321102', 'Current Year Net Surplus Clearing', '3.2.1.1.2', 'Equity'),
    ('322101', 'Mandatory 10% Legal Reserve', '3.2.2.1.1', 'Equity'),

    -- =========================================================================
    -- 4. REVENUE (الإيرادات)
    -- =========================================================================
    ('400000', 'Revenue', '4', 'Revenue'),
    -- Level 2: Operating & Non-Operating Revenues
    ('410000', 'Operating Revenue', '4.1', 'Revenue'),
    ('420000', 'Other Operating & Financial Gains', '4.2', 'Revenue'),
    -- Level 3: Sub-Categories under Revenue
    ('411000', 'Logistics & Freight Sales', '4.1.1', 'Revenue'),
    ('412000', 'Agricultural & Bulk Trading', '4.1.2', 'Revenue'),
    ('421000', 'Ancillary Gains & Returns', '4.2.1', 'Revenue'),
    -- Level 4: Control Accounts under Revenue
    ('411100', 'Heavy Haulage Freight', '4.1.1.1', 'Revenue'),
    ('411200', 'Cold Chain Logistics', '4.1.1.2', 'Revenue'),
    ('412100', 'Commodity Crop Sales', '4.1.2.1', 'Revenue'),
    ('421100', 'Foreign Exchange & Treasury Gains', '4.2.1.1', 'Revenue'),
    -- Level 5: Detailed Sub-Ledger Accounts under Revenue
    ('411101', 'Long-Haul Bulk Cargo Freight', '4.1.1.1.1', 'Revenue'),
    ('411102', 'Inter-Facility Shuttle Freight', '4.1.1.1.2', 'Revenue'),
    ('411201', 'Refrigerated Harvest Delivery', '4.1.1.2.1', 'Revenue'),
    ('412101', 'Grain & Wheat Bulk Distribution', '4.1.2.1.1', 'Revenue'),
    ('412102', 'Wholesale Farm Produce Revenue', '4.1.2.1.2', 'Revenue'),
    ('421101', 'Realized FX Translation Gain', '4.2.1.1.1', 'Revenue'),

    -- =========================================================================
    -- 5. EXPENSES (المصروفات)
    -- =========================================================================
    ('500000', 'Expenses', '5', 'Expense'),
    -- Level 2: Direct Operating Costs & G&A
    ('510000', 'Direct Operating Costs (COGS)', '5.1', 'Expense'),
    ('520000', 'General & Administrative Expenses', '5.2', 'Expense'),
    -- Level 3: Sub-Categories under Expenses
    ('511000', 'Direct Fleet Running Costs', '5.1.1', 'Expense'),
    ('512000', 'Driver Operations & Labor', '5.1.2', 'Expense'),
    ('521000', 'Executive & Administrative Payroll', '5.2.1', 'Expense'),
    ('522000', 'Cloud Infrastructure & Telemetry', '5.2.2', 'Expense'),
    -- Level 4: Control Accounts under Expenses
    ('511100', 'Fuel & Lubricant Expenses', '5.1.1.1', 'Expense'),
    ('511200', 'Tires & Consumable Spares', '5.1.1.2', 'Expense'),
    ('512100', 'Variable Driver Compensation', '5.1.2.1', 'Expense'),
    ('521100', 'HQ Management Salaries', '5.2.1.1', 'Expense'),
    ('522100', 'Cloud Hosting & IoT Connectivity', '5.2.2.1', 'Expense'),
    -- Level 5: Detailed Sub-Ledger Accounts under Expenses
    ('511101', 'Diesel Fuel Bulk Consumption', '5.1.1.1.1', 'Expense'),
    ('511102', 'Engine Oil & Hydraulic Fluids', '5.1.1.1.2', 'Expense'),
    ('511201', 'Heavy Drive Tires Replacement', '5.1.1.2.1', 'Expense'),
    ('511202', 'Brake Pad & Drum Wear Spares', '5.1.1.2.2', 'Expense'),
    ('512101', 'Per-KM Driver Trip Allowances', '5.1.2.1.1', 'Expense'),
    ('512102', 'Overnight Lodging & Daily Subsistence', '5.1.2.1.2', 'Expense'),
    ('521101', 'Executive Base Salaries', '5.2.1.1.1', 'Expense'),
    ('521102', 'GOSI Social Insurance Employer Share', '5.2.1.1.2', 'Expense'),
    ('522101', 'Vultr Cloud Compute Infrastructure', '5.2.2.1.1', 'Expense'),
    ('522102', 'Fleet GPS & IoT Cellular Packages', '5.2.2.1.2', 'Expense')
ON CONFLICT (account_code) DO UPDATE 
SET account_name = EXCLUDED.account_name,
    node_path = EXCLUDED.node_path,
    account_type = EXCLUDED.account_type;

-- 8. Mirror identical hierarchical data into Tenant Schema (tenant_company_alpha)
INSERT INTO tenant_company_alpha.chart_of_accounts (account_code, account_name, node_path, account_type)
SELECT account_code, account_name, node_path, account_type 
FROM public.chart_of_accounts
ON CONFLICT (account_code) DO UPDATE 
SET account_name = EXCLUDED.account_name,
    node_path = EXCLUDED.node_path,
    account_type = EXCLUDED.account_type;
