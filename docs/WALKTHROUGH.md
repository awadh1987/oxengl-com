# OxenGL SaaS ERP Platform: Master Execution Walkthrough

This document serves as the master engineering log and architecture walkthrough detailing all enhancements, database migrations, API extensions, and frontend overhauls executed across the OxenGL SaaS platform (`oxengl.me` / `oxengl.com`).

---

## 1. Executive Summary

Over this continuous delivery cycle, four major enterprise initiatives were completed, verified, and pushed to `main`:

1. **Standardized Two-Tier Dynamic Branding Architecture:** Created the relational schema, JSONB platform store, FastAPI routing resolution, and frontend DOM injection for Tier 1 (Global Platform) and Tier 2 (Tenant Workspace) visual identities.
2. **Control Plane Master Tenant Schema Alignment:** Remediated the `psycopg2.errors.UndefinedColumn: column master_tenants.features_override does not exist` error through safe Alembic migration and end-to-end verification of workspace onboarding pipelines.
3. **Frontend Overhaul (Phases 1–4):** Built and deployed a production-ready, standalone, responsive frontend featuring an omnipresent dark theme, cursor spotlight lighting engine, and resizable multi-window desktop compositor.
4. **Git Operations & Audit Traceability:** Committed all verified code and migrations with detailed SHA hashes and clear rollback instructions.

---

## 2. Milestone A: Two-Tier Dynamic Branding Architecture

### A. Problem Statement & Audit
* Hardcoded strings (`OXENGL ENTERPRISE CLOUD`) existed in `Navbar.tsx`.
* Global CSS tokens in `index.css` lacked standardized `--color-primary` and `--color-accent` root variables.
* Branding metadata was previously confined to legacy columns on `res_companies` without an isolated relational `tenant_branding` table or JSONB-backed `platform_settings` store for super-admin defaults.

