#!/bin/bash

BACKUP_DIR="/root/oxengl-com/backups"
CONTAINER="oxengl_com_postgres_container"
DB_USER="postgres"
DB_NAME="erp_db_com"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")

# Run pg_dump inside the container and compress it on the host
docker exec -t "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz"

# Delete backups older than 7 days to prevent disk space exhaustion
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -exec rm {} \;
