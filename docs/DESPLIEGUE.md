# Guía de despliegue en servidor propio (Presente / checador)

Guía exacta para que TI instale y opere el checador en un servidor Linux propio.
Tiempo estimado: **2-4 horas** la primera vez. Requisitos: VM o físico con **4 vCPU / 8 GB RAM / 60 GB disco**, Ubuntu 22.04 o 24.04 (amd64), acceso a Internet (para imágenes y Let's Encrypt).

---

## 0. Antes de empezar (checklist de TI)

- [ ] Nombre DNS público apuntando al servidor, p. ej. `presente.empresa.com` (registro A). Necesario para el bot de Teams y TLS.
- [ ] Firewall corporativo permite entrada **80/TCP y 443/TCP** hacia el servidor. Ningún otro puerto expuesto.
- [ ] Acceso SSH al servidor con usuario sudo.
- [ ] (Para el bot) App registration en Entra ID: anota `BOT_APP_ID`, client secret y `ENTRA_TENANT_ID`.

## 1. Instalar Docker + Compose

```bash
ssh admin@presente.empresa.com
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # cerrar sesión y volver a entrar
```

## 2. Obtener el código

```bash
sudo mkdir -p /opt/presente && sudo chown $USER /opt/presente
git clone https://github.com/jrivera06/Presente.git /opt/presente
cd /opt/presente
```

## 3. Aprovisionar (automático)

El script hace todo: `.env`, secrets, TLS, firewall y arranque del stack.

```bash
sudo ./scripts/provision.sh --domain presente.empresa.com --email soporte@empresa.com
```

El script es idempotente: se puede relanzar sin romper nada. Opciones:

| Opción | Descripción |
|---|---|
| `--domain` | Dominio público del servidor (obligatorio) |
| `--email` | Correo para Let's Encrypt |
| `--tls selfsigned` | En vez de Let's Encrypt: certificado autofirmado (solo redes internas sin dominio público) |
| `--skip-firewall` | No tocar `ufw` (si el firewall lo administra otro equipo) |

## 4. Qué hace `provision.sh` (por si prefieres hacerlo a mano)

```bash
# 1. Configuración
cp .env.example .env && nano .env          # ajustar POSTGRES_*, MINIO_*, ENTRA_*
mkdir -p secrets nginx/certs
openssl rand -base64 24 > secrets/postgres_password
openssl rand -base64 24 > secrets/minio_password
chmod 600 secrets/*

# 2. TLS (Let's Encrypt, renovación automática por systemd timer de certbot)
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d presente.empresa.com -m soporte@empresa.com --agree-tos
sudo cp /etc/letsencrypt/live/presente.empresa.com/{fullchain.pem,privkey.pem} nginx/certs/
# (o: ./scripts/tls-init.sh selfsigned presente.empresa.com)

# 3. Firewall: solo SSH, HTTP y HTTPS
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable

# 4. Arrancar
docker compose up -d --build
```

## 5. Verificación post-instalación

```bash
./scripts/verify.sh
```

Comprueba: contenedores sanos, Postgres aceptando conexiones, Redis, MinIO, API respondiendo y proxy con TLS. Después:

1. Abre `https://presente.empresa.com` — debe cargar el frontend.
2. En Azure Bot Service configura el endpoint `https://presente.empresa.com/api/messages`.
3. Envía `entrada` al bot en Teams y verifica el registro en la base:
   `docker compose exec postgres psql -U checador -c "SELECT * FROM shifts;"`

## 6. Operación continua

| Tarea | Comando / frecuencia |
|---|---|
| Respaldos | Automáticos (sidecar `backup`, diario a volumen `backups`). Copiar el volumen a MinIO o sitio externo **semanalmente** (regla 3-2-1) |
| Probar restauración | `./scripts/restore.sh backups/checador-YYYY-MM-DD.dump.gz` — **trimestral**, documentar el resultado (RPO 24h / RTO 4h) |
| Actualizar el sistema | `./scripts/update.sh` (git pull + rebuild + prune) — mensual |
| Renovar TLS | Automático (certbot timer + `tls-renew.sh` vía deploy hook) |
| Ver logs | `docker compose logs -f api worker` |
| Reiniciar un servicio | `docker compose restart api` |
| Estado | `docker compose ps` / `./scripts/verify.sh` |

## 7. Alta en Entra ID / Teams (una sola vez)

1. **App registration** (identidad del bot): registra `Presente-Bot`, crea client secret, anota `BOT_APP_ID` y pégalo en `.env`.
2. **Azure Bot Service**: crea el bot, canal de Teams, endpoint `https://presente.empresa.com/api/messages`.
3. **Scope de API** para el frontend: expón `api://checador-api` (= `ENTRA_AUDIENCE` en `.env`).
4. Tras cambiar `.env`: `docker compose up -d` para recrear los contenedores.

## 8. DR y mantenimiento del host

- El host solo necesita: Docker, el directorio `/opt/presente` y los volúmenes (`pgdata`, `miniodata`, `backups`).
- Restauración en servidor nuevo: instalar Docker (§1) → clonar repo (§2) → copiar `.env`, `secrets/`, `nginx/certs/` y el volumen `backups` → `docker compose up -d` → restaurar el dump más reciente.
- Actualizaciones del SO: `sudo apt-get update && sudo apt-get upgrade` con reinicio programado en ventana de mantenimiento (la app no debe quedar expuesta sin TLS).

## 9. Costo y dimensionamiento

- 500 usuarios: 4 vCPU / 8 GB sobra; escrituras mínimas, lecturas del tablero.
- Costo recurrente: ≈ $0 (todo open source; el canal de Azure Bot Service es gratuito).
- Contrapartida: TI opera respaldos, actualizaciones y disponibilidad.
