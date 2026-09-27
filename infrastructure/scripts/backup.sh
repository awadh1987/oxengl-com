#!/usr/bin/env bash
# ==============================================================================
# OxenGL Enterprise Automated PostgreSQL Daily Backup Routine
# Executes pg_dump, gzip compression, checksum generation & retention pruning
#
# Daily Cron Configuration (Run at 02:00 AM every night):
#   0 2 * * * /root/oxen-gl/scripts/backup.sh >> /var/log/oxengl_backup.log 2>&1
# ==============================================================================
set -euo pipefail

# Configuration parameters with sensible defaults
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILENAME="oxengl_erp_backup_${TIMESTAMP}.sql.gz"
DUMP_FILEPATH="${BACKUP_DIR}/${DUMP_FILENAME}"
CHECKSUM_FILEPATH="${DUMP_FILEPATH}.sha256"
DOCKER_CONTAINER="${DOCKER_CONTAINER:-oxengl_postgres_container}"

# Ensure backup destination directory exists
mkdir -p "${BACKUP_DIR}"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
}

log "================================================================="
log "Starting OxenGL PostgreSQL Database Backup: ${DUMP_FILENAME}"
log "================================================================="

# 1. Load Database Credentials from Environment or .env files
ENV_FILE="${PROJECT_DIR}/backend/.env"
if [ ! -f "${ENV_FILE}" ] && [ -f "${PROJECT_DIR}/.env" ]; then
    ENV_FILE="${PROJECT_DIR}/.env"
fi

if [ -f "${ENV_FILE}" ]; then
    log "Loading credentials from: ${ENV_FILE}"
    # Extract DB variables safely without sourcing entire file
    DB_USER_VAL=$(grep -E '^POSTGRES_USER=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
    DB_PASS_VAL=$(grep -E '^POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
    DB_HOST_VAL=$(grep -E '^POSTGRES_HOST=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
    DB_PORT_VAL=$(grep -E '^POSTGRES_PORT=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
    DB_NAME_VAL=$(grep -E '^POSTGRES_DB=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)

    [ -n "${DB_USER_VAL}" ] && POSTGRES_USER="${DB_USER_VAL}"
    [ -n "${DB_PASS_VAL}" ] && POSTGRES_PASSWORD="${DB_PASS_VAL}"
    [ -n "${DB_HOST_VAL}" ] && POSTGRES_HOST="${DB_HOST_VAL}"
    [ -n "${DB_PORT_VAL}" ] && POSTGRES_PORT="${DB_PORT_VAL}"
    [ -n "${DB_NAME_VAL}" ] && POSTGRES_DB="${DB_NAME_VAL}"
fi

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-erp_db}"

# 2. Execute pg_dump with Gzip Compression
log "Executing pg_dump for database '${POSTGRES_DB}'..."

if command -v pg_dump >/dev/null 2>&1; then
    log "Using host native pg_dump tool..."
    PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --no-owner \
        --clean \
        --if-exists \
        | gzip -9 > "${DUMP_FILEPATH}"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "${DOCKER_CONTAINER}"; then
    log "Using Docker container exec (${DOCKER_CONTAINER})..."
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${DOCKER_CONTAINER}" \
        pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --clean --if-exists \
        | gzip -9 > "${DUMP_FILEPATH}"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "postgres"; then
    ACTIVE_CONTAINER=$(docker ps --format '{{.Names}}' | grep "postgres" | head -n 1)
    log "Using detected PostgreSQL container (${ACTIVE_CONTAINER})..."
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${ACTIVE_CONTAINER}" \
        pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --clean --if-exists \
        | gzip -9 > "${DUMP_FILEPATH}"
else
    log "ERROR: Neither host 'pg_dump' nor an active Docker PostgreSQL container was found." >&2
    exit 1
fi

# 3. Verify Non-Empty Dump & Create Checksum
if [ ! -s "${DUMP_FILEPATH}" ]; then
    log "ERROR: Backup creation failed. File is missing or 0 bytes." >&2
    rm -f "${DUMP_FILEPATH}"
    exit 1
fi

FILE_SIZE=$(ls -lh "${DUMP_FILEPATH}" | awk '{print $5}')
sha256sum "${DUMP_FILEPATH}" > "${CHECKSUM_FILEPATH}"
CHECKSUM=$(cut -d' ' -f1 < "${CHECKSUM_FILEPATH}")

log "Backup successfully created: ${DUMP_FILEPATH}"
log "• Archive Size: ${FILE_SIZE}"
log "• SHA256 Hash:  ${CHECKSUM}"

# 4. Retention Pruning Policy (Delete dumps older than RETENTION_DAYS)
log "Running retention policy: pruning archives older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
PRUNED_COUNT=0
while IFS= read -r old_file; do
    if [ -n "${old_file}" ]; then
        rm -f "${old_file}" "${old_file}.sha256"
        PRUNED_COUNT=$((PRUNED_COUNT + 1))
    fi
done < <(find "${BACKUP_DIR}" -type f -name "oxengl_erp_backup_*.sql.gz" -mtime "+${RETENTION_DAYS}")

log "Retention pruning complete: ${PRUNED_COUNT} stale backup file(s) removed."
log "Daily backup routine completed successfully."
exit 0
