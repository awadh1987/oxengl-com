# OxenGL Two-Tier Email Configuration Architecture

This document establishes the official technical specification for implementing two-tier email delivery within the OxenGL SaaS platform. It covers global superadmin fallback configuration and tenant-specific isolated custom SMTP overrides, adhering to enterprise security and multi-tenant isolation standards.

---

## 1. Architectural Overview

OxenGL implements a hierarchical fallback mail delivery pipeline:
1. **Tier 1 (Tenant Override):** If an active tenant-specific email provider exists, outbound operational emails (invoices, purchase orders, client alerts) are dispatched using that tenant's provider.
2. **Tier 2 (Global Superadmin Fallback):** If no tenant override is active or tenant delivery fails, the system automatically falls back to the active platform-wide email provider managed by the Superadmin. Platform-only delivery for a system-critical alert must be requested explicitly; it is not inferred from message content.

```
                  [ Outbound Email Request ]
                             │
                             ▼
              { Does Tenant Have Active SMTP? }
                     /                 \
                 ( YES )              ( NO )
                   /                     \
                  ▼                       ▼
      [ Decrypt & Apply Tenant ]    [ Use Global Superadmin ]
      [      SMTP Config       ]    [      Fallback SMTP    ]
                   \                     /
                    \                   /
                     ▼                 ▼
              [ Dispatch via FastAPI Mail Engine ]
```

---

## 2. Database Schema & Storage Specifications

Both tiers use `communication_settings` in `erp_db`; configuration is not split between
a tenant-only table and environment variables.

* **Tenant override:** `tenant_id` references `res_companies.id`. An active email row is
  the tenant's override. Its `config` JSON contains provider-specific non-secret values
  (for SMTP: `host`, `port`, `security`, and optional `username`); the sender is stored
  in `sender_identity`.
* **Platform fallback:** `tenant_id IS NULL` identifies a platform-wide setting. The
  partial unique indexes allow at most one active setting for each channel at each
  scope. The Superadmin manages this row from the existing Communications panel.
* **Credentials:** Provider credentials are stored in `credentials_encrypted`; API
  responses expose only `has_credential`. SMTP and other email providers share the
  same model, so the platform fallback may be SMTP or SendGrid.
* **Metadata:** `channel`, `provider`, `is_active`, timestamps, `created_by`, and
  connectivity-test status are also stored on the row.

---

## 3. Security & Encryption Standards

* **Credential Encryption:** Credentials are encrypted before persistence with the
  communication credential cipher. Decryption occurs in-memory only for delivery.
* **Row-Level Security (RLS):** `communication_settings` is registered as a
  `tenant_id`-scoped table in both RLS setup scripts. Policies are enabled and forced:
  ordinary tenant sessions can access only rows matching
  `app.current_tenant_id`; the dedicated `oxengl_platform` database role bypasses RLS
  for authorized platform operations. Dispatcher queries must still filter by the
  exact tenant id or `tenant_id IS NULL`.
* **API isolation:** Tenant setting routes derive scope from the authenticated user's
  `company_id`; clients cannot choose another tenant id. Superadmin configuration
  routes require platform authorization, use the platform database session, and only
  modify platform-scoped rows.
* **Domain Validation:** Tenant sender domains should ideally pass SPF/DKIM checks
  where enterprise compliance requires it.

---

## 4. Backend Dispatch Logic & Fallback Mechanism

The dispatcher resolves an active tenant email setting first, then the active
platform email setting. If tenant delivery is rejected or fails (including SMTP
authentication failure), it attempts the platform setting. If the platform attempt
also fails, dispatch returns an explicit safe delivery error; provider secrets and
raw provider exception details are not returned or logged. If there is no tenant
override, the platform setting is used directly.

Background delivery uses the dedicated `PlatformSessionLocal` connection so it can
read both the tenant-scoped row and the `tenant_id IS NULL` fallback despite RLS.
Queries remain explicitly scoped. If platform DB access is not configured, delivery
fails explicitly rather than silently returning a success-shaped result.

The implementation is `backend/app/services/communication_service.py`; email OTPs,
recovery messages, and other notification flows use its `send_message` dispatcher.
SMS resolution remains on its existing channel path.

---

## 5. API Endpoint Specifications

The implemented endpoints use the shared Communications API:

* **Tenant:** `/api/v1/tenant-control/communications` supports list, create, update,
  delete, and `/{setting_id}/test`; scope comes from the authenticated tenant.
* **Superadmin:** `/api/v1/superadmin/communications` supports list, create, update,
  delete, and `/{setting_id}/test`. Platform defaults have a null `tenant_id`;
  tenant rows are visible for oversight but cannot be modified through platform
  setting mutations.
* Both APIs mask credentials, accept write-only credential updates, validate
  provider configuration, and audit administrative/configuration actions.

---

## 6. Frontend UI Considerations

* **Superadmin Panel:** The existing Superadmin Communications panel manages platform
  defaults and inspects tenant overrides. Select the platform scope to configure,
  activate, edit, and test global email delivery. Tenant rows are read-only there.
* **Tenant Panel:** The tenant Communications module manages the workspace's email
  and SMS settings, including SMTP host, port, username, write-only password,
  activation, and test delivery. Deleting or deactivating the tenant email override
  returns delivery to the platform fallback.