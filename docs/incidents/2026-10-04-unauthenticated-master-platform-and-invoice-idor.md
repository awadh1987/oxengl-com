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
- ~~`get_authenticated_user` auto-provisions accounts for unknown token subjects. See Addendum B, Follow-ups.~~ **Fixed in Addendum C** (unknown subjects → 401; token claims no longer grant super admin).

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

- ~~**`get_authenticated_user` auto-provisioning (high).** Any validly signed token whose subject isn't a known email creates a new `res_users` row. The role comes from the token, and `Super_Admin` / `is_superuser` comes from token claims. Exploiting it needs a server-signed token, but it should be removed: unknown subjects should get **401**.~~ **Fixed in Addendum C.**
- Two decorative `Crown` icons remain outside the Super Admin console: `Navbar.tsx` (header badge) and `MasterLoginForm.tsx` (master login header).


---

## Addendum C — Silent account provisioning & token-claim super-admin elevation (2026-10-04, backend image `oxen-gl_backend:noclaims`)

### Findings

**C1. Silent auto-provisioning (high).** `get_authenticated_user()` in `backend/app/main.py` is the main auth dependency; `core/auth.py` delegates to it. If a validly signed token named a subject that was not in `res_users`, it did not reject the request. Instead it **created a new account**:
- the email came from the token subject;
- the role came from the token claims;
- `is_superuser` was set if the claims looked like a super admin;
- the account was bound to the company from the `X-Company-ID` header, or else to the first company in the database.

This is how the harness created shadow accounts in Addendum B.

There were related silent bindings:
- **Users with no company.** In both `get_authenticated_user` and `get_active_company_id`, a user with `company_id = NULL` was silently attached to the company from the token claim, the header, or the first company in the database.
- **Legacy dependencies.** The `get_current_user` functions in `backend/api/dependencies.py` and `backend/app/dependencies.py` copied `tenant_users` subjects into new `res_users` rows. If that failed, they built an in-memory "envelope" user from the token claims.

Exploiting these needs a server-signed token, since the JWT secrets are required env values with no fallback. But any token-minting bug or leaked secret would turn directly into account creation.

**C2. Token claims made every tenant admin a platform super admin (critical, found while verifying C1).**
- `issue_two_tier_jwt()` (`backend/two_tier_auth.py`) set the claim `is_superuser = true` for **every tenant user with role admin, owner or super_admin**. This token comes from the normal tenant login, `/api/auth/tenant/login`.
- `get_authenticated_user()` treated that claim as authority: it set `is_superuser = True` on the user object for the request. It did the same for any token with `tier == "master"`, a role containing "super", or a `super_admin` scope.
- `is_super_admin_authorized()` (`backend/app/core/auth.py`) also accepted token claims as proof: `role`, `tier == "master"`, and `scopes`.

**Impact:** any tenant Admin or Owner who logged in through the normal tenant login passed `require_super_admin`. This was confirmed on production before the fix: the **Myon admin's real tenant-login token received `200` from `GET /api/master/platform/tenants`**. That means they had master-platform API access: list, provision, suspend and delete tenants, feature flags, and the pricing editor.

The §3 and Addendum A/B verifications did not catch this. They used `create_access_token()` session tokens, which have no `is_superuser` claim, and those correctly got 403.

The exposure window is every tenant-admin login since two-tier login shipped. `platform_audit_logs` records only denials and some mutations, not successful reads. It shows **no successful master-platform mutation by any tenant-admin email**. The only `PRICING_PLAN_UPDATED` rows are from `superadmin@oxengl.com` and from a test shadow account during the 01:53 UTC harness run. Successful elevated reads would not appear in the audit log at all.

### Fix

