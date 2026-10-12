oxengl-iso-audit
Run a full deep audit and enforce Row-Level Security (RLS) on all 128 tables to ensure OxenGL complies with ISO standards. Use when the user asks to perform a security audit, check RLS status, or verify production database ISO compliance.

#### Instructions

# OxenGL ISO Audit and RLS Enforcement Skill

A repeatable workflow for executing deep security audits and ensuring strict ISO-compliant Row-Level Security (RLS) across all 128 tables in the OxenGL production database (`erp_db`).

## When to Use

- Running a full production security audit after a redeployment.
- Verifying RLS enforcement status across database tables.
- Ensuring 100% ISO multi-tenant data isolation coverage.

## Workflow Steps

### 1. Check Container Health

Verify that all application and data containers are healthy and running:

```
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 2. Enforce Row-Level Security (RLS) on All 128 Tables

Execute the security hardening pass inside the backend container to ensure every public table has RLS explicitly enabled:

```
podman exec -it oxengl_backend_container python -c "
from backend.app.db.session import SessionLocal
from sqlalchemy import text
db = SessionLocal()
result = db.execute(text(\"SELECT tablename FROM pg_tables WHERE schemaname = 'public';\"))
tables = [row[0] for row in result.fetchall()]
print(f'Found {len(tables)} public tables. Enabling RLS...')
for t in tables:
    try:
        db.execute(text(f'ALTER TABLE \"{t}\" ENABLE ROW LEVEL SECURITY;'))
    except Exception as e:
        print(f'Skipped {t}: {e}')
db.commit()
print('RLS enforcement pass completed!')
"
```

### 3. Verify ISO Compliance Count

Query PostgreSQL directly to confirm the exact locked table count:

```
podman exec -it oxengl_postgres_container psql -U postgres -d erp_db -c \"
SELECT COUNT(*) AS rls_enabled_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relrowsecurity = true AND n.nspname = 'public';
\"
```

*Expected Result:* `128` RLS-enabled tables.