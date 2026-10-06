![OxenGL Logo - Insert Image Here](../frontend/public/oxengl-wordmark.svg)

# OxenGL
**Enterprise Profile, Architecture Report, Strategic Roadmap & User Manual**

**Audience:** Investors, enterprise clients, business owners, and engineering teams
**Repository review date:** 6 October 2026
**Scope:** Findings reflect implementation and configuration present in this repository. A feature described in a UI, plan catalog, migration, or design document is not by itself evidence of a verified production service-level commitment.

---

## 1. OxenGL Profile & Logo Placeholder

OxenGL is a modular, multi-tenant cloud ERP platform intended to bring the operating processes of SMEs, holding companies, and multi-entity organizations into one managed system. Its product direction combines finance, procurement, inventory, human resources, fleet and logistics, reporting, tenant administration, and workflow automation under a common workspace and access model.

The repository implements a broad ERP application surface: a React and TypeScript client, FastAPI services, PostgreSQL-backed business data, tenant and platform administration, subscription entitlements, custom-domain resolution, optional external PostgreSQL migration, and an AI workflow prototype built with LangGraph. The intended business outcome is simpler cross-entity administration, fewer disconnected operational records, and reduced dependence on client-managed application infrastructure.

The platform’s strongest strategic differentiators are:

- **Multi-tenant operating model:** Tenant and company identities, subscription records, role controls, and tenant-scoped database access are represented in application code.
- **Flexible data placement:** The code includes both shared-database tenant handling and a tenant-specific external PostgreSQL connection and migration path.
- **Tenant-specific digital identity:** Custom domain resolution, tenant branding, SSL checks, and domain entitlements are represented in the platform.
- **AI-assisted operations:** A LangGraph workflow classifies commands, builds domain-specific drafts, and routes proposed changes through a human-approval gate.
- **Broad operational coverage:** Implemented screens and APIs cover inventory, finance, procurement, HR/payroll, billing, logistics, planning, and platform administration.

### Executive perspective

OxenGL has a compelling enterprise SaaS direction and a significant implementation footprint. It should currently be positioned as an **evolving ERP platform with implemented modules and enterprise-oriented infrastructure capabilities**, rather than as a fully validated, compliance-certified, globally scaled ERP. The repository contains architectural and operational readiness gaps that should be addressed before making unqualified claims about autonomous AI execution, complete tenant isolation, instant database provisioning, or regulatory certification. The strategic opportunity is to convert its existing breadth into a smaller, dependable, auditable core and to prove isolation, recovery, security, and module integrity with repeatable evidence.

---

## 2. What is OxenGL?

### Core identity

OxenGL is a cloud-oriented ERP application organized around tenant workspaces and company entities. A platform-level control plane manages tenant records, plans, access entitlements, and operational oversight; tenant-facing application areas provide business workflows scoped to the user’s organization. The application is modular rather than a set of independent ERP products: the backend is primarily a Python/FastAPI service with multiple domain routers, while the frontend is a React single-page application.

### Unique selling propositions

#### Multi-tenant architecture

The codebase models platform tenants and operating companies separately, and implements tenant selection, tenant-specific database connections, company-scoped query patterns, and PostgreSQL Row-Level Security (RLS) in parts of the schema. A connection manager can choose a dedicated connection for a company when an active external-database configuration exists; otherwise, tenant traffic can use the shared database.

This is a meaningful architectural foundation, but isolation is a property of the complete request path—not just a schema or a header. Production claims should be backed by an endpoint-by-endpoint authorization review, automated cross-tenant tests, verified RLS policies across all tenant tables, and proof that background tasks and exports inherit the same tenant boundary.

#### Custom domains and white-label identity

The application includes host-based tenant lookup for registered domains and platform subdomains, tenant branding data, domain-management APIs, SSL status checks, and Nginx virtual-host routing. Tenant control APIs expose domain registration, verification, and SSL status operations. The subscription catalog includes an Enterprise custom-domain entitlement.

The domain capability is present in code, but the exact production behavior must be confirmed in the deployed edge configuration. Some domain-control code returns optimistic verification values during registration/listing; the separate verification endpoint performs DNS and certificate checks. Clients should treat registration as configuration, not proof that DNS, routing, and certificates have all been validated.

#### External PostgreSQL hosting

Enterprise-oriented code supports testing an external PostgreSQL connection, starting a background tenant-data migration, checking migration status, switching the active connection, and reverting to shared hosting. The connection URL is encrypted for storage, and a connection manager maintains tenant-specific engines.

This is stronger than a simple database-host field, but it is not equivalent to a managed database service or an independently audited sovereign architecture. The present migration implementation should undergo data-integrity, rollback, transactionality, performance, and failure-recovery testing before customer production migrations are marketed as zero-downtime or lossless.

#### Embedded AI engine

The repository includes LangChain and LangGraph dependencies, typed domain schemas, a state graph, tenant AI knowledge models, a separate Copilot query API, AI governance models, and forecast/parser services. The graph’s current operating pattern is primarily **AI-assisted draft creation with human approval**, not unrestricted autonomous processing.

The system has a potentially valuable base for controlled workflow automation. In its current form, AI functionality should be treated as a prototype or supervised capability until real authentication, tenant-bound context, model-provider secret handling, robust business-data retrieval, action idempotency, monitoring, and safety evaluations are completed.

### Product claims versus evidence in this repository

