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
- ~~`tenant_control.py` is unauthenticated and trust-on-header.~~ **Resolved, see Addendum B.**
- `get_authenticated_user` auto-provisions accounts for unknown token subjects. See Addendum B, Follow-ups.

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

### New critical finding (fixed in Addendum B)

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

---

## Addendum B — Tenant control panel lock-down (2026-10-04, backend image `oxen-gl_backend:tenantctl2`)

### Finding (confirmed)

`backend/app/api/v1/tenant_control.py` (mounted at `/api/tenant/control`, `/api/v1/tenant/control`, `/tenant/control`, `/api/v1/tenant`, `/api/tenant`) had **no authentication on any route**. Every route got its tenant from `resolve_control_tenant_id`, which trusted, in order: JWT claims if present, request state, then `X-Tenant-ID` / `X-Company-ID` / `?tenant_id=` / `X-Tenant-Slug`, the Host header, **the first company in the table**, and finally a hard-coded UUID.

So an anonymous caller could act on **any** tenant by passing its id or slug:

| Route | Impact |
|---|---|
| `GET /team`, `/settings`, `/domains`, `/database/config` | Read any tenant's users, company settings, domains, DB hosting config |
| `POST /team/invite` | Create users in any tenant, **including `Super_Admin`-role users** (the role map accepted `super_admin`) |
| `DELETE /team/{id}` | Delete any tenant's users |
| `POST /settings` | Overwrite company name, CR number, VAT number, currency |
| `POST/DELETE /domains`, `POST /domains/{id}/verify` | Hijack or remove a tenant's custom domain |
| `POST /database/test-connection`, `/database/migrate`, `/database/switch-back` | Copy a tenant's data to an attacker-supplied PostgreSQL server, or revert its DB hosting |

### Fix

**Router-level authentication.** `router = APIRouter(..., dependencies=[Depends(get_authenticated_user)])`. Every route needs a session cookie or Bearer token (**401** otherwise). Routes added later are protected by default.

**Public routes split out.** Zero-slug domain resolution (`GET /domains/resolve`, `GET /resolve-domain`) moved to a separate `public_router`. It reads only the Host / `?host=` and returns branding metadata. `main.py` mounts `public_router` and `router` at the same five prefixes.

**Caller-derived tenant.**
- `_caller_tenant_id(current_user)` returns the authenticated user's own `company_id`, or **403** if the user has none. It is the only tenant source.
- The `?tenant_id=` / `X-Tenant-ID` / `X-Tenant-Slug` / `X-Company-ID` parameters were removed from all 15 endpoint signatures.
- `resolve_control_tenant_id` was replaced by a stub that raises. The header, first-company and hard-coded fallbacks are gone.

**Explicit cross-tenant targeting is refused.** A router-level guard, `enforce_caller_tenant_scope`, returns **403** if any tenant hint in the request names a tenant other than the caller's own.
- The hint may be a different UUID, or a slug belonging to another company / master tenant.
- Hints that match the caller's own company id, slug, `domain_slug` or master-tenant slug are accepted, because the frontend sends them.
- This applies to platform super admins too: they use the master-platform API for other tenants.

**Admin / Owner role on sensitive routes.** `require_tenant_admin` (role `Admin` or `Owner`, or platform Super_Admin acting on its own tenant) is required on:
- invite and remove member;
- `POST /settings`;
- add / remove / verify domain, and `ssl-status`;
- **all** `/database/*` routes (config, test-connection, migrate, migration-status, switch-back).

`GET /team`, `/settings` and `/domains` remain readable by any authenticated member of the tenant.

**Guard rails.**
- Only a platform Super_Admin may invite a `Super_Admin` (**403** otherwise).
- An admin cannot remove their own account (**400**).
- Tenant admins cannot remove a platform super admin (**403**).

### Verification (production)

**`verify_tenant_control.py`: 121/121 passed**

