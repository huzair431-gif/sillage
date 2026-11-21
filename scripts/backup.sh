#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_directory="${SILLAGE_BACKUP_DIR:-./backups}"
mkdir -p "$backup_directory"
backup_file="$backup_directory/sillage-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Connexion via PGHOST, PGPORT, PGUSER, PGDATABASE et PGPASSFILE ; aucun secret en argument.
pg_dump --format=custom --no-owner --no-acl --file="$backup_file"
pg_restore --list "$backup_file" >/dev/null
printf 'Sauvegarde créée et catalogue vérifié : %s\n' "$backup_file"
