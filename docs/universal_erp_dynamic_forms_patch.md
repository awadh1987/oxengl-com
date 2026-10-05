# Universal ERP Dynamic Forms - Complete Coverage Patch

Task: Fix remaining gaps by rolling out `custom_attributes` and `<DynamicFieldRenderer>` integration for Supplier Contracts, Stock Adjustments, Payroll Allowances, Purchase Requisitions, and the HRMS Profile Panel.

## Instructions:

1. **Backend Database & Model Extensions (`models.py`, `schemas.py`, Migrations):**
   - Ensure `custom_attributes` JSONB columns exist on Supplier Contracts, Stock Adjustments, Payroll Allowances, and Purchase Requisitions.
   - Update backend Pydantic schemas and endpoints (`procurement.py`, `inventory.py`, `hr.py`) to accept, persist, and return `custom_attributes` for these sub-entities.

2. **Frontend UI Modal & Panel Integration:**
   - **Purchase Requisitions:** Wire `<DynamicFieldRenderer entity="purchase_order" ... />` into the requisition creation modal.
   - **Stock Adjustments:** Add dynamic field support to the stock movement/adjustment forms.
   - **HRMS Employee Profile Panel:** Integrate `<DynamicFieldRenderer entity="employee" ... />` directly into the comprehensive employee profile & edit panels.
   - **Supplier Contracts:** Surface dynamic custom fields in contract management forms.

3. **Build, Test & Deploy:**
   - Run `npm run build` in the frontend directory.
   - Rebuild and restart Podman containers (`podman compose build backend frontend && podman compose up -d --no-deps backend frontend`).
   - Stage, commit, and push changes to `main`.