| Check | Result |
|---|---|
| Anonymous, every route (3 reads + 12 sensitive) × all 5 mounts, with Alwehda id/slug spoofed | **401** (75 probes) |
| Anonymous `/api/v1/tenant/resolve-domain`, `/api/tenant/control/domains/resolve` | 200, resolved |
| Myon admin `GET /team` | 200; every member is Myon's; no `@wac-ye.com` users |
| Myon admin with its **own** id / slug / `domain_slug` hints (frontend pattern) | 200 |
| Alwehda admin / super admin `GET /team` | only their own tenant's members |
| Myon admin → Alwehda via `X-Tenant-ID`, `?tenant_id=`, `X-Tenant-Slug`, `X-Company-ID` on team / settings / database config / settings write / domain add & delete / switch-back / invite / member delete | **403** |
| Alwehda admin → Myon, super admin → Myon | **403** |
| Myon admin deletes an Alwehda member by id (no hints) | **404**; member still exists, Alwehda company row unchanged |
| Temporary `Data_Entry` user in Myon: `GET /team`, `/settings`, `/domains` | 200 |
| Same user: all 12 sensitive routes | **403** |
| Admin self-removal (disposable probe admin) | **400**; account still exists |
| Admin invites with `role=super_admin` | **403**; no user created |

**Regression:** `verify_sec.py` 28/28, `verify_idor.py` 7/7 and `verify_tenant_billing.py` 23/23 still pass. Total 179/179.

**Rollback:** `oxengl_backend_prev` (image `:tenantctl`, which has auth and role checks but not the cross-tenant 403 guard) is stopped but kept. `:tenantbill` (the pre-patch image) still exists. Rolling back to `:tenantbill` **re-opens this vulnerability**.

### Operational incident during verification (resolved)

The first verification run **accidentally deleted the Myon admin account `muath.salaih@meayon.com`** at 02:56 UTC. It was restored at 02:58 UTC.

**Cause: a test-harness bug, not a flaw in the patch.**
- The harness minted tokens with `create_access_token()`, which puts the user's **UUID** in `sub`.
- `get_authenticated_user()` (`backend/app/main.py`) treats `sub` as an **email**. When it found no user with that "email", it **auto-provisioned a new account**: email = the UUID, with the role taken from the token.
- So the requests ran as a *shadow* user, not as muath. The "admin cannot remove self" check therefore saw two different ids, and the self-removal probe deleted the real account.
- The earlier verification runs (Addenda/§3) had silently created three such shadow accounts the same way. One was a `Super_Admin` with `is_superuser = true` in the platform company.

**Remediation.**
- **Account restored.** muath's row was restored from the pre-change snapshot `~/.oxengl/backups/pre_isolation_fix_20261004T005607Z_*.sql` with the same id, password hash, role and company. `is_superuser = false` was kept, as decided earlier today.
- **Collateral checked.** `pg_stat_user_tables` showed:
  - the only FK side effect was the `SET NULL` of `user_id` and `hitl_approved_by` on one Myon `ai_governance_logs` row. Both were re-linked;
  - no sessions, tokens, drivers or employees were affected (0 deletes).
- **Shadow accounts deleted.** All four shadow accounts (three from earlier runs, one from this run) were deleted. `superadmin@oxengl.com` is again the only `is_superuser` account. `res_users` is back to the 6 real users.
- **Harness fixed.**
  - Tokens now carry the real email as `sub` / `identity`.
  - Destructive guard tests target only disposable probe accounts.
  - Each run asserts that there are 0 UUID-email accounts and that the Myon admin still exists.
  - A fresh `res_users` snapshot is taken before verification (`pre_tenantctl_verify_*.sql`).

**Effect on users.** muath's active sessions were unaffected (0 `user_sessions` rows were removed). The account was restored to its 00:56 UTC state; any profile or password change made between 00:56 and 02:56 UTC would need to be redone. None is known.

### Follow-ups

- **`get_authenticated_user` auto-provisioning (high).** Any validly signed token whose subject isn't a known email creates a new `res_users` row. The role comes from the token, and `Super_Admin` / `is_superuser` comes from token claims. Exploiting it needs a server-signed token, but it should be removed: unknown subjects should get **401**.
- Two decorative `Crown` icons remain outside the Super Admin console: `Navbar.tsx` (header badge) and `MasterLoginForm.tsx` (master login header).
