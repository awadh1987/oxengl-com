# OxenGL Enterprise Agent Upgrade Prompt: Security & Session Hardening
You are the Lead Security Architect, Principal Backend Engineer, and Database Architect for OxenGL. 
Your mission is to upgrade the current Phase 1 Identity and Access Management (`iam`) codebase to enforce the newly approved, enterprise-grade capabilities from the Master System Specification (MSS) updates.

## REFERENCE ARCHITECTURE FOOTPRINT (MSS v1.0 Update)
The platform must implement short-lived JWT access tokens, strict single-use rotating refresh tokens, granular audit logs, and an asynchronous processing pipeline.

- Access Token TTL: 15 minutes (Stateless JWT)
- Refresh Token TTL: 7 days (Hashed, tracked, and revocable in database)
- Invalidation Strategy: Event-driven + Multi-layer Cache-Aside via Redis
- Security Monitoring: IP/Device tracking, account lockouts after 5 consecutive failures.

---

## EXECUTION STEP 1: EXTEND THE POSTGRESQL & SQLALCHEMY IAM DATA LAYER
Locate `backend/app/domains/iam/models.py`. Maintain all existing business logic, roles, and user mappings, but incrementally integrate the following database architecture extensions using SQLAlchemy 2.0 type mapping:

1. **Enhance `User` Model**: Add the following fields to your existing `User` table class:
   - `mfa_enabled`: Mapped[bool] (Boolean, default=False, non-nullable)
   - `mfa_secret`: Mapped[Optional[str]] (String(255), nullable)
   - `mfa_backup_codes`: Mapped[Optional[Dict[str, Any]]] (JSONB, nullable)

2. **Add `UserSession` Class**:
   - `id`: UUID (Primary Key, default=uuid4)
   - `tenant_id`: UUID (Indexed, non-nullable)
   - `user_id`: UUID (Indexed, Foreign Key to `users.id` with `ondelete="CASCADE"`)
   - `device_name`: String(255) (Nullable)
   - `ip_address`: String(45) (To accurately record IPv4 and IPv6 footprints)
   - `logged_in_at`: DateTime (Timezone-aware, default=utcnow)
   - `last_activity_at`: DateTime (Timezone-aware, default=utcnow, onupdate=utcnow)
   - `is_active`: Boolean (Default=True)
   - Relationship: `refresh_tokens = relationship("RefreshToken", back_populates="session", cascade="all, delete-orphan")`

3. **Add `RefreshToken` Class**:
   - `id`: UUID (Primary Key, default=uuid4)
   - `user_id`: UUID (Indexed, non-nullable)
   - `session_id`: UUID (Indexed, Foreign Key to `user_sessions.id` with `ondelete="CASCADE"`)
   - `token_hash`: String(255) (Unique, Indexed, non-nullable)
   - `revoked_at`: DateTime (Timezone-aware, nullable)
   - `revoked_reason`: String(100) (Nullable - e.g., 'LOGOUT', 'PASSWORD_RESET', 'REFRESH_ROTATION', 'SECURITY_INCIDENT')
   - `expires_at`: DateTime (Timezone-aware, non-nullable)
   - `created_at`: DateTime (Timezone-aware, default=utcnow)
   - Relationship: `session = relationship("UserSession", back_populates="refresh_tokens")`

4. **Add `LoginAttempt` Class**:
   - `id`: UUID (Primary Key, default=uuid4)
   - `username`: String(255) (Indexed, non-nullable)
   - `ip_address`: String(45) (Indexed, non-nullable)
   - `device_id`: String(255) (Nullable)
   - `user_agent`: TEXT (Nullable)
   - `success`: Boolean (Non-nullable)
   - `failure_reason`: String(100) (Nullable - e.g., 'INVALID_PASSWORD', 'ACCOUNT_LOCKED', 'MFA_FAILED')
   - `attempt_time`: DateTime (Timezone-aware, default=utcnow)

