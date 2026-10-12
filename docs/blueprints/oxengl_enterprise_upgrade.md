# OxenGL Global Enterprise Platform Upgrade Blueprint
**Target Role:** Principal Software Architect, Lead Enterprise Engineer, and Security Lead
**Objective:** Upgrade the core modular monolith architecture of OxenGL to establish platform-wide enterprise layers: Advanced Core Security, Asynchronous Decoupled Logging, Enterprise Cache-Aside Infrastructure, Multi-Tier Asset Lifecycles, and a Structured AI Matrix.

---

## 1. IDENTITY & AUTHORIZATION LAYER UPGRADE (IAM & SECURITY)
Extend the existing security layer to implement robust session tracking, short-lived JWT access tokens, mandatory single-use rotating refresh tokens (RTR), and multi-factor authentication (MFA) parameters.

### Data Layer Enhancements (`backend/app/domains/iam/models.py`)
1. **Extend `User` Model**:
   - `mfa_enabled`: Mapped[bool] (Default=False, non-nullable)
   - `mfa_secret`: Mapped[Optional[str]] (String(255), nullable)
   - `mfa_backup_codes`: Mapped[Optional[Dict[str, Any]]] (JSONB, nullable)

2. **Add `UserSession` Class**:
   - `id`: UUID (Primary Key, default=uuid4)
   - `tenant_id`: UUID (Indexed, non-nullable)
   - `user_id`: UUID (Indexed, Foreign Key to `users.id` with cascade delete)
   - `device_name`: String(255) (Nullable)
   - `ip_address`: String(45) (Supports IPv4 and IPv6)
   - `logged_in_at`: DateTime (Timezone-aware, default=utcnow)
   - `last_activity_at`: DateTime (Timezone-aware, default=utcnow, onupdate=utcnow)
   - `is_active`: Boolean (Default=True)
   - Relationship: `refresh_tokens = relationship("RefreshToken", back_populates="session", cascade="all, delete-orphan")`

3. **Add `RefreshToken` Class**:
   - `id`: UUID (Primary Key, default=uuid4)
   - `user_id`: UUID (Indexed, non-nullable)
   - `session_id`: UUID (Indexed, Foreign Key to `user_sessions.id` with cascade delete)
   - `token_hash`: String(255) (Unique, Indexed, non-nullable)
   - `revoked_at`: DateTime (Timezone-aware, nullable)
   - `revoked_reason`: String(100) (Nullable: 'LOGOUT', 'PASSWORD_RESET', 'REFRESH_ROTATION', 'SECURITY_INCIDENT')
   - `expires_at`: DateTime (Timezone-aware, non-nullable)
   - `created_at`: DateTime (Timezone-aware, default=utcnow)

4. **Add `LoginAttempt` Class**:
   - `id`: UUID (Primary Key, default=uuid4)
   - `username`: String(255) (Indexed, non-nullable)
   - `ip_address`: String(45) (Indexed, non-nullable)
   - `device_id`: String(255) (Nullable)
   - `user_agent`: TEXT (Nullable)
   - `success`: Boolean (Non-nullable)
   - `failure_reason`: String(100) (Nullable)
   - `attempt_time`: DateTime (Timezone-aware, default=utcnow)

5. **Add `SecurityToken` Class**:
   - `id`: UUID (Primary Key, default=uuid4)
   - `user_id`: UUID (Indexed, Foreign Key to `users.id` with cascade delete)
   - `token_type`: String(50) (Non-nullable: 'EMAIL_VERIFICATION' or 'PASSWORD_RESET')
   - `token_hash`: String(255) (Unique, Indexed, non-nullable)
   - `expires_at`: DateTime (Timezone-aware, non-nullable)
   - `used_at`: DateTime (Timezone-aware, nullable)

### Logic and Control Rules
- **Token Timelines**: Force Access Token lifetime to exactly 15 minutes and Refresh Tokens to 7 days.
- **Refresh Token Rotation (RTR)**: If a refresh token is reused after being flagged as `revoked_at IS NOT NULL`, immediately log a breach event and invalidate the entire parent `session_id` session tree.
- **Brute Force Interceptor**: Lock any account configuration for a rolling window of 15 minutes if it records **5 consecutive failed attempts inside 15 minutes** via `LoginAttempt`.
- **Global Revocation Engine**: Hook into `/auth/logout`, `/auth/logout-all`, and password reset mechanisms. Mark records with specific reasons (`LOGOUT`, `LOGOUT_ALL`, `PASSWORD_RESET`). Trigger session clearing on sensitive structural updates (e.g., changes to roles, warehouse access matrices, or multi-company boundaries).