| Capability | Evidence present | Qualification |
|---|---|---|
| Tenant onboarding and administration | Tenant records, registration endpoints, a Super Admin tenant interface, subscription entitlements | The repository does not establish a complete, externally tested instant-provisioning SLA. |
| Shared tenant data isolation | Tenant/company filters, connection routing, RLS schema/policies | Coverage is not proven across every API, worker, report, or agent path. |
| Custom domain | Domain APIs, host resolver, tenant branding, TLS-related routes/configuration | DNS and TLS must be independently verified; some registration responses appear optimistic. |
| External PostgreSQL | Connection test, migration worker, encrypted connection configuration, routing cache | Migration integrity, rollback, monitoring, and operational ownership need additional validation. |
| AI workflow | LangGraph classification, domain schema drafting, human approval and action handlers | The agent route currently uses a stub identity context, and parts of its fallback behavior are synthetic. |
| Flat plan pricing | Subscription catalog has monthly/annual prices and seat quotas | Seat usage is counted and plan entitlements include seat limits. Confirm the commercial contract before claiming no seat-based billing. |
| Vultr hosting | No provider-specific Vultr configuration found in the reviewed deployment manifests | Repository deployment is cloud-VM/container compatible, but Vultr is not verified as the required or current host. |

---

## 3. How it Works (Under the Hood)

### 3.1 Technology stack evidenced by repository files

| Layer | Technology evidenced in code/configuration | Role |
|---|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 6, React Router | ERP application screens, tenant interface, platform console, and client-side workflows. |
| Frontend runtime / edge helper | Node.js 20 and Express 4 are present in the frontend package and runtime build | A Node process is used by some deployment paths for application serving/routing. The repository also defines a static frontend served by Nginx. |
| Backend | Python 3.11/3.12 container definitions, FastAPI, Uvicorn, Pydantic 2 | REST APIs, authentication-related services, ERP domains, tenant controls, and background-task entry points. |
| Persistence | PostgreSQL 15 container image, SQLAlchemy 2, Alembic | ERP and platform data, migrations, shared database operation, and optional external database connections. |
| Vector search | PostgreSQL `pgvector` dependency and migration/configuration | AI knowledge chunks and vector-search support. |
| Cache / broker | Redis 7, Celery and other queue libraries | Caching, task/broker functions, agent state where supported, and operational messaging. |
| Web gateway | Nginx configurations and container definitions | TLS termination or upstream proxying, static content and API routing, and WebSocket proxy support. |
| Packaging / deployment | Dockerfiles, Compose manifests, shell deployment scripts, GitHub Actions | Container builds and deployment to a Linux cloud server or equivalent infrastructure. |
| Hosting provider | Generic cloud-server references and server deployment workflow | No repository evidence establishing Vultr as a provider-specific dependency. |

There are multiple deployment definitions rather than one unambiguous canonical runtime: the root Compose manifest describes PostgreSQL, Redis, FastAPI, an Nginx-served frontend, and an Nginx edge container, while a separate SaaS Dockerfile supervises a Node edge process and FastAPI in one image. Backend Dockerfiles also specify different Python minor versions. Engineering should choose, document, and continuously test one production deployment path.

### 3.2 Conceptual architecture

OxenGL can be understood as two logical planes:

1. **Platform control plane**
   - Holds tenant directory and subscription/entitlement metadata.
   - Exposes Super Admin tenant registration, status, logging, and platform views.
   - Resolves workspace domains and plan-based capabilities.

2. **Tenant data plane**
   - Serves business domains for an organization and its entities.
   - Uses authenticated company context, company/tenant identifiers, database routing, and—in selected schema tables—RLS policies.
   - Can use shared PostgreSQL or an external PostgreSQL target when the tenant is entitled and configured.

This is a conceptual separation inside a largely modular-monolith codebase; it should not be read as evidence that separate control-plane and data-plane services are independently deployed or independently failure-isolated.

### 3.3 Tenant request and data flow

1. **Tenant creation:** A Super Admin route registers tenant metadata and plan-related properties. Tenant registration and master-platform APIs are registered in the FastAPI application.
2. **Workspace identity:** The tenant receives a slug/subdomain or, when entitled, a custom domain. Tenant name, logo, colors, and other branding are represented in platform and company records.
3. **Host resolution:** Incoming `Host` or forwarded-host information can be mapped to a tenant using custom-domain and platform-subdomain lookup. Nginx passes host and client-forwarding headers to the upstream service.
4. **Authentication and scope:** The intended request flow resolves the authenticated user and company. Tenant-control APIs explicitly derive the target tenant from the authenticated user and reject attempts to select another tenant through request hints.
5. **Database routing:** A tenant connection manager uses an active tenant-specific connection configuration when present; otherwise it returns to the platform database path. External connection details are encrypted before persistence.
6. **Query isolation:** Domain code uses `company_id` or `tenant_id` filters; the RLS schema sets tenant context using PostgreSQL session settings. These controls must be made consistent across all endpoints, administrative paths, agents, jobs, and exports.
7. **Business workflow:** Frontend modules call FastAPI APIs for operations such as inventory, finance, procurement, and HR. Some operational actions are posted to the ledger or passed through an approval process.
8. **AI workflow:** The agent endpoint creates a LangGraph state from a user prompt and route context, selects a domain node, and returns a typed draft. Approval and execution are exposed as separate API actions.

**Provisioning qualification:** Tenant metadata and logical routes can be created through APIs; that does not mean a new hardware stack or external database is provisioned instantly. External database migration is an asynchronous job. Public materials should state the provisioning scope (workspace record, database, DNS/TLS, integrations) and measured completion time separately.

### 3.4 Security and production-readiness observations

The repository has useful foundations including password-hashing dependencies, native authentication-related code, encrypted external connection strings, audit-log models/services, tenant entitlements, and RLS SQL. The following items are high-priority engineering checks before broad enterprise commitments:

