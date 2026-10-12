# Hide Global Super-Admin from Tenant User Lists

Task: Update the user listing endpoint (`GET /api/v1/users`) in `backend/app/api/v1/users.py` so that when a request comes from a specific corporate tenant/company workspace (rather than a global super-admin context), it filters out system super-admins (`is_superuser == True` or `role == "Super Admin"`).

## Instructions:

1. **Modify User Query (`backend/app/api/v1/users.py`):**
   - Inspect the `list_users` endpoint.
   - If the request is scoped to a specific company/tenant workspace and the caller is *not* viewing from the global root plane, append a filter to exclude global super-admins: `.filter(ResUser.is_superuser.is_(False))` (or equivalent super-admin boolean/role check).
   - This ensures `superadmin@oxengl.com` never shows up inside tenant matrices like `myon-contract` or `wac-ye`.

2. **Rebuild & Restart Containers:**
   - Run the build and container restart strictly from `/home/ahmed_awadh/oxen-gl/Oxen-gl`:
     ```bash
     cd /home/ahmed_awadh/oxen-gl/Oxen-gl
     cd frontend && npm run build
     cd ..
     podman compose build backend frontend
     podman compose up -d --no-deps backend frontend
     ```

3. **Commit & Push:**
   - Stage, commit, and push the changes to `main`.