| File | Change |
|---|---|
| `backend/app/main.py` — `get_authenticated_user` | Unknown or inactive subject → **401** `Session subject is not a registered active user`. The auto-create block is removed. Super-admin status comes **only from the database row** (`is_superuser`, or DB role `Super_Admin`); token claims are ignored. A company claim can no longer bind a user to a company: if the user has no company, or the claim names a different one, the result is **403**. |
| `backend/app/main.py` — `get_active_company_id` | A non-super user with no company → **403** `Authenticated user is not bound to a tenant workspace`. A super admin with no `X-Company-ID` → **400** (no longer falls back to the first company). |
| `backend/api/dependencies.py`, `backend/app/dependencies.py` — `get_current_user` | The `tenant_users`→`res_users` copy and the in-memory envelope user are removed. A `tenant_users` subject is mapped **read-only** to an existing `res_users` row by email. Otherwise → **401** `Authenticated subject is not a registered user.` |
| `backend/app/core/auth.py` — `is_super_admin_authorized` | The token-claim checks (role / tier / scopes) are removed. The dev-mode branch no longer looks at token `sub`/`tier`. Authority comes only from the DB record (`is_superuser`, role, ACL / role_ids) or the configured `MASTER_PLATFORM_KEY`. |
| `backend/two_tier_auth.py` — `issue_two_tier_jwt` | `is_superuser` claim = `tier == "master"` only. The backend no longer trusts this claim anyway. |

Explicit provisioning flows are unchanged: registration, invites, admin user creation, and configured SSO JIT.

### Verification (production)

`verify_noprovision.py` passed **57/57**:

| Check | Result |
|---|---|
| 6 validly signed forged tokens for **non-existent** subjects. Types: session (Admin / Super_Admin), two-tier master, two-tier tenant, access token with random UUID `sub`, access token with unknown email. Each sent to 6 protected endpoints, covering every auth dependency (tenant control, tenant billing, master platform, customs, `/api/v1/users`, organization) | **401** (36/36) |
| `res_users` after the forged requests | count unchanged (6); no row for the forged email or UUID; 0 new ids; 0 UUID-email rows |
| Myon admin: session token, real two-tier tenant token, and legacy access token on team / billing / customs / users | 200, own tenant only |
| Myon and Alwehda admins' **real tenant-login tokens** → `/api/master/platform/tenants` | **403** (was 200) |
| Myon identity with forged `tier=master` / `role=Super_Admin` claims; Myon token re-signed with `is_superuser=true` and `scopes=[Super_Admin]` | **403** |
| New tenant-admin tokens | `is_superuser = false` |
| `superadmin@oxengl.com` (DB `is_superuser`) → master platform | 200 |
| DB invariants | `superadmin@oxengl.com` is the only `is_superuser` account; still 6 real users |

**Regression:** `verify_tenant_control.py` 121/121, `verify_sec.py` 28/28, `verify_idor.py` 7/7, `verify_tenant_billing.py` 23/23. **Total 236/236.**

Pre-deploy snapshot: `~/.oxengl/backups/pre_noprovision_*_res_users.sql`. No real user or tenant data was changed by this verification.

**Effect on users:**
- Existing sessions keep working; no forced logout is needed.
- Tenant-admin tokens issued before the fix still carry `is_superuser: true`, but the claim now grants nothing.
- Tenant admins keep full tenant-level admin rights; tenant control 121/121 still passes.

**Rollback:** `oxengl_backend_prev` (image `:noprovision`, which has the C1 fixes but **not** C2) is stopped but kept. `:tenantctl2` is the image from before Addendum C. Rolling back to `:tenantctl2` **re-opens both C1 and C2**.

### Follow-ups

