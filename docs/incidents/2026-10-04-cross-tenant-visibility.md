# 2026-10-04 — Cross-tenant visibility (Myon ⇄ Alwehda)

## Symptom
Admins of the Myon tenant (`myon.oxengl.me`) could see Alwehda's `@wac-ye.com`
users in the user matrix and Alwehda's company code in organization settings.

## Root cause
Not a data-assignment problem. Alwehda (`wac-ye`, company `4c9dbe63…`) is a
correctly provisioned, separate tenant: its `res_companies` row has
`parent_id = NULL` and all of its users carry Alwehda's own `company_id`. They
were created by the normal onboarding flow on 2026-10-03 03:22 UTC (no faulty
migration, no manual seed).

The leak came from **privilege flags**: `res_users.is_superuser = true` is
treated by the backend as *platform* super admin
(`core/auth.py:is_super_admin_authorized`, `dependencies.py:get_tenant_context`).
Super admins are served every root company code
(`api/routers/organization.py`) and every company's users (`api/v1/users.py`).
Two tenant admins had the flag:

| Account | Tenant | Before | After |
|---|---|---|---|
| `muath.salaih@meayon.com` | Myon | `is_superuser = true` | `false` (role `Admin` kept) |
| `ahmed.awadh@wac-ye.com` | Alwehda | `is_superuser = true` | `false` (role `Admin` kept) |

The leak was bidirectional: Alwehda's admin could equally see Myon.

The platform owner account `superadmin@oxengl.com` was also bound to Myon's
`company_id`.

## Fix applied (production DB, 2026-10-04 ~00:56 UTC)
Script: [`backend/scripts/sql/2026-10-04_tenant_isolation_superuser_fix.sql`](../../backend/scripts/sql/2026-10-04_tenant_isolation_superuser_fix.sql)
(guarded, idempotent, single transaction).

1. `is_superuser = false` for every `res_users` row except `superadmin@oxengl.com`.
2. Created an internal company **OxenGL System Platform** (`slug = oxengl-platform`,
   no `domain_slug`/`custom_domain`, no `master_tenants` row, so it is not a
   customer tenant and no subdomain resolves to it).
3. Moved `superadmin@oxengl.com` onto that company.

**Why not `company_id = NULL`?** The column allows NULL, but
`dependencies.py:get_active_company_id()` auto-reassigns a NULL `company_id` to
the request host's tenant (or the oldest company, i.e. Myon) and commits it on
the next API call. NULL would silently revert.

A pre-change data backup of `res_users`, `res_companies` and `organizations` was
taken on the host (outside the repo).

## Verification (live API, minted short-lived tokens)
| Caller | `/api/v1/organization/companies` | `/api/v1/users` |
|---|---|---|
| Myon admin | Myon only | 2 Myon users |
| Alwehda admin | Alwehda only | 3 Alwehda users |
| `superadmin@oxengl.com` | all 3 (by design) | all 6 (by design) |

The superadmin's `company_id` stayed on `oxengl-platform` after authenticated
requests (no auto-reassignment).

## Follow-ups
- Tenant-scoped accounts should never receive `is_superuser`; super-admin
  status should be limited to platform accounts in code, not only by data.
- `superadmin@oxengl.com` also exists in `master_users` (separate table, unchanged).
