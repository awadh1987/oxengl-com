# Global Platform & Tenant Bulk Operations Specification

## 1. Overview
This specification standardizes multi-record select and bulk action capabilities across both the **Platform Admin Console** (`/admin/*`) and all individual **Tenant Workspaces** (`/tenant/*`).

## 2. Core Components
- **Frontend Hook (`useBulkSelection.ts`)**: Manages individual checkbox states, "Select All" toggles, and ID tracking arrays.
- **Floating Action Bar (`BulkActionBar.tsx`)**: Context-aware bottom bar displaying selected item counts and trigger buttons (e.g., Export, Delete, Status Update).
- **Backend Bulk Router (`/api/v1/bulk/*`)**: Accepts UUID arrays and performs atomic multi-record updates/deletes wrapped in safe transaction rollback scopes.

## 3. Standardization Rules
1. Every table grid in the platform must include a master checkbox in the header and row-level checkboxes synchronized with `useBulkSelection`.
2. Bulk actions must validate payload lengths and require explicit confirmation modals for destructive operations (e.g., batch deletions or license revocations).
3. Session rollback handling must be enforced on backend bulk transactions to prevent connection poisoning.
