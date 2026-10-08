# Phase 8: RFP-Ready Corporate CV (UNOPS Standard)

## Strategic Objective
Automate the generation of a UNOPS-style Corporate Profile (CV) by aggregating live operational data, financial standing, and verified attachments into a unified, compliant PDF package for rapid tender bidding.

## Architectural Requirements
*   **Aggregation Engine:** A backend service that compiles completed projects, fleet capacity, active manpower, and financial tiering directly from operational modules.
*   **Document Vault:** A secure storage relation for verified commercial registrations, ZATCA tax certificates, and ISO compliance documents.
*   **PDF Rendering:** A service (e.g., ReportLab, WeasyPrint, or headless Puppeteer) to map the JSON payload into a strict, highly structured enterprise template.

---

## Agent Execution Plan

### Step 1: Corporate Vault Schema
**Target:** `backend/models.py`
**Tasks:**
1. Create a `TenantDocument` model linked to `res_companies` to store references to S3/local file paths for legal attachments (Trade License, Tax ID, Certifications).
2. Add metadata columns for document expiration dates and verification status to ensure RFP compliance.

### Step 2: The Aggregation API
**Target:** `backend/app/api/routers/corporate_cv.py` (New File)
**Tasks:**
1. Build a `GET /api/v1/corporate/cv-payload` endpoint.
2. Query and aggregate cross-module data: total executed projects, current fleet/asset count, permanent employee headcount, and active operating regions based on the user's `company_id`.

### Step 3: PDF Generation Engine
**Target:** `backend/app/services/pdf_generator.py` (New File)
**Tasks:**
1. Implement a rendering engine that accepts the aggregated JSON payload and injects it into a predefined HTML/CSS template modeled on the UNOPS vendor profile standard.
2. Stitch the generated PDF profile together with the verified `TenantDocument` attachments into a single, downloadable PDF portfolio.
