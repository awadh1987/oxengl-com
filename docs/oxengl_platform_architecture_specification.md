# OxenGL Platform: Enterprise Control Plane & Admin Architecture

**Document Version:** 1.0.0  
**Target Baseline:** Git commit `a0b8db4` on branch `main`  
**Scope:** Global Platform Admin Panel, Master Configuration Deduplication, Dynamic Headless CMS for `https://oxengl.me`, and Broadcast Subsystem.

---

## 1. Executive Summary & Vision

OxenGL requires an enterprise-grade global governance architecture matching and exceeding standards set by SAP NetWeaver, Odoo SuperAdmin, and modern hyperscale SaaS platforms. The objective is to decouple tenant workspace administration from root platform governance while providing complete headless CMS control over the public digital storefront (`https://oxengl.me`), centralizing master branding, and consolidating duplicate settings trees into a single source of truth.

---

## 2. High-Level System Architecture

```
                               ┌────────────────────────────────────────────────────────┐
                               │             OXENGL GLOBAL CONTROL PLANE                │
                               │           (SuperAdmin / Platform Master)               │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
         ┌────────────────────────────────────────────────┼────────────────────────────────────────────────┐
         │                                                │                                                │
         ▼                                                ▼                                                ▼
┌──────────────────────────────┐        ┌───────────────────────────────────┐            ┌───────────────────────────────────┐
│ Dynamic Landing CMS Engine   │        │ Unified Platform Governance       │            │ System Broadcast & Comms Engine   │
│ (`https://oxengl.me`)        │        │ (`https://oxengl.me/admin`)       │            │ (Cross-Tenant Runtime)            │
├──────────────────────────────┤        ├───────────────────────────────────┤            ├───────────────────────────────────┤
│ • Hierarchical Block Tree    │        │ • Single Source of Truth Settings │            │ • Severity Tiering (Info/Crit)    │
│ • Key-Value Content Registry │        │ • Multi-Tenant Identity Defaults  │            │ • WebSocket / SSE Event Push      │
│ • Cache & Invalidation Layer │        │ • Enterprise Dark/Light Theming   │            │ • Dismissal & Scheduling State    │
│ • Component-Level Overrides  │        │ • RBAC Isolation (SuperAdmin Only)│            │ • Banner Injection Across Portals │
└──────────────────────────────┘        └───────────────────────────────────┘            └───────────────────────────────────┘
```

---

## 3. Core Architectural Subsystems

### 3.1. Dynamic Headless Landing CMS (`https://oxengl.me`)

The public landing page must not contain static or hardcoded text, labels, icons, or matrices. Every visual and textual element is driven by a schema-backed CMS engine.

1. **Structured Block Model**:
   - The landing page is divided into ordered sections (`hero`, `features`, `metrics`, `pricing_matrix`, `testimonials`, `faq`, `footer`).
   - Each section contains a typed JSON payload defining headings, descriptions, buttons, target URIs, badge text, media URLs, and iconography identifiers (e.g., Lucide icon strings).
2. **Performance & Delivery**:
   - Exposed via `GET /api/v1/public/content/landing`.
   - Edge-cached with automated invalidation upon administrative commit.
   - Fallback defaults embedded within frontend bundles to guarantee zero layout shift (CLS = 0) and high availability even during cold cache states.
3. **Admin Studio (`/admin/landing-editor`)**:
   - Live form editors with side-by-side or instant modal preview.
   - Direct upload integration for hero graphics, feature mockups, and logos.
   - Version history and "Reset to Factory Default" safety controls.

### 3.2. Unified Master Settings (De-duplication Engine)

Legacy settings tables (`settings`, `platform_settings`, `branding`, and `master_config`) are consolidated into a unified schema to eliminate duplication and configuration drift.