---

## 2. CROSS-CUTTING DECOUPLED ASYNCHRONOUS AUDITING
Audit pipelines must be completely asynchronous. They must never share database transactions or run blocking sequences on core thread workflows.

1. **Celery Worker Execution Pipeline**: Move your structural tracking executions to background workers (`tasks.emit_audit_log`).
2. **Correlation Context IDs**: Inject an internal tracking mechanism using standard request-level middleware. Capture or generate an `X-Correlation-ID` header string for every inbound client API cycle. Pass this reference string down into background tasks, audit database records, and log traces to monitor asynchronous calls seamlessly.

---

## 3. MULTI-LAYER ENTERPRISE CACHE-ASIDE FRAMEWORK
Deploy a secure, isolated caching layout over Redis to protect system resources and optimize read pathways. Caching handles rapid lookups and performance optimization; it **must never** act as a replacement for the PostgreSQL database system of record.

### Key Structure & Namespace Pattern
Every cached element must strictly map to an isolated multi-tenant string template structure:
`oxengl:{environment}:{tenant_id}:{domain}:{resource}:{identifier}:{version}`

### Cache Stampede & Jitter Strategy
Implement a central utility function that dynamically introduces a random variance factor (±10% to ±20%) to your base caching profiles. This spreads out expirations and prevents a synchronized cache stampede (the Thundering Herd Problem) from hitting the main database.

```python
# Baseline System Expiration Profiles
VERY_SHORT_TTL = 5   # (5-30s range + jitter) -> Operational statuses, tracking indices, inventory counters
SHORT_TTL      = 60  # (1-5m range + jitter) -> Active user permissions matrix, dashboard aggregations
MEDIUM_TTL     = 900 # (15-60m range + jitter) -> Chart of Accounts layouts, static warehouse topologies
LONG_TTL       = 86400 # (1-24h range + jitter) -> Multi-currency metadata, country catalogs, static constants
```

### Control Standards
- **Write Validation Strategy**: Caches are cleared or updated only *after* database transactions are successfully committed to PostgreSQL via transactional outbox handlers.
- **Idempotency Routing Cache**: Configure short-lived caching buckets matching incoming `Idempotency-Key` headers to protect system posting channels (such as payments, stock ledgers, and journal postings) from duplicate processing.

---

## 4. GROUNDING THE PHASE 3 AI PLATFORM MATRIX
While business operations and data loops take priority in Phase 1, you must prepare the system architecture today to seamlessly support the Phase 3 AI roadmap (conversational Copilot, predictive analytics, and the Executive Agent orchestration layer).

1. **Enable System Extensions**: Add commands to your primary initialization setup scripts to guarantee the extensions are registered:
   ```sql
   CREATE EXTENSION IF NOT EXISTS ltree;
   CREATE EXTENSION IF NOT EXISTS vector; -- Registers pgvector compatibility layer
   ```
2. **Strict RAG Security Pipeline**: Design future retrieval layer abstractions to run multi-stage permission validations *before* context injection happens:
   - Apply tenant checks: Apply hardcoded `tenant_id = :active_tenant` constraints to database calls.
   - Enforce domain security: Verify user roles and data permissions (e.g., checking `HR_PAYROLL_VIEW` or warehouse access blocks) prior to pulling text chunks.
   - Mask sensitive values: Sanitize data footprints (such as salary details, bank accounts, or credentials) before forwarding payloads to the AI model.
3. **Structured Explainable Outputs**: Enforce a schema standard requiring the reasoning engine to structure outputs into a predictable format containing recommendation strings, explicit confidence metrics, business reasoning, trace sources, and risk classifications.

---

## 5. MIGRATION & SYSTEM DISPATCH
1. Register all newly introduced data mapping classes inside your central collection point (`backend/app/db/base.py`) to let Alembic track the updates.
2. Navigate to your terminal root path inside the backend virtual runtime container and run:
   - `alembic revision --autogenerate -m "upgrade_oxengl_enterprise_platform_matrix"`
   - `alembic upgrade head`
3. Verify that all components compile properly and that the application starts up cleanly.
