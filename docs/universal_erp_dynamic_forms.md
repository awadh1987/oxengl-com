# Universal ERP Dynamic Forms & Metadata Pipeline Blueprint

Task: Extend the dynamic form schema ingestion, intelligent Excel custom column parsing, and metadata-driven UI rendering to the remaining OxenGL ERP workspaces: Procurement & S2P, Inventory & Valuation, and Human Resources.

## Instructions:

1. **Backend Database & Model Extensions (`models.py`, `schemas.py`):**
   - Add `custom_attributes` JSONB columns to the remaining domain models:
     - **Procurement & S2P:** Purchase Orders, Requisitions, Supplier Contracts.
     - **Inventory & Valuation:** Inventory Items, Warehouse Lots, Stock Adjustments.
     - **Human Resources:** Employee Master Records, Contracts, Payroll Allowances.
   - Update `custom_fields.py` entity aliases to include: `"purchase_order"`, `"procurement"`, `"inventory_item"`, `"stock_item"`, `"employee"`, `"hr_profile"`, `"payroll"`.

2. **Smart Excel Bulk Importers:**
   - Create or update specialized bulk import services for Procurement, Inventory, and HR documents.
   - Ensure unrecognised or custom spreadsheet column headers are captured into `custom_attributes` and auto-registered as custom field definitions via `register_discovered_fields`.
   - Mount their respective bulk import endpoints under `/api/v1/procurement/...`, `/api/v1/inventory/...`, and `/api/v1/hr/...`.

3. **API & Schema Support:**
   - Ensure Pydantic schemas and endpoints for Procurement, Inventory, and HR accept, persist, and return `custom_attributes`.

4. **Frontend Dynamic Form Integration (`DynamicFieldRenderer.tsx`):**
   - Extend `DynamicFieldRenderer` entity types to support `'purchase_order'`, `'inventory_item'`, and `'employee'`.
   - Integrate `<DynamicFieldRenderer>` into the creation and edit modals across Procurement views, Inventory registries, and HR onboarding/profile panels.

5. **Build, Test & Deploy:**
   - Run `npm run build` in the frontend directory.
   - Create a new Alembic migration script for the new JSONB columns.
   - Rebuild and restart the Podman containers (`podman compose build backend frontend && podman compose up -d --no-deps backend frontend`).
   - Stage, commit, and push the changes to `main`, and report back.
   