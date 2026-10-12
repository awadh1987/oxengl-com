# OxenGL Platform Upgrade Summary

**Date:** October 5, 2026
**Scope:** HR-to-IAM provisioning, unified user management, entity UI relocation, multi-tenant external backups, global modal responsiveness.

---

## 1. HR-to-IAM Automated Provisioning Pipeline

Registering an employee in the HR module now provisions the matching system user account automatically.

- **Trigger:** the HR "Register Employee" routes (`backend/app/api/v1/hr.py`, `backend/api/routes/hrms_ledger.py`) schedule a FastAPI `BackgroundTasks` job *after* the employee is committed.
- **Service:** `backend/app/domains/iam/provisioning.py` creates the user, generates a temporary password (hashed before storage), links the user back to the employee via foreign key, and writes audit entries. It uses its own safe database session.
- **Role matrix:** `backend/app/domains/iam/role_catalog.py` maps each HR job title to one of 25 standardized IAM roles (Super_Admin, Operations_Admin, Finance_Admin, System_Admin, General_Manager, ... Employee_Self_Serve), exactly as defined in `docs/oxengl_hr_iam_provisioning_blueprint.md`.
- **ABAC context:** a JSON context is generated per mapped title (e.g. `approval_limit`, `requires_mfa`) and stored with the user.
- **Notes:**
  - The exact role is stored in `res_users.iam_role`. For the CEO (`Super_Admin`) the legacy `role` column is set to `CEO` to avoid cross-tenant platform access.
  - The credential notifier is currently a stub, so temporary passwords are not yet delivered to employees.
  - `must_change_password` and `requires_mfa` are stored but not yet enforced at login.

Related earlier work (same migration chain): KSA-compliant Advanced HR Registration (5-tab modal, expanded employee schema, tiered job titles, Quick Add retained) in `618b43b`.

## 2. Unified User Management & IAM Control Panel

User management is consolidated into **Master Data → Users & RBAC** (`/settings/master-data`).

- **Removed:** the "Team Members" tab from `/settings/tenant` and the "User Registration Requests" tab from `/settings/approvals`.
- **Actions column:** Edit Access, Force Password Reset, Suspend Account.
- **Roles:** hardcoded role arrays removed; dropdowns use the 25 standardized roles.
- **Invites:** "Invite New User" is restricted to external identities (Guest, External Auditor). The modal shows: *"Internal staff must be registered via the HR module to generate payroll and compliance profiles."*
- **Backend:** `backend/app/api/v1/users.py` reworked accordingly.
- **Follow-up:** the legacy `/team` endpoints in `backend/app/api/v1/tenant_control.py` still exist and bypass HR. They are unused by the UI and should be removed.

## 3. Entity Management Relocation

Creation of master entities moved from Settings into the screens where it is used.

| Entity | Removed from | Now in |
|---|---|---|
| Service Supplier | Master Data | `/operations/transporters` |
| Material Supplier, Material Item | Master Data | `/operations/crushers` |
| Customer | Master Data | `/operations/daily` |

- A shared `EntityQuickAdd.tsx` provides the modals and trigger buttons, plus a **Quick Add** menu on the Daily Entry portal for all entities.
- Existing API hooks and validation were preserved; the ledger grids refresh after a new entity is added.
- Master Data now focuses on Users, Roles and RBAC only.
- **Known limitation:** `addMaterial` is local-only (no backend create-material API), so new materials do not persist across reloads.

## 4. Multi-Tenant External Backup Destinations & Run Logs

- **Migration `202610050001`:** creates `backup_destinations` (nullable `tenant_id` for platform-wide, `provider_type` in gdrive/onedrive/sftp, non-secret `config`, `credential_ref`, `is_active`, encrypted credentials column) and `backup_run_logs` (per-attempt status, size, sanitized error, timestamps).
- **Worker (`backup_worker.py`, `backup_service.py`):** the previous `destinations=[]` is replaced with active destinations. The platform archive goes only to platform-wide destinations; each tenant's archive goes only to that tenant's destinations. Every upload attempt writes a `backup_run_logs` row, and one failure does not stop the others.
- **Credentials:** write-only, stored AES-256-GCM encrypted and bound to destination and tenant. API responses expose only `has_credential`. Tenant SFTP hosts must be public, host keys are pinned, and paths are validated.
- **APIs:**
  - `/api/v1/tenant-control/backups`: destination CRUD, test, and run logs, scoped server-side by `company_id` (cross-tenant IDs return 404).
  - `/api/v1/superadmin/backups`: all destinations and logs with filters; may modify platform-wide destinations only.
  - Both write to the audit logs.
- **UI:** "Data Backups & Archives" tab in `TenantSettingsPanel.tsx`; global monitoring panel in `SuperAdminTenantsView.tsx`.
- **Operational notes:** run the migration before restarting the backend. Disable any legacy external backup scripts once destinations are configured to avoid duplicate uploads. The SFTP host check is repeated at upload time, but the resolved IP is not pinned.

## 5. Global Modal & Dialog Responsiveness

- `frontend/src/index.css` now includes global overrides for `.modal-container`, `dialog`, `[role="dialog"]`, `.MuiDialog-paper` and `.ant-modal-content`: `width: min(90vw, 1200px)`, `max-height: 90vh`, `overflow-y: auto`, `margin: auto` (all `!important`).
- **Note:** because of `!important` on `dialog` and `[role="dialog"]`, small confirmation dialogs are also widened.

---

## Rollback & Technical Notes

### Alembic migrations (in order)

| Revision | File | Purpose |
|---|---|---|
| `202610040001` | `202610040001_hr_advanced_registration.py` | Expanded employee schema and constraints |
| `202610040002` | `202610040002_hr_iam_provisioning.py` | HR-to-IAM provisioning columns/links |
| `202610050001` | `202610050001_backup_destinations_and_run_logs.py` | Backup destinations and run logs (current head) |

Apply: `cd backend && alembic upgrade head`
Roll back one step: `alembic downgrade -1` (repeat as needed; `202610050001` downgrade drops both backup tables and their data).

### Commits

| Commit | Area |
|---|---|
| `618b43b` | KSA-compliant HR Advanced Registration (migration `202610040001`) |
| `70309e2` | HR-to-IAM provisioning (migration `202610040002`) |
| `e43e95c` | Global modal/dialog CSS |
| `5d7dc6d` | Unified IAM UI and `users.py` rewrite |
| `cc2fe2c` | Entity creation relocated to operations screens |
| `bf1913a` | Multi-tenant backup destinations, run logs, APIs and UI (migration `202610050001`) |

Revert a single area with `git revert <commit>`. If reverting a commit that owns a migration, downgrade the database first.

### Deployment

1. `cd backend && alembic upgrade head`, then restart `oxengl-backend.service`.
2. Set `OXENGL_TRUSTED_PROXY_CIDRS` so audit logs capture real client IPs.
3. Frontend: `npm run build` and copy `dist/` to the active web root (confirm the path first).

### Validation status

Tests were run on SQLite/in-memory only; migrations have not been applied to a live PostgreSQL database, and external SFTP, Google Drive and OneDrive uploads have not been exercised end to end.
