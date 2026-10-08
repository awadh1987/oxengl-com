#!/usr/bin/env bash
# ====================================================================
# OxenGL Production Database Automated Snapshot Utility
# Purpose: Executes non-blocking compressed backups and rotates assets.
# ====================================================================
set -eo pipefail

BACKUP_DIR="/var/backups/oxengl/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_FILE="${BACKUP_DIR}/erp_db_${TIMESTAMP}.sql.gz"
CONTAINER_NAME="oxengl_postgres_container"
RETENTION_DAYS=7

echo -e "\033[1m[BACKUP-INFO]\033[0m Commencing compressed database snapshot allocation loop..."
mkdir -p "${BACKUP_DIR}"

# 1. Execute safe, transaction-isolated pg_dump stream over the live container node
docker exec "${CONTAINER_NAME}" pg_dump -U postgres -d erp_db | gzip > "${TARGET_FILE}"

# 2. Restrict file permissions immediately to protect enterprise state secrets
chmod 0600 "${TARGET_FILE}"
echo -e "\033[92m[SUCCESS]\033[0m Local compressed backup archive generated at: ${TARGET_FILE}"

# 3. Optional Cloud Mirroring Hook Block
# aws s3 cp "${TARGET_FILE}" "s3://my-secure-oxengl-vault-bucket/db/" --quiet

# 4. Prune historical backup instances older than the explicit retention threshold
echo -e "[BACKUP-INFO] Scanning for historical artifacts older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "erp_db_*.sql.gz" -mtime +"${RETENTION_DAYS}" -exec rm -f {} \;
echo -e "\033[92m[SUCCESS]\033[0m Historical snapshot compaction cycle complete."
