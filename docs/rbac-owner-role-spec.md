# RBAC Overhaul: Tenant Owner Role Implementation

## Phase 1: Backend Database & Model Schema Update
**Objective:** Expand the platform's role hierarchy to explicitly include `OWNER`.
*   **Target Files:** `backend/app/models/user.py` (or equivalent models file) and database enums.
*   **Implementation:** 
    *   Update the user role Enum to include `OWNER` alongside `USER`, `ADMIN`, and `SUPER_ADMIN`.
    *   Ensure the database schema reflects this new enum value (requires an Alembic migration or raw SQL ALTER TYPE execution to add 'OWNER' to the enum if using PostgreSQL ENUMs).

## Phase 2: Security Middleware & Dependency Fixes
**Objective:** Grant the `OWNER` role supreme authority over their tenant partition and fix the `/api/v1/users` isolation block.
*   **Target Files:** `backend/app/api/dependencies.py`, `backend/app/api/routers/users.py`
*   **Implementation:**
    *   Update role-checking dependencies (e.g., `require_role`, `get_current_active_user`) to recognize `OWNER` as the highest tenant-level authority, granting them all `ADMIN` privileges automatically.
    *   Update the `GET /api/v1/users` route: If the requester is an `OWNER` or `ADMIN`, allow them to fetch all users *where the user's `company_id` matches the requester's `company_id`*. 
    *   Ensure the dynamic tenant isolation middleware explicitly permits `OWNER` to query their own tenant's user directory without throwing a 403.

## Phase 3: Frontend State & UI Rebranding
**Objective:** Reflect the new role in the frontend application and unlock Owner-specific UI features.
*   **Target Files:** `frontend/src/types/auth.ts`, `frontend/src/components/layout/TopHeader.tsx` (or similar).
*   **Implementation:**
    *   Add `OWNER` to the frontend Role types.
    *   Update the Top Header profile display logic. If the user's role is `OWNER`, display a distinct "Tenant Owner" badge (perhaps in a gold or distinct brand color) instead of the generic "Admin / CEO".