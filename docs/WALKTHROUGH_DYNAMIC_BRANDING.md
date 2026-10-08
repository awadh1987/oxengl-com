# OxenGL Two-Tier Dynamic Branding Architecture: Implementation Walkthrough

This document details the complete end-to-end execution, architectural changes, database migrations, backend endpoints, frontend integrations, and verification tests performed to upgrade the OxenGL SaaS platform to the standardized **Two-Tier Dynamic Branding Architecture** (Admin Portal Level & Tenant Workspace Level) in compliance with [oxengl_dynamic_branding_specification.md](file:///root/oxen-gl/docs/oxengl_dynamic_branding_specification.md).

---

## 1. Architectural Overview

```
                                  [ Incoming Request ]
                                           │
          ┌────────────────────────────────┴────────────────────────────────┐
          ▼                                                                 ▼
[ Admin Portal / Public Landing ]                               [ Tenant Workspace ]
  e.g., oxengl.me, admin.oxengl.me                                e.g., acme.oxengl.me
          │                                                                 │
          ▼                                                                 ▼
[ Tier 1: Platform Global Branding ]                            [ Tier 2: Tenant Scoped Branding ]
  - Endpoint: GET /api/v1/platform/branding                       - Endpoint: GET /api/v1/tenant/branding
  - DB Table: platform_settings (JSONB)                           - DB Table: tenant_branding (Relational)
  - Resolves system-wide default identity:                        - Resolves tenant context via:
    * Platform Name: "OxenGL Enterprise"                            * Subdomain (Host header)
    * Default Primary: #f97316 (orange-500)                         * Custom Domain (custom_domain column)
    * Default Accent: #0f172a (slate-900)                           * X-Tenant-ID / X-Tenant-Slug headers
    * Assets: Default Logo & Favicon                                * Query param & JWT bearer claims
          │                                                                 │
          └────────────────────────────────┬────────────────────────────────┘
                                           ▼
                           [ Dynamic Frontend DOM Injection ]
                             - document.documentElement.style:
                                 --color-primary
                                 --color-accent
                             - document.title: "${Brand} | OxenGL Workspace"
                             - document.head: <link rel="icon" href="...">
```

---

## 2. Phase 1: Codebase Audit & Gap Analysis

### Findings
1. **Frontend Hardcoding & Leaks:**
   * Static string `"OXENGL ENTERPRISE CLOUD"` was hardcoded in `frontend/src/components/Navbar.tsx` rather than reflecting platform or tenant brand names.
   * `frontend/src/context/AppContext.tsx` maintained an in-memory `brandConfig` that was never synchronized with backend branding endpoints upon route navigation or subdomain changes.
   * `frontend/src/index.css` defined legacy CSS tokens (`--primary-color: #6366f1;`, `--secondary-color: #4f46e5;`), while the two-tier standard requires `--color-primary` and `--color-accent` on `:root`.

2. **Backend & Relational Structure Gaps:**
   * Branding was previously scattered across legacy columns on `res_companies` (`ui_primary_color`, `ui_logo_url`, `primary_color`, `secondary_color`).
   * No dedicated relational schema existed for `tenant_branding` or JSONB-backed `platform_settings`.
   * No public Tier 1 platform endpoint (`/api/v1/platform/branding`) existed for unauthenticated landing and login pages.

---

## 3. Phase 2: Database Schema & Migration Execution

### A. SQLAlchemy Models (`backend/models.py`)
Added three models matching PostgreSQL relational and JSONB specifications:

```python
class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=True, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    branding = relationship("TenantBranding", back_populates="organization", uselist=False, cascade="all, delete-orphan")


class TenantBranding(Base):
    __tablename__ = "tenant_branding"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False)
    brand_name = Column(String(255), nullable=False)
    logo_url = Column(Text, nullable=False)
    favicon_url = Column(Text, nullable=True)
    primary_color = Column(String(50), default="#f97316")
    accent_color = Column(String(50), default="#0f172a")
    custom_domain = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    organization = relationship("Organization", back_populates="branding")
```

### B. Alembic Database Migration
Generated and executed revision `202610020001_create_dynamic_branding_tables.py` in `backend/alembic/versions/`:
* Created tables: `platform_settings`, `organizations`, `tenant_branding`.
* Added column: `res_companies.features_override (JSONB)`.
* Seeded default global platform branding in `platform_settings`:
  ```json
  {
    "platform_name": "OxenGL Enterprise",
    "default_logo": "/assets/logo.svg",
    "favicon_url": "/favicon.ico",
    "primary_color": "#f97316",
    "accent_color": "#0f172a",
    "support_email": "support@oxengl.me"
  }
  ```
* Automated data migration: Synchronized existing records from `res_companies` into `organizations` and `tenant_branding`.

---

## 4. Phase 3: Backend API Architecture & Context Resolution

Implemented in `backend/app/api/v1/branding.py` and mounted to FastAPI in `backend/app/main.py`:

### Tier 1: Platform Endpoints (Public & Super Admin)
* `GET /api/v1/platform/branding` (Public): Returns platform branding defaults.
* `PUT /api/v1/admin/platform/branding` (Super Admin): Updates global branding settings in `platform_settings`.

### Tier 2: Tenant Scoped Endpoints
* `GET /api/v1/tenant/branding`: Scoped endpoint resolving tenant identity dynamically via:
  1. **Subdomain resolution**: Extracts `<slug>` from `Host: <slug>.oxengl.me` (ignoring system subdomains `admin`, `api`, `app`, `www`).
  2. **Custom domain**: Matches `Host` header against `tenant_branding.custom_domain`.
  3. **Headers**: Inspects `X-Tenant-ID` or `X-Tenant-Slug`.
  4. **Query Parameter**: Inspects `?tenant_id=...` (accepting integer ID, UUID, or slug).
  5. **JWT Token Claims**: Resolves `tenant_id` or `org_id` from bearer authorization.
* `GET /api/v1/admin/tenant/{tenant_id}/branding`: Admin view for tenant branding.
* `PUT /api/v1/admin/tenant/{tenant_id}/branding`: Admin override endpoint updating `tenant_branding` and synchronizing with `res_companies`.

---

## 5. Phase 4: Frontend Integration & Dynamic Property Injection

### A. CSS Custom Properties (`frontend/src/index.css`)
```css
:root {
  --color-primary: #f97316;
  --color-accent: #0f172a;
  --primary-color: var(--color-primary);
  --secondary-color: var(--color-accent);
}
```

### B. Dynamic Branding Hook (`frontend/src/hooks/useDynamicBranding.ts`)
Created `applyBrandingToDOM()` helper:
* Dynamically sets CSS variables `--color-primary` and `--color-accent` on `document.documentElement.style`.
* Updates browser `document.title` to `${brandName} | OxenGL Workspace`.
* Finds or creates `<link rel="icon">` in `document.head` and points to custom `favicon_url`.

### C. AppContext Dynamic Synchronization (`frontend/src/context/AppContext.tsx`)
* Added automatic tenant vs. platform resolution on component mount and window `popstate` events.
* If a tenant slug/subdomain is detected, calls `api.getTenantBranding()`.
* If on the apex domain or no tenant context is found, falls back gracefully to `api.getPlatformBranding()`.

### D. Navbar Header Refactoring (`frontend/src/components/Navbar.tsx`)
Replaced hardcoded platform text with dynamic brand titles:
```tsx
<span className="text-sm font-bold tracking-tight text-white uppercase">
  {brandConfig.companyNameAr || brandConfig.companyNameEn || 'OXENGL ENTERPRISE'}
</span>
```

---

## 6. Phase 5: Verification & Automated Testing

### A. Database Migration Verification
```bash
cd /root/oxen-gl/backend && .venv/bin/alembic upgrade head
```
* **Output:** Upgrade to `202610020001 (create_dynamic_branding_tables)` completed cleanly.

### B. Automated Pytest Test Suite
Executed the new dynamic branding test suite and existing tenant validation suite:
```bash
cd /root/oxen-gl/backend && .venv/bin/pytest tests/test_dynamic_branding.py tests/test_tenants_validate_slug.py
```
* **Results:**
  ```text
  tests/test_dynamic_branding.py ......                                    [ 50%]
  tests/test_tenants_validate_slug.py ......                               [100%]
  ======================= 12 passed, 15 warnings in 1.80s ========================
  ```
* **Coverage:**
  * Public `GET /api/v1/platform/branding` returns standard global branding.
  * Super Admin `PUT /api/v1/admin/platform/branding` modifies `platform_settings` JSONB payload.
  * Subdomain host header (`Host: acme.oxengl.me`) resolves tenant branding.
  * `X-Tenant-ID` header resolves tenant branding.
  * Query parameter (`?tenant_id=...`) resolves tenant branding via integer ID, UUID, and slug.
  * Tenant branding updates synchronize both `tenant_branding` and `res_companies`.
  * Uncontextualized calls to `GET /api/v1/tenant/branding` return clean 404 responses.

### C. Frontend Production Build
```bash
cd /root/oxen-gl/frontend && npm run build
```
* **Result:** Vite transformed 3136 modules and generated bundle in `dist/` with 0 errors.

---

## 7. Modified & Created Files Summary

| File Path | Status | Purpose |
| :--- | :--- | :--- |
| `backend/alembic/versions/202610020001_create_dynamic_branding_tables.py` | Created | Database migration for `platform_settings`, `organizations`, `tenant_branding`. |
| `backend/models.py` | Modified | Added SQLAlchemy models with JSONB and relational foreign key constraints. |
| `backend/schemas.py` | Modified | Added Pydantic request/response schemas for branding tiers. |
| `backend/app/api/v1/branding.py` | Created | Two-Tier FastAPI router for platform and tenant branding. |
| `backend/app/main.py` | Modified | Registered dynamic branding router in FastAPI application. |
| `backend/tests/test_dynamic_branding.py` | Created | Pytest test suite for dynamic branding endpoints and resolution logic. |
| `frontend/src/index.css` | Modified | Standardized `--color-primary` and `--color-accent` CSS custom properties. |
| `frontend/src/services/api.ts` | Modified | Added TypeScript DTOs and API methods for branding endpoints. |
| `frontend/src/hooks/useDynamicBranding.ts` | Created | React hook for dynamic CSS property, title, and favicon injection. |
| `frontend/src/context/AppContext.tsx` | Modified | Mounted dynamic branding resolver with fallback to global branding. |
| `frontend/src/components/Navbar.tsx` | Modified | Updated navigation bar to display dynamic brand labels. |
| `docs/oxengl_dynamic_branding_specification.md` | Existing | Base architectural standard. |
| `docs/WALKTHROUGH_DYNAMIC_BRANDING.md` | Created | This implementation walkthrough document. |
