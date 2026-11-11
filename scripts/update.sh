#!/usr/bin/env bash
# Actualización mensual del sistema: git pull + rebuild + limpieza.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> git pull"
git pull --ff-only

echo "==> rebuild + recreate"
docker compose up -d --build

echo "==> esquema (si postgres/init/ cambió, revisar migraciones incrementales)"
echo "  (init solo corre en el primer arranque; ver docs/DESPLIEGUE.md §6)"

echo "==> limpieza de imágenes antiguas"
docker image prune -f

echo "==> verificación"
./scripts/verify.sh
