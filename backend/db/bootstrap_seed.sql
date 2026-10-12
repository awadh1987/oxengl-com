-- Multi-Tenant Database Orchestrator Seeding Logic
INSERT INTO public.tenants (id, company_name, schema_name, is_active)
VALUES ('a3b6c2d1-e4f5-7a8b-9c0d-1e2f3a4b5c6d', 'Alpha Raw Materials Corp', 'tenant_company_alpha', true)
ON CONFLICT (schema_name) DO NOTHING;

INSERT INTO public.exchange_rates (id, from_currency, to_currency, rate)
VALUES (gen_random_uuid(), 'USD', 'SAR', 3.750000) ON CONFLICT DO NOTHING;

CREATE SCHEMA IF NOT EXISTS tenant_company_alpha;
SET search_path TO tenant_company_alpha, public;
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(50) NOT NULL UNIQUE,
    account_name VARCHAR(150) NOT NULL,
    node_path ltree NOT NULL,
    account_type VARCHAR(50) NOT NULL
);

INSERT INTO chart_of_accounts (account_code, account_name, node_path, account_type) VALUES
    ('100000', 'Current Assets', '1', 'Asset'),
    ('110000', 'Cash Equivalents', '1.1', 'Asset'),
    ('120000', 'Inventories Ledger', '1.2', 'Asset'),
    ('121000', 'Raw Materials Stockpiles', '1.2.1', 'Asset'),
    ('500000', 'Operating Expenses', '5', 'Expense'),
    ('510000', 'Workforce Compensation', '5.1', 'Expense'),
    ('511111', 'Base Wages - Operations', '5.1.1', 'Expense'),
    ('200000', 'Current Liabilities', '2', 'Liability'),
    ('211111', 'Accrued Payroll Clearing', '2.1.1', 'Liability'),
    ('212111', 'Statutory Social Withholding', '2.1.2', 'Liability')
ON CONFLICT DO NOTHING;
