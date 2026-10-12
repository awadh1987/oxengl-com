# Clean Commit, Pull, and Rebuild Protocol

Task: Clean up the workspace, commit all uncommitted changes to main, sync from the root directory, and perform a complete container rebuild.

## Instructions:

1. **Verify Root Directory:**
   - Execute all commands strictly from the repository root: `/home/ahmed_awadh/oxen-gl/Oxen-gl`.

2. **Stage and Commit Uncommitted Changes:**
   - Run `git status` to inspect modified or untracked files.
   - Run `git add .` to stage all changes.
   - Run `git commit -m "Preserve all uncommitted workspace and dynamic form changes"` to commit them cleanly to `main`.
   - Run `git push origin main` to back them up remotely.

3. **Pull and Sync Repository:**
   - Run `git pull origin main` to ensure the local repository is completely synchronized.

4. **Clean Frontend Build:**
   - Navigate to the frontend directory (`cd frontend`).
   - Run `npm run build` to verify the production bundle compiles successfully.

5. **Rebuild & Restart Containers from Root:**
   - Return to the root directory (`cd /home/ahmed_awadh/oxen-gl/Oxen-gl`).
   - Run `podman compose down` to cleanly stop existing containers without destroying persistent database volumes.
   - Run `podman compose build backend frontend` to rebuild images from the proper root context.
   - Run `podman compose up -d` to start the stack.
   - Verify container health via `curl -s localhost:8000/health`.