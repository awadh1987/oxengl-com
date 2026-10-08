# OxenGL Workspace Consolidation & De-duplication Plan
**Target Role:** DevSecOps Architect and Principal Software Engineer
**Objective:** Merge all redundant, duplicate, and scattered files across `/root/oxen-gl` and `/root/Oxen-gl` into a single, clean, production-ready directory structure named `oxengl`. Eliminate case-sensitivity path issues, consolidate competing python virtual environments, and preserve all custom domain logic.

## Step 1: Prepare the Root Architecture
1. Ensure a clean directory root layout exists at `/root/oxen-gl_clean/` with distinct directories:
   - `backend/app/`
   - `frontend/src/`
   - `docs/`
   - `infrastructure/`

## Step 2: Merge the Backend Components safely
1. Locate the authoritative `main.py` asset. Consolidate its custom endpoints (such as the recent WebSocket `/api/v1/tracking/ws/fleet-stream` and health loops) into a clean, un-duplicated `backend/app/main.py`.
2. Move all core modules (`iam`, `finance`, `procurement`, `inventory`, `logistics`) under the shared `backend/app/domains/` boundary directory. 
3. If duplicate files exist across directories, evaluate their contents and keep the version that is most functionally complete. Do not delete unique domain logic or seed scripts (`bootstrap_seed.sql`).
4. Consolidate `requirements.txt` to contain all enterprise validation dependencies (`email-validator`, `websockets`, etc.).

## Step 3: Consolidate the Frontend Assets
1. Move the React/Vite/Next codebase safely into `frontend/`.
2. Ensure the recently generated components (`FleetTracker.tsx` and the unified `FleetMaintenanceView.tsx`) are neatly mapped to `frontend/src/views/` or `frontend/src/components/`.
3. Consolidate type structures into `frontend/src/types.ts` without losing node path metadata profiles.
4. Clean up and delete any artificial structural symbolic links (like `/root/oxen-gl/web`). Ensure `vite.config.ts` proxies incoming API requests correctly to `http://localhost:8000`.

## Step 4: Environment Unification & Verification
1. Delete all separate competing virtual environment paths (`/root/oxen-gl/venv` and `.venv`).
2. Build exactly one clean python environment inside `backend/.venv`. Activate it and run a comprehensive dependency setup using `pip install -r requirements.txt`.
3. Update the tracking configurations inside the background service daemon descriptor (`oxengl.service`) to accurately reference your unified paths.
4. Run `npm install` and execute a production build sequence (`npm run build`) in the new `frontend/` directory to guarantee zero typescript breakage.

## Step 5: Final Swapping
1. Once compilation succeeds without warning or path exceptions, gracefully swap the temporary workspace `/root/oxen-gl_clean/` to become your permanent, un-duplicated master directory root.

After you have completely executed the file consolidation and before you mark the cleanup task as done, open the terminal and execute the verification framework utility by running:
`python3 scripts/migration_sanity_check.py`

If the framework throws any CRITICAL errors, track down the misplaced domain files, restore them to their correct home directories within `backend/` or `frontend/`, and run the script again until it reports a complete green success status.

