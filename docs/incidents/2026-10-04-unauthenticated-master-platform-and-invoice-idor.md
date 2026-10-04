# 2026-10-04 — Unauthenticated master-platform API & tenant invoice IDOR

**Severity:** Critical (unauthenticated tenant deletion/provisioning; cross-tenant data access)
**Status:** Fixed and verified in production (backend image `oxen-gl_backend:secpatch`)
**Related:** [2026-10-04-hardcoded-master-key.md](2026-10-04-hardcoded-master-key.md), [billing unification](../architecture/2026-10-04-billing-unification.md)

---

## 1. Findings

### 1.1 `master_platform` routers had no authentication

`backend/app/api/v1/master_platform.py` defines two routers. Main mounts them at:

- `router`: `/api/master/platform` and `/api/v1/master/platform`
- `admin_router`: `/api/admin` and `/api/v1/admin`

**None of their routes declared an auth dependency.** Anyone on the internet could:

| Route | Impact |
|---|---|
| `GET /tenants` | List every tenant (name, slug, tier, user counts, custom domain) |
| `POST /tenants` | **Provision arbitrary tenants** (`res_companies` + `master_tenants` rows) |
| `DELETE /tenants/{id}` | **Purge a tenant's data.** The only guard was the phrase `CONFIRM-DELETE-<slug>`, and the slug is returned by `GET /tenants` |
| `GET /search?q=` | Search **all users across all tenants** (names, emails, roles) and audit logs |
| `GET/PATCH/POST /feature-flags*` | Read and **toggle platform-wide feature flags** |
| `GET /health` | Infrastructure details |

Discovered on 2026-10-04 during the billing-unification work: `GET /api/master/platform/tenants` returned 200 without a token. We found no evidence of abuse during this work. The tenant count is unchanged (3) and the Alwehda/Myon data is intact. Access logs were not audited in depth (see §5).

### 1.2 Tenant invoice IDOR

| Endpoint | Before |
|---|---|
| `GET /api/v1/tenant/billing/invoices/{invoice_id}` | `db.get(SaaSInvoice, invoice_id)` with **no tenant check and no authentication**. Anyone with an invoice UUID could read any tenant's invoice. |
| `GET /api/v1/tenant/billing/invoices` | No authentication. Tenant came from `resolve_control_tenant_id`, which, **when no token is present, trusts `X-Tenant-ID` / `?tenant_id=` and finally falls back to the first company in the table**. So any tenant's invoice history could be listed by passing its id. |

## 2. Fixes

### 2.1 Super_Admin enforced on every master-platform route

```python
router = APIRouter(tags=["Master Platform Control"], dependencies=[Depends(require_super_admin)])
admin_router = APIRouter(tags=["Admin Control"], dependencies=[Depends(require_super_admin)])
```

The guard sits at router level, so any endpoint added to these routers later is protected by default.

- `require_super_admin` authenticates the caller via the session cookie or a Bearer token: no token → **401**.
- It then requires platform Super_Admin authority: tenant admins → **403**.
- Denials are audited as `SUPER_ADMIN_DENIED`.
- `X-Master-Admin-Key` is only honoured when `MASTER_PLATFORM_KEY` is configured. There is no hard-coded fallback (see the master-key incident).

The Master Control Panel (`frontend/src/components/platform/MasterControlPanel.tsx`) used bare `fetch()` for these endpoints. It now uses a `masterFetch` helper that sends `credentials: 'include'` and the session Bearer token.

### 2.2 Invoices scoped to the requesting user's tenant

- **`billing_service.py`** has two new helpers. Each filters by tenant **inside the SQL query**:
  - `list_tenant_invoices_scoped(db, tenant_id=…)`
  - `get_tenant_invoice(db, tenant_id=…, invoice_id=…)`
- **`billing.py`**: both invoice endpoints now:
  - require an authenticated user (`get_authenticated_user`);
  - derive the tenant **only from the user's own `company_id`**. Client-supplied `X-Tenant-ID`, `X-Tenant-Slug` and `?tenant_id=` are ignored for tenant users;
  - let a platform Super_Admin target another tenant with `?tenant_id=<uuid>`;
  - return **404** for another tenant's invoice, the same as a non-existent one, so they don't reveal whether it exists.

## 3. Verification (production, 2026-10-04)

Tokens were minted in-process inside the backend container and never printed. The scripts are kept in the agent scratch area: `verify_sec.py` and `verify_idor.py`.

**Master platform: 28/28 checks passed**

| Caller | Routes probed | Result |
|---|---|---|
| Anonymous | All 11 routes and mounts, including `POST` / `DELETE /tenants` and `PATCH` feature-flags | **401** |
| Anonymous + wrong `X-Master-Admin-Key` | `GET /tenants` | **401** |
| Myon tenant admin | tenants, provision, delete, search, feature flags | **403** |
| `superadmin@oxengl.com` | tenants (3 visible), health, feature flags, search | **200** |
| — | Tenant count before and after the probes | unchanged (3) |

**Invoice IDOR: 7/7 checks passed (end-to-end)**

Production had no invoices yet. A clearly labelled zero-amount `cancelled` probe invoice was committed for Alwehda and **deleted immediately afterwards**; 0 probe rows remain.

