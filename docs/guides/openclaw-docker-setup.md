# Ejecutar OpenClaw en Docker (desarrollo local)

Cómo ejecutar OpenClaw en un contenedor Docker para desarrollo local y probar la integración del adaptador OpenClaw de Paperclip.

## Prueba smoke automatizada de join (recomendado primero)

Paperclip incluye un harness smoke de join de extremo a extremo:

```bash
pnpm smoke:openclaw-join
```

El harness automatiza:

- creación de invitaciones (`allowedJoinTypes=agent`)
- solicitud de join del agente OpenClaw (`adapterType=openclaw`)
- aprobación del tablero
- reclamo de API key de un solo uso (incluye verificaciones de reclamos inválidos/repetidos)
- entrega del callback de wakeup a un receptor de webhooks estilo OpenClaw dockerizado

Por defecto, usa una imagen receptora Docker preconfigurada (`docker/openclaw-smoke`) para que la ejecución sea determinista y no requiera ediciones manuales de la configuración de OpenClaw.

Nota de permisos:

- El harness realiza acciones gobernadas por el tablero (creación de invitaciones, aprobación de join, wakeup del nuevo agente).
- En modo autenticado, proporciona auth de tablero/operador o la ejecución termina temprano con un error de permisos explícito.

## UI de OpenClaw Gateway en un comando (flujo Docker manual)

Para levantar OpenClaw en Docker e imprimir una URL de panel para el navegador del host en un comando:

```bash
pnpm smoke:openclaw-docker-ui
```

El comportamiento por defecto es sin flags: puedes ejecutar el comando tal cual sin variables de entorno relacionadas con emparejamiento.

Lo que hace este comando:

- clona/actualiza `openclaw/openclaw` en `/tmp/openclaw-docker`
- construye `openclaw:local` (a menos que `OPENCLAW_BUILD=0`)
- escribe configuración smoke aislada en `~/.openclaw-paperclip-smoke/openclaw.json` y `.env` de Docker
- fija los modelos por defecto del agente a OpenAI (`openai/gpt-5.2` con fallback de OpenAI)
- inicia `openclaw-gateway` vía Compose (con el override tmpfs de `/tmp` requerido)
- sondea e imprime una URL de host de Paperclip accesible desde dentro del Docker de OpenClaw
- espera el estado de salud e imprime:
  - `http://127.0.0.1:18789/#token=...`
- deshabilita el emparejamiento de dispositivos de Control UI por defecto para ergonomía del smoke local

Ajustes de entorno:

- `OPENAI_API_KEY` (requerido; cargado desde env o `~/.secrets`)
- `OPENCLAW_DOCKER_DIR` (por defecto `/tmp/openclaw-docker`)
- `OPENCLAW_GATEWAY_PORT` (por defecto `18789`)
- `OPENCLAW_GATEWAY_TOKEN` (aleatorio por defecto)
- `OPENCLAW_BUILD=0` para omitir la reconstrucción
- `OPENCLAW_OPEN_BROWSER=1` para abrir la URL automáticamente en macOS
- `OPENCLAW_DISABLE_DEVICE_AUTH=1` (por defecto) deshabilita el emparejamiento de dispositivos de Control UI para ergonomía del smoke local
- `OPENCLAW_DISABLE_DEVICE_AUTH=0` mantiene el emparejamiento habilitado (luego aprueba el navegador con comandos CLI `devices`)
- `OPENCLAW_MODEL_PRIMARY` (por defecto `openai/gpt-5.2`)
- `OPENCLAW_MODEL_FALLBACK` (por defecto `openai/gpt-5.2-chat-latest`)
- `OPENCLAW_CONFIG_DIR` (por defecto `~/.openclaw-paperclip-smoke`)
- `OPENCLAW_RESET_STATE=1` (por defecto) reinicia el estado del agente smoke en cada ejecución para evitar derivas de auth/sesión obsoletas
- `PAPERCLIP_HOST_PORT` (por defecto `3100`)
- `PAPERCLIP_HOST_FROM_CONTAINER` (por defecto `host.docker.internal`)

### Modo autenticado

Si tu despliegue de Paperclip es `authenticated`, proporciona contexto de auth:

```bash
PAPERCLIP_AUTH_HEADER="Bearer <token>" pnpm smoke:openclaw-join
# or
PAPERCLIP_COOKIE="your_session_cookie=..." pnpm smoke:openclaw-join
```

### Consejos de topología de red

