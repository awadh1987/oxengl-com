# Dynamic Form Pipeline & JSONB Schema Blueprint

Task: Implement dynamic form schema ingestion and JSONB metadata-driven UI rendering across OxenGL engines.

## Instructions:

1. **Backend JSONB & Schema Ingestion:**
   - Update core SQLAlchemy models (`ResPartner`, `MaterialSupplier`, `ServiceSupplier`, `OperationsTrip`, etc.) to include a `custom_attributes` JSONB column if not already present.
   - Update the Legacy Data Bridge import service in the backend so that any unrecognized columns in uploaded Excel sheets are automatically captured and stored inside the entity's `custom_attributes` JSONB dictionary instead of being dropped or throwing validation errors.

2. **Schema Metadata API:**
   - Create or update an API endpoint (e.g., `/api/v1/tenant/form-schemas` or `/api/v1/metadata/custom-fields`) that allows tenants to inspect, register, and configure custom field definitions (field key, label, data type, target entity, UI visibility).

3. **Frontend Dynamic Form Renderer:**
   - Create a reusable React component (`DynamicFieldRenderer.tsx`) that fetches the tenant's dynamic form schema for a given entity.
   - Integrate `<DynamicFieldRenderer>` into the universal modals (`DailyOperationsModal`, `EntityCRUDModal`, customer/supplier forms) so that any custom fields injected via Excel or configured via Design Studio automatically appear in the forms across workspaces.

4. **Build & Verify:**
   - Run `npm run build` in the `frontend` directory.
   - Execute focused backend tests, rebuild and restart the backend and frontend containers via Podman, and verify zero regressions.

5. **Finalize:**
   - Stage, commit, and push the changes to `main`, and report back.
   