| Check | Result |
|---|---|
| Myon admin → Alwehda invoice by id | **404** |
| Same, while spoofing `X-Tenant-ID`, `X-Tenant-Slug` and `?tenant_id=` | **404** |
| Myon invoice list (spoofed) | Alwehda invoice not present |
| Alwehda admin → own invoice, own list | 200, present |
| Super admin with explicit `?tenant_id` | 200 |
| Anonymous list / detail | **401** |

## 4. Rollback

The previous backend container `oxengl_backend_prev` (image `:pricing`) is stopped but kept. To restore it, swap container names. Rolling back would **re-open both vulnerabilities**.

## 5. Follow-ups (not yet done)

- ~~Tenant billing `/subscription`, `/checkout` and `/enterprise-quote` are unauthenticated and trust-on-header.~~ **Resolved, see Addendum A.**
- Run an access-log review of the master-platform routes for the period before this fix. Look for `POST`, `DELETE`, `PATCH` and `/search` requests from non-admin IPs.
- `backend/routers/master_platform.py` (legacy, not mounted) should be deleted so it can't be re-mounted by mistake.

---

## Addendum A — Tenant billing router lock-down (2026-10-04, backend image `oxen-gl_backend:tenantbill`)

### Finding

Three remaining tenant billing routes had **no authentication**. They got the tenant from `resolve_control_tenant_id`, which without a token trusts `X-Tenant-ID`, `X-Company-ID`, `X-Tenant-Slug` and `?tenant_id=`, and finally falls back to the first company in the table.

The routes, under `/api/v1/tenant/billing` (alias `/api/tenant/billing`):

| Route | Impact |
|---|---|
| `GET /subscription` | Anyone could read any tenant's plan, usage meters, entitlements and billing period |
| `POST /checkout` | Anyone could start a card checkout session bound to any tenant |
| `POST /enterprise-quote` | Anyone could **create pending Purchase-Order invoices** on any tenant's account |

### Fix

**Router-level authentication.** `tenant_billing_router` now uses `dependencies=[Depends(get_authenticated_user)]`, so every tenant billing route needs a session cookie or Bearer token. The anonymous pricing catalog stays on its own router, `pricing_router` (`/api/v1/pricing/plans`), and is unchanged.

**Caller-derived tenant.** The new `billing_service.resolve_billing_tenant(db, user)` maps the authenticated user's own `company_id` to its control-plane `MasterTenant`:
- The three routes no longer accept any tenant header or query parameter. The spoofable parameters were removed from their signatures.
- `resolve_control_tenant_id` is no longer imported by `billing.py`.
- Accounts with no billable tenant get **403**. This includes the platform super admin, who uses the `/api/v1/superadmin/billing/*` endpoints instead.

**Service hardening.**
- `create_stripe_checkout_session` and `create_enterprise_po_quote` now take `tenant_id` as a keyword-only argument.
- Both now call `require_master_tenant`. They can no longer create billing side effects for an unknown or fabricated tenant id. Previously checkout silently fell back to a generic customer email.

### Verification (production)

**`verify_tenant_billing.py`: 23/23 passed**

| Check | Result |
|---|---|
| Anonymous `/subscription`, `/checkout`, `/enterprise-quote`, `/plans`, `/invoices` on both mounts, with and without spoofed headers or query | **401** (12 probes) |
| Public `/api/v1/pricing/plans` | 200 |
| Myon admin `/subscription`, with Alwehda's `X-Tenant-ID`, `X-Tenant-Slug`, `?tenant_id=` and `Host: wac-ye.oxengl.me` | 200, **Myon's** tenant |
| Alwehda admin `/subscription`, spoofing Myon | 200, **Alwehda's** tenant |
| Myon `/checkout` while spoofing Alwehda | Session bound to **Myon** (simulated: no Stripe key is configured) |
| Myon `/enterprise-quote` while spoofing Alwehda | Invoice created on **Myon**; Alwehda's invoice count unchanged. The probe invoice was deleted (0 remain) |
| Super admin on the three routes | **403** |

**Regression:** `verify_sec.py` 28/28 and `verify_idor.py` 7/7 still pass.

**Rollback:** `oxengl_backend_prev` (image `:secpatch`) is stopped but kept. Rolling back re-opens this addendum's vulnerability only.

### New critical finding (not fixed in this patch)

`backend/app/api/v1/tenant_control.py` is mounted at `/api/tenant/control`, `/api/v1/tenant/control`, `/tenant/control`, `/api/v1/tenant` and `/api/tenant`. It has the **same pattern**: no authentication, and 15 call sites of `resolve_control_tenant_id`.

Anonymous read-only probes on 2026-10-04 returned **200** for:
- `GET /api/v1/tenant/control/team`
- `GET /api/v1/tenant/control/settings`
- `GET /api/v1/tenant/control/domains`
- `GET /api/v1/tenant/control/database/config`

Its write routes use the same resolver, so they are most likely also anonymously usable against any tenant. They were not probed:
- `POST /team/invite`
- `DELETE /team/{id}`
- `POST /settings`
- domain add, delete and verify
- `POST /database/migrate`, `POST /database/switch-back`

**Recommended fix (same approach as here):**
1. Add a router-level `Depends(get_authenticated_user)`.
2. Derive the tenant from the user.
3. Require a tenant Admin/Owner role on mutating routes.
4. Delete the header and query fallback and the "first company" fallback from `resolve_control_tenant_id`.

Keep `/domains/resolve` and `/resolve-domain` public if the edge or nginx needs them, but make sure they only return the minimum.
