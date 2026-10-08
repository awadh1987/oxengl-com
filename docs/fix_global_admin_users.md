# Global Super-Admin User Visibility Blueprint

Task: Update the backend user listing endpoint (`GET /api/v1/users`) in `backend/app/api/v1/users.py` so that if the requesting user is a system super-admin, it bypasses company/organization scoping and returns all users across all workspaces and companies.

## Instructions:

1. **Update User Listing Query (`backend/app/api/v1/users.py`):**
   - Locate the `list_users` (or equivalent) endpoint.
   - Check if the current actor/user has super-admin or global administrative privileges (e.g., `actor.is_superuser` or role check).
   - If they are a super-admin, omit the strict company or organization tree filter entirely so that the query returns *all* user records in the database (`ResUser`).
   - If they are a standard workspace admin, keep the organization tree scope intact.

2. **Rebuild & Restart Containers from Root:**
   - Run the build and restart strictly from `/home/ahmed_awadh/oxen-gl/Oxen-gl`:
     ```bash
     cd /home/ahmed_awadh/oxen-gl/Oxen-gl
     frontend && npm run build
     podman compose build backend frontend
     podman compose up -d --no-deps backend frontend
     ```

3. **Commit & Push:**
   - Stage, commit, and push the changes to `main`.