#!/bin/sh
# Hook de renovación de certbot: copiar certificados nuevos y recargar nginx.
set -e
cd /opt/presente
DOMAIN="${RENEWED_DOMAINS%% *}"
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" nginx/certs/
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem"  nginx/certs/
docker compose exec -T proxy nginx -s reload
echo "[tls-renew] certificados de $DOMAIN actualizados y nginx recargado"
