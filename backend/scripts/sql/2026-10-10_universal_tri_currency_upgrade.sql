-- ==============================================================================
-- OxenGL Universal Tri-Currency Migration Script (USD, SAR, YER)
-- Target Database: erp_db
-- Description: Upgrades the currency architecture to universally support
--              USD (Base Ledger), SAR, and YER across registry, rates, and engines.
-- Idempotent: Can be run multiple times safely.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Global Currency Registry (oxengl_currencies)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oxengl_currencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_code VARCHAR(10) NOT NULL,
    currency_symbol VARCHAR(10) NOT NULL,
    currency_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_oxengl_currencies_code UNIQUE (currency_code)
);

CREATE INDEX IF NOT EXISTS idx_oxengl_currencies_active ON public.oxengl_currencies (is_active);

-- Seed / Upsert the Tri-Currency Master Data
INSERT INTO public.oxengl_currencies (currency_code, currency_symbol, currency_name, is_active, updated_at)
VALUES 
    ('USD', '$', 'US Dollar', TRUE, CURRENT_TIMESTAMP),
    ('SAR', 'SR', 'Saudi Riyal', TRUE, CURRENT_TIMESTAMP),
    ('YER', '﷼', 'Yemeni Rial', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (currency_code) DO UPDATE 
SET currency_symbol = EXCLUDED.currency_symbol,
    currency_name = EXCLUDED.currency_name,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

-- ------------------------------------------------------------------------------
-- 2. Universal Exchange Rates (oxengl_exchange_rates)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oxengl_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency VARCHAR(10) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    rate NUMERIC(18, 6) NOT NULL,
    effective_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_oxengl_exchange_rates_pair_date UNIQUE (from_currency, to_currency, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_oxengl_exchange_rates_lookup 
ON public.oxengl_exchange_rates (from_currency, to_currency, effective_date DESC);

-- Seed Universal Peg/Market Rates with Effective Date
INSERT INTO public.oxengl_exchange_rates (from_currency, to_currency, rate, effective_date, is_active)
VALUES
    ('USD', 'SAR', 3.750000, '2026-10-10 00:00:00+00', TRUE),
    ('SAR', 'USD', 0.266667, '2026-10-10 00:00:00+00', TRUE),
    ('USD', 'YER', 535.000000, '2026-10-10 00:00:00+00', TRUE),
    ('YER', 'USD', 0.001869, '2026-10-10 00:00:00+00', TRUE),
    ('SAR', 'YER', 142.666667, '2026-10-10 00:00:00+00', TRUE),
    ('YER', 'SAR', 0.007009, '2026-10-10 00:00:00+00', TRUE)
ON CONFLICT (from_currency, to_currency, effective_date) DO UPDATE 
SET rate = EXCLUDED.rate,
    is_active = EXCLUDED.is_active;

-- Synchronize legacy public.exchange_rates table for backward compatibility
CREATE TABLE IF NOT EXISTS public.exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency VARCHAR(10) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    rate NUMERIC(18, 6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_exchange_rates_pair UNIQUE (from_currency, to_currency)
);

INSERT INTO public.exchange_rates (from_currency, to_currency, rate)
VALUES
    ('USD', 'SAR', 3.750000),
    ('SAR', 'USD', 0.266667),
    ('USD', 'YER', 535.000000),
    ('YER', 'USD', 0.001869),
    ('SAR', 'YER', 142.666667),
    ('YER', 'SAR', 0.007009)
ON CONFLICT (from_currency, to_currency) DO UPDATE
SET rate = EXCLUDED.rate;

-- ------------------------------------------------------------------------------
-- 3. Engine Settings (oxengl_engine_settings)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oxengl_engine_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engine_name VARCHAR(64) NOT NULL,
    supported_currencies JSONB NOT NULL DEFAULT '["USD", "SAR", "YER"]'::jsonb,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_oxengl_engine_settings_name UNIQUE (engine_name)
);

-- Push Tri-Currency Configuration to Target Interconnected Modules
INSERT INTO public.oxengl_engine_settings (engine_name, supported_currencies, settings, updated_at)
VALUES
    ('core_financial', '["USD", "SAR", "YER"]'::jsonb, '{"base_currency": "USD", "auto_fx_revaluation": true}'::jsonb, CURRENT_TIMESTAMP),
    ('billing',        '["USD", "SAR", "YER"]'::jsonb, '{"base_currency": "USD", "allow_multi_currency_invoicing": true}'::jsonb, CURRENT_TIMESTAMP),
    ('inventory',      '["USD", "SAR", "YER"]'::jsonb, '{"base_currency": "USD", "valuation_currency": "USD"}'::jsonb, CURRENT_TIMESTAMP),
    ('payroll',        '["USD", "SAR", "YER"]'::jsonb, '{"base_currency": "SAR", "disbursement_currencies": ["SAR", "YER", "USD"]}'::jsonb, CURRENT_TIMESTAMP),
    ('reporting',      '["USD", "SAR", "YER"]'::jsonb, '{"presentation_currencies": ["USD", "SAR", "YER"]}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT (engine_name) DO UPDATE
SET supported_currencies = EXCLUDED.supported_currencies,
    settings = public.oxengl_engine_settings.settings || EXCLUDED.settings,
    updated_at = CURRENT_TIMESTAMP;

-- ------------------------------------------------------------------------------
-- 4. Role Permissions
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.oxengl_currencies TO oxengl_app, oxengl_platform;
GRANT SELECT ON public.oxengl_exchange_rates TO oxengl_app, oxengl_platform;
GRANT SELECT ON public.oxengl_engine_settings TO oxengl_app, oxengl_platform;
GRANT SELECT ON public.exchange_rates TO oxengl_app, oxengl_platform;

GRANT ALL PRIVILEGES ON public.oxengl_currencies TO oxengl_platform;
GRANT ALL PRIVILEGES ON public.oxengl_exchange_rates TO oxengl_platform;
GRANT ALL PRIVILEGES ON public.oxengl_engine_settings TO oxengl_platform;
GRANT ALL PRIVILEGES ON public.exchange_rates TO oxengl_platform;

COMMIT;
