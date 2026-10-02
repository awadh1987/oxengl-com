# OxenGL Standardized Dynamic Branding Specification

This document defines the architectural standard for managing, caching, and rendering dynamic branding across two distinct tiers in the OxenGL SaaS platform:
1. **Platform Admin Portal Level:** Global branding defaults, white-label templates, and system-wide assets managed by super-administrators.
2. **Tenant Workspace Level:** Organization-specific overrides (logos, color themes, custom favicon, company titles) applied dynamically based on active tenant resolution.

---

## 1. Two-Tier Architecture Overview

```
[ Incoming Request ] 
       │
       ├─► Admin Portal (*.oxengl.me/admin) ──► Loads Global System Branding
       └─► Tenant Workspace (client.oxengl.me) ──► Resolves Tenant Slug/Subdomain 
                                                ──► Fetches Tenant Custom Branding
                                                ──► Injects CSS Variables & Assets
```

---

## 2. Database Schema Standard

To support robust multi-level branding, your PostgreSQL database must accommodate both global settings and tenant-specific records.

### A. Global Platform Settings Table
```sql
CREATE TABLE platform_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Example record: key = 'global_branding', value = '{"platform_name": "OxenGL Enterprise", "default_logo": "/assets/logo.svg"}'
```

### B. Tenant Branding Table
```sql
CREATE TABLE tenant_branding (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    brand_name VARCHAR(255) NOT NULL,
    logo_url TEXT NOT NULL,
    favicon_url TEXT,
    primary_color VARCHAR(50) DEFAULT '#f97316', -- Tailwind orange-500 equivalent
    accent_color VARCHAR(50) DEFAULT '#0f172a',  -- Tailwind slate-900 equivalent
    custom_domain VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Backend API Endpoints (FastAPI Standard)

* `GET /api/v1/platform/branding` — Returns global branding defaults (accessible publicly for login/landing pages).
* `GET /api/v1/tenant/branding` — Tenant-scoped endpoint requiring workspace authentication or subdomain context resolution, returning color schemes and logo URLs.
* `PUT /api/v1/admin/tenant/{tenant_id}/branding` — Admin endpoint to update or override a specific tenant's visual identity.

---

## 4. Frontend Dynamic Injection (React / Tailwind Standard)

Upon application startup or workspace switching, the frontend layout wrapper must fetch branding configurations and inject them into CSS custom properties:

```typescript
// Example React Hook / Provider snippet
useEffect(() => {
  if (brandingData) {
    document.documentElement.style.setProperty('--color-primary', brandingData.primary_color);
    document.documentElement.style.setProperty('--color-accent', brandingData.accent_color);
    document.title = `${brandingData.brand_name} | OxenGL Workspace`;
  }
}, [brandingData]);
