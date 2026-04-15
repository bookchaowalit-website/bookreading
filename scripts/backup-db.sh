#!/usr/bin/env bash
# Database backup script for BookReading
# Creates a gzipped SQL dump of the PostgreSQL database

set -euo pipefail

CONTAINER_NAME="bookreading-db"
BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/bookreading_${TIMESTAMP}.sql.gz"

# Create backups directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Check if the container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ERROR: Container '${CONTAINER_NAME}' is not running."
    echo "Start it with: docker compose up -d"
    exit 1
fi

echo "Starting database backup..."
echo "Container: ${CONTAINER_NAME}"
echo "Output: ${BACKUP_FILE}"

# Run pg_dump inside the container and compress output
docker exec "${CONTAINER_NAME}" pg_dump -U bookreading -d bookreading \
    | gzip > "${BACKUP_FILE}"

# Verify backup was created and show file size
if [ -f "${BACKUP_FILE}" ]; then
    FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "Backup completed successfully!"
    echo "File: ${BACKUP_FILE}"
    echo "Size: ${FILE_SIZE}"
else
    echo "ERROR: Backup file was not created."
    exit 1
fi
