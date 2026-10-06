# OxenGL Codebase Diagnostic Audit

**Review date:** 2026-10-06  
**Mode:** Read-only static inspection. No code, configuration, or dependency files were changed; no dependencies were installed and no Git commands were run.  
**Coverage:** FastAPI entry points and APIs, LangGraph agent, SQLAlchemy/Alembic and RLS assets, React frontend wiring/authentication, migration worker, Docker/Compose/Nginx configurations, and the supplied technical scan. Findings below are limited to issues supported by repository evidence; they are not a substitute for dynamic integration, penetration, or database tests.

## [CRITICAL]

### C1. Agent routes use a hard-coded owner identity and do not authenticate or bind graph state to a tenant

- **Files:** `backend/app/agent/router.py:80-82,121-145,179-188,216-225,243-310`
- **Root cause:** `get_current_user_context()` always returns a literal user, tenant, and Owner role. Every agent endpoint depends on this stub rather than the platform's verified user/session dependency. The request controls `thread_id`, but the graph/Redis state lookup is keyed only by that ID and is not checked against an authenticated actor or tenant. The execute route's managerial-role check therefore always sees Owner; invalid/fake tenant IDs resolve to the first company at lines 95-103, and invalid user IDs can resolve to the first user at lines 106-114.
- **Impact:** An anonymous caller can create drafts and, if able to address a pending thread, pass the approval gate and cause tenant business writes. The selected company/user may be unrelated to the caller.
- **Remediation pattern:** Replace the stub with the platform's verified auth dependency and derive tenant/company from signed claims plus server-side membership. Reject absent or invalid identities rather than selecting a first-row fallback. Store and verify actor/company ownership with graph state and Redis records; authorize state reads, reject, and execute against that ownership. Require a separately verified managerial permission for approval.

### C2. AI query and forecast endpoints accept caller-selected tenant IDs without authenticating the caller

- **Files:** `backend/app/api/v1/ai.py:64-109,146-172`
- **Root cause:** The imported `get_current_user`/`ABACUserContext` are not dependencies of either route. `X-Tenant-ID` and `payload.tenant_id` are trusted directly; invalid/missing IDs fall back to the first company or a fixed UUID. The vector query then filters solely on that derived value.
- **Impact:** Anonymous callers can target another tenant's AI knowledge chunks and receive snippets in the response, or obtain forecast results for an unverified tenant. Tenant selection is an authorization decision, not request data.
- **Remediation pattern:** Require the native authenticated user context, derive tenant/company only from verified claims and authorized memberships, and scope every query with that context. Return 401/403 for missing or invalid context; remove first-company/fixed-UUID fallbacks. Add cross-tenant endpoint tests.

### C3. Super-admin operations, including destructive purge, have no authorization dependency

- **Files:** `backend/app/api/v1/super_admin.py:28,355-360,393-397,770-773,856-859,1111-1117,1145-1147,1167-1168,1291-1292`; `backend/app/main.py:515`
- **Root cause:** The router has no router-level dependency. Tenant listing/status update, purge, restore upload, logs, telemetry, and analytics routes shown here depend on a database session only. A `get_current_super_admin` dependency exists at lines 449-459 but is only attached to the overrides handler around lines 474-481. Main registers this router directly, without a global authentication middleware.
- **Impact:** Public requests can read cross-tenant control-plane information, alter tenant status, and invoke backup/tenant purge or restore workflows without a super-admin identity.
- **Remediation pattern:** Apply an authenticated super-admin dependency at router construction (`APIRouter(..., dependencies=[Depends(require_super_admin)])`) or to every protected endpoint. Keep public routes in a separate explicitly allow-listed router. Require re-authentication/step-up approval for purge and restore, and audit actor, client IP, target tenant, action, and outcome.

### C4. RLS protects only four control tables; tenant business tables have no policies in the supplied RLS script

