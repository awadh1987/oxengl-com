# Fix Invited Users in Users Matrix Blueprint

Task: Update the backend user listing endpoint powering `/settings/master-data` to include pending workspace invitations alongside active users, and update the frontend table to display their status clearly.

## Instructions:

1. **Backend Integration (Combining Active Users & Pending Invites):**
   - Locate the API endpoint that fetches users for the workspace (e.g., in `backend/app/api/v1/users.py`, `backend/app/domains/iam/router.py`, or tenant management routes).
   - Query the tenant's invitation table (e.g., `tenant_invites`, `invitations`, or equivalent) matching the active `company_id` / `tenant_id`.
   - Map pending invitations into the user response schema so they are returned in the user list, setting fields like `role = "Invited / Pending"`, `is_active = false`, or a custom status flag.

2. **Frontend Table Status Badge (`MasterDataView.tsx` or User Matrix):**
   - Update the user matrix table UI to check if a user is pending/invited (e.g., checking `user.status === 'pending'` or `is_active === false`).
   - Render a distinct badge (e.g., yellow/orange "Pending Acceptance" tag) in the role or actions column so you can see who has been invited to `myon-contract` or `wac-ye`.

3. **Build, Test & Deploy:**
   - Run `npm run build` in the frontend directory.
   - Rebuild and restart Podman containers (`podman compose build backend frontend && podman compose up -d --no-deps backend frontend`).
   - Stage, commit, and push changes to `main`.