- **Agent authentication and tenant identity:** `backend/app/agent/router.py` contains a `get_current_user_context` stub that returns a fixed sample identity and tenant. The agent endpoints should be connected to the platform’s real authenticated-user dependency and derive tenant scope only from trusted claims/database relationships.
- **Secret hygiene:** `backend/app/agent/graph.py` includes a hard-coded provider-key fallback. Remove source-level credentials, rotate any exposed credential, and load only from approved secret management with fail-closed startup validation.
- **AI integration truthfulness:** The separate AI query route’s embedding helper creates deterministic pseudo-random vectors from a prompt hash rather than obtaining a semantic embedding. Its empty-context response is a fixed sample recommendation. That path should not be described as validated retrieval-grounded decision support without replacement and evaluation.
- **Tenant-wide test coverage:** Verify every tenant data endpoint, AI handler, export, Celery/background job, WebSocket, and platform override against cross-tenant access tests. Do not treat client-supplied tenant IDs as authorization.
- **External DB migration assurance:** Add per-table counts/checksums, consistent snapshots, resumability, conflict handling, controlled cutover, rollback tests, and a migration operator runbook. Avoid silent row skips or partial-copy success.
- **Operational durability:** Validate Redis persistence/HA for agent checkpoints, PostgreSQL backups and restore tests, queue recovery, metrics/alerts, and documented RTO/RPO.
- **Configuration consistency:** Select one authoritative runtime and database driver, align Dockerfiles, Compose files, Nginx and CI, and test that exact production artifact.
- **Native identity consistency:** Native email/password and phone-capable registration should be the canonical user-login model. Reconcile legacy Firebase-shaped identifiers and the frontend Firebase dependency with the native authentication implementation; do not make external identity services a prerequisite for user login.
- **Primary implementation references:** `backend/app/main.py`, `backend/database.py`, `backend/schema_multi_tenant_rls.sql`, `backend/app/api/v1/tenant_control.py`, `backend/app/services/migration_service.py`, `backend/app/services/billing_service.py`, the frontend module views, and the deployment files listed in Section 3.

---

## 4. Specifications & Global Comparison (OxenGL vs. Odoo, SAP, etc.)

The comparison below contrasts OxenGL’s repository-level design with broad deployment patterns. Odoo and SAP are product families with multiple editions, hosting models, contracts, and partner implementations; exact capabilities and pricing vary by product, region, and agreement. This is an architectural positioning comparison, not a procurement-grade feature audit.

| Specification | OxenGL (repository evidence) | Odoo (typical product-family options) | SAP ERP family (typical options) |
|---|---|---|---|
| **Architecture** | Cloud-oriented multi-tenant application; containerized FastAPI/React stack. Shared PostgreSQL and tenant-specific external PostgreSQL paths are represented. | Vendor-hosted SaaS, managed platform, and self-hosted options exist across offerings; architecture depends on edition and deployment choice. | Cloud SaaS and customer-managed/private deployment models exist across product lines; architecture depends on the chosen SAP product and contract. |
| **Pricing model** | Code contains fixed monthly/annual subscription-plan price fields and plan quotas; sample defaults include seat limits. Seat usage is tracked. Validate actual checkout and customer contracts. | Commonly subscription/licensing plans whose cost can depend on users, apps, edition, and hosting. Current offer varies by market and plan. | Enterprise subscription/licensing and implementation agreements; costs are negotiated and scope-dependent. User or package metrics vary by contract. |
| **Deployment speed** | Workspace registration and domain/DB control APIs exist. External data migration is asynchronous. No measured end-to-end production deployment SLA was established by this scan. | Standard SaaS onboarding can be quick; complex configuration, data conversion, and custom rollout depend on scope and partner work. | Product provisioning and implementation timelines vary materially; enterprise transformation projects can be extensive. |
| **AI-native integration** | LangGraph dependency and prototype graph route domain prompts into typed drafts, with an approval stage. Current safeguards and grounding require material production hardening. | AI and automation capabilities vary by release, product, and connected services; assess the exact licensed configuration. | SAP is investing in embedded AI capabilities across products; availability and entitlement depend on product, region, and contract. |
| **Data isolation / external DB** | Shared RLS and tenant filters plus code for encrypted external PostgreSQL configuration and tenant migration. Needs comprehensive isolation/migration verification. | Hosting and database isolation are managed according to the selected service; arbitrary customer-selected external DB routing is not a default equivalence. | Enterprise deployments offer distinct hosting and control options, subject to architecture and agreement; not directly comparable to a tenant-directed PostgreSQL migration feature. |
| **Custom brand identity** | Tenant branding and custom host resolution are present; domain registration, entitlement, verification, and SSL routes exist. Deployed DNS/TLS behavior must be tested. | Domain and branding flexibility depends on hosting and plan; self-hosted/custom setups offer different control than standard SaaS. | Corporate access domains and UI configuration depend on deployment; full white-labeling is not a universal property of every SAP service. |
| **Implementation and ownership cost** | Intended to reduce client-owned server and maintenance effort; repository alone cannot prove total cost, reliability, or service delivery economics. | Standard modules may reduce build-from-scratch work; customization and hosting choices affect total cost. | Broad enterprise capabilities can involve substantial licensing, implementation, integration, and operations scope. |

### Positioning and the per-seat question

OxenGL’s billing code seeds named subscription tiers with monthly and annual prices, while separately enforcing seat quotas and incrementing seat usage. That design is consistent with a fixed tier price **up to an included seat allowance**, but it does not by itself prove that a customer’s commercial agreement can never introduce per-user charges, overage fees, or custom terms. Enterprise defaults use a very high seat cap rather than a literal mathematical infinity.

