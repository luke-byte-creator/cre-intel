#!/bin/bash
# Nova Research CRE Intel - SQLite Daily Backup
# Runs via launchd daily at 3:00 AM

set -euo pipefail

DB_PATH="/Users/lukejansen/.openclaw/workspace/cre-intel/data/cre-intel.db"
BACKUP_DIR="/Users/lukejansen/.openclaw/workspace/cre-intel/data/backups"
LOG="/tmp/nova-backup.log"
DATE=$(date +%Y-%m-%d)
BACKUP_FILE="cre-intel-${DATE}.db"
RETENTION_DAYS=14

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

mkdir -p "$BACKUP_DIR"

log "Starting backup..."

# SQLite safe backup
if sqlite3 "$DB_PATH" ".backup ${BACKUP_DIR}/${BACKUP_FILE}"; then
    log "SQLite backup succeeded: ${BACKUP_FILE}"
else
    log "ERROR: SQLite backup failed!"
    exit 1
fi

# Compress
if gzip -f "${BACKUP_DIR}/${BACKUP_FILE}"; then
    SIZE=$(ls -lh "${BACKUP_DIR}/${BACKUP_FILE}.gz" | awk '{print $5}')
    log "Compressed: ${BACKUP_FILE}.gz (${SIZE})"
else
    log "ERROR: Compression failed!"
    exit 1
fi

# Prune old backups
DELETED=$(find "$BACKUP_DIR" -name "cre-intel-*.db.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l | tr -d ' ')
log "Pruned ${DELETED} backup(s) older than ${RETENTION_DAYS} days"

log "Backup complete."
