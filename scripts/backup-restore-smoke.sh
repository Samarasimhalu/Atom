#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./data/backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$BACKUP_DIR"

pg_dump --format=custom --file="$BACKUP_DIR/atom.dump" "$DATABASE_URL"
pg_restore --list "$BACKUP_DIR/atom.dump" > "$BACKUP_DIR/manifest.txt"
grep -q 'atom_runs' "$BACKUP_DIR/manifest.txt"
grep -q 'atom_run_events' "$BACKUP_DIR/manifest.txt"
grep -q 'atom_audit_events' "$BACKUP_DIR/manifest.txt"
grep -q 'atom_artifacts' "$BACKUP_DIR/manifest.txt"

if [[ "${RESTORE_DATABASE_URL:-}" != "" ]]; then
  pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" "$BACKUP_DIR/atom.dump"
  psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1 FROM atom_runs LIMIT 1;'
fi

printf 'Backup created and manifest verified at %s\n' "$BACKUP_DIR"