- **Files:** `backend/schema_multi_tenant_rls.sql:132-194`; examples of other tenant models: `backend/models.py:55-56,1367-1368`, `backend/app/domains/hr/models.py:24-26,202-204`, `backend/app/domains/ai/models.py:32`
- **Root cause:** The script enables RLS and creates policies only for `tenant_users`, `tenant_settings`, `tenant_feature_flags`, and `tenant_domains`. It does not apply tenant policies to business tables such as `res_companies`, `purchase_orders`, `employees`, `payroll_runs`, `inventory_movements`, or `ai_knowledge_chunks`. The script's comments claim tenant-wide guarantees, but policy coverage does not match the ORM's tenant-facing schema.
- **Impact:** Any unscoped SQL path, including raw SQL and future routes/jobs, can read or write across tenants. Application-level filters alone are not a database-enforced boundary.
- **Remediation pattern:** Generate and review an explicit tenant-table inventory from SQLAlchemy metadata and Alembic state. Add `ENABLE` and `FORCE ROW LEVEL SECURITY` plus restrictive `USING`/`WITH CHECK` policies for every tenant table, with deliberate audited exceptions. Add tests that attempt cross-tenant reads/writes through the production DB role for each table and assert denial.

### C5. RLS master bypass is exposed through an unguarded `SECURITY DEFINER` function

- **File:** `backend/schema_multi_tenant_rls.sql:200-211`
- **Root cause:** `set_tenant_context(p_tenant_id, p_is_master)` accepts a caller-supplied master flag and sets `app.is_master_admin=true` when requested. It is `SECURITY DEFINER`, and the script does not revoke default `EXECUTE` permission from `PUBLIC` or grant it narrowly. The RLS policies trust that setting as an unconditional bypass at lines 150-194.
- **Impact:** A database role able to connect through the application credentials may invoke the function with `p_is_master=true` and bypass the RLS policies on the four covered tables.
- **Remediation pattern:** Do not let an untrusted caller set a privileged GUC. Revoke function execution from `PUBLIC` and application roles, and expose a narrowly privileged, audited mechanism whose master privilege is established server-side after verifying identity. Prefer non-`SECURITY DEFINER` context setup where possible; test the least-privileged production role explicitly.

### C6. SaaS Compose publishes database and Redis ports with known/default credentials

- **File:** `infrastructure/docker-compose.saas.yml:8-28,46-56`
- **Root cause:** PostgreSQL defaults to user/password `oxengl` and publishes `5432:5432`; Redis publishes `6379:6379` without authentication. The backend and web ports are also published on all host interfaces. The defaults are activated when deployment variables are omitted.
- **Impact:** A production deployment using defaults exposes database credentials and an unauthenticated cache/state service on host interfaces, risking direct data access and agent/session state compromise.
- **Remediation pattern:** Require non-default secrets at startup (no defaults for production), bind data-plane ports only to a private network or loopback, configure Redis ACL/TLS if remotely reachable, and expose only the authenticated edge proxy. Add a production Compose validation that rejects missing secrets and unintended public bindings.

## [HIGH]

### H1. External database migration can report success despite silently skipped writes and has no transactional rollback

- **File:** `backend/app/services/migration_service.py:335-371,398-459,460-480,486-509`
- **Root cause:** Each destination table is committed independently. Per-row insert exceptions are caught and skipped at lines 366-368; the transfer counter is increased by the number of source rows regardless of successful inserts. Integrity verification only checks for the tenant company row, not row counts/checksums per table. The failure handler rolls back only the current local session; it cannot undo already committed target-table transactions. Routing/configuration is switched at lines 414-459, and reverting later only switches routing back.
- **Impact:** A migration may be marked `COMPLETED` with missing or inconsistent data, and failures can leave partial target copies with no automated cleanup or restoration path.
- **Remediation pattern:** Implement a migration plan with pre-migration snapshot/backup, per-table source/target row counts and content checksums, explicit failed-row accounting, and a reconciliation gate that blocks cutover on any discrepancy. Write into a versioned/staging target and use atomic cutover only after verification; retain a compensating rollback procedure and do not convert insert exceptions into success.

### H2. Agent LLM failures are converted into synthetic business drafts that can be committed

- **Files:** `backend/app/agent/graph.py:229-258,275-312,348-378,393-438,494-528`; `backend/app/agent/router.py:320-427,437-501,588-612`
- **Root cause:** On provider/structured-output errors, graph nodes create hard-coded vendor, vehicle, driver, employee, SKU, customer, amounts, and other values, then mark the results `VALIDATED` and `awaiting_approval`. The SQL dispatcher supplies further fallbacks and inserts or updates live records after approval.
- **Impact:** Provider outages, malformed output, or ambiguous prompts can yield fabricated purchase orders, payroll/leave records, fleet trips, journals, invoices, or inventory movements. A routine human approval can turn this synthetic state into production data.
- **Remediation pattern:** Fail closed on model/provider or validation errors and return an explicit draft-generation error. Require required business identifiers and values from verified database records; reject unresolved entities rather than inventing defaults. Preserve the approval gate, but only approve fully validated, tenant-bound, idempotent commands.