Accordingly, OxenGL can position a tier-based commercial model as an alternative to per-seat billing only when the published price book, checkout logic, contract templates, and renewal/overage terms all agree. Avoid promising that OxenGL “eliminates the per-seat billing trap” until product and finance teams confirm that users do not independently change the subscription price. Likewise, implementation savings should be demonstrated through comparable customer total-cost-of-ownership studies rather than assumed from cloud hosting alone.

---

## 5. Strategic Roadmap: Becoming a Perfect Global Brand

“Perfect” is best treated as a target state rather than a current claim. The recommended roadmap prioritizes trust, verifiable operations, and module correctness before adding more visible features.

### Phase 0 — Close critical production-readiness gaps

**Goal:** Make core tenant workflows safe, reproducible, and supportable.

- Replace stub identity/context in AI routes with native authenticated-user dependencies; derive tenant identity server-side.
- Remove and rotate source-embedded credentials; centralize secret loading and rotation.
- Establish one supported deployment architecture, with pinned runtime versions, documented topology, hardened images, and repeatable CI/CD.
- Add cross-tenant authorization tests for API handlers, analytics, reports, downloads, WebSockets, AI, and background jobs.
- Ensure every tenant table has a documented isolation strategy: company/tenant scoping, RLS, dedicated database, or control-plane classification.
- Make all write operations transactional, idempotent, auditable, and safe to retry.
- Make external DB migrations fail closed on copy errors; add checksums/counts, a consistent snapshot strategy, resumability, progress persistence, and tested rollback/cutback.
- Review AI fallback behavior and remove synthetic defaults from paths that can create financial or operational records.
- Produce module-by-module acceptance tests that validate the end-to-end database record, not just a successful HTTP response.

**Exit evidence:** CI tests, a threat model, an endpoint isolation matrix, independently restored backups, and an audited external-database migration rehearsal.

### Phase 1 — Service reliability and enterprise operations

**Goal:** Move from a capable single-host deployment toward repeatable service delivery.

- Define uptime, support response, incident communication, maintenance, and tenant onboarding commitments.
- Implement service-level indicators and objectives for API latency, error rate, queue age, database saturation, migration duration, and restore performance.
- Add structured logs, distributed traces, correlation IDs, and business audit trails tied to actor, company, operation, outcome, and timestamp.
- Establish database high availability, managed backups/PITR, tested restore automation, encryption-key custody, and disaster-recovery drills.
- Make Redis and agent checkpointing durable and highly available; do not silently downgrade production checkpointing to process memory.
- Run FastAPI as horizontally scalable stateless workers behind a load balancer; separate long-running tasks into durable workers.
- Add connection pooling (for example, PgBouncer where appropriate), per-tenant connection limits, fair-use controls, and database performance telemetry.
- Put uploaded documents and backup artifacts in a private object store with tenant-scoped authorization, malware checks, retention, and lifecycle rules.
- Define a tenant-deactivation, legal hold, export, deletion, and purge lifecycle with verified audit evidence.

### Phase 2 — Compliance, privacy, and localization

**Goal:** Build evidence-based compliance and localization rather than badge-oriented claims.

- **SOC 2:** Establish security policies, control ownership, access reviews, change management, incident response, vendor risk, evidence collection, and independent Type I readiness; proceed to Type II only after sustained operating evidence.
- **ISO/IEC 27001:** Build an information security management system, risk register, Statement of Applicability, internal audit, and recurring management review.
- **GDPR and comparable privacy regimes:** Define controller/processor roles, DPA terms, lawful processing, privacy notices, data-subject request workflows, data minimization, retention, breach notification, subprocessor governance, and cross-border transfer controls.
- **Residency and sovereignty:** Document storage/processing regions for primary data, backups, logs, telemetry, and AI-provider traffic; make tenant region selection and migration controls auditable.
- **Encryption and key management:** Apply TLS in transit, database/storage encryption, managed key custody, tenant-secret protection, rotation, and recovery procedures.
- **Regional finance and tax packs:** Build jurisdiction-specific tax rules, e-invoicing, invoice numbering, accounting calendars, currency/tax rounding, withholding, and reporting; validate each pack with local specialists.
- **Saudi market readiness:** Test current ZATCA e-invoicing requirements, VAT calculation, cryptographic controls, integrations, and operational exception handling in a certified/approved test path before making compliance claims.
- Publish a subprocessor list, security overview, incident contact process, and customer-facing data-processing documentation.

No certification, audit opinion, regulatory approval, or current country-by-country tax compliance should be claimed unless it has been independently obtained and remains in force.

### Phase 3 — Product completeness and integration ecosystem

**Goal:** Turn broad module presence into dependable workflows customers can adopt.

- Complete integrated source-to-pay, order-to-cash, record-to-report, inventory, employee lifecycle, payroll, and multi-entity consolidation journeys.
- Add robust approval policy configuration, delegation, segregation-of-duties checks, close calendar, immutable posting evidence, and period lock/unlock controls.
- Expand supported payment, bank statement, tax authority, e-invoicing, payroll, shipping, CRM, warehouse scanning, and fleet-provider integrations through versioned APIs and webhooks.
- Introduce stable API versioning, OAuth-like machine-to-machine credential lifecycle (distinct from user-login identity), webhook replay protection, rate limits, and developer documentation.
- Create migration tooling for common ERP source formats with dry-run, reconciliation, field mapping, validation, and rollback reporting.
- Add tenant-facing service status, usage metrics, billing statements, data export, retention controls, and support request tracking.
- Establish customer advisory groups and product analytics that avoid collecting unnecessary personal or business-sensitive content.

### Phase 4 — AI maturity

**Goal:** Make AI useful, bounded, measurable, and governable.

- Add workflow-specific retrieval with verified tenant-bound source records and citations.
- Separate retrieval, planning, drafting, validation, policy checking, approval, and execution into explicit testable graph nodes.
- Add strict typed tool contracts and server-side authorization at the operation boundary; never let a model select its own tenant scope or bypass business rules.
- Require approval for high-impact financial, payroll, external communications, employee, and irreversible actions.
- Enforce idempotency keys, duplicate prevention, concurrency control, transaction boundaries, and compensating actions for all AI-triggered writes.
- Record model/provider/version, prompt and output hashes, retrieved records, policy decisions, approver, action outcome, and trace ID without logging unnecessary sensitive data.
- Maintain a model registry, evaluation datasets, quality/safety thresholds, regression tests, cost budgets, rate limits, prompt-injection defenses, and rollback controls.
- Support provider selection via secure configuration and a data-processing review; disclose when data is sent to an external model service.
- Track agent task completion, human override rates, false positives, and business outcomes before marketing automation savings.

### Scaling strategy

1. **Near term:** Optimize the current modular monolith, remove split-brain endpoints and runtime variation, and make the core horizontally scalable.
2. **Work separation:** Move migrations, imports, report generation, notifications, and AI execution into durable worker services backed by a transactional outbox and versioned messages.
3. **Data architecture:** Establish tenant data classification, connection-pool controls, per-tenant quotas, query performance budgets, partitioning for high-volume tables, and a measured shared-to-dedicated migration playbook.
4. **Geographic growth:** Introduce region-aware control-plane metadata, regional data planes, regional backups, and residency-aware routing only after region failover and data-transfer controls are tested.
5. **Capacity engineering:** Load-test by tenant count, records, concurrency, import size, agent workload, and live telemetry. Scale database and workers based on bottleneck measurements, not only host size.
6. **Enterprise isolation options:** Offer a clearly supported shared-RLS tier, single-tenant database tier, and fully dedicated deployment only where operational support, upgrade consistency, backup ownership, and incident response are defined.

---

## 6. AI Architecture: LangGraph Agents Breakdown

### 6.1 Current links in the repository

The LangGraph agent is constructed in `backend/app/agent/graph.py` and exposed by `backend/app/agent/router.py`. The backend application registers the router, whose declared prefix is `/api/v1/agent`.

| Endpoint | Current purpose |
|---|---|
| `POST /api/v1/agent/interact` | Accepts a prompt, UI route, optional screen context, and required thread ID; invokes the graph and returns a proposed draft and status. |
| `GET /api/v1/agent/threads/{thread_id}/state` | Reads the graph/checkpointer state or a Redis-cached draft. |
| `POST /api/v1/agent/reject` | Clears the Redis draft cache and returns a rejected status. |
| `POST /api/v1/agent/execute` | Checks a managerial role, retrieves a draft, dispatches the action to SQL handlers, and attempts to resume the graph. |

The graph uses these state fields: `user_prompt`, `current_ui_route`, `active_tenant_id`, `user_role`, `intent_category`, `department`, `draft_payload`, `validation_status`, `execution_status`, `messages`, `message`, and `error_message`. A thread ID is supplied as the LangGraph configurable checkpoint key.

### 6.2 Graph flow and implemented departmental actions

The current graph is a **classifier → domain draft → execution checkpoint** graph:

1. **Classify:** `classify_intent_node` uses keyword/route heuristics to select a domain: procurement, fleet, payroll, governance, or general.
2. **Route:** A conditional edge chooses one departmental node.
3. **Draft and validate:** Nodes use Pydantic schemas. Some try structured-output extraction via `ChatOpenAI`; exception paths use hard-coded heuristics and sample fallback values.
4. **Pause before the execution node:** The compiled graph uses `interrupt_before=["execute"]`, so an interaction should return a draft that awaits a separate approval action.
5. **Human decision and database handler:** The API’s `/execute` route applies a managerial-role check and dispatches recognized action names to SQL/database handlers. The route—not the graph’s simple `execute_action` node—is where the business writes are performed.

| Intent/domain | Draft/action types evidenced | Execution connection evidenced |
|---|---|---|
| Procurement / Source-to-Pay | `ProcurementPOSchema`, legacy `PurchaseOrderSchema`; typed line items, supplier, delivery location, and estimated cost | Creates a purchase-order record and line items, with a supplier lookup/create path. |
| Fleet / Logistics | `FleetDispatchSchema`; vehicle, driver, route, schedule, weight, GPS deviation, and route audit fields | Creates a fleet-trip record. Several identifiers/default values are inferred by fallback logic and should be validated against the tenant’s actual master data. |
| HR / Payroll | `PayrollVoucherSchema`, `EmployeeLeaveSchema` | Creates payroll-run or leave-related attendance records. Payroll and employee data require strict authorization and review. |
| Governance | `GovernanceComplianceSchema` | Creates governance/audit-related records. |
| General / Finance and Sales | `JournalVoucherSchema`, `CustomerInvoiceSchema` | Router has SQL handler branches for finance vouchers and invoice actions; validate the actual schema and posting workflow end-to-end. |
| Inventory | `InventoryTransferSchema`, `InventoryValuationSchema` | Action branches exist in the router; the frontend inventory screen also calls the agent for an audit prompt. Confirm actual write/read behavior and ensure no false success response. |
| Procurement controls | `P2PMatchSchema` | A handler branch exists. Test matching inputs, approvals, and source-record traceability before operational use. |

`backend/app/api/v1/ai.py` exposes a separate Copilot and inventory forecasting API. It is not the LangGraph agent endpoint. Its current “embedding” function produces deterministic random vectors based on a prompt hash; it is not an embedding-model request. It returns a canned recommendation when no knowledge chunks are found. The forecasting endpoint is a distinct service path and should be validated independently.

### 6.3 Important implementation limits

- There is **no explicit planner node or independent reviewer node** in the graph. Intent classification and domain schema formulation lead to a human approval gate.
- The graph’s `execute_action` function returns a committed-status message but does not itself write to PostgreSQL. The API route contains the SQL dispatch logic. Keep these status transitions aligned to actual transaction outcomes.
- The LangGraph route currently injects a static identity/tenant through `get_current_user_context`; this is a production blocker for safe tenant-scoped operation until replaced by a real authenticated context.
- The agent key fallback is embedded in source. It must be removed; provider secrets should be externally managed and rotated.
- Several model failure paths manufacture default supplier, vehicle, employee, route, amounts, or business content. Do not allow synthetic fallback data to create real transactions.
- The checkpointer can fall back from Redis to in-process `MemorySaver`. That fallback is not suitable for a horizontally scaled production service unless explicitly disabled or handled as a degraded, visible mode.
- Thread retrieval/cache paths must bind each thread to the authenticated actor and tenant, not just a caller-provided thread ID.
- Add idempotency, stale-draft protection, version checks, approval expiry, replay protection, concurrency controls, and a full audit event before allowing writes.

### 6.4 Recommended graph evolution

Build an explicit and testable flow:

`Authenticated Request → Tenant-scoped Retrieval → Intent/Policy Classification → Planner → Typed Draft → Domain Validation → Risk/Policy Reviewer → Human Approval (when required) → Idempotent Executor → Reconciliation → Audit/Notification`

The future graph should:

- Pass verified actor, tenant, role, and request correlation metadata through state, but derive authorization again at each tool invocation.
- Retrieve source records by stable IDs under server-side tenant filters; attach source references and timestamps to drafts.
- Validate monetary and quantity values using decimal types, configured currencies, tax rules, master data, and business constraints.
- Route uncertainty, missing data, high risk, or failed validation to an explicit exception/approval state.
- Commit once under a database transaction and return success only after commit; on failure, record an error and leave no success-shaped fallback.
- Use durable cross-worker checkpointing in production and test recovery after worker restart.
- Retain human oversight for payroll, journal posting, tender awards, supplier changes, and any action that changes legal, financial, or employee records.

### 6.5 Departmental AI expansion

#### Finance and accounting

- Draft journal entries from approved source documents; validate debits equal credits and account/cost-center eligibility.
- Detect duplicate invoices, unusual amounts, missing tax identifiers, and out-of-period postings.
- Prepare bank reconciliation suggestions with matched source references; never auto-clear disputed items.
- Prepare close checklists and variance explanations; keep final close approval with an authorized controller.

#### Procurement and supply chain

- Summarize requisitions, compare supplier bids, identify policy exceptions, and propose award criteria.
- Match requisition, purchase order, receipt, and supplier invoice; raise discrepancy cases with supporting record links.
- Forecast replenishment candidates from tenant inventory history and lead times; require approval before PO creation.
- Monitor supplier performance and contract expiry while enforcing confidentiality across suppliers and entities.

#### Inventory and warehouse operations

- Suggest replenishment, transfer, cycle-count prioritization, and stockout-risk review.
- Detect anomalous adjustments, negative stock, duplicate receipts, and valuation changes.
- Explain valuation variance from approved transaction history and selected valuation method.
- Require human review for stock write-offs, cost changes, and ledger-impacting adjustments.

#### Human resources

- Assist with policy-grounded leave request triage, missing employee-document checks, and onboarding task lists.
- Identify attendance anomalies for HR review without automatically making disciplinary or compensation decisions.
- Draft payroll exception reports and flag changes against approved compensation inputs.
- Apply least-privilege access to identity, compensation, and employee records; require an authorized human to approve changes.

#### Sales and customer operations

- Draft invoice records from approved delivery and contract data; verify customer, tax, currency, and period.
- Flag duplicate invoice candidates, overdue balances, and delivery/invoice mismatches.
- Suggest customer follow-up drafts for human approval; do not send externally without configured consent and approval.
- Summarize receivables aging with tenant-scoped source links and clear date boundaries.

---

## 7. Departmental User Manual (With Screenshot Placeholders)

### 7.1 Super Admin / IT Administrator

#### A. Create and provision a tenant

1. Sign in to the platform administration area using an authorized platform administrator account. Open the Super Admin console and navigate to the tenant registry.
   - `[Insert Screenshot: Super Admin sign-in and protected platform dashboard]`
2. Choose the tenant registration action. Enter the organization name, requested slug/workspace identity, owner contact details, and the approved subscription plan. Confirm that the selected plan matches the required limits and capabilities.
   - `[Insert Screenshot: Tenant Registry with the tenant creation form and plan selection]`
3. Submit the tenant registration and record the returned tenant/company identifier and initial workspace address in the organization’s onboarding record.
   - `[Insert Screenshot: Tenant registration confirmation showing workspace name and identifier]`
4. Invite named users individually. Assign roles based on least privilege; create at least one separate backup administrator. Test access with representative administrator and business-user accounts.
   - `[Insert Screenshot: Tenant team administration showing invited users and scoped roles]`

**Implementation note:** The backend exposes tenant registration routes including `POST /api/v1/superadmin/tenants/register`; user registration and workspace sign-up flows also exist. UI labels and plan names may differ from internal plan codes. The billing service’s default tiers are `FREE`, `PROFESSIONAL`, and `ENTERPRISE`; confirm the live plan catalog rather than assuming a “Standard” label maps one-to-one to a code.

