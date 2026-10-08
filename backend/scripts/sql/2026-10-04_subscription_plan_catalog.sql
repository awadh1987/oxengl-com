-- 2026-10-04: subscription_plans becomes the single source of truth for pricing.
-- Adds catalog presentation columns used by the landing page, tenant billing and the
-- Super Admin pricing console. Idempotent; also applied by the backend's startup
-- schema check (backend/app/main.py). Values are back-filled once by
-- billing_service.seed_default_subscription_plans() and then owned by the Super Admin.
BEGIN;

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_features JSON NOT NULL DEFAULT '[]'::json;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

COMMIT;