### H3. Graph execution and SQL dispatch are separate sources of truth

- **Files:** `backend/app/agent/graph.py:533-542,581-595`; `backend/app/agent/router.py:243-320,320-701`
- **Root cause:** LangGraph's `execute_action` only returns `execution_status="committed"` and a success message; it does not execute a database operation. Actual SQL writes live in a large hand-written API-router dispatcher. The router manually resumes the graph after SQL work at line 701.
- **Impact:** Graph state can claim success without a corresponding transaction if invoked/resumed outside the router path, while API-side SQL can commit even if graph-state cleanup/resume fails. Authorization, validation, and transaction rules are duplicated rather than enforced at one business-operation boundary.
- **Remediation pattern:** Move each action into a typed domain command/service that accepts an authenticated tenant context and a SQLAlchemy transaction. Have the graph emit only validated commands; have one execution service authorize, execute, audit, and return the persisted result. Update graph completion only after the service transaction commits.

### H4. The committed OpenRouter credential is hard-coded in the agent provider configuration

- **File:** `backend/app/agent/graph.py:175-180`
- **Root cause:** `_get_llm()` provides a literal API-key fallback when `OPENROUTER_API_KEY` is unset.
- **Impact:** The credential is recoverable from source history and can be abused; a deployment with missing configuration silently uses the embedded credential.
- **Remediation pattern:** Revoke/rotate the exposed credential immediately, remove the literal fallback, and fail startup or agent requests with an explicit configuration error when a secret is absent. Load secrets from the deployment secret manager and prevent them from entering logs or error responses.

### H5. MFA frontend URL and request body do not match any backend verification contract

- **Files:** `frontend/src/views/MfaVerificationView.tsx:80-85`; `backend/app/domains/iam/routes.py:29,92,173,193,210`; `backend/app/api/v1/auth.py:70-76,581-583`
- **Root cause:** The frontend sends `POST /api/v1/iam/auth/verify-mfa` with `challenge_token` and `totp_code`. The IAM router exposes login/refresh/logout only; the recovery/auth router exposes `/2fa/verify` and expects `two_factor_token` and `code` (or email for setup).
- **Impact:** The MFA flow receives a 404 or schema validation failure and cannot complete authentication.
- **Remediation pattern:** Choose one canonical backend contract and use it consistently. For the existing handler, call the mounted `/api/v1/auth/2fa/verify` route with `{ two_factor_token, code, tenant_slug }`; add an integration test covering login challenge through successful token/session issuance.

### H6. AI embeddings and recommendation fallback are synthetic, yet represented as semantic evidence

- **File:** `backend/app/api/v1/ai.py:34-44,102-120,136-143`
- **Root cause:** `generate_openai_embedding()` builds a deterministic pseudorandom Gaussian vector rather than an embedding model output. Empty/failed retrieval produces a fixed sulfur inventory recommendation, fixed confidence, and source names that are not demonstrated to have been retrieved.
- **Impact:** Results are not semantically grounded; unrelated chunks may rank as similar, and fabricated operational advice is presented with high confidence and source attribution.
- **Remediation pattern:** Use the configured embedding provider/model with versioned dimensions and fail explicitly if unavailable. On no retrieval or retrieval failure, return a clearly marked no-evidence response with low/absent confidence and no fabricated citations. Validate `top_k` bounds and keep any future writes out of the retrieval endpoint.

### H7. Migration status lookup can retrieve a migration by ID without tenant scoping

- **File:** `backend/app/services/migration_service.py:177-204`
- **Root cause:** When `migration_id` is supplied, the database query filters only by `TenantDatabaseMigration.id`; it does not also constrain `company_id`. The in-memory fast path at lines 182-185 also returns state by migration ID alone.
- **Impact:** A caller that can reach this service/API and obtain or guess another migration ID may see another tenant's migration status, target host/database, or error details.
- **Remediation pattern:** Always include `TenantDatabaseMigration.company_id == authenticated_company_id` in both cache and DB lookups. Verify ownership before returning any migration details and avoid exposing target connection metadata unnecessarily.

