#!/usr/bin/env bash
# ==============================================================================
# OxenGL Backend Container Entrypoint
# Automatically verifies database connectivity and applies Alembic migrations
# before launching the application server.
# ==============================================================================
set -e

echo "[OxenGL Startup] Verifying PostgreSQL connectivity on ${POSTGRES_HOST:-postgres_db}:5432..."
while ! pg_isready -h "${POSTGRES_HOST:-postgres_db}" -p 5432 -U "${DB_USER:-oxengl_app}" -d "${DB_NAME:-erp_db_com}" >/dev/null 2>&1; do
    echo "[OxenGL Startup] Waiting for PostgreSQL database to become ready..."
    sleep 1
done
echo "[OxenGL Startup] PostgreSQL is ready."

echo "[OxenGL Startup] Running automatic database migrations (alembic upgrade head)..."
alembic -c /app/backend/alembic.ini upgrade head
echo "[OxenGL Startup] Database migrations up to date."

exec "$@"
