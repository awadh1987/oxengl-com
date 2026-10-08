-- =============================================================================
-- 2026-10-04 — Tenant isolation fix: revoke tenant-level superuser flags and
-- detach the platform owner account from the Myon customer workspace.
--
-- Context: `res_users.is_superuser = true` is treated by the backend as a
-- platform super admin (organization.py / users.py / core/auth.py). Two tenant
-- admins carried the flag, which made every tenant's company codes and users
-- visible across workspaces (Myon <-> Alwehda). The platform owner account
-- (superadmin@oxengl.com) was also bound to Myon's company_id.
--
-- Why a system company instead of company_id = NULL: the schema allows NULL,
-- but backend/app/dependencies.py:get_active_company_id() auto-reassigns a NULL
-- company_id to the request host's tenant (or the oldest company — Myon) and
-- commits it on the next API call, so NULL would silently revert.
--
-- Idempotent and guarded: aborts (ROLLBACK) if the data is not in an expected
-- state. Run with:
--   podman exec -i oxengl_postgres_container \
--     psql -U postgres -d erp_db -v ON_ERROR_STOP=1 < this_file.sql
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- 1. Revoke superuser from tenant admins: only the platform owner keeps it.
UPDATE res_users
   SET is_superuser = false, updated_at = now()
 WHERE is_superuser
   AND lower(email) <> 'superadmin@oxengl.com';

-- 2. Internal platform company (never a customer tenant: no master_tenants row,
--    no domain_slug / custom_domain, so no subdomain resolves to it). Required
--    NOT NULL settings are copied from the oldest existing company so any
--    app-level CHECK/enum expectations are satisfied.
INSERT INTO res_companies (
    id, name, slug, currency, subscription_tier, max_cost_centers,
    theme_mode, ui_primary_color, parent_id, domain_slug, custom_domain,
    is_active, status, created_at, updated_at
)
SELECT gen_random_uuid(), 'OxenGL System Platform', 'oxengl-platform',
       src.currency, src.subscription_tier, src.max_cost_centers,
       src.theme_mode, src.ui_primary_color, NULL, NULL, NULL,
       true, 'ACTIVE', now(), now()
  FROM (SELECT * FROM res_companies WHERE slug <> 'oxengl-platform'
        ORDER BY created_at ASC LIMIT 1) src
 WHERE NOT EXISTS (SELECT 1 FROM res_companies WHERE slug = 'oxengl-platform');

-- 3. Re-home the platform owner onto the system company.
UPDATE res_users u
   SET company_id = c.id, updated_at = now()
  FROM res_companies c
 WHERE c.slug = 'oxengl-platform'
   AND lower(u.email) = 'superadmin@oxengl.com'
   AND u.company_id IS DISTINCT FROM c.id;

-- 4. Post-conditions — any failure aborts the whole transaction.
DO $$
DECLARE
    n_super int;
    owner_ok boolean;
BEGIN
    SELECT count(*) INTO n_super FROM res_users WHERE is_superuser;
    SELECT EXISTS (
        SELECT 1 FROM res_users u JOIN res_companies c ON c.id = u.company_id
         WHERE lower(u.email) = 'superadmin@oxengl.com'
           AND u.is_superuser AND c.slug = 'oxengl-platform'
    ) INTO owner_ok;

    IF n_super <> 1 OR NOT owner_ok THEN
        RAISE EXCEPTION 'post-condition failed: superusers=%, owner_on_platform_company=%', n_super, owner_ok;
    END IF;
END $$;

SELECT u.email, u.role, u.is_superuser, c.name AS company
  FROM res_users u LEFT JOIN res_companies c ON c.id = u.company_id
 ORDER BY c.name, u.email;

COMMIT;