### H8. SaaS Compose omits required cryptographic environment variables; RLS migration errors are ignored

- **Files:** `infrastructure/docker-compose.saas.yml:46-55`; `infrastructure/Dockerfile.saas:112-115,120`; `backend/app/dependencies.py:30-34`; `backend/database.py:266-270`; `backend/two_tier_auth.py:62-67`
- **Root cause:** The SaaS Compose environment passes `DATABASE_URL`, `REDIS_URL`, and app ports, but not `JWT_SECRET_MASTER`, `JWT_SECRET_TENANT`, or `DATA_RESIDENCY_KEY`, all of which are required by imported backend modules. Its migration entrypoint suppresses RLS script failures with `|| true`, then proceeds to start the application.
- **Impact:** The combined deployment can fail at backend import/startup because required secrets are absent; alternatively, it can run without the intended RLS setup if migration execution fails.
- **Remediation pattern:** Declare required secrets through Compose secrets or a deployment secret store and validate them before starting the process. Remove `|| true`; fail the deployment and health check if RLS/migrations do not apply successfully. Separate schema migration from normal app startup and record migration version/state.

## [MEDIUM]

### M1. Frontend keeps native JWTs in JavaScript-readable local storage despite backend HttpOnly cookie support

- **Files:** `frontend/src/services/api.ts:755,813-817,1036-1047`; `frontend/src/context/AppContext.tsx:1181-1185,1232-1237,1306-1310`; `backend/app/main.py:664-668`
- **Root cause:** Backend session issuance supports an HttpOnly cookie, but frontend session helpers copy the token into `localStorage`, read it back, and add it as a Bearer token. Login surfaces also write the token directly to local storage.
- **Impact:** XSS or a compromised third-party script can exfiltrate a live access token; cookie and bearer-token session semantics are inconsistent.
- **Remediation pattern:** Make the secure, HttpOnly, SameSite cookie the sole browser session credential; use `credentials: "include"` and CSRF protection for state-changing requests. Stop persisting access tokens in local storage and remove legacy token-copy paths after a staged migration.

### M2. Firebase SDK remains wired into the client alongside native authentication

- **Files:** `frontend/src/firebase.ts:1-74`; `frontend/src/context/AppContext.tsx:1-9,1141-1147`
- **Root cause:** Firebase Auth/Google provider and Firestore are initialized/exported while application login is performed through native OxenGL JWT APIs. AppContext still writes brand configuration to Firestore, and the write suppresses errors.
- **Impact:** The browser has an unused external identity path and a second persistence backend with unclear tenant ownership/security rules. The silent Firestore fallback can hide configuration/data-sync failures.
- **Remediation pattern:** Remove Firebase authentication and persistence dependencies from the application path; use native backend APIs and tenant-scoped database storage. If a Firestore data migration remains necessary, isolate it as a time-bounded migration utility with explicit authorization and surfaced errors.

### M3. Synchronous database/model calls and graph invocation block asynchronous route handlers

- **Files:** `backend/app/api/v1/ai.py:66-68,92-110,147-149,162-172`; `backend/app/agent/router.py:122-145,243-310`
- **Root cause:** `async def` routes use synchronous SQLAlchemy `Session` queries and `.all()` and call synchronous LangGraph `.invoke()`/`.get_state()` methods. The event loop remains occupied while database and model operations run.
- **Impact:** Concurrent AI/agent requests can reduce API throughput and cause latency spikes, especially under slow provider or database conditions.
- **Remediation pattern:** Use async SQLAlchemy and async graph/provider APIs consistently, or move blocking operations to an explicit worker/thread boundary. Add request timeouts, bounded concurrency, and latency/load tests for these endpoints.

### M4. Production Python baselines differ across supported container definitions

- **Files:** `backend/Dockerfile:6`; `infrastructure/Dockerfile:5`; `infrastructure/Dockerfile.saas:25,45`
- **Root cause:** The standard backend/infrastructure image targets Python 3.12, but the combined SaaS image builds and runs Python 3.11.
- **Impact:** Dependency resolution, runtime behavior, and production verification can diverge across deployment paths.
- **Remediation pattern:** Select and document one supported Python baseline, align builders/runtimes/CI to it, and validate each deployed image with the same backend test suite.