1. **Unified Configuration Hierarchy**:
   - **Level 0 (Root Platform Master)**: Global domain branding, OxenGL system identity, root logos, favicons, security compliance, platform-wide contact emails, and core metadata.
   - **Level 1 (Tenant Default Blueprint)**: System-wide base templates inherited by new workspace organizations during provisioning.
   - **Level 2 (Tenant Workspace Overrides)**: Isolated organizational settings managed within tenant domains, strictly separated from the platform master.
2. **Data Consistency**:
   - Pydantic v2 strict schema models for request/response validation.
   - Single atomic table `platform_master_settings` backed by keyed JSON configurations where dynamic extensibility is required.

### 3.3. Real-Time Broadcast & Announcement Subsystem

A platform-wide notification system enabling SuperAdmins to push critical updates, maintenance windows, and global notices.

1. **Broadcast Model**:
   - Severity levels: `info`, `warning`, `critical`, `maintenance`.
   - Targeting scope: `all_tenants`, `specific_plans`, or `administrators_only`.
   - Lifecycle controls: `starts_at`, `expires_at`, and `is_dismissible`.
2. **Delivery Mechanism**:
   - Synchronized via Server-Sent Events (SSE) or WebSocket push to active client sessions.
   - Session storage tracking for dismissed alerts to prevent intrusive re-prompting.

### 3.4. Enterprise Design System & UI/UX Standards (`https://oxengl.me/admin`)

The platform control panel must adhere to modern enterprise usability standards:

1. **Theme Engine**:
   - High-contrast, accessibility-tested Dark and Light themes (`prefers-color-scheme` compatible with explicit user override).
   - Cohesive CSS variable tokens for borders, elevation levels, muted surfaces, and accent states.
   - Lightable hover feedback states with micro-interactions.
2. **Information Architecture**:
   - Responsive multi-device layout (mobile, tablet, desktop, ultra-wide).
   - Collapsible high-density navigation sidebar.
   - Universal command palette (`Cmd/Ctrl + K`) for rapid navigation across settings, sections, and audit logs.
   - Unified breadcrumbs and contextual action headers.

---

## 4. Database Schema Specification

### 4.1. `platform_master_settings`

```sql
CREATE TABLE platform_master_settings (
    id VARCHAR(36) PRIMARY KEY,
    platform_name VARCHAR(128) NOT NULL DEFAULT 'OxenGL',
    platform_tagline VARCHAR(255) NULL,
    logo_light_url VARCHAR(512) NULL,
    logo_dark_url VARCHAR(512) NULL,
    favicon_url VARCHAR(512) NULL,
    primary_color VARCHAR(32) DEFAULT '#2563EB',
    secondary_color VARCHAR(32) DEFAULT '#0F172A',
    support_email VARCHAR(255) NULL,
    legal_terms_url VARCHAR(512) NULL,
    privacy_policy_url VARCHAR(512) NULL,
    custom_css TEXT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(36) NULL
);
```

### 4.2. `platform_landing_sections`

```sql
CREATE TABLE platform_landing_sections (
    id VARCHAR(36) PRIMARY KEY,
    section_key VARCHAR(64) UNIQUE NOT NULL, -- e.g., 'hero', 'features', 'pricing'
    locale VARCHAR(10) NOT NULL DEFAULT 'en',
    title VARCHAR(255) NULL,
    subtitle TEXT NULL,
    content_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- structured cards, matrices, buttons
    sort_order INT NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3. `system_broadcasts`

```sql
CREATE TABLE system_broadcasts (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NULL,
    is_dismissible BOOLEAN NOT NULL DEFAULT TRUE,
    target_scope VARCHAR(64) NOT NULL DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(36) NULL
);
```

---

## 5. Security & Access Control

1. **Role-Based Isolation**: Access to `/admin` and platform settings APIs is strictly confined to the `SuperAdmin` role. Tenant admins are barred from querying or mutating platform master entities.
2. **Audit Logging**: Every mutation in `platform_master_settings`, landing sections, or broadcast banners produces an immutable record in `platform_audit_logs`.
3. **Data Sanitization**: All content entered into CMS inputs is sanitized against XSS attacks before persistence and sanitized again upon rendering.
