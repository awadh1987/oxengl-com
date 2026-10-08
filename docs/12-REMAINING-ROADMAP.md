# OxenGL: Remaining Commercial Roadmap

## Phase 9: Neo-Classic UI/UX Integration
**Objective:** Blend the high-density data grids of classic ERPs (e.g., Onyx) with modern web components to serve veteran accountants and logistics managers.
* **Design System:** Retain dark mode themes but drastically tighten padding and margins. Maximize vertical screen real estate to support 50+ rows of data per view without scrolling.
* **Iconography:** Replace overly minimalist icons with easily recognizable, color-coded classic enterprise iconography to reduce cognitive load and leverage user muscle memory.

## Phase 10: Procurement Tendering & Vendor Portals [COMPLETED]
**Objective:** Build a competitive eSourcing engine linked directly to Phase 7's SAP-Style Purchasing Organizations.
* **Vendor Portal:** Created a restricted, secure external interface (`/vendor-portal`, [VendorPortalView.tsx](file:///root/oxen-gl/frontend/src/views/VendorPortalView.tsx)) utilizing two-tier authentication architecture (`vendor_portal_users`).
* **Tendering (eSourcing):** Implemented an encrypted Request for Quotation (RFQ) generator allowing external suppliers to submit sealed bids (`SHA-256` sealed envelopes) directly against active tenant tenders.
* **Ceremony & Awarding:** Created the official unsealing ceremony (`POST /api/v1/procurement/tenders/{id}/unseal`) with automated ranking and award PO generation (`POST /api/v1/procurement/tenders/{id}/award`).
* **Test Verification:** [test_phase10_procurement_tendering.py](file:///root/oxen-gl/backend/tests/procurement/test_phase10_procurement_tendering.py) 100% passing (4/4 tests).

## Phase 11: Subscriptions & Global Payment Gateways
**Objective:** Automate SaaS billing and enforce PCI-DSS compliance using MENA-focused enterprise gateways (e.g., PayTabs, Tap Payments).
* **Architecture:** Offload credit card tokenization to the gateway's frontend SDK. The backend must never touch raw card numbers.
* **Webhooks:** Build asynchronous webhook listeners to automatically update a tenant's `subscription_tier` in PostgreSQL based on payment events.