### M5. An AI Copilot view is not routed or imported by the application shell

- **Files:** `frontend/src/views/AiCopilotView.tsx:21`; `frontend/src/App.tsx:1-61` (view import declarations)
- **Root cause:** `AiCopilotView` is implemented but no application-shell import or route references it; the active AI surface is a different operations auditor/widget.
- **Impact:** The view is dead/unreachable code and its endpoint wiring is not exercised by normal navigation.
- **Remediation pattern:** Either register it behind an explicit route/navigation entry with auth and tenant context, or remove it after confirming it is not an externally consumed module. Add route smoke tests for retained screens.

## [LOW]

### L1. API discovery and client wiring are duplicated across raw `fetch` and the shared API client

- **Files:** `frontend/src/views/MfaVerificationView.tsx:80-85`; `frontend/src/views/SuperAdminTenantsView.tsx:146-245`; `frontend/src/services/api.ts:1098-1150`
- **Root cause:** Several views issue raw `fetch` calls instead of using the common request wrapper, so auth/session headers, tenant context, error handling, and route typing are not centralized. Some admin requests omit credentials/authorization headers.
- **Impact:** This increases the likelihood of repeated endpoint and payload drift; several security-critical paths have already diverged (see C3 and H5).
- **Remediation pattern:** Use a typed API client with named methods, request/response interfaces, shared credential behavior, and generated or contract-tested paths. Keep raw requests only for narrowly justified cases.

### L2. The supplied technical scan describes capabilities that require stronger repository proof

- **File:** `backend/schema_multi_tenant_rls.sql:132-194`; `backend/app/services/migration_service.py:335-371,398-459`
- **Root cause:** The supplied technical report describes tenant-scoped RLS and migration integrity capabilities at a platform level, while the inspected SQL migration script covers four tenant-control tables and the migration worker lacks per-table checksum/reconciliation.
- **Impact:** Architecture and operational claims may be read as stronger than the implemented enforcement/recovery evidence.
- **Remediation pattern:** Keep claims tied to verified code and test evidence. Publish an endpoint/table isolation matrix, completed migration rehearsal results, restore evidence, and clearly marked prototype capabilities.

## Step-by-Step Remediation Plan

1. **Contain immediate exposure:** Revoke and replace the hard-coded provider credential; rotate any deployment secrets exposed through configuration. Disable or restrict public access to database/Redis and high-risk super-admin and agent routes until authorization is corrected.
2. **Establish identity and tenant trust:** Replace the agent identity stub; enforce native authenticated principal and server-derived company scope on all agent, AI, and super-admin endpoints. Bind thread state, migration status, approvals, and audit records to actor plus tenant.
3. **Close database isolation gaps:** Build a complete ORM/migration tenant-table inventory; add and force RLS policies across tenant data tables; remove or narrowly secure the `SECURITY DEFINER` master bypass; test with the least-privileged runtime DB role and cross-tenant negative cases.
4. **Make writes safe and auditable:** Remove synthetic agent fallbacks; centralize typed operations behind tenant-aware transactional services; make the graph reflect committed outcomes only. Add idempotency, row-level audit events, and authorization checks to every write path.
5. **Make migration integrity a cutover prerequisite:** Add staged transfer, backups/snapshots, per-table row-count/checksum reconciliation, explicit handling of failed rows, atomic cutover, and a tested compensating rollback. Tenant-scope all progress/status reads.
6. **Restore API contract consistency:** Align MFA URL/body, inventory frontend API calls and Pydantic schemas, centralize client methods/types, and add contract/integration tests that exercise successful and rejected calls.
7. **Harden session and runtime configuration:** Standardize on HttpOnly cookie sessions, remove browser-readable JWT persistence, retire Firebase identity/persistence paths, require all secrets at deployment, make migrations fail closed, restrict service ports, and align Python versions.
8. **Improve reliability and cleanup:** Replace synchronous work in async routes or move it to bounded worker execution; route or remove dead screens; add CI checks for route registration, tenant isolation, model/migration drift, migration recovery, and container startup under the chosen runtime configuration.

**Implementation gate:** No remediation has been applied. Proceed with code changes only after explicit approval.
