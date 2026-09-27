#!/usr/bin/env bash
# ==============================================================================
# OxenGL Automated PostgreSQL Backup & Pruning Routine
# ==============================================================================
set -euo pipefail

BACKUP_DIR="/root/backups/postgres"
ENV_FILE="/root/oxen-gl/backend/.env"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="${BACKUP_DIR}/oxengl_db_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=14
DOCKER_CONTAINER="oxengl_postgres_container"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting automated PostgreSQL backup..."

# 1. Load Database Credentials
if [ -f "${ENV_FILE}" ]; then
    # Export only DB variables safely without breaking on complex values
    export POSTGRES_USER=$(grep -E '^POSTGRES_USER=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'")
    export POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'")
    export POSTGRES_HOST=$(grep -E '^POSTGRES_HOST=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'")
    export POSTGRES_PORT=$(grep -E '^POSTGRES_PORT=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'")
    export POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-erp_db}"

# 2. Execute pg_dump (try native host pg_dump first, fallback to docker exec)
if command -v pg_dump >/dev/null 2>&1; then
    PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --no-owner \
        --clean \
        --if-exists \
        | gzip > "${DUMP_FILE}"
elif docker ps --format '{{.Names}}' | grep -q "^${DOCKER_CONTAINER}$"; then
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${DOCKER_CONTAINER}" \
        pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --clean --if-exists \
        | gzip > "${DUMP_FILE}"
else
    echo "ERROR: Neither host pg_dump nor docker container ${DOCKER_CONTAINER} is accessible." >&2
    exit 1
fi

# Verify archive creation and non-empty size
if [ ! -s "${DUMP_FILE}" ]; then
    echo "ERROR: Backup dump file ${DUMP_FILE} is empty or was not created." >&2
    rm -f "${DUMP_FILE}"
    exit 1
fi

FILE_SIZE=$(ls -lh "${DUMP_FILE}" | awk '{print $5}')
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup successfully created: ${DUMP_FILE} (Size: ${FILE_SIZE})"

# 3. Prune Backups Older Than 14 Days
PRUNED_COUNT=$(find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" | wc -l)
find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Retention cleanup complete: ${PRUNED_COUNT} archive(s) older than ${RETENTION_DAYS} days pruned."
