#!/usr/bin/env bash
# Provisionamiento del servidor propio para Presente (checador on-premise).
# Idempotente: se puede relanzar sin romper nada.
# Uso: sudo ./scripts/provision.sh --domain presente.empresa.com --email soporte@empresa.com [--tls selfsigned] [--skip-firewall]
set -euo pipefail

DOMAIN=""
EMAIL=""
TLS_MODE="letsencrypt"
SKIP_FIREWALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --tls) TLS_MODE="$2"; shift 2 ;;
    --skip-firewall) SKIP_FIREWALL=1; shift ;;
    *) echo "Opción desconocida: $1"; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Ejecutar con sudo"; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Falta --domain"; exit 1; }
[[ -f docker-compose.yml ]] || { echo "Ejecutar desde la raíz del repositorio clonado"; exit 1; }

echo "==> [1/6] Docker Engine + Compose"
if ! docker compose version &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
docker compose version

echo "==> [2/6] Configuración (.env + secrets)"
if [[ ! -f .env ]]; then
  cp .env.example .env
  sed -i "s/^ENTRA_AUDIENCE=.*/ENTRA_AUDIENCE=api:\/\/checador-api/" .env
  echo "  .env creado desde .env.example — EDITAR antes de producción: $PWD/.env"
fi
mkdir -p secrets nginx/certs
[[ -f secrets/postgres_password ]] || { openssl rand -base64 24 > secrets/postgres_password; chmod 600 secrets/postgres_password; }
[[ -f secrets/minio_password ]]    || { openssl rand -base64 24 > secrets/minio_password;    chmod 600 secrets/minio_password; }
chmod 600 secrets/* 2>/dev/null || true

echo "==> [3/6] TLS ($TLS_MODE) para $DOMAIN"
if [[ "$TLS_MODE" == "selfsigned" ]]; then
  ./scripts/tls-init.sh selfsigned "$DOMAIN"
else
  [[ -n "$EMAIL" ]] || { echo "Falta --email para Let's Encrypt (o usa --tls selfsigned)"; exit 1; }
  ./scripts/tls-init.sh letsencrypt "$DOMAIN" "$EMAIL"
fi

echo "==> [4/6] Firewall (solo SSH/HTTP/HTTPS)"
if [[ $SKIP_FIREWALL -eq 0 ]] && command -v ufw &>/dev/null; then
  ufw allow 22/tcp  >/dev/null
  ufw allow 80/tcp  >/dev/null
  ufw allow 443/tcp >/dev/null
  yes | ufw enable >/dev/null || true
  ufw status | head -10
else
  echo "  (omitido)"
fi

echo "==> [5/6] Arrancando stack"
docker compose up -d --build

echo "==> [6/6] Verificación"
sleep 5
./scripts/verify.sh || true

cat <<AVISO

════════════════════════════════════════════════════════════
 PENDIENTES MANUALES:
 1. Editar .env (contraseñas, ENTRA_TENANT_ID, ENTRA_AUDIENCE, TIMEZONE)
 2. docker compose up -d   (tras editar .env)
 3. Azure Bot Service -> endpoint: https://$DOMAIN/api/messages
 Guía completa: docs/DESPLIEGUE.md
════════════════════════════════════════════════════════════
AVISO
