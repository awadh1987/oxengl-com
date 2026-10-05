Task: Fix token signature errors, populate tenant users in Master Data, and roll out Bulk/Dynamic Import buttons to all remaining module headers.

Instructions:
1. **Fix Token Signature & Auth Validation:**
   - Investigate backend token verification middleware (in `backend/app/core/auth.py` or JWT handling modules) where "Invalid token signature" is emitted. Ensure session token decoding correctly handles tenant-scoped tokens without throwing false-positive signature errors.
2. **Fix Users Matrix Query (`/settings/master-data`):**
   - Check the user management endpoint powering the Users, Roles & Permissions Matrix. Ensure it queries users matching the active tenant/company ID (`company_id`) and auto-seeds the current session owner if no users exist so the table is never empty.
3. **Roll Out Bulk/Dynamic Import Triggers:**
   - Update the `ActionsMenu` or toolbar component across Inventory, Planning, Material/Service Suppliers, Fleet Maintenance, and Financial Reports to include the **"Bulk Import (.xlsx)"** action option that opens the Legacy Data Bridge import modal.
4. **Build, Test & Deploy:**
   - Run `npm run build` in frontend.
   - Rebuild and restart Podman containers (`podman compose build backend frontend && podman compose up -d --no-deps backend frontend`).
   - Stage, commit, and push changes to `main`.