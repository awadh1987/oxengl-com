# Fix and Apply Missing User Sync Migration

Task: Move the unapplied user sync migration into the active Alembic versions directory, run the database migration, and restart the backend.

## Instructions:

1. **Move the Missing Migration File:**
   - Locate `backend/backend/alembic/versions/add_sync_reference_id_to_res_users.py`.
   - Move/copy it into the active migrations directory: `backend/alembic/versions/`.
   - (Optional) Discard or delete the unwanted Clerk migration file if it conflicts with native auth, but ensure `add_sync_reference_id_to_res_users.py` is safely in `backend/alembic/versions/`.

2. **Run Database Migration:**
   - Execute the Alembic upgrade command inside the backend container or environment to apply the migration to PostgreSQL:
     `podman exec -it oxengl_backend_container alembic upgrade head`

3. **Clean Up Stray Folder & Commit:**
   - Delete the stray `backend/backend/` directory entirely (`rm -rf backend/backend`).
   - Stage, commit, and push the migration file to `main`.

4. **Restart Stack:**
   - Restart the containers to ensure the database schema changes are fully live.