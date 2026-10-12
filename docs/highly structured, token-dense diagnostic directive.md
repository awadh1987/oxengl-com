# Role & System Audit Mandate
Act as our Principal Full-Stack SRE and Enterprise System Auditor. Dig deep into the entire repository codebase structure to perform a strict layout and data-mapping reconciliation pass.

# Core Verification Tasks

## Task 1: Backend to UI/UX Functional Matching Audit
1. Locate all active backend REST API modules (`backend/app/api/v1/`) and WebSocket telemetry stream loops (`backend/app/services/fleet_service.py`).
2. Intersect these endpoints against the asynchronous network `fetch` hooks and socket initialization variables mapped inside our React client layouts (`frontend/src/views/` and `frontend/src/components/`).
3. Verify that the JSON payload properties, data types, and cryptographic context headers (`X-Tenant-ID`, `X-Role`, `Authorization`) match exactly across both code surfaces to ensure zero communication mismatches.

## Task 2: Backend to UI/UX Structural Layout Mapping
1. Audit the central database model data fields (`backend/app/domains/` and `backend/models.py`) for our core functional modules:
   - SaaS Billing / Quota counters (`subscription_plans`, `tenant_subscriptions`)
   - HRMS & Biometric Ledgers (`employees`, `attendance_logs`, `payroll_runs`)
   - Advanced Phase 4 Transport manifests (`delivery_manifests`, `manifest_stops`, `iot_telemetry_events`)
2. Verify how these relational columns map onto the structural layout parameters of our primary dashboard components:
   - `DashboardView.tsx` (Least-squares regression trend variables)
   - `FleetMapView.tsx` (60 FPS HTML5 Canvas latitude/longitude coordinate parsing vectors)
   - `AiCopilotView.tsx` (Explainable AI JSON audit tracing blocks)
3. Ensure that our Arabic localization schema profile (`frontend/src/locales/ar.json`) successfully captures and translates every data variable layout label rendered in the UI.

# Execution Checks & Deliverables
- Run a clean client bundle sequence to verify absolute type stability: `cd frontend && npm run build`
- Run our master directory path gatekeeper tool to prove layout parameters match spec limits perfectly: `python3 scripts/migration_sanity_check.py`

Print a detailed, itemized compliance matrix report flagging any mismatched fields or confirming 100% full-stack architectural alignment.

# Role & Context
You are an expert Site Reliability Engineer (SRE) and Deployment Automation Agent. You are tasked with deploying the compiled frontend production asset bundle and verifying backend system alignment for OxenGL Enterprise.

# Execution Objective
Execute the production deployment sequence to push the final client distribution bundle to the live environment with zero downtime, ensuring schema validity and asset integrity.

# Step-by-Step Instructions

1. **Environmental Verification**
   - Confirm that the git status is clean and the release commit (`./scripts/commit_release.sh`) has run successfully.
   - Verify that `frontend/src/locales/ar.json` is bundled and present.

2. **Execute Deployment Script**
   - Run the primary production deployment script using the following command:
     `./scripts/deploy_production.sh --bundle=final-client-dist --verify-schemas`

3. **Pipeline Monitoring & Verification**
   - **Asset Sync:** Confirm all optimized chunks and static assets successfully upload to the production edge network/CDN.
   - **Schema Sanity:** Ensure backend migration scripts return a successful status code with 0 pending schema updates.
   - **Rolling Restart:** Monitor the zero-downtime rolling restart of the backend REST workers and high-frequency WebSocket streams (`/api/v1/logistics/ws/fleet-stream`).

4. **Post-Deployment Health Check**
   - Execute a quick curl smoke test against `/api/v1/ai/forecasting/inventory` to ensure the API responds with a `200 OK`.

# Output Requirements
Provide a real-time log stream snippet of the deployment process, followed by a final status report containing:
- [ ] Deployment Status (SUCCESS/FAILED)
- [ ] Active Production Version/Commit Hash
- [ ] Verification checklist of live WebSocket handshakes and API endpoints
