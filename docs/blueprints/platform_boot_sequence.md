# OxenGL Phase 1 Platform Deployment & Boot Sequence Spec
**Target Role:** Lead DevSecOps Engineer, Site Reliability Engineer (SRE), Platform Admin
**Objective:** Orchestrate the concurrent initialization of the multi-process container mesh, automate database readiness verification loops, seed structural ledgers, and map log streams cleanly.

---

## 1. PRE-FLIGHT READINESS CONFIGURATION
Before executing the boot script, verify that your active backend configuration profiles (`backend/.env`) are synchronized with the enterprise parameters established in the master specs:

```ini
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://postgres:CHANGE_ME_SECRET_KEY@localhost:5432/erp_db
REDIS_URL=redis://localhost:6379/0
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
```

---

## 2. PORT ALIGNMENT & SERVICE MESH MAP
The orchestration engine will claim the following system networking interface binds. Ensure no conflicting background daemons are active:
- **Port 5432**: PostgreSQL 16 DB Core Cluster Mesh
- **Port 6379**: Redis 7 Enterprise Cache & Idempotency Store
- **Port 8000**: Asynchronous FastAPI Web Application Backend Engine
- **Port 3000**: Next.js / Vite React User Portal Frontend Application Client

---

## 3. MASTER BOOT SYSTEM RUNNER (`run_oxengl.sh`)
The file script handles graceful signal trapping (`SIGINT`/`SIGTERM`), loops through database connection readiness checks, runs out-of-band `ltree` Chart of Accounts bootstrapping seeds, and tracks multi-process worker logs inside background thread frames.

### Verification Health Rules
- If the core database container fails to log an active `online` signal within the polling loop, the runner will block downstream executions to prevent backend framework initialization crashes.
- Terminating the main shell script window sessions will execute a cascade kill command capturing and closing all sub-process PIDs cleanly.

# Role & Instruction
Act as our Principal Site Reliability Engineer (SRE). Read and parse the launch specifications saved inside `docs/blueprints/platform_boot_sequence.md`.

# Execution Actions
1. Grant master execution permissions to our deployment launcher: `chmod +x run_oxengl.sh`.
2. Fire up the entire multi-container application mesh from the root directory: `./run_oxengl.sh`.
3. Monitor the runtime terminal loop logs. Confirm that:
   - PostgreSQL and Redis containers register a healthy, online status.
   - The 107-item hierarchical `ltree` financial ledger seeds completely into `erp_db`.
   - The async FastAPI engine (port 8000), Celery worker tasks queue, and Next.js portal (port 3000) initialize successfully.

Expose the verified runtime process metrics and final connection links.

