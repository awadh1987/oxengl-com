#!/usr/bin/env bash
set -euo pipefail

export PYTHONPATH="/app:/app/backend:${PYTHONPATH:-}"

# Ensure alembic.ini and script_location (backend/alembic) resolve whether invoked from /app or /app/backend
if [ ! -f "alembic.ini" ] && [ -f "backend/alembic.ini" ]; then
    ln -sf backend/alembic.ini alembic.ini
fi

if [ -f "alembic.ini" ] && [ ! -d "backend/alembic" ] && [ -d "alembic" ]; then
    ln -sf . backend
fi

DB_HOST="${POSTGRES_HOST:-postgres_db}"
DB_PORT="${POSTGRES_PORT:-5432}"
PG_USER="${DB_USER:-${POSTGRES_USER:-postgres}}"

echo "[entrypoint] Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${PG_USER}" >/dev/null 2>&1; do
    echo "[entrypoint] PostgreSQL is unavailable - sleeping 2s..."
    sleep 2
done
echo "[entrypoint] PostgreSQL is ready."

echo "[entrypoint] Running database migrations (alembic -c alembic.ini upgrade head)..."
alembic -c alembic.ini upgrade head
echo "[entrypoint] Database migrations completed successfully."

echo "[entrypoint] Starting Uvicorn (app.main:app)..."
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers "${UVICORN_WORKERS:-3}" \
    --limit-concurrency "${UVICORN_LIMIT_CONCURRENCY:-100}"