#### B. Configure a custom domain

1. Confirm Enterprise/custom-domain entitlement and select a domain or subdomain controlled by the organization, such as `erp.example.com`.
   - `[Insert Screenshot: Tenant subscription and custom-domain entitlement details]`
2. In tenant control settings, submit the domain through the authenticated domain-management flow. The API route is `POST /api/v1/tenant/control/domains`.
   - `[Insert Screenshot: Tenant Control Panel custom-domain registration screen]`
3. Configure the exact DNS records supplied for this tenant by the OxenGL deployment team. Do not reuse guessed CNAME, A, or verification values.
   - `[Insert Screenshot: DNS provider showing the OxenGL-issued domain records]`
4. Run domain verification using the tenant domain verification route and inspect the DNS, routing, and certificate result. The API includes `POST /api/v1/tenant/control/domains/{domain_id}/verify` and `GET /api/v1/tenant/control/domains/{domain_id}/ssl-status`.
   - `[Insert Screenshot: Domain verification result with DNS and TLS status]`
5. Test the new HTTPS address from a clean browser session, verify that the correct tenant branding appears, and confirm that sign-in remains tied to the expected organization.
   - `[Insert Screenshot: Verified custom-domain workspace with tenant branding and secure browser indicator]`

#### C. Configure external PostgreSQL (Enterprise)

1. Confirm Enterprise entitlement, database owner, residency region, backup obligations, network access, and recovery responsibilities. Prepare a dedicated PostgreSQL database and least-privilege service account.
   - `[Insert Screenshot: Enterprise database hosting settings showing shared versus external mode]`
2. Enter the approved host, port, database, username, password/secret, and TLS mode in the secure database configuration flow. Never put a database credential in email, chat, source code, or a screenshot.
   - `[Insert Screenshot: External PostgreSQL connection form with secrets masked]`
3. Run the database connection test. The API route is `POST /api/v1/tenant/control/database/test-connection`. Confirm the expected host and database metadata without exposing credentials.
   - `[Insert Screenshot: External database connection test result showing TLS and successful reachability]`
4. Schedule migration in an approved maintenance window, take/verify a source backup, and trigger migration through `POST /api/v1/tenant/control/database/migrate`.
   - `[Insert Screenshot: Migration review screen showing tenant, target database, and pre-migration checklist]`
5. Monitor `GET /api/v1/tenant/control/database/migration-status` until completion. Review errors, transferred-record counts, reconciliation results, and operator logs before cutover approval.
   - `[Insert Screenshot: Database migration progress and integrity reconciliation result]`
6. Validate critical tenant workflows against the destination database. Keep the rollback path and responsible operator available; use `POST /api/v1/tenant/control/database/switch-back` only under the approved recovery procedure.
   - `[Insert Screenshot: Post-cutover verification checklist and database hosting status]`

**Production safeguard:** The repository has an in-app migration worker, but administrators should not treat a “completed” progress status as a substitute for business-level reconciliation. Confirm transaction consistency, table-level row counts/checksums, backups, and an actual rollback rehearsal before migrating production data.

### 7.2 Operations / Workflow Management

#### Trigger and monitor an AI-assisted workflow

1. Open the relevant tenant workspace and choose the business area for the task. Confirm the displayed entity/branch and active user role before submitting operational data.
   - `[Insert Screenshot: Tenant workspace showing the active company/entity and operations navigation]`
2. Open the AI Operations or relevant module assistant. State the desired task plainly and include only known source identifiers and values. Avoid supplying personal or confidential data that is not necessary.
   - `[Insert Screenshot: AI Operations prompt panel with a scoped operational request]`
3. Submit the prompt with the correct UI route context. The current agent API expects a prompt, route, and thread ID at `POST /api/v1/agent/interact`.
   - `[Insert Screenshot: Agent interaction form showing prompt, current route, and created thread]`
4. Review the returned department, intent, draft payload, validation status, and message. Compare all supplier, vehicle, employee, account, quantity, amount, and date values against authoritative source records. Do not assume an AI-generated default is correct.
   - `[Insert Screenshot: Draft preview showing department, action, source data, and validation status]`
5. If incorrect or incomplete, reject the draft with the rejection action and correct the source data or request. For an accepted draft, obtain the required managerial review.
   - `[Insert Screenshot: Human review panel with approve and reject actions and review notes]`
6. Only an authorized manager should execute an approved draft. The current endpoint is `POST /api/v1/agent/execute`; confirm the response and the actual business record/ledger result rather than relying solely on a success message.
   - `[Insert Screenshot: Approval confirmation and resulting ERP record identifier]`
7. Monitor the workflow thread and audit history. Record unresolved exceptions and stop the workflow if tenant identity, source record, amount, or destination is uncertain.
   - `[Insert Screenshot: Workflow thread state and audit outcome for a completed or rejected action]`

**Operational warning:** The current agent endpoint uses a stub user context in source and fallback values in some graph nodes. Treat it as non-production until real identity binding, tenant authorization, source-grounded validation, and execution safety are verified.

### 7.3 Procurement / Source-to-Pay

1. Open **Procurement & S2P** from the tenant navigation and verify the active company/branch. Review existing requisitions, contracts, purchase orders, tender records, and approval queues.
   - `[Insert Screenshot: Procurement & S2P dashboard showing requisitions, orders, tenders, and approvals]`
2. Create a purchase requisition with the requested items, quantities, delivery location, budget/cost center where applicable, and business justification. Save it and confirm it appears in the requisition list.
   - `[Insert Screenshot: New purchase requisition form with item lines and delivery location]`
