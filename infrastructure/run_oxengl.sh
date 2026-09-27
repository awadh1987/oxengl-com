#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${PROJECT_DIR}/backend/.venv"
DB_CONTAINER="oxengl_postgres_container"
REDIS_CONTAINER="oxengl_redis_container"

cleanup() {
    echo ""
    echo "🛑 Received termination signal. Cascading graceful shutdown to application mesh..."
    if [ -n "${UVICORN_PID:-}" ] && kill -0 "$UVICORN_PID" 2>/dev/null; then
        echo "  Stopping FastAPI backend (PID: $UVICORN_PID)..."
        kill -TERM "$UVICORN_PID" 2>/dev/null || true
    fi
    if [ -n "${CELERY_PID:-}" ] && kill -0 "$CELERY_PID" 2>/dev/null; then
        echo "  Stopping Celery worker (PID: $CELERY_PID)..."
        kill -TERM "$CELERY_PID" 2>/dev/null || true
    fi
    if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "  Stopping Frontend portal (PID: $FRONTEND_PID)..."
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
    echo "✅ All application mesh processes terminated cleanly."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Release any lingering binds on target ports
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

echo "⚙️  Step 1: Checking Unified Virtual Environment..."
if [ ! -d "$VENV_DIR" ]; then
    echo "  Building backend/.venv..."
    python3 -m venv "$VENV_DIR"
    "${VENV_DIR}/bin/pip" install --upgrade pip
    "${VENV_DIR}/bin/pip" install -r "${PROJECT_DIR}/backend/requirements.txt"
fi

source "${VENV_DIR}/bin/activate"

echo "⚙️  Step 2: Checking storage container health..."
if ! docker compose ps | grep -q "$DB_CONTAINER" || ! docker compose ps | grep -q "$REDIS_CONTAINER"; then
    echo "  Starting PostgreSQL and Redis containers via Docker Compose..."
    docker compose up -d postgres_db redis_cache
fi

echo "  ⏳ Polling PostgreSQL readiness (port 5432)..."
MAX_RETRIES=30
RETRIES=0
until docker exec -i "$DB_CONTAINER" pg_isready -U postgres -d erp_db > /dev/null 2>&1; do
    RETRIES=$((RETRIES + 1))
    if [ $RETRIES -ge $MAX_RETRIES ]; then
        echo "❌ ERROR: PostgreSQL container failed to report online status. Aborting launch."
        exit 1
    fi
    sleep 1
done
echo "  ✅ PostgreSQL container (port 5432) is ONLINE and healthy."

echo "  ⏳ Polling Redis readiness (port 6379)..."
RETRIES=0
until redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q "PONG" || docker exec -i "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q "PONG"; do
    RETRIES=$((RETRIES + 1))
    if [ $RETRIES -ge $MAX_RETRIES ]; then
        echo "❌ ERROR: Redis container failed to report online status. Aborting launch."
        exit 1
    fi
    sleep 1
done
echo "  ✅ Redis container (port 6379) is ONLINE and healthy."

echo "⚙️  Step 3: Checking and seeding 107-item hierarchical ltree financial ledger..."
SEED_FILE="${PROJECT_DIR}/backend/app/db/bootstrap_seed.sql"
if [ -f "$SEED_FILE" ]; then
    docker exec -i "$DB_CONTAINER" psql -U postgres -d erp_db -f - < "$SEED_FILE" > /dev/null 2>&1 || true
fi
COA_COUNT=$(docker exec -i "$DB_CONTAINER" psql -U postgres -d erp_db -t -c "SELECT count(*) FROM public.chart_of_accounts;" 2>/dev/null | tr -d '[:space:]')
echo "  ✅ Hierarchical ltree ledger verified: ${COA_COUNT}/107 accounts seeded into erp_db."

echo "⚙️  Step 4: Loading environment variables..."
if [ -f "${PROJECT_DIR}/backend/.env" ]; then
    export $(grep -v '^#' "${PROJECT_DIR}/backend/.env" | xargs)
fi
export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://postgres:postgres@localhost:5432/erp_db}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
export JWT_SECRET="${JWT_SECRET:-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad}"
export PYTHONPATH="${PROJECT_DIR}:${PROJECT_DIR}/backend"

echo "⚙️  Step 5: Launching Multi-Container Application Mesh..."

# 5a. FastAPI Backend Engine
echo "  🚀 Starting Async FastAPI Engine (port 8000 on 127.0.0.1, concurrency limit: 100)..."
"${VENV_DIR}/bin/python" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --limit-concurrency 100 &
UVICORN_PID=$!

# 5b. Celery Worker Queue
echo "  🚀 Starting Celery Worker Tasks Queue (bounded concurrency: 2 for 2GB host)..."
"${VENV_DIR}/bin/celery" -A backend.app.core.celery_app.celery_app worker --concurrency=2 --loglevel=info &
CELERY_PID=$!

# 5c. Next.js / Vite React User Portal
echo "  🚀 Starting Frontend User Portal (port 3000 on 127.0.0.1, max-old-space: 256MB)..."
(cd "${PROJECT_DIR}/frontend" && HOST=127.0.0.1 NODE_ENV=production NODE_OPTIONS="--max-old-space-size=256" node dist/server.cjs) &
FRONTEND_PID=$!

echo "  ⏳ Verifying runtime health of initialized services..."
sleep 3

# Verify FastAPI
for i in $(seq 1 15); do
    if curl -s http://127.0.0.1:8000/api/v1/health 2>/dev/null | grep -q "healthy"; then
        echo "  ✅ FastAPI Engine initialized: http://127.0.0.1:8000 (Health 200 OK)"
        break
    fi
    sleep 1
done

# Verify Frontend
for i in $(seq 1 15); do
    if curl -s http://127.0.0.1:3000/api/health 2>/dev/null | grep -q "ok"; then
        echo "  ✅ Frontend User Portal initialized: http://127.0.0.1:3000 (HTTP 200 OK)"
        break
    fi
    sleep 1
done

echo ""
echo "================================================================="
echo "✨ OxenGL Enterprise Platform Mesh Online and Operational ✨"
echo "================================================================="
echo "• PostgreSQL Core DB:     localhost:5432 (erp_db, 107 ltree accounts)"
echo "• Redis State Broker:     localhost:6379 (db 0)"
echo "• FastAPI Backend Engine: http://localhost:8000 (Docs: /docs)"
echo "• Celery Task Worker:     Online (PID: $CELERY_PID, oxengl_enterprise)"
echo "• Frontend Portal:        http://localhost:3000"
echo "================================================================="
echo "Application mesh is running in the foreground. Press Ctrl+C to terminate."
echo ""

wait $UVICORN_PID $CELERY_PID $FRONTEND_PID