- **Review access logs (recommended).** Check nginx access logs for `/api/master/platform/*` and `/api/master/*` requests from non-platform sessions since two-tier login shipped. The application audit log cannot attribute successful reads.
- **SSO callback reassigns existing users (high).** The SSO JIT callback (`main.py`, SSO callback) moves an *existing* user to the SSO-configured company and overrides their role. A tenant that can configure SSO for an email domain could take over accounts from another tenant. Not changed here.
- **Legacy dependencies trust the token role (medium).** `backend/api/dependencies.get_current_user` ("Honor token's normalized role") overrides the DB role with the token's role on the in-request user object. Authority should come from the DB only, as it now does in `main.get_authenticated_user`.
- **Test bypass still present (low).** `PYTEST_CURRENT_TEST` in `backend/api/dependencies.py` is a test-only bypass. It should be removed or guarded so it can never be active in production images.


---

## Addendum D — Password-recovery credential leak & unauthenticated 2FA setup (2026-10-04, backend image `oxen-gl_backend:recoveryfix3`)

Found while preparing the password-reset roadmap (`docs/architecture/password-reset-and-backup-strategy.md`). The existing recovery endpoints were checked by reading the code before any scaffolding was written. The live exploit was **not** run against real accounts.

### Findings

**D1. Recovery endpoint returned the reset credentials to the caller (critical).**

Affected endpoint: `POST /forgot-password` in `backend/app/api/v1/auth.py`, mounted at `/`, `/api` and `/api/v1`, with aliases `/auth/forgot-password` and `/password-reset-init`. It needs no authentication.

What happened:
- Anyone could send any email address, including `superadmin@oxengl.com` (slug `master` resolves to `res_users`).
- The JSON response contained the **6-digit `otp_code`, the legacy reset `token` and the `recovery_link`**.
- Either the OTP or the token could then be sent to `/reset-password` to set a new password.

Result: unauthenticated takeover of **any** account, including the platform super admin.

Related problems in the same flow:
- **Secrets in logs.** OTPs, tokens and links were printed to stdout and logged. `VerificationService.dispatch_email_otp` / `dispatch_sms_otp` are stubs that *only* logged the OTP.
- **No real delivery.** No SMTP, SendGrid or SMS provider is configured, so the API response was the only place a user ever received the code.
- **Account enumeration.** Unknown accounts got `404 User identity … not found`. Unknown workspaces got an unhandled **500**, caused by a probe of the non-existent `public.users` table.
- **Shared OTP key.** The recovery OTP was stored under the bare `otp:{email}` key. That is the same key tenant registration uses, so the two flows could redeem each other's codes.
- **Weak OTPs, no attempt limit.** OTPs came from `random.randint`, which is not a cryptographically secure generator. There was no limit on wrong guesses, so the 6-digit code could be brute-forced within its 5-minute lifetime.

**D2. Two-tier recovery could skip the OTP (critical).**
- `POST /api/auth/recover-password` (`two_tier_auth.py`) returns a `reset_token` to the caller. It is meant only as a flow handle: the two-tier `/api/auth/reset-password` also requires the OTP, with 3 attempts.
- However, `auth.py` `/reset-password` accepted rows from **`public.tenant_password_resets` by token alone**. A tenant user's handle could therefore be redeemed **without the OTP**.
- The endpoint also logged `Code: <otp> | Token: <token>`.
- Its responses differed for existing and unknown accounts.

**D3. Unauthenticated 2FA setup (high).**
- `POST /2fa/setup` (`auth.py`, same mounts) needed no authentication. Given just an email, it **overwrote that user's TOTP secret, set `tfa_enabled = FALSE`, and returned the new secret and provisioning URI**.
- The email path of `/2fa/verify` (setup completion) then let the same caller enable 2FA with *their* secret, locking the real owner out.
- The secret was also logged.
- The frontend does not use `/2fa/setup`.

### Fix