3. Route the requisition through the configured approval sequence. Approvers should review quantities, budget, supplier eligibility, and supporting documents before approval.
   - `[Insert Screenshot: Purchase requisition approval queue with pending approval steps]`
4. Convert an approved requisition into a purchase order or create a purchase order through the approved order workflow. Validate vendor, currency, item pricing, terms, tax, and delivery details before submission.
   - `[Insert Screenshot: Purchase order review showing supplier, line items, totals, and approval status]`
5. For sourcing, create and publish a tender, review received bids, and follow the configured bid-opening and award controls. Do not unseal or award bids outside the approved procurement policy.
   - `[Insert Screenshot: Tender workspace showing published tender, bid list, and controlled award actions]`
6. Reconcile purchase order, goods receipt, and supplier invoice where the P2P workflow is enabled. Resolve quantity or price discrepancies before posting a payable or ledger entry.
   - `[Insert Screenshot: Three-way match view comparing purchase order, receipt, and supplier invoice]`
7. Review the order and approval audit trail and export the record through the supported screen action when needed.
   - `[Insert Screenshot: Purchase order audit trail and export controls]`

### 7.4 Inventory / Warehouse Management

1. Open **Inventory & Valuation** and select the correct warehouse or all-warehouse view. Confirm the active valuation method shown by the screen.
   - `[Insert Screenshot: Inventory dashboard with warehouse selector, valuation method, and stock summary]`
2. Review products/materials, warehouse balances, and recent movements. Use search and status filters to locate the record before creating a new one.
   - `[Insert Screenshot: Inventory movements table filtered by warehouse and status]`
3. To record an adjustment, choose the warehouse and product, movement type, quantity, unit cost, reason, and reference. Review the computed total value before saving.
   - `[Insert Screenshot: Stock adjustment form with warehouse, item, quantity, cost, and reason]`
4. Confirm the new movement appears with the expected status. Investigate unexpected quantities, duplicate references, and negative stock before posting.
   - `[Insert Screenshot: Saved inventory movement showing quantity, reference, and posting status]`
5. If approved, post the movement to the General Ledger using the movement’s posting action. Confirm the journal entry number and debit/credit amounts.
   - `[Insert Screenshot: Inventory-to-ledger posting confirmation with journal reference and balanced totals]`
6. To run the inventory AI audit, select the intended warehouse and valuation method, invoke the audit action, and review the result against source balances and valuation policy. Treat the AI response as a review aid, not as authoritative valuation.
   - `[Insert Screenshot: Inventory valuation audit request and resulting review panel]`
7. Export or bulk-import only through the supported interface. Validate import totals and errors before committing uploaded records.
   - `[Insert Screenshot: Inventory bulk-import preview with validation results]`

### 7.5 Human Resources / Payroll

1. Open **HR** and select the Employees view. Search first to prevent duplicate employee records; check that the correct tenant/company is active.
   - `[Insert Screenshot: HRMS employee directory with active company and duplicate-check search]`
2. Select **Add Employee** and enter approved employee identity, role/title, department, employment status, and required organization fields. Restrict access to sensitive identifiers and compensation fields.
   - `[Insert Screenshot: Employee registration form with personal data masked in the example]`
3. Save the employee and verify the generated employee identifier and active status. Correct mismatched department or entity assignment before proceeding.
   - `[Insert Screenshot: Employee profile showing employee number, department, and status]`
4. Open the Attendance tab to review incoming attendance records and investigate missing or inconsistent entries. Do not treat an example/demo scan as an authoritative device integration.
   - `[Insert Screenshot: Attendance register showing employee, timestamp, and verification source]`
5. Open the Payroll tab and prepare a draft payroll run for the intended period using approved source data. Review base earnings, allowances, deductions, and net pay with the authorized payroll reviewer.
   - `[Insert Screenshot: Payroll run draft showing period, earnings, deductions, and review state]`
6. Obtain the required payroll approval and verify any posting eligibility. Use the **Post to GL** action only after reconciliation and sign-off.
   - `[Insert Screenshot: Payroll approval and Post to GL control with authorized reviewer]`
7. Confirm the resulting ledger reference and audit record; investigate any discrepancy before payroll is marked complete.
   - `[Insert Screenshot: Payroll-to-ledger posting result with journal reference and audit event]`

### 7.6 Finance / Sales Invoicing

1. Open the Finance or Customer Invoicing area and select the correct company, customer, accounting period, and currency.
   - `[Insert Screenshot: Finance or invoicing workspace showing company, customer, and period selectors]`
2. Review source delivery/operation records and ensure they belong to the selected customer and billing period. Confirm that no invoice already exists for the same source records.
   - `[Insert Screenshot: Invoice preparation screen with matched operational records and duplicate check]`
3. Draft the invoice and review line descriptions, quantities, unit prices, tax treatment, subtotal, and total. Validate jurisdiction-specific tax settings before finalizing.
   - `[Insert Screenshot: Customer invoice draft showing line items, tax breakdown, and totals]`
4. Submit the draft through the organization’s approval process. The permitted actions and approver depend on the user’s configured role.
   - `[Insert Screenshot: Invoice approval panel with draft, pending, and approved states]`
5. After approval, issue/share or export the invoice through the approved channel. Confirm that public-link sharing, email delivery, and applicable e-invoicing requirements are configured for the tenant.
   - `[Insert Screenshot: Approved invoice with controlled share, email, and export options]`
6. Record payment or settlement through the supported finance process, reconcile it to the relevant customer and invoice, and verify receivables aging.
   - `[Insert Screenshot: Customer receivables view showing invoice status, settlement, and aging]`

---
