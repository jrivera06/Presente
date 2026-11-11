# Checador on-premise (Teams + PostgreSQL)

Implementación on-premise del checador de jornada conforme a la guía: todo en Docker Compose,
PostgreSQL 16, MinIO (API S3), Redis, API Node, timer worker y reverse proxy Nginx.
**Cloud-agnostic:** cero SDKs de nube en el código; migrar a Azure/AWS es cambio de infraestructura.

## Estructura

```
docker-compose.yml          # todo el stack
.env.example                # configuración 12-factor (copiar a .env)
postgres/init/01-schema.sql # modelo de datos (jornadas, HE, retardos, firmas)
api/                        # Express: /api/clock, /api/me/*, /api/messages (bot)
worker/                     # reglas por minuto: cierre auto, registros semanales, preavisos
frontend/                   # SPA base (MSAL pendiente de integrar)
nginx/                      # reverse proxy TLS (bot + frontend expuestos)
scripts/                    # pg_dump diario con retención + restore
```

## Puesta en marcha

```bash
cp .env.example .env                 # ajustar valores
mkdir -p secrets nginx/certs
openssl rand -base64 24 > secrets/postgres_password
openssl rand -base64 24 > secrets/minio_password
# TLS: certbot o copiar fullchain.pem/privkey.pem a nginx/certs/

docker compose up -d --build
docker compose ps
```

En desarrollo, exponer el bot con `ngrok http 80` y configurar el endpoint de
Azure Bot Service con la URL de ngrok (`/api/messages`).

## Configuración de Entra ID / Teams

1. App registration (la identidad del bot): genera `BOT_APP_ID` y client secret.
2. Azure Bot Service: canal de Teams, endpoint `https://TU-DOMINIO/api/messages`.
3. Exponer la API al frontend: scope `api://checador-api` (= `ENTRA_AUDIENCE`).
4. El bot entiende los comandos `entrada` y `salida` en chat directo.

## Operación

- **Respaldos**: sidecar `backup` ejecuta `pg_dump -Fc` diario a `/backups` (volumen),
  retención configurable (`BACKUP_RETENTION_DAYS`). Copiar además a MinIO o sitio externo (regla 3-2-1).
- **Restauración**: `./scripts/restore.sh <archivo.dump.gz>` (probar trimestralmente; RPO 24h / RTO 4h).
- **Bitácoras**: retención ≥ 4 años de registros de jornada; versionar bucket MinIO.
- **Actualizaciones**: imágenes fijadas por digest; rutina mensual.

## Checklist de portabilidad (auditar cada sprint)

- [ ] Cero SDKs de nube en código de aplicación (solo SQL, API S3, HTTPS).
- [ ] Configuración 100% por variables de entorno; mismo compose corre en cualquier lado.
- [ ] Esquema Postgres sin extensiones propietarias.
- [ ] Archivos siempre vía API S3, nunca rutas locales absolutas.
- [ ] Secretos por referencia (Docker secrets), resueltos por el entorno.
- [ ] `docker compose up` + `pg_dump` probados en una VM limpia de cero.

## Pendientes para producción

- [ ] Integrar MSAL en el frontend para tokens Bearer contra `/api/*`.
- [ ] Sustituir el stub del bot por Bot Framework SDK (validación completa del token).
- [ ] Firmado semanal (hash + PDF a MinIO) y entrega de notificaciones vía proactive messages.
- [ ] Prometheus + Grafana para monitoreo.