5. **Add `SecurityToken` Class**:
   - `id`: UUID (Primary Key, default=uuid4)
   - `user_id`: UUID (Indexed, Foreign Key to `users.id` with `ondelete="CASCADE"`)
   - `token_type`: String(50) (Non-nullable - 'EMAIL_VERIFICATION' or 'PASSWORD_RESET')
   - `token_hash`: String(255) (Unique, Indexed, non-nullable)
   - `expires_at`: DateTime (Timezone-aware, non-nullable)
   - `used_at`: DateTime (Timezone-aware, nullable)
   - `created_at`: DateTime (Timezone-aware, default=utcnow)

*Ensure all 4 new tables are explicitly imported inside `backend/app/db/base.py` so they map perfectly into Alembic's `target_metadata` auto-detection layer.*

---

## EXECUTION STEP 2: BACKEND SECURITY SERVICE UPGRADES
Implement or modify corresponding domain services to handle the new session-aware validation loops:

1. **Brute Force & Account Lockout Monitoring**:
   - Create a service method that tracks entries in `LoginAttempt`.
   - If a given `username` or `ip_address` registers **5 consecutive failed attempts within a rolling window of 15 minutes**, automatically flag the account status as locked (`LOCKED`) or block requests from that footprint for 15 minutes.
   
2. **Strict Refresh Token Rotation (RTR) Engine**:
   - Rewrite the `/api/v1/auth/refresh` route handling sequence.
   - When a token arrives, read its database hash. If it is already marked as `revoked_at IS NOT NULL`, trigger a security incident event: look up the associated `session_id` and **instantly revoke all other child tokens matching that session** to eliminate reuse attacks.
   - On a successful refresh, gracefully mark the old token as revoked (`revoked_reason='REFRESH_ROTATION'`), append a new `RefreshToken` record with a rotating reference pool, and issue a fresh 15-minute stateless JWT access token.

3. **Central Token Revocation System Hooks**:
   - **Logout (`/auth/logout`)**: Mark the active session refresh token as revoked (`revoked_reason='LOGOUT'`).
   - **Global Logout (`/auth/logout-all`)**: Query all active entries for the target `user_id` and nullify them collectively (`revoked_reason='LOGOUT_ALL'`).
   - **Password Resets**: Force complete global session termination upon successful password replacement (`revoked_reason='PASSWORD_RESET'`).
   - **Admin Updates**: Hook into your user administration pipelines. If a user's role or company/warehouse data permissions change, fire an internal signal to immediately close active user session loops so values reload instantly.

---

## EXECUTION STEP 3: ASYNCHRONOUS AUDITING & CACHING INTEGRATION
1. **Decoupled Audit Execution**: Ensure audit engine emissions do not lock synchronous API threads. Route `audit_logs` processing into a Celery back-end worker thread (`tasks.emit_audit_log`). Incorporate a clear, distributed `X-Correlation-ID` tracing string inside the logs context matching FastAPI's tracking middleware lifecycle.
2. **Redis Cache Engine with TTL Jitter**: Create a centralized cache service layer that utilizes a dynamic variance value ($\pm20\%$) against your baseline definitions to eliminate synchronized stampedes (the Thundering Herd Problem).
   - *Very Short TTL (5–30s)*: Operational dashboards, vehicle updates, dynamic inventory stock ledger tallies.
   - *Short TTL (1–5m)*: Dynamic user permission maps and operational dashboard components.
   - *Medium TTL (15–60m)*: Chart of Accounts metadata nodes and structural warehouse mappings.

---

## EXECUTION STEP 4: MIGRATION DISPATCH
When all SQLAlchemy script changes, base registries, and service configurations are saved successfully, open your local workspace runtime shell inside the `backend/` engine directory and execute the database layout upgrades:

1. Run: `alembic revision --autogenerate -m "upgrade_oxengl_security_and_session_lifecycle"`
2. Run: `alembic upgrade head`

Confirm clean validation compilation without breaking any pre-existing foundational models or multi-tenant route mechanisms. Deliver production-ready code.