### B. Implementation Details
* **SQLAlchemy Models ([backend/models.py](file:///root/oxen-gl/backend/models.py)):**
  * `PlatformSetting`: Table `platform_settings` storing global platform branding in JSONB format.
  * `Organization`: Table `organizations` bridging integer tenant IDs with company UUIDs.
  * `TenantBranding`: Table `tenant_branding` with `tenant_id INT REFERENCES organizations(id) ON DELETE CASCADE UNIQUE`, brand names, logo/favicon URLs, colors (`primary_color`, `accent_color`), and custom domains.
* **Alembic Migration ([backend/alembic/versions/202610020001_create_dynamic_branding_tables.py](file:///root/oxen-gl/backend/alembic/versions/202610020001_create_dynamic_branding_tables.py)):**
  * Created `platform_settings`, `organizations`, and `tenant_branding`.
  * Added `features_override` to `res_companies`.
  * Seeded default global branding configuration (`#f97316` primary, `#0f172a` accent) and migrated active companies.
* **FastAPI Endpoints ([backend/app/api/v1/branding.py](file:///root/oxen-gl/backend/app/api/v1/branding.py)):**
  * `GET /api/v1/platform/branding`: Public Tier 1 endpoint for login/landing views.
  * `PUT /api/v1/admin/platform/branding`: Super-admin Tier 1 configuration override.
  * `GET /api/v1/tenant/branding`: Tier 2 scoped endpoint resolving tenant context from Subdomain (Host header), `X-Tenant-ID` / `X-Tenant-Slug` headers, query parameters, or JWT bearer claims.
  * `PUT /api/v1/admin/tenant/{tenant_id}/branding`: Admin override endpoint updating branding and synchronizing with `res_companies`.
* **Frontend DOM & State Integration:**
  * [frontend/src/index.css](file:///root/oxen-gl/frontend/src/index.css): Injected `:root` variables `--color-primary: #f97316;` and `--color-accent: #0f172a;`.
  * [frontend/src/hooks/useDynamicBranding.ts](file:///root/oxen-gl/frontend/src/hooks/useDynamicBranding.ts): Custom hook injecting CSS variables, updating document title (`${brand} | OxenGL Workspace`), and replacing the favicon link.
  * [frontend/src/context/AppContext.tsx](file:///root/oxen-gl/frontend/src/context/AppContext.tsx): Automatically resolves tenant vs. global platform branding on mount and route changes.
  * [frontend/src/components/Navbar.tsx](file:///root/oxen-gl/frontend/src/components/Navbar.tsx): Dynamically renders company brand name.

---

## 3. Milestone B: Master Tenant Schema Alignment (`features_override`)

### A. Root Cause Diagnosis
During enterprise tenant onboarding (`/api/v1/auth/register-tenant`) and Super Admin tenant deployment (`/api/v1/superadmin/tenants/register`), SQLAlchemy queried:
```python
existing_master = db.query(MasterTenant).filter(MasterTenant.slug == slug_cleaned).first()
```
While `MasterTenant` in `backend/models.py` declared:
```python
features_override: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
```
the underlying PostgreSQL `master_tenants` table had never received the column, throwing `psycopg2.errors.UndefinedColumn: column master_tenants.features_override does not exist`.

### B. Implementation Details
* **Alembic Migration ([backend/alembic/versions/202610020002_add_features_override_to_master_tenants.py](file:///root/oxen-gl/backend/alembic/versions/202610020002_add_features_override_to_master_tenants.py)):**
  ```python
  def upgrade() -> None:
      op.execute("""
          ALTER TABLE master_tenants 
          ADD COLUMN IF NOT EXISTS features_override JSONB NOT NULL DEFAULT '{}'::jsonb;
      """)

  def downgrade() -> None:
      op.execute("""
          ALTER TABLE master_tenants 
          DROP COLUMN IF EXISTS features_override;
      """)
  ```
* **Executed Migration:**
  Applied cleanly via `alembic -c backend/alembic.ini upgrade head` to head revision `202610020002`.
* **Handler Dependency Fix:**
  Added missing `import os` in [backend/app/domains/auth/onboard_tenant.py](file:///root/oxen-gl/backend/app/domains/auth/onboard_tenant.py) required for resolving the default domain environment variable during workspace URL generation.

---

## 4. Milestone C: Frontend Overhaul (Phases 1–4)

Built a production-ready, standalone, responsive frontend delivered at [frontend/public/landing.html](file:///root/oxen-gl/frontend/public/landing.html):

### A. Omnipresent Dark Theme Token System
* High-contrast enterprise palette: `--bg-void: #06080d`, `--bg-primary: #0b0f17`, `--bg-surface: #111827`, `--bg-inset: #0a0d14`, `--color-primary: #f97316`, `--color-accent: #38bdf8`, and `--color-success: #10b981`.
* Strict universal dark theme coverage across all inputs, forms, scrollbars, window frames, tables, and modals.
* Typography configured with `Inter` and `JetBrains Mono`.

### B. Cursor Spotlight Engine
* Responsive mouse pointer listener tracks `--mouse-x` and `--mouse-y` dynamically on the root document.
* Caster of soft radial spotlight gradients (`rgba(249, 115, 22, 0.06)`) and double-border illumination masks around windows and cards.

### C. Resizable Multi-Window Compositor (Hero Section)
* **Window 1 (GL-Voucher & ZATCA Engine):** Real-time debit/credit balancing, dynamic SHA-256 hash generation for ZATCA Phase 2 compliance, and commit simulation.
* **Window 2 (Ubuntu 24.04 LTS & PostgreSQL 16 Radar):** Real-time host telemetry (CPU 18.4%, RAM 14.2 / 64 GB, active connections 84 / 300), animated SVG query rate sparkline, and synchronous replication lag indicator.
* **Window 3 (Weighbridge & Quarry Logistics Dispatch):** Real-time scale tickets (`WB-2026-0984`, `WB-2026-0985`) with gross/tare/net calculation and scale ingestion triggers.
* **Compositor Logic:** Header drag handles, 8-axis resizing, z-index elevation, minimize/maximize toggling, and dock restoration.

### D. Full Page Sections & Conversion Flow
* **System Radar Bar:** Live cluster beacon (`KSA-RIYADH-01 [ONLINE]`), domain toggle (`oxengl.me` vs `oxengl.com`), and SuperAdmin cockpit trigger.
* **Infrastructure Proof Ribbon:** 4 benchmark metrics covering query latency (`0.42 ms`), buffer cache hit ratio (`99.7%`), quarterly volume (`SAR 418.9M+`), and ZATCA clearance speed (`< 14 ms`).
* **Interactive Workflow Matrix:** Tabbed operational catalog with syntax-highlighted FastAPI endpoint code previews (`branding.py`, `weighbridge.py`, `payroll.py`, `super_admin.py`).
* **Transparent Deployment Pricing:** Growth (`SAR 3,750`), Enterprise Syndicate (`SAR 8,900`), and Sovereign Dedicated with interactive monthly/annual (20% discount) billing toggles.
* **Instant Provisioning Terminal:** Direct subdomain reservation input (`[ your-company ].oxengl.me`) connected to validation feedback.
* **Comprehensive Footer:** ISO 27001, ZATCA Phase 2, and NDMO compliance badges, datacenter indicators, and source specification attribution link.

---

## 5. Verification & Testing Evidence

1. **Alembic Database Head:**
   * Current Head: `202610020002 (head)`
   * PostgreSQL Schema: Confirmed `master_tenants.features_override` is active `JSONB`.

2. **Automated Backend Tests:**
   ```bash
   /root/oxen-gl/backend/.venv/bin/pytest tests/test_dynamic_branding.py tests/test_tenants_validate_slug.py
   # Result: 12 passed in 1.68s (100% pass rate)
   ```

3. **Enterprise Onboarding & Registration Endpoints:**
   * `execute_tenant_provisioning`: Generated workspace with status `"PROVISIONED"`, created schemas, initialized charts of accounts, and synced `MasterTenant`.
   * `POST /api/v1/superadmin/tenants/register`: Returned `HTTP 201 Created` with `"status": "PROVISIONED"` and clean `workspace_url`.

4. **Frontend Production Build:**
   ```bash
   cd /root/oxen-gl/frontend && npm run build
   # Result: 3136 modules transformed, dist/ bundle generated with 0 errors.
   ```

---

## 6. Git Commit Trail & Reversion Runbook

### Commit Log History

| Commit Hash | Description |
| :--- | :--- |
| `963120b` | `feat(frontend): deliver phase 4 production standalone overhaul and walkthrough` |
| `4a7e201` | `feat(branding,db): implement two-tier dynamic branding and synchronize master_tenants schema` |
| `b0232ee` | Upstream baseline commit |

### Rollback & Reversion Guide
If you ever need to inspect or revert to any specific stage:

1. **Inspect Commit History:**
   ```bash
   git log --oneline -n 10
   ```
2. **Revert Frontend Overhaul Only (Return to commit `4a7e201`):**
   ```bash
   git checkout 4a7e201 -- frontend/public/landing.html
   ```
3. **Roll Back Database Migrations:**
   ```bash
   # Revert master_tenants.features_override migration:
   cd /root/oxen-gl/backend && .venv/bin/alembic -c alembic.ini downgrade 202610020001
   
   # Revert dynamic branding tables:
   cd /root/oxen-gl/backend && .venv/bin/alembic -c alembic.ini downgrade f3a4b5c6d7e8
   ```
4. **Inspect Schema State:**
   ```bash
   cd /root/oxen-gl/backend && .venv/bin/alembic -c alembic.ini current
   ```

---

## 7. Master File Matrix

| File Path | Status | Purpose |
| :--- | :--- | :--- |
| `backend/alembic/versions/202610020001_create_dynamic_branding_tables.py` | Created | Migration for `platform_settings`, `organizations`, `tenant_branding`. |
| `backend/alembic/versions/202610020002_add_features_override_to_master_tenants.py` | Created | Migration adding `features_override` to `master_tenants`. |
| `backend/models.py` | Modified | Added `PlatformSetting`, `Organization`, `TenantBranding` models. |
| `backend/schemas.py` | Modified | Added Pydantic schemas for Tier 1 & Tier 2 branding. |
| `backend/app/api/v1/branding.py` | Created | FastAPI endpoints for Two-Tier branding resolution. |
| `backend/app/main.py` | Modified | Registered dynamic branding router in FastAPI application. |
| `backend/app/domains/auth/onboard_tenant.py` | Modified | Fixed missing `os` import in onboarding workspace URL formatter. |
| `backend/tests/test_dynamic_branding.py` | Created | Pytest test suite for branding endpoints. |
| `frontend/src/index.css` | Modified | Standardized `--color-primary` and `--color-accent` variables. |
| `frontend/src/services/api.ts` | Modified | Added TypeScript DTOs and API methods for branding endpoints. |
| `frontend/src/hooks/useDynamicBranding.ts` | Created | React hook for dynamic CSS property, title, and favicon injection. |
| `frontend/src/context/AppContext.tsx` | Modified | Dynamic branding state management and fallback handling. |
| `frontend/src/components/Navbar.tsx` | Modified | Render dynamic brand names in global and tenant contexts. |
| `frontend/public/landing.html` | Created | Standalone deployable production frontend file. |
| `docs/WALKTHROUGH.md` | Updated | Master engineering execution walkthrough report. |
| `docs/WALKTHROUGH_DYNAMIC_BRANDING.md` | Created | Dedicated dynamic branding walkthrough report. |
| `docs/WALKTHROUGH_FRONTEND_OVERHAUL.md` | Created | Dedicated frontend overhaul walkthrough report. |
| `docs/docs/FRONTEND_OVERHAUL_PHASE4.md` | Created | Upstream Phase 4 specification file. |
| `docs/oxengl_dynamic_branding_specification.md` | Created | Base architectural specification standard. |
