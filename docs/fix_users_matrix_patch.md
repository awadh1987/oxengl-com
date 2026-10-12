Task: Fix the empty Users Matrix table in Master Data (`/settings/master-data`) where it displays "No users match the active query".

Instructions:
1. **Locate the Users Matrix API Endpoint:**
   - Search backend routers (e.g., `backend/app/api/v1/users.py`, `backend/app/domains/iam/router.py`, or tenant user management endpoints) to find the exact route that fetches the user list for the permissions matrix.
2. **Fix the Query & Add Auto-Seeding Fallback:**
   - Ensure the query correctly filters by the active tenant/company ID (`company_id` / `tenant_id`), or loosens the match if user records use global tenant ownership.
   - Implement an auto-seeding fallback: If the database query returns an empty list (`[]`), dynamically append and return the currently authenticated session user (`current_user`) so the table always displays the active admin/owner.
3. **Build, Test & Deploy:**
   - Run `npm run build` in the frontend directory.
   - Rebuild and restart Podman containers (`podman compose build backend frontend && podman compose up -d --no-deps backend frontend`).
   - Stage, commit, and push the changes to `main`.