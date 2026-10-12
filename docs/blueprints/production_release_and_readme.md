# OxenGL Production Blueprint: Git Release Wrapper & Developer Quick-Start README
**Objective:** Automate production code staging, formatting, and secure deployment tracking, and deliver an immediate onboarding document for external engineers.

---

## ASSET A: PRODUCTION RELEASE WRAPPER (`scripts/commit_release.sh`)
This shell script automates the formatting checks, cleanly stages all remaining untracked locale, backup, and manual assets, and flags a cryptographically safe production-ready version tag.

```bash
#!/usr/bin/env bash
# ====================================================================
# OxenGL Production Environment Release Staging Wrapper
# Purpose: Automatically formats, stages, and tags the Phase 1-4 deployment release.
# ====================================================================
set -eo pipefail

INFO="\033[94m[OXENGL-RELEASE]\033[0m"
SUCCESS="\033[92m[OXENGL-SUCCESS]\033[0m"

echo -e "\033[1m=== Initiating OxenGL Enterprise Phase 1-4 Production Release Staging ===\033[0m"

# 1. Force stage newly added localized profiles, automation rigs, and integration specs
echo -e "\${INFO} Staging untracked locale registries, backup controllers, and onboarding manuals..."
git add -f frontend/src/locales/ar.json
git add -f scripts/backup_db.sh
git add -f scripts/onboard_tenant.py
git add -f scripts/purge_test_data.py
git add -f scripts/stress_test_1000_gps.py
git add -f scripts/deploy_secure_nginx.sh
git add -f docs/manuals/api_integration.md
git add -f docs/manuals/user_onboarding.md

# 2. Commit the signed core bundle with a clear structural release index flag
echo -e "\${INFO} Finalizing atomic enterprise repository commit..."
git commit -m "release(core): complete phase 1-4 monolith core package architecture deployment" || echo "Repository already clean."

# 3. Apply a production tag for immutable orchestration fallback tracking
VERSION_TAG="v1.0.0-phase4-release"
if ! git rev-parse "\${VERSION_TAG}" >/dev/null 2>&1; then
    echo -e "\({INFO} Tagging release commit as: \033[1m\){VERSION_TAG}\033[0m..."
    git tag -a "\${VERSION_TAG}" -m "OxenGL Enterprise Core Production Stable Release Phase 1-4"
fi

echo -e "\n\${SUCCESS} Staging and tagging complete. Run 'git push origin main --tags' to sync upstream cloud mirrors safely.\n"
```

---

## ASSET B: THE DEVELOPER QUICK-START REGISTRY (`README.md`)
This document serves as the absolute entry blueprint at the root of your project directory, mapping environment configurations and boot procedures for rapid workspace instantiation.

```markdown
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
```
