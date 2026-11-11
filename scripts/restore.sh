#!/bin/sh
# Restaurar un respaldo pg_dump. Uso:
#   ./scripts/restore.sh backups/checador-2025-01-15.dump.gz
set -eu

FILE="${1:?Uso: restore.sh <archivo.dump.gz>}"
gunzip -c "$FILE" | pg_restore -d "$PGDATABASE" --clean --if-exists
echo "[restore] restaurado desde $FILE"
