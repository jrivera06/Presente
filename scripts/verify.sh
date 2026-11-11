#!/usr/bin/env bash
# Verificación post-despliegue del stack Presente.
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0
check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  OK  $name"
  else
    echo "  FALLO  $name"; FAIL=1
  fi
}

echo "Contenedores:"
docker compose ps

echo "Servicios:"
check "API responde (/healthz via proxy)"   curl -fk https://localhost/healthz
check "Proxy redirige HTTP a HTTPS"          curl -s -o /dev/null -w '%{http_code}' http://localhost/ | grep -q 301
check "Frontend carga"                       curl -sk https://localhost/ | grep -qi '<title>Checador</title>'
check "PostgreSQL acepta conexiones"         docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-checador}"
check "Redis responde PING"                  docker compose exec -T redis redis-cli ping | grep -q PONG
check "Worker en ejecucion"                  docker compose logs worker 2>&1 | grep -q 'iniciado'

if [[ $FAIL -eq 0 ]]; then
  echo "TODO OK"
else
  echo "HAY FALLOS - revisar: docker compose logs <servicio>"
fi
exit $FAIL
