# OxenGL ERP Platform: Frontend Overhaul - Phase 4 & Full Assembly Spec

**Role:** Senior Product Designer and Frontend Engineer specializing in enterprise UI overhauls.  
**Objective:** Build, verify, and deliver the complete, production-ready, standalone, responsive HTML/CSS/JS frontend for the **OxenGL ERP** platform (`oxengl.me` / `oxengl.com`).

---

## Core Architecture & Design Specifications

### 1. Omnipresent Dark Theme Token System
* **Canvas Void (`--bg-void`):** `#06080d` (Root background)
* **Canvas Primary (`--bg-primary`):** `#0b0f17` (Window frames, headers)
* **Surface Elevated (`--bg-surface`):** `#111827` (Cards, panels)
* **Primary Brand (`--color-primary`):** `#f97316` (Action buttons, primary focus rings)
* **Success Emerald (`--color-success`):** `#10b981` (ZATCA clearance, sync status)
* **Typography:** Inter (Sans) and JetBrains Mono (Telemetry/Code).

### 2. Dynamic Hover Illumination (Cursor Spotlight Engine)
* Uses mouse coordinates (`--mouse-x`, `--mouse-y`) updated via JavaScript `mousemove` events on the root stage.
* Renders a soft radial gradient spotlight (`rgba(249, 115, 22, 0.07)`) and reactive borders across window components.

### 3. Resizable Workspace Architecture
* Interactive multi-window desktop stage containing:
  * **Window 1:** GL-Voucher & ZATCA Phase 2 Cryptographic Validation Engine.
  * **Window 2:** Ubuntu 24.04 LTS & PostgreSQL 16 Telemetry Radar.
  * **Window 3:** Weighbridge & Quarry Manifest Logistics Dispatch Table.
* Features window dragging, 8-axis resizing, z-index elevation on click, and minimization/maximization toggles.

### 4. Full Page Section Rhythm
* **System Bar & Sticky Navigation:** Cluster health radar, domain switch (`oxengl.me` vs `oxengl.com`), tenant portal trigger.
* **Interactive Hero Stage:** Multi-window ERP workspace preview.
* **Infrastructure Proof Ribbon:** Real-time query latency (0.42 ms), memory allocation, and clearance speeds.
* **Interactive Workflow Matrix:** Tabbed operational modules with live FastAPI endpoint code previews.
* **Transparent Deployment Pricing:** Growth, Enterprise Syndicate, and Sovereign Dedicated tiers.
* **Conversion & Provisioning Terminal:** Instant namespace reservation (`.oxengl.me`).
* **Comprehensive Footer:** ISO 27001, ZATCA, NDMO compliance links, and repository attribution.
