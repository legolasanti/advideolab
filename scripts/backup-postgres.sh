#!/bin/bash
#
# PostgreSQL Backup Script for UGC Video SaaS
#
# Usage: ./backup-postgres.sh
#
# Configuration: Set environment variables or use /etc/ugcvideo-backup.env
#
set -euo pipefail

# Load configuration
if [ -f /etc/ugcvideo-backup.env ]; then
  # shellcheck source=/dev/null
  source /etc/ugcvideo-backup.env
fi

# Configuration with defaults
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-app}"
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ugcvideo/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DOCKER_CONTAINER="${DOCKER_CONTAINER:-}"  # Optional: run pg_dump inside container

# Derived variables
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/ugcvideo_${TIMESTAMP}.dump.gz"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# Functions
log_info() {
  echo "${LOG_PREFIX} INFO: $*"
}

log_error() {
  echo "${LOG_PREFIX} ERROR: $*" >&2
}

log_success() {
  echo "${LOG_PREFIX} SUCCESS: $*"
}

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

log_info "Starting PostgreSQL backup for database '${POSTGRES_DB}'"
log_info "Backup destination: ${BACKUP_FILE}"

# Perform backup
if [ -n "${DOCKER_CONTAINER}" ]; then
  # Run pg_dump inside Docker container
  log_info "Using Docker container: ${DOCKER_CONTAINER}"
  docker exec "${DOCKER_CONTAINER}" pg_dump \
    -U "${POSTGRES_USER}" \
    -Fc \
    --no-owner \
    --no-acl \
    "${POSTGRES_DB}" | gzip > "${BACKUP_FILE}"
else
  # Run pg_dump directly (requires PostgreSQL client and access)
  export PGPASSWORD="${POSTGRES_PASSWORD}"
  pg_dump \
    -h "${POSTGRES_HOST}" \
    -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" \
    -Fc \
    --no-owner \
    --no-acl \
    "${POSTGRES_DB}" | gzip > "${BACKUP_FILE}"
  unset PGPASSWORD
fi

# Validate backup
if [ ! -f "${BACKUP_FILE}" ]; then
  log_error "Backup file was not created!"
  exit 1
fi

BACKUP_SIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}" 2>/dev/null)
if [ "${BACKUP_SIZE}" -lt 1000 ]; then
  log_error "Backup file is suspiciously small (${BACKUP_SIZE} bytes). Check for errors."
  rm -f "${BACKUP_FILE}"
  exit 1
fi

BACKUP_SIZE_HUMAN=$(numfmt --to=iec "${BACKUP_SIZE}" 2>/dev/null || echo "${BACKUP_SIZE} bytes")
log_success "Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE_HUMAN})"

# Clean up old backups
log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=0
while IFS= read -r -d '' old_file; do
  rm -f "${old_file}"
  log_info "Deleted old backup: ${old_file}"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -name "ugcvideo_*.dump.gz" -type f -mtime "+${RETENTION_DAYS}" -print0 2>/dev/null)

if [ "${DELETED_COUNT}" -gt 0 ]; then
  log_info "Removed ${DELETED_COUNT} old backup(s)"
fi

# Report current backup status
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "ugcvideo_*.dump.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)
log_info "Backup directory contains ${BACKUP_COUNT} backup(s), total size: ${TOTAL_SIZE}"

log_success "Backup process completed successfully"
