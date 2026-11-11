#!/usr/bin/env bash
# TLS para el reverse proxy: Let's Encrypt (dominio público) o autofirmado (red interna).
# Uso:
#   sudo ./scripts/tls-init.sh letsencrypt presente.empresa.com soporte@empresa.com
#   sudo ./scripts/tls-init.sh selfsigned presente.empresa.com
set -euo pipefail

MODE="${1:-}"
DOMAIN="${2:-}"
EMAIL="${3:-}"
CERT_DIR="nginx/certs"

[[ -d "$CERT_DIR" ]] || { echo "Ejecutar desde la raíz del repositorio"; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Uso: tls-init.sh {letsencrypt|selfsigned} <dominio> [email]"; exit 1; }

if [[ "$MODE" == "selfsigned" ]]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$CERT_DIR/privkey.pem" -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=$DOMAIN/O=Presente"
  echo "Certificado autofirmado creado (825 días). Los navegadores mostrarán aviso; importar en los clientes de confianza."
  exit 0
fi

[[ -n "$EMAIL" ]] || { echo "Modo letsencrypt requiere email"; exit 1; }

if [[ -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "TLS ya configurado en $CERT_DIR — nada que hacer."
  exit 0
fi

apt-get update -qq && apt-get install -y -qq certbot
# El proxy ocupa el 80: liberarlo durante la validación standalone
docker compose stop proxy
certbot certonly --standalone -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive || { docker compose start proxy; exit 1; }
docker compose start proxy

cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem"  "$CERT_DIR/"
chmod 644 "$CERT_DIR/fullchain.pem" "$CERT_DIR/privkey.pem"

# Renovación automática: hook deploy de certbot que copia y recarga nginx
HOOK="$(cd "$(dirname "$0")" && pwd)/tls-renew.sh"
cat > /etc/letsencrypt/renewal-hooks/deploy/presente-reload.sh <<EOF
#!/bin/sh
"$HOOK"
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/presente-reload.sh

echo "TLS de Let's Encrypt instalado; renovación automática configurada (deploy hook)."