- Smoke local en el mismo host: el callback por defecto usa `http://127.0.0.1:<port>/webhook`.
- Dentro del Docker de OpenClaw, `127.0.0.1` apunta al propio contenedor, no a tu servidor Paperclip del host.
- Para las URLs de invitación/incorporación consumidas por OpenClaw en Docker, usa la URL de Paperclip impresa por el script (típicamente `http://host.docker.internal:3100`).
- Si Paperclip rechaza el host visible desde el contenedor con un error de hostname, permítelo desde el host:

```bash
pnpm paperclipai allowed-hostname host.docker.internal
```

Luego reinicia Paperclip y vuelve a ejecutar el script smoke.
- OpenClaw Docker/remoto: prefiere un hostname accesible (alias de host Docker, hostname Tailscale o dominio público).
- Modo autenticado/privado: asegúrate de que los hostnames estén en la lista permitida cuando se requiera:

```bash
pnpm paperclipai allowed-hostname <host>
```

## Prerrequisitos

- **Docker Desktop v29+** (con soporte de Docker Sandbox)
- **2 GB+ de RAM** disponibles para la construcción de la imagen Docker
- **API keys** en `~/.secrets` (como mínimo `OPENAI_API_KEY`)

## Opción A: Docker Sandbox (recomendado)

Docker Sandbox proporciona mejor aislamiento (basado en microVM) y configuración más simple que Docker Compose. Requiere Docker Desktop v29+ / Docker Sandbox v0.12+.

```bash
# 1. Clone the OpenClaw repo and build the image
git clone https://github.com/openclaw/openclaw.git /tmp/openclaw-docker
cd /tmp/openclaw-docker
docker build -t openclaw:local -f Dockerfile .

# 2. Create the sandbox using the built image
docker sandbox create --name openclaw -t openclaw:local shell ~/.openclaw/workspace

# 3. Allow network access to OpenAI API
docker sandbox network proxy openclaw \
  --allow-host api.openai.com \
  --allow-host localhost

# 4. Write the config inside the sandbox
docker sandbox exec openclaw sh -c '
mkdir -p /home/node/.openclaw/workspace /home/node/.openclaw/identity /home/node/.openclaw/credentials
cat > /home/node/.openclaw/openclaw.json << INNEREOF
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "sandbox-dev-token-12345"
    },
    "controlUi": { "enabled": true }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-5.2",
        "fallbacks": ["openai/gpt-5.2-chat-latest"]
      },
      "workspace": "/home/node/.openclaw/workspace"
    }
  }
}
INNEREOF
chmod 600 /home/node/.openclaw/openclaw.json
'

# 5. Start the gateway (pass your API key from ~/.secrets)
source ~/.secrets
docker sandbox exec -d \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -w /app openclaw \
  node dist/index.js gateway --bind loopback --port 18789

# 6. Wait ~15 seconds, then verify
sleep 15
docker sandbox exec openclaw curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/
# Should print: 200

# 7. Check status
docker sandbox exec -e OPENAI_API_KEY="$OPENAI_API_KEY" -w /app openclaw \
  node dist/index.js status
```

### Gestión del Sandbox

```bash
# List sandboxes
docker sandbox ls

# Shell into the sandbox
docker sandbox exec -it openclaw bash

# Stop the sandbox (preserves state)
docker sandbox stop openclaw

# Remove the sandbox
docker sandbox rm openclaw

# Check sandbox version
docker sandbox version
```

## Opción B: Docker Compose (alternativa)

Usa esto si Docker Sandbox no está disponible (Docker Desktop < v29).

