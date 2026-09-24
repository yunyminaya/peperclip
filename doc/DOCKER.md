# Inicio rápido con Docker

Ejecuta Paperclip en Docker sin instalar Node ni pnpm en local.

## Una línea (build + run)

```sh
docker build -t paperclip-local . && \
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

Abre: `http://localhost:3100`

Persistencia de datos:

- Datos de PostgreSQL embebido
- assets subidos
- clave local de secretos
- datos locales del workspace de agentes

Todo persiste bajo tu bind mount (`./data/docker-paperclip` en el ejemplo de arriba).

## Inicio rápido con Compose

```sh
docker compose -f docker-compose.quickstart.yml up --build
```

Valores por defecto:

- puerto de host: `3100`
- directorio de datos persistente: `./data/docker-paperclip`

Overrides opcionales:

```sh
PAPERCLIP_PORT=3200 PAPERCLIP_DATA_DIR=./data/pc docker compose -f docker-compose.quickstart.yml up --build
```

Si cambias el puerto de host o usas un dominio no local, define `PAPERCLIP_PUBLIC_URL` con la URL externa que usarás en flujos de navegador/autenticación.

## Compose autenticado (una sola URL pública)

Para despliegues autenticados, define una URL pública canónica y deja que Paperclip derive los valores por defecto de autenticación/callback:

```yaml
services:
  paperclip:
    environment:
      PAPERCLIP_DEPLOYMENT_MODE: authenticated
      PAPERCLIP_DEPLOYMENT_EXPOSURE: private
      PAPERCLIP_PUBLIC_URL: https://desk.koker.net
```

`PAPERCLIP_PUBLIC_URL` se usa como fuente principal para:

- URL base pública de autenticación
- valores por defecto de URL base de Better Auth
- valores por defecto de URL de invitación bootstrap
- valores por defecto de lista de hosts permitidos (hostname extraído de la URL)

Los overrides granulares siguen disponibles si se necesitan (`PAPERCLIP_AUTH_PUBLIC_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `PAPERCLIP_ALLOWED_HOSTNAMES`).

Define `PAPERCLIP_ALLOWED_HOSTNAMES` explícitamente solo cuando necesites hostnames adicionales más allá del host de la URL pública (por ejemplo alias de Tailscale/LAN o múltiples hostnames privados).

## Adaptadores locales Claude + Codex en Docker

La imagen preinstala:

- `claude` (CLI de Anthropic Claude Code)
- `codex` (CLI de OpenAI Codex)

Si quieres ejecuciones de adaptadores locales dentro del contenedor, pasa API keys al iniciar el contenedor:

```sh
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -e OPENAI_API_KEY=... \
  -e ANTHROPIC_API_KEY=... \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

Notas:

- Sin API keys, la app sigue ejecutándose normalmente.
- Los chequeos de entorno de adaptadores en Paperclip mostrarán requisitos faltantes de autenticación/CLI.

## Contenedor de revisión de PR no confiables

Si quieres un entorno Docker separado para revisar pull requests no confiables con `codex` o `claude`, usa el flujo de revisión dedicado en `doc/UNTRUSTED-PR-REVIEW.md`.

Esa configuración mantiene el estado de autenticación de los CLI en volúmenes Docker en lugar de tu directorio home del host y usa un workspace de scratch separado para checkouts de PR y ejecuciones de vista previa.

## Prueba de humo de onboard (solo Ubuntu + npm)

Úsalo cuando quieras imitar una máquina nueva que solo tiene Ubuntu + npm y verificar:

- `npx paperclipai onboard --yes` se completa
- el servidor hace bind en `0.0.0.0:3100` para que el acceso del host funcione
- los banners de onboard/run y los logs de arranque son visibles en tu terminal

Build + run:

```sh
./scripts/docker-onboard-smoke.sh
```

Abre: `http://localhost:3131` (puerto de host de humo por defecto)

Overrides útiles:

```sh
HOST_PORT=3200 PAPERCLIPAI_VERSION=latest ./scripts/docker-onboard-smoke.sh
PAPERCLIP_DEPLOYMENT_MODE=authenticated PAPERCLIP_DEPLOYMENT_EXPOSURE=private ./scripts/docker-onboard-smoke.sh
SMOKE_DETACH=true SMOKE_METADATA_FILE=/tmp/paperclip-smoke.env PAPERCLIPAI_VERSION=latest ./scripts/docker-onboard-smoke.sh
```

Notas:

- Los datos persistentes se montan en `./data/docker-onboard-smoke` por defecto.
- El id de usuario de runtime del contenedor por defecto es tu `id -u` local para que el directorio de datos montado siga siendo escribible evitando runtime como root.
- El script de humo por defecto usa modo `authenticated/private` para que `HOST=0.0.0.0` pueda exponerse al host.
- El script de humo usa por defecto el puerto de host `3131` para evitar conflictos con Paperclip local en `3100`.
- El script de humo también usa por defecto `PAPERCLIP_PUBLIC_URL` en `http://localhost:<HOST_PORT>` para que las URLs de invitación bootstrap y los callbacks de autenticación usen el puerto de host alcanzable en lugar del `3100` interno del contenedor.
- En modo autenticado, el script de humo usa por defecto `SMOKE_AUTO_BOOTSTRAP=true` y conduce la ruta bootstrap real automáticamente: registra un usuario real, ejecuta `paperclipai auth bootstrap-ceo` dentro del contenedor para acuñar una invitación bootstrap real, acepta esa invitación por HTTP y verifica el acceso de sesión del tablero.
- Ejecuta el script en primer plano para ver el flujo de incorporación; detén con `Ctrl+C` después de validar.
- Define `SMOKE_DETACH=true` para dejar el contenedor ejecutándose para automatización y opcionalmente escribir metadatos listos para shell en `SMOKE_METADATA_FILE`.
- La definición de la imagen está en `Dockerfile.onboard-smoke`.
