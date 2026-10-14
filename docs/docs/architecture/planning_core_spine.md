# OxenGL Next-Gen Architecture: The Planning-First Core Spine

## 1. Core Philosophy: The Genesis Engine

In OxenGL, no transaction exists in a vacuum. The **Planning Department** acts as the Genesis Engine. Every entity—financial ledgers, IoT telemetry, warehouse stock picks, logistics GPS routing, HR payroll allocations, and UN relief distributions—permanently anchors to a parent project. This creates an unbroken, cryptographically verifiable audit trail from initial project charter to final delivery.

## 2. Expanded Polymorphic Project Taxonomy

OxenGL supports dynamic, schema-less project classifications engineered for global enterprise and crisis-zone resilience:

* **Logistics & Freight:** Multi-modal transport, container freight stations, heavy haulage, and cross-border customs clearing.
* **Supply Chain & Procurement:** Construction materials (cement, steel, aggregates tailored for GCC mega-projects), food/NFI rations, and fuel/energy distribution.
* **Humanitarian & NGO Relief (WFP, WHO, UNICEF):** Donor-funded emergency operations requiring strict beneficiary tracking, cluster reporting, and last-mile immutable audit trails.
* **EPC Construction & Infrastructure:** Long-cycle engineering projects with hierarchical Work Breakdown Structures (WBS), sub-contractor ledgers, and retention guarantees.
* **Oil & Gas Field Services:** Upstream/downstream rig provisioning, hazardous material handling, and regulatory safety compliance (ideal for entities like Alwehda Alarabia Oil Services).
* **Commercial & Agribusiness:** Crop cycle management, BOM-driven manufacturing, and cold-chain warehousing (ideal for entities like Myon Economic Co Ltd).

## 3. Next-Generation SaaS Differentiators

To compete at the top tier globally, OxenGL's project core integrates these advanced paradigms:

* **Infinite Hierarchies (WBS):** Projects can have unlimited sub-projects (Phases -> Tasks -> Deliverables) using PostgreSQL `ltree` or self-referential UUIDs, allowing granular P&L roll-ups.
* **IoT & Telematics Ready:** Native support for live GPS, temperature (cold-chain), and fuel sensor webhooks bound directly to active project execution states.
* **ESG & Carbon Accounting:** Automated calculation of Scope 1, 2, and 3 carbon emissions per project based on logistics mileage and material procurement.
* **AI-Predictive Data Lakes:** Heavy utilization of `JSONB` for metadata, allowing future ML models to predict budget overruns, supply chain bottlenecks, and optimum routing without schema migrations.

## 4. Master Project Schema (`core_projects`)

The foundational nexus for all operational modules:
* `id` (UUID, Primary Key)
* `tenant_id` / `company_id` (UUID, Multi-tenant RLS boundaries)
* `parent_project_id` (UUID, Nullable self-reference for Sub-Projects / WBS)
* `project_code` (String, Auto-generated strict sequential serial, e.g., `PRJ-WFP-2026-001`)
* `project_type` (Enum/String: `logistics`, `humanitarian_supply`, `epc`, `oil_gas`, etc.)
* `client_id` (UUID, FK to `res_partner` - UN agencies, GCC contractors, commercial buyers)
* `beneficiary_id` (UUID, Optional FK: End recipient, IDP camp, or specific facility)
* `status` (String: Draft, Planning, Active Execution, Suspended, Completed, Closed, Audited)
* `financial_envelope` (Numeric: Hard budget limits, automatically validated against committed POs)
* `metadata_json` (JSONB: Schema-less storage for custom dynamic form fields)
* `telemetry_data` (JSONB: Live IoT sensor states, latest GPS pings)
* `esg_metrics` (JSONB: Running carbon footprint and compliance tracking)

## 5. Downstream Module Integration (The Nervous System)

Every core transactional engine mandates a `project_id` foreign key:
* **Finance & GL (`account_move_line`):** Zero-reconciliation project accounting. Every journal item updates real-time project profitability.
* **Inventory & Supply Chain (`stock_picking`, `purchase_orders`):** Stock reservations are ring-fenced per project.
* **Logistics & Fleet (`logistics_trips`):** Trip costs, fuel consumption, and driver hours roll up to the project's financial envelope.
* **HR & Payroll (`hr_timesheets`):** Labor costs dynamically allocate to the project budget.

## 6. Security & Frontend Mandates

- **Zero-Trust RLS:** `core_projects` must enforce strict PostgreSQL Row-Level Security (`USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`).
* **WebSockets / Live Telemetry:** The frontend Command Hub must utilize WebSockets or Server-Sent Events (SSE) to reflect real-time trip GPS and financial updates.
* **Design System:** All UIs must adhere to the OxenGL Tailwind Dark Mode standard (`bg-white dark:bg-[#1e1e2d]`), featuring responsive telemetry grids and command-center aesthetics.