```bash
# 1. Clone the OpenClaw repo
git clone https://github.com/openclaw/openclaw.git /tmp/openclaw-docker
cd /tmp/openclaw-docker

# 2. Build the Docker image (~5-10 min on first run)
docker build -t openclaw:local -f Dockerfile .

# 3. Create config directories
mkdir -p ~/.openclaw/workspace ~/.openclaw/identity ~/.openclaw/credentials
chmod 700 ~/.openclaw ~/.openclaw/credentials

# 4. Generate a gateway token
export OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
echo "Your gateway token: $OPENCLAW_GATEWAY_TOKEN"

# 5. Create the config file
cat > ~/.openclaw/openclaw.json << EOF
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    },
    "controlUi": {
      "enabled": true,
      "allowedOrigins": ["http://127.0.0.1:18789"]
    }
  },
  "env": {
    "OPENAI_API_KEY": "\${OPENAI_API_KEY}"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-5.2",
        "fallbacks": ["openai/gpt-5.2-chat-latest"]
      },
      "workspace": "/home/node/.openclaw/workspace"
    }
  }
}
EOF
chmod 600 ~/.openclaw/openclaw.json

# 6. Create the .env file (load API keys from ~/.secrets)
source ~/.secrets
cat > .env << EOF
OPENCLAW_CONFIG_DIR=$HOME/.openclaw
OPENCLAW_WORKSPACE_DIR=$HOME/.openclaw/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN
OPENCLAW_IMAGE=openclaw:local
OPENAI_API_KEY=$OPENAI_API_KEY
OPENCLAW_EXTRA_MOUNTS=
OPENCLAW_HOME_VOLUME=
OPENCLAW_DOCKER_APT_PACKAGES=
EOF

# 7. Add tmpfs to docker-compose.yml (required — see Known Issues)
# Add to BOTH openclaw-gateway and openclaw-cli services:
#   tmpfs:
#     - /tmp:exec,size=512M

# 8. Start the gateway
docker compose up -d openclaw-gateway

# 9. Wait ~15 seconds for startup, then get the dashboard URL
sleep 15
docker compose run --rm openclaw-cli dashboard --no-open
```

La URL del panel se verá así: `http://127.0.0.1:18789/#token=<your-token>`

### Gestión de Docker Compose

```bash
cd /tmp/openclaw-docker

# Stop
docker compose down

# Start again (no rebuild needed)
docker compose up -d openclaw-gateway

# View logs
docker compose logs -f openclaw-gateway

# Check status
docker compose run --rm openclaw-cli status

# Get dashboard URL
docker compose run --rm openclaw-cli dashboard --no-open
```

## Problemas conocidos y soluciones

### "no space left on device" al iniciar contenedores

El disco virtual de Docker Desktop puede estar lleno.

```bash
docker system df                   # check usage
docker system prune -f             # remove stopped containers, unused networks
docker image prune -f              # remove dangling images
```

### "Unable to create fallback OpenClaw temp dir: /tmp/openclaw-1000" (solo Compose)

El contenedor no puede escribir en `/tmp`. Agrega un montaje `tmpfs` a `docker-compose.yml` para **ambos** servicios:

```yaml
services:
  openclaw-gateway:
    tmpfs:
      - /tmp:exec,size=512M
  openclaw-cli:
    tmpfs:
      - /tmp:exec,size=512M
```

Este problema no afecta el enfoque de Docker Sandbox.

### Desajuste de versión de Node en imágenes de plantillas comunitarias

Algunas plantillas sandbox construidas por la comunidad (p. ej. `olegselajev241/openclaw-dmr:latest`) incluyen Node 20, pero OpenClaw requiere Node >=22.12.0. Usa en su lugar nuestra imagen `openclaw:local` construida localmente como plantilla sandbox, que incluye Node 22.

### El gateway tarda ~15 segundos en responder tras el inicio

El gateway de Node.js necesita tiempo para inicializarse. Espera 15 segundos antes de acceder a `http://127.0.0.1:18789/`.

### Advertencias CLAUDE_AI_SESSION_KEY (solo Compose)

Estas advertencias de Docker Compose son inofensivas y se pueden ignorar:
```
level=warning msg="The \"CLAUDE_AI_SESSION_KEY\" variable is not set. Defaulting to a blank string."
```

## Configuración

Archivo de configuración: `~/.openclaw/openclaw.json` (formato JSON5)

Ajustes clave:
- `gateway.auth.token` — el token de auth para la UI web y la API
- `agents.defaults.model.primary` — el modelo de IA (usa `openai/gpt-5.2` o más nuevo)
- `env.OPENAI_API_KEY` — referencia la variable de entorno `OPENAI_API_KEY` (enfoque Compose)

Las API keys se almacenan en `~/.secrets` y se pasan a los contenedores vía variables de entorno.

## Referencia

- [OpenClaw Docker docs](https://docs.openclaw.ai/install/docker)
- [OpenClaw Configuration Reference](https://docs.openclaw.ai/gateway/configuration-reference)
- [Docker blog: Run OpenClaw Securely in Docker Sandboxes](https://www.docker.com/blog/run-openclaw-securely-in-docker-sandboxes/)
- [Docker Sandbox docs](https://docs.docker.com/ai/sandboxes)
- [OpenAI Models](https://platform.openai.com/docs/models) — modelos actuales: gpt-5.2, gpt-5.2-chat-latest, gpt-5.2-pro
