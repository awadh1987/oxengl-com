# OxenGL SaaS Platform Upgrade & Schema Synchronization Walkthrough

This document serves as the comprehensive audit, architecture refactoring, and database migration walkthrough for the OxenGL SaaS platform.

---

## 1. Executive Summary

This cycle addressed two critical enterprise architectural milestones:
1. **Standardized Two-Tier Dynamic Branding Architecture:** Upgraded the frontend and backend to support Tier 1 (Platform Admin / Global) and Tier 2 (Tenant Workspace Scoped) dynamic visual identity, dynamic CSS custom property injection (`--color-primary`, `--color-accent`), favicon, and title updates.
2. **Control Plane Master Tenant Schema Alignment:** Diagnosed and remediated the `psycopg2.errors.UndefinedColumn: column master_tenants.features_override does not exist` error occurring during enterprise workspace onboarding and registration.

---

## 2. Milestone A: Two-Tier Dynamic Branding Architecture

### Problem Statement & Audit
* Hardcoded strings (`OXENGL ENTERPRISE CLOUD`) existed in `Navbar.tsx`.
* Global CSS tokens in `index.css` lacked the standardized `--color-primary` and `--color-accent` variables.
* Branding metadata was previously confined to legacy columns on `res_companies` without an isolated relational `tenant_branding` table or JSONB-backed `platform_settings` store for super-admin defaults.

### Implementation Details
* **SQLAlchemy Models (`backend/models.py`):**
  * `PlatformSetting`: Table `platform_settings` holding global platform defaults in JSONB.
  * `Organization`: Table `organizations` bridging integer tenant IDs with existing company UUIDs.
  * `TenantBranding`: Table `tenant_branding` with `tenant_id INT REFERENCES organizations(id) ON DELETE CASCADE UNIQUE`, brand names, URLs, colors (`primary_color`, `accent_color`), and custom domains.
* **Alembic Migration (`backend/alembic/versions/202610020001_create_dynamic_branding_tables.py`):**
  * Created `platform_settings`, `organizations`, and `tenant_branding`.
  * Added `features_override` to `res_companies`.
  * Seeded default global branding configuration and migrated active companies.
* **FastAPI Endpoints (`backend/app/api/v1/branding.py`):**
  * `GET /api/v1/platform/branding`: Public Tier 1 endpoint for login/landing views.
  * `PUT /api/v1/admin/platform/branding`: Super-admin Tier 1 configuration override.
  * `GET /api/v1/tenant/branding`: Tier 2 scoped endpoint resolving tenant context from Subdomain (Host header), `X-Tenant-ID` / `X-Tenant-Slug` headers, query parameters, or JWT bearer claims.
  * `PUT /api/v1/admin/tenant/{tenant_id}/branding`: Admin override endpoint updating branding and synchronizing with `res_companies`.
* **Frontend DOM & State Integration:**
  * `frontend/src/index.css`: Injected `:root` variables `--color-primary: #f97316;` and `--color-accent: #0f172a;`.
  * `frontend/src/hooks/useDynamicBranding.ts`: Custom hook injecting CSS variables, updating document title (`${brand} | OxenGL Workspace`), and replacing the favicon link.
  * `frontend/src/context/AppContext.tsx`: Automatically resolves tenant vs. global platform branding on mount and route changes.
  * `frontend/src/components/Navbar.tsx`: Dynamically renders company brand name.

---

## 3. Milestone B: Control Plane Master Tenant Schema Synchronization

### Problem Statement & Root Cause
* During enterprise tenant onboarding (`/api/v1/auth/register-tenant`) and Super Admin tenant deployment (`/api/v1/superadmin/tenants/register`), SQLAlchemy queried:
  ```python
  existing_master = db.query(MasterTenant).filter(MasterTenant.slug == slug_cleaned).first()
  ```
* While `MasterTenant` in `backend/models.py` declared:
  ```python
  features_override: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
  ```
  the underlying PostgreSQL `master_tenants` table had never received the column, throwing `psycopg2.errors.UndefinedColumn: column master_tenants.features_override does not exist`.

### Implementation Details
* **Alembic Migration (`backend/alembic/versions/202610020002_add_features_override_to_master_tenants.py`):**
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
  ```bash
  alembic -c backend/alembic.ini upgrade head
  # 202610020001 -> 202610020002 (add_features_override_to_master_tenants) applied successfully.
  ```
* **Handler Dependency Fix:**
  Added missing `import os` in `backend/app/domains/auth/onboard_tenant.py` required for resolving the default domain environment variable during workspace URL generation.

---

## 4. Verification & Validation Summary

1. **Alembic Migration History & Current Head:**
   * Current Head: `202610020002 (head)`
   * PostgreSQL Schema Inspection: Confirmed `master_tenants.features_override` is of type `JSONB`.

2. **Backend Automated Tests:**
   ```bash
   /root/oxen-gl/backend/.venv/bin/pytest tests/test_dynamic_branding.py tests/test_tenants_validate_slug.py
   # Output: 12 passed, 15 warnings in 1.68s (100% pass rate)
   ```

3. **Enterprise Onboarding & Registration Endpoints:**
   * Tested `execute_tenant_provisioning`: Successfully generated workspace with status `"PROVISIONED"`, created schemas, initialized charts of accounts, and synced `MasterTenant`.
   * Tested `POST /api/v1/superadmin/tenants/register` via TestClient: Returned `HTTP 201 Created` with `"status": "PROVISIONED"` and clean `workspace_url`.

4. **Frontend Production Build:**
   ```bash
   cd /root/oxen-gl/frontend && npm run build
   # Output: 3136 modules transformed, dist/ bundle generated with 0 errors.
   ```

---

## 5. Repository File Matrix

| File Path | Status | Purpose |
| :--- | :--- | :--- |
| `backend/alembic/versions/202610020001_create_dynamic_branding_tables.py` | Created | Migration for `platform_settings`, `organizations`, `tenant_branding`. |
| `backend/alembic/versions/202610020002_add_features_override_to_master_tenants.py` | Created | Migration adding `features_override` to `master_tenants`. |
| `backend/models.py` | Modified | Added `PlatformSetting`, `Organization`, `TenantBranding` models. |
| `backend/schemas.py` | Modified | Added Pydantic schemas for Tier 1 & Tier 2 branding. |
| `backend/app/api/v1/branding.py` | Created | FastAPI endpoints for Two-Tier branding resolution. |
| `backend/app/main.py` | Modified | Registered dynamic branding router in FastAPI application. |
| `backend/app/domains/auth/onboard_tenant.py` | Modified | Added missing `os` import in onboarding workspace URL formatter. |
| `backend/tests/test_dynamic_branding.py` | Created | Pytest test suite for branding endpoints. |
| `frontend/src/index.css` | Modified | Injected `--color-primary` and `--color-accent` variables. |
| `frontend/src/services/api.ts` | Modified | Added TypeScript DTOs and API methods for branding endpoints. |
| `frontend/src/hooks/useDynamicBranding.ts` | Created | React hook for dynamic CSS property, title, and favicon injection. |
| `frontend/src/context/AppContext.tsx` | Modified | Dynamic branding state management and fallback handling. |
| `frontend/src/components/Navbar.tsx` | Modified | Render dynamic brand names in global and tenant contexts. |
| `docs/WALKTHROUGH.md` | Created | Complete process walkthrough report. |
| `docs/WALKTHROUGH_DYNAMIC_BRANDING.md` | Created | Specialized dynamic branding walkthrough report. |
