#!/bin/sh
# pg_dump diario con retención. Loop para el contenedor sidecar "backup".
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
OUTDIR=/backups

while :; do
  TODAY=$(date +%F)
  if [ ! -f "$OUTDIR/checador-$TODAY.dump.gz" ]; then
    pg_dump -Fc "$PGDATABASE" | gzip > "$OUTDIR/checador-$TODAY.dump.gz" \
      && echo "[backup] respaldo creado: checador-$TODAY.dump.gz" \
      || echo "[backup] ERROR en pg_dump"
  fi

  find "$OUTDIR" -name 'checador-*.dump.gz' -mtime +"$RETENTION_DAYS" -delete
  echo "[backup] siguiente intento en 24h"
  sleep 86400
done