| File | Change |
|---|---|
| `backend/app/api/v1/auth.py` — `request_password_reset` | Returns the **same** body (`status`, generic `message`, `expires_in_seconds`) for every case: existing account, unknown account, unknown workspace. It never contains the OTP, token or link. The 404s and the 500 are replaced by this response. The OTP is issued only under `reset:{email}`. Secret `print`/`logger` output is removed. |
| `backend/app/api/v1/auth.py` — `confirm_password_reset` | Accepts only the `reset:`-namespaced OTP. `tenant_password_resets` tokens are no longer accepted alone; they must go through `/api/auth/reset-password` with the OTP. |
| `backend/app/api/v1/auth.py` — 2FA | `/2fa/setup` requires an authenticated session and targets only the caller's own account (another email → 403). The email path of `/2fa/verify` requires an authenticated session for the same email. The login-handshake path (`two_factor_token`) is unchanged. The secret/URI is no longer logged. |
| `backend/two_tier_auth.py` — `recover_password` | One uniform acknowledgement for every case. Unknown accounts get a random, unredeemable handle, so the responses cannot be told apart. The OTP/token is no longer logged. |
| `backend/app/services/notification_service.py` | OTPs come from `secrets` (cryptographically secure). An OTP is **destroyed after 5 wrong guesses**, and comparison is constant-time. The dispatch stubs no longer log the OTP; they warn that no provider is configured. |

**Effect on users:** self-service password reset is unavailable until an email/SMS provider is configured (Phase A of the roadmap). This was decided with the platform owner. The response is still a normal 200 acknowledgement, but no code arrives. Super Admin password rotation is unaffected.

### Verification (production)

`verify_recovery.py` passed **51/51**:

| Check | Result |
|---|---|
| `forgot-password` on 4 aliases × (existing probe account / unknown account / unknown workspace) | **200**; no `otp_code` / `token` / `recovery_link`; body byte-identical in all three cases |
| Registration-namespace OTP sent to `reset-password` | **400** |
| 5 wrong OTP guesses, then the correct OTP | **400**; OTP destroyed; probe password unchanged |
| Legitimate reset using the out-of-band OTP (read server-side by the harness) | **200**; hash changed; replay → **400** |
| Unknown legacy token; two-tier handle redeemed alone at `/api/v1/auth/reset-password` | **400** |
| Two-tier `recover-password` for unknown master identity / unknown workspace | **200**; identical keys; no OTP |
| Anonymous `/2fa/setup` (3 aliases) targeting superadmin | **401**; no secret returned |
| Authenticated probe targeting superadmin's 2FA (setup / verify) | **403** |
| Anonymous `/2fa/verify` email path | **401**; handshake path still reachable (bad token → 400) |
| Real users | password hashes unchanged; `superadmin@oxengl.com` is still the only `is_superuser` account |
| Backend logs since deploy | 0 OTP / token / TOTP-URI occurrences |

**Regression:** `verify_noprovision.py` 57/57, `verify_tenant_control.py` 121/121, `verify_sec.py` 28/28, `verify_idor.py` 7/7, `verify_tenant_billing.py` 23/23. **Total 287/287.**

The only test account was a disposable `secprobe.recovery.*@probe.invalid` user, which was deleted afterwards (`res_users` back to 6). Pre-deploy snapshot: `~/.oxengl/backups/pre_recoveryfix_*_users.sql`.

**Rollback:** the `:noclaims` image is the version from before this addendum. Rolling back to it **re-opens D1–D3**.

### Follow-ups

- **Phase A (blocks self-service reset).** Wire a real email provider (SMTP / SendGrid) and an SMS / WhatsApp provider behind `RecoveryDeliveryProvider` (`backend/app/api/v1/auth_recovery.py`), then retire the legacy endpoints.
- **Revoke sessions on reset.** A completed reset does not yet revoke the account's existing sessions or refresh tokens.
- **Rate limits.** `forgot-password` / `recover-password` have no per-IP or per-identifier rate limit; `slowapi` is installed but not applied to them.
- **Response timing.** Response timing still differs slightly between existing and unknown accounts (database lookups and OTP storage).
- **Credential review.** It is not known whether D1–D3 were exploited before the fix: successful resets are not audited. Real users who reset their password recently should confirm it was them, and recent password changes on platform accounts should be reviewed.
