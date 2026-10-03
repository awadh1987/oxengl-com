# OxenGL Database Migration System - Fix Report

## 1. Executive Summary
- **Module:** Tenant Control Panel (`/api/v1/tenant_control`)
- **Action:** Tenant Live Database Migration (Shared Cluster -> Dedicated Instance)
- **Status:** Resolved
- **Date:** 2026-10-03

---

## 2. Problem Statement
When triggering the **"Launch Migration"** feature in the Tenant Control Panel UI, the frontend received an `API request failed: 500` error, despite the **"Test Connection & SSL"** check succeeding against the external database (`200.141.10.213:5435`).

---

## 3. Root Cause Analysis (RCA)
- **Traceback Extraction:** Logs captured via `podman logs oxengl_backend_container`.
- **Faulting Operation:** An `INSERT` into the migration ledger table executed at `/app/backend/app/api/v1/tenant_control.py:818` inside the `trigger_database_migration` handler.
- **Underlying Error:**
  ` napython
  sqlalchemy.exc.ProgrammingError: (psycopg2.errors.UndefinedTable) relation "tenant_database_migrations" does not exist
  LINE 1: INSERT INTO tenant_database_migrations (id, company_id, sour...
  ``
- **Explanation:** The SQLLochemy ORM model `TenantDatabaseMigration` had been authored in code, but the corresponding Alembic revision was neither generated nor executed against the PostgreSQL instance. When `db.commit()` was called, the database aborted the transaction due to a missing relation.

---

## 4. Resolution & Execution
1. **Migration Auto-Generation:**
   Executed Alembic inside the running backend container to generate the DDL script:
   ```bash
   podman exec -w /app oxengl_backend_container alembic -c backend/alembic.ini revision --autogenerate -m "create tenant_database_migrations table"
   ```
2. **Schema Upgrade:**
   Applied the newly generated migration to `head`:
   ``bash
   podman exec -w /app oxengl_backend_container alembic -c backend/alembic.ini upgrade head
   ```
3. **Table Verification:**
   Verified that the `tenant_database_migrations` table was created with all required audit and operational tracking fields:
   - `id` (UUID, Primary Key)
   - `company_id` (UUID, Foreign Key)
   - `source_type` (VARCHAR)
   - `target_host`, `target_port`, `target_database`, `ssl_mode`
   - `status`, `progress_pct`, `current_step`, `records_transferred`
   - `error_message`, `started_at`, `completed_at`, `created_at`, `updated_at`

---

## 5. Verification & Testing
- Database schema upgrade completed with `202610020002 -> 906f41c472d9`.
- The `tenant_database_migrations` relation now exists in the shared cluster.
- When `/api/v1/tenant_control/trigger_database_migration` is invoked, the initial migration job state (`PENDING`) is successfully persisted without generating a 500 error.
