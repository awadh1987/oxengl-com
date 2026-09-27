# Phase 7: Enterprise Organizational Management (SAP-Style Profiles)

## Strategic Objective
Transform the flat `res_companies` structure into a deep, SAP-style organizational hierarchy. This allows enterprise tenants to model complex internal structures, which is a prerequisite for advanced procurement tendering and localized SaaS billing.

## Architectural Requirements
*   **Company Codes (Legal Entities):** The top-level billing entities within the tenant workspace.
*   **Plant/Branches:** Physical locations or distinct operational branches linked to a Company Code.
*   **Purchasing Organizations:** Entities responsible for procurement and tendering negotiations.
*   **Cost Centers:** Financial tracking buckets for operational expenses.

---

## Agent Execution Plan

### Step 1: Schema Expansion & Database Migrations
**Target:** `backend/models.py` and new Alembic migration.
**Tasks:**
1. Add a self-referential `parent_id` foreign key to `res_companies` to allow infinite nesting (e.g., Parent Group -> Subsidiary).
2. Create new SQLAlchemy models for `CostCenter` and `PurchasingOrganization`.
3. Generate and apply the Alembic migration. Ensure safe defaults so existing data is not corrupted.

### Step 2: Backend API Endpoints & RBAC Validation
**Target:** `backend/app/api/routers/organization.py` (New File)
**Tasks:**
1. Create CRUD endpoints for the new hierarchical models.
2. Ensure the `TenantContext` middleware properly validates that users can only access Branches and Cost Centers assigned to their specific User Role within the overarching Tenant Workspace.
3. Write a pytest script to verify cross-branch isolation.

### Step 3: Frontend Organizational Chart (UI/UX)
**Target:** `frontend/src/views/settings/OrganizationProfile.tsx`
**Tasks:**
1. Build an interactive tree-view UI allowing the Super Admin to visualize and manage their SAP-style organizational structure.
2. Implement forms to add new Cost Centers and Purchasing Orgs under specific branches.
