#!/usr/bin/env bash
# ==============================================================================
# OxenGL Enterprise Workspace Consolidation, De-Duplication & Migration Runner
# ==============================================================================
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[92m"
YELLOW="\033[93m"
RED="\033[91m"
RESET="\033[0m"

echo -e "${BOLD}=== OxenGL Workspace Consolidation Pipeline ===${RESET}\n"

SOURCE_ROOT="/root/oxen-gl"
CLEAN_ROOT="/root/oxen-gl_clean"

echo -e "📁 ${BOLD}Step 1: Preparing Clean Staging Directory Structure at ${CLEAN_ROOT}...${RESET}"
rm -rf "${CLEAN_ROOT}"
mkdir -p "${CLEAN_ROOT}/backend/app/api"
mkdir -p "${CLEAN_ROOT}/backend/app/core"
mkdir -p "${CLEAN_ROOT}/backend/app/db"
mkdir -p "${CLEAN_ROOT}/backend/app/domains/iam"
mkdir -p "${CLEAN_ROOT}/backend/app/domains/finance"
mkdir -p "${CLEAN_ROOT}/backend/app/domains/procurement"
mkdir -p "${CLEAN_ROOT}/backend/app/domains/inventory"
mkdir -p "${CLEAN_ROOT}/backend/app/domains/logistics"
mkdir -p "${CLEAN_ROOT}/backend/app/domains/ai"
mkdir -p "${CLEAN_ROOT}/backend/alembic"
mkdir -p "${CLEAN_ROOT}/frontend/src/components"
mkdir -p "${CLEAN_ROOT}/frontend/src/views"
mkdir -p "${CLEAN_ROOT}/docs/blueprints"
mkdir -p "${CLEAN_ROOT}/infrastructure"
mkdir -p "${CLEAN_ROOT}/scripts"
mkdir -p "${CLEAN_ROOT}/db"

echo -e "📦 ${BOLD}Step 2: Merging Backend Modules and Domain Logic...${RESET}"
# Determine active backend source path
if [ -d "${SOURCE_ROOT}/backend/app" ] && [ ! -L "${SOURCE_ROOT}/backend" ]; then
    BACKEND_SRC="${SOURCE_ROOT}/backend"
elif [ -d "${SOURCE_ROOT}/Oxen-gl/backend" ]; then
    BACKEND_SRC="${SOURCE_ROOT}/Oxen-gl/backend"
else
    BACKEND_SRC="${SOURCE_ROOT}/backend"
fi

# Copy Alembic migrations and config
cp -r "${BACKEND_SRC}/alembic/"* "${CLEAN_ROOT}/backend/alembic/"
cp "${BACKEND_SRC}/alembic.ini" "${CLEAN_ROOT}/backend/alembic.ini"

# Update alembic.ini script_location to alembic directly inside backend
sed -i 's|script_location = .*|script_location = alembic|g' "${CLEAN_ROOT}/backend/alembic.ini"

# Copy database, models, schemas, auth, workers
cp "${BACKEND_SRC}/database.py" "${CLEAN_ROOT}/backend/database.py"
cp "${BACKEND_SRC}/models.py" "${CLEAN_ROOT}/backend/models.py"
cp "${BACKEND_SRC}/schemas.py" "${CLEAN_ROOT}/backend/schemas.py"
cp "${BACKEND_SRC}/two_tier_auth.py" "${CLEAN_ROOT}/backend/two_tier_auth.py"
cp "${BACKEND_SRC}/workers.py" "${CLEAN_ROOT}/backend/workers.py"
cp "${BACKEND_SRC}/zatca_adapter.py" "${CLEAN_ROOT}/backend/zatca_adapter.py"
if [ -f "${BACKEND_SRC}/schema_multi_tenant_rls.sql" ]; then
    cp "${BACKEND_SRC}/schema_multi_tenant_rls.sql" "${CLEAN_ROOT}/backend/"
fi
if [ -d "${BACKEND_SRC}/services" ]; then
    cp -r "${BACKEND_SRC}/services" "${CLEAN_ROOT}/backend/"
fi

# Copy Core and App infrastructure
cp -r "${BACKEND_SRC}/app/core/"* "${CLEAN_ROOT}/backend/app/core/"
cp -r "${BACKEND_SRC}/app/db/"* "${CLEAN_ROOT}/backend/app/db/"
cp -r "${BACKEND_SRC}/app/domains/iam/"* "${CLEAN_ROOT}/backend/app/domains/iam/"
if [ -d "${BACKEND_SRC}/app/domains/ai" ]; then
    cp -r "${BACKEND_SRC}/app/domains/ai/"* "${CLEAN_ROOT}/backend/app/domains/ai/"
fi

# Consolidate main.py into backend/app/main.py and create backend/main.py bridge
cp "${BACKEND_SRC}/main.py" "${CLEAN_ROOT}/backend/app/main.py"
cat << 'EOF' > "${CLEAN_ROOT}/backend/main.py"
"""OxenGL Backend Entrypoint Bridge."""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
app_root = backend_dir.parent
for p in [str(backend_dir), str(app_root)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.main import app  # noqa: F401,E402

__all__ = ["app"]
EOF

# Initialize packages across all required domain boundaries
touch "${CLEAN_ROOT}/backend/__init__.py"
touch "${CLEAN_ROOT}/backend/app/__init__.py"
touch "${CLEAN_ROOT}/backend/app/api/__init__.py"
touch "${CLEAN_ROOT}/backend/app/domains/__init__.py"

for domain in finance procurement inventory logistics; do
    DOM_DIR="${CLEAN_ROOT}/backend/app/domains/${domain}"
    mkdir -p "${DOM_DIR}"
    cat << EOF > "${DOM_DIR}/__init__.py"
"""OxenGL ${domain^} Domain Module."""
EOF
    cat << EOF > "${DOM_DIR}/models.py"
"""OxenGL ${domain^} Domain Models."""
from backend.database import Base
from backend import models
EOF
    cat << EOF > "${DOM_DIR}/services.py"
"""OxenGL ${domain^} Domain Services."""
import logging
logger = logging.getLogger("oxengl.domains.${domain}")
EOF
done

# Build unified backend/requirements.txt
cat << 'EOF' > "${CLEAN_ROOT}/backend/requirements.txt"
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
sqlalchemy>=2.0.28
asyncpg>=0.29.0
psycopg2-binary>=2.9.9
redis>=5.0.2
pydantic>=2.6.4
pydantic-settings>=2.2.1
passlib[bcrypt]>=1.7.4
pyjwt>=2.8.0
argon2_cffi>=25.1.0
celery>=5.3.6
pgvector>=0.2.5
websockets>=12.0
httpx>=0.27.0
alembic>=1.13.1
cryptography>=42.0.5
python-dotenv>=1.0.0
email-validator>=2.3.0
pytest>=8.1.1
pytest-asyncio>=0.23.5
EOF

# Backend Dockerfile
cat << 'EOF' > "${CLEAN_ROOT}/backend/Dockerfile"
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl gcc python3-dev libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./backend

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF

# Copy database bootstrap seeds
if [ -f "${SOURCE_ROOT}/db/bootstrap_seed.sql" ]; then
    cp "${SOURCE_ROOT}/db/bootstrap_seed.sql" "${CLEAN_ROOT}/db/bootstrap_seed.sql"
fi

echo -e "🎨 ${BOLD}Step 3: Consolidating Frontend Source & Components...${RESET}"
FRONTEND_SRC="${SOURCE_ROOT}/Oxen-gl"
if [ ! -d "${FRONTEND_SRC}/src" ] && [ -d "${SOURCE_ROOT}/frontend/src" ]; then
    FRONTEND_SRC="${SOURCE_ROOT}/frontend"
fi

# Copy all configuration and root files required by the frontend build
for cfg in package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html server.ts firebase-applet-config.json firebase-blueprint.json logo.jpg; do
    if [ -f "${FRONTEND_SRC}/${cfg}" ]; then
        cp "${FRONTEND_SRC}/${cfg}" "${CLEAN_ROOT}/frontend/"
    fi
done

# Copy frontend source and assets
cp -r "${FRONTEND_SRC}/src/"* "${CLEAN_ROOT}/frontend/src/"
if [ -d "${FRONTEND_SRC}/public" ]; then
    cp -r "${FRONTEND_SRC}/public" "${CLEAN_ROOT}/frontend/"
fi

# Pre-populate node_modules from source to optimize build speed
if [ -d "${FRONTEND_SRC}/node_modules" ]; then
    cp -r "${FRONTEND_SRC}/node_modules" "${CLEAN_ROOT}/frontend/"
fi

# Frontend Dockerfile
cat << 'EOF' > "${CLEAN_ROOT}/frontend/Dockerfile"
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
EOF

echo -e "📚 ${BOLD}Step 4: Consolidating Documentation & Infrastructure...${RESET}"
cp -r "${SOURCE_ROOT}/docs/"* "${CLEAN_ROOT}/docs/"
cp "${SOURCE_ROOT}/docker-compose.yml" "${CLEAN_ROOT}/docker-compose.yml"
cp "${SOURCE_ROOT}/docker-compose.yml" "${CLEAN_ROOT}/infrastructure/docker-compose.yml"
if [ -f "${SOURCE_ROOT}/docker-compose.saas.yml" ]; then
    cp "${SOURCE_ROOT}/docker-compose.saas.yml" "${CLEAN_ROOT}/infrastructure/"
fi

# Copy sanity checker and runner into scripts
cp "${SOURCE_ROOT}/scripts/migration_sanity_check.py" "${CLEAN_ROOT}/scripts/migration_sanity_check.py"
cp "${SOURCE_ROOT}/scripts/execute_workspace_migration.sh" "${CLEAN_ROOT}/scripts/execute_workspace_migration.sh"
chmod +x "${CLEAN_ROOT}/scripts/execute_workspace_migration.sh"
chmod +x "${CLEAN_ROOT}/scripts/migration_sanity_check.py"

# Copy root entrypoint and runner script
cat << 'EOF' > "${CLEAN_ROOT}/main.py"
"""OxenGL Root ASGI Entrypoint Bridge."""
import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent
backend_dir = root_dir / "backend"

for p in [str(root_dir), str(backend_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.main import app  # noqa: F401,E402

__all__ = ["app"]
EOF

# Clean, unified run_oxengl.sh
cat << 'EOF' > "${CLEAN_ROOT}/run_oxengl.sh"
#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${PROJECT_DIR}/backend/.venv"
DB_CONTAINER="oxengl_postgres_container"
REDIS_CONTAINER="oxengl_redis_container"

echo "⚙️  Step 1: Checking Unified Virtual Environment..."
if [ ! -d "$VENV_DIR" ]; then
    echo "  Building backend/.venv..."
    python3 -m venv "$VENV_DIR"
    "${VENV_DIR}/bin/pip" install --upgrade pip
    "${VENV_DIR}/bin/pip" install -r "${PROJECT_DIR}/backend/requirements.txt"
fi

source "${VENV_DIR}/bin/activate"

echo "⚙️  Step 2: Checking storage container health..."
if ! docker compose ps | grep -q "$DB_CONTAINER"; then
    docker compose up -d postgres_db redis_cache
fi

until docker exec -i "$DB_CONTAINER" psql -U postgres -d erp_db -c "SELECT 1;" > /dev/null 2>&1; do
    sleep 1
done

echo "⚙️  Step 3: Starting OxenGL Unified Backend Engine..."
export DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/erp_db"
export REDIS_URL="redis://localhost:6379/0"
export JWT_SECRET="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
export PYTHONPATH="${PROJECT_DIR}:${PROJECT_DIR}/backend"

exec "${VENV_DIR}/bin/python" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
EOF
chmod +x "${CLEAN_ROOT}/run_oxengl.sh"

echo -e "🐍 ${BOLD}Step 5: Building Unified Python Environment at ${CLEAN_ROOT}/backend/.venv...${RESET}"
python3 -m venv "${CLEAN_ROOT}/backend/.venv"
"${CLEAN_ROOT}/backend/.venv/bin/pip" install --upgrade pip --quiet
"${CLEAN_ROOT}/backend/.venv/bin/pip" install -r "${CLEAN_ROOT}/backend/requirements.txt" --quiet

echo -e "🧪 ${BOLD}Step 6: Verifying Frontend Build in ${CLEAN_ROOT}/frontend...${RESET}"
(
    cd "${CLEAN_ROOT}/frontend"
    npm install --silent
    npm run build
)

echo -e "🔄 ${BOLD}Step 7: Performing Graceful Workspace Swapping...${RESET}"
# Stop systemd service temporarily
systemctl stop oxengl.service || true

# Remove redundant legacy links and directories
rm -rf "${SOURCE_ROOT}/Oxen-gl"
rm -f "${SOURCE_ROOT}/web"
rm -rf "${SOURCE_ROOT}/venv"
if [ -L "${SOURCE_ROOT}/backend" ]; then
    rm -f "${SOURCE_ROOT}/backend"
fi

# Copy all consolidated staging files into workspace root
cp -r "${CLEAN_ROOT}/"* "${SOURCE_ROOT}/"

# Clean up staging directory
rm -rf "${CLEAN_ROOT}"

# Restart oxengl.service with updated unified environment
systemctl daemon-reload
systemctl restart oxengl.service || true

echo -e "\n🔍 ${BOLD}Step 8: Running Migration Sanity Check Validation Engine...${RESET}"
(
    cd "${SOURCE_ROOT}"
    python3 scripts/migration_sanity_check.py
)

echo -e "\n${GREEN}${BOLD}🎉 Workspace Consolidation & Migration Successfully Completed!${RESET}"
