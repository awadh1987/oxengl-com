# OxenGL Enterprise AI-Native Cloud ERP Platform
An industrial-grade, multi-tenant modular monolith architecture with deep role-based access control, real-time Canvas telemetry streaming, automated double-entry financial posting loops, and high-performance `pgvector` RAG search capabilities.

## 🚀 The 3-Step Quick-Start
To spin up this exact verified environment structure locally on your machine, clone the repository and execute these orchestrations:

### 1. Synchronize the Environment Keys (`.env`)
Create a standard configuration profile named `.env` at the project root matching these parameters:
```ini
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/erp_db
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=FALLBACK_ENTERPRISE_SECRET_KEY_OXEN_GL_2026
```

### 2. Grant Master Launcher Execution Access
```bash
chmod +x run_oxengl.sh scripts/commit_release.sh scripts/backup_db.sh
```

### 3. Bootstrap the Full Multi-Container Stack Mesh
```bash
./run_oxengl.sh
```
*The orchestration launcher script will automatically spin up your persistent database and caching layers, verify PostgreSQL/Redis node connections, inject the 107-item hierarchical financial chart of accounts, and initialize your FastAPI web apps and Next.js frontend web portals concurrently with log trapping panels.*

## 🚦 Endpoint Directory Summary Mappings
- **Frontend Portal Interface:**   `http://localhost:3000` (or your active server domain)
- **FastAPI Core OpenAPI Specs:**  `http://localhost:8000/docs`
- **Super Admin Account Identity:** `admin@oxengl.com` / `OxenGL@2026Secure!`
- **Myon Tenant Identity:**    `muath.salaih@meayon.com` / `Meayon123!`

## 🧪 Operational Commands & Testing Suite Runbook
- **Run Complete Regression Suite (23/23 tests):** `PYTHONPATH=.:backend backend/.venv/bin/pytest backend/tests/ -v`
- **Execute 1,000 Concurrent GPS Pings Test:**    `python3 scripts/stress_test_1000_gps.py`
- **Trigger pgvector Similarity Benchmark Search:**  `PYTHONPATH=.:backend backend/.venv/bin/python scripts/benchmark_vector_search.py`
- **Verify Repository Folder Sanity Boundaries:** `python3 scripts/migration_sanity_check.py`
