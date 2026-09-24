# Desarrollar

Este proyecto puede ejecutarse completamente en dev local sin configurar PostgreSQL manualmente.

## Modos de despliegue

Para definiciones de modos y comportamiento previsto del CLI, consulta `doc/DEPLOYMENT-MODES.md`.

Estado actual de implementación:

- modelo canónico: `local_trusted` y `authenticated` (con exposición `private/public`)

## Prerrequisitos

- Node.js 20+
- pnpm 9+

## Política de lockfile de dependencias

GitHub Actions es dueño de `pnpm-lock.yaml`.

- No commitees `pnpm-lock.yaml` en pull requests.
- El CI de pull requests valida la resolución de dependencias cuando cambian los manifiestos.
- Los pushes a `master` regeneran `pnpm-lock.yaml` con `pnpm install --lockfile-only --no-frozen-lockfile`, lo commitean de vuelta si es necesario, y luego ejecutan verificación con `--frozen-lockfile`.

## Iniciar dev

Desde la raíz del repo:

```sh
pnpm install
pnpm dev
```

Esto inicia:

- Servidor API: `http://localhost:3100`
- UI: servida por el servidor API en modo middleware de dev (mismo origen que la API)

`pnpm dev` ejecuta el servidor en modo watch y reinicia ante cambios de paquetes del workspace (incluidos paquetes de adaptadores). Usa `pnpm dev:once` para ejecutar sin file watching.

`pnpm dev:once` ahora rastrea cambios de archivos relevantes del backend y migraciones pendientes. Cuando el arranque actual está obsoleto, la UI del tablero muestra un banner `Restart required`. También puedes habilitar auto-reinicio protegido en `Instance Settings > Experimental`, que espera a que las ejecuciones locales de agentes en cola/en ejecución terminen antes de reiniciar el servidor de dev.

Modo dev con autenticación Tailscale/privada:

```sh
pnpm dev --tailscale-auth
```

Esto ejecuta dev como `authenticated/private` y hace bind del servidor en `0.0.0.0` para acceso en red privada.

Permite hostnames privados adicionales (por ejemplo hostnames Tailscale personalizados):

```sh
pnpm paperclipai allowed-hostname dotta-macbook-pro
```

## Ejecución local de un comando

Para una primera instalación local, puedes hacer bootstrap y ejecutar en un comando:

```sh
pnpm paperclipai run
```

`paperclipai run` hace:

1. auto-onboard si falta la configuración
2. `paperclipai doctor` con reparación habilitada
3. inicia el servidor cuando los chequeos pasan

## Inicio rápido con Docker (sin instalación local de Node)

Construye y ejecuta Paperclip en Docker:

```sh
docker build -t paperclip-local .
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

O usa Compose:

```sh
docker compose -f docker-compose.quickstart.yml up --build
```

Consulta `doc/DOCKER.md` para el cableado de API keys (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) y detalles de persistencia.

## Docker para revisión de PR no confiables

Para un contenedor separado orientado a revisión que mantiene el estado de login de `codex`/`claude` en volúmenes Docker y hace checkout de PRs en un workspace scratch aislado, consulta `doc/UNTRUSTED-PR-REVIEW.md`.

## Base de datos en dev (automanejada)

Para desarrollo local, deja `DATABASE_URL` sin definir.
El servidor usará automáticamente PostgreSQL embebido y persistirá datos en:

- `~/.paperclip/instances/default/db`

Haz override de home e instancia:

```sh
PAPERCLIP_HOME=/custom/path PAPERCLIP_INSTANCE_ID=dev pnpm paperclipai run
```

No se requiere Docker ni base de datos externa para este modo.

## Almacenamiento en dev (automanejado)

Para desarrollo local, el proveedor de almacenamiento por defecto es `local_disk`, que persiste imágenes/adjuntos subidos en:

- `~/.paperclip/instances/default/data/storage`

Configura proveedor/ajustes de almacenamiento:

```sh
pnpm paperclipai configure --section storage
```

## Workspaces de agente por defecto

Cuando una ejecución local de agente no tiene un workspace de proyecto/sesión resuelto, Paperclip recurre a un workspace home de agente bajo la raíz de instancia:

- `~/.paperclip/instances/default/workspaces/<agent-id>`

Esta ruta respeta `PAPERCLIP_HOME` y `PAPERCLIP_INSTANCE_ID` en configuraciones no por defecto.

Para `codex_local`, Paperclip también gestiona un home de Codex por empresa bajo la raíz de instancia y lo siembra desde el home compartido de login/configuración de Codex (`$CODEX_HOME` o `~/.codex`):

- `~/.paperclip/instances/default/companies/<company-id>/codex-home`

## Instancias locales de worktree

Al desarrollar desde múltiples worktrees de git, no apuntes dos servidores Paperclip al mismo directorio de datos de PostgreSQL embebido.

En su lugar, crea una configuración Paperclip local del repo más una instancia aislada para el worktree:

```sh
paperclipai worktree init
# o crea el worktree de git e inicialízalo en un paso:
pnpm paperclipai worktree:make paperclip-pr-432
```

Este comando:

- escribe archivos locales del repo en `.paperclip/config.json` y `.paperclip/.env`
- crea una instancia aislada bajo `~/.paperclip-worktrees/instances/<worktree-id>/`
- cuando se ejecuta dentro de un worktree de git enlazado, refleja los hooks de git efectivos en el directorio git privado de ese worktree
- elige un puerto de app libre y un puerto de PostgreSQL embebido
- por defecto siembra la BD aislada en modo `minimal` desde la instancia/configuración efectiva actual de Paperclip (configuración de worktree local del repo cuando está presente, de lo contrario la instancia por defecto) vía un snapshot SQL lógico

Modos de semilla:

- `minimal` mantiene estado central de app como empresas, proyectos, issues, comentarios, aprobaciones y estado de autenticación, preserva el esquema para todas las tablas, pero omite datos de filas de historial operativo pesado como ejecuciones de latidos, solicitudes de wake, logs de actividad, servicios de runtime y estado de sesión de agentes
- `full` hace un clon lógico completo de la instancia fuente
- `--no-seed` crea una instancia aislada vacía

Después de `worktree init`, tanto el servidor como el CLI autocargan el `.paperclip/.env` local del repo cuando se ejecutan dentro de ese worktree, así comandos normales como `pnpm dev`, `paperclipai doctor` y `paperclipai db:backup` quedan con alcance a la instancia del worktree.

Ese env local del repo también define:

- `PAPERCLIP_IN_WORKTREE=true`
- `PAPERCLIP_WORKTREE_NAME=<worktree-name>`
- `PAPERCLIP_WORKTREE_COLOR=<hex-color>`

El servidor/UI usan esos valores para branding específico del worktree como el banner superior y el favicon de color dinámico.

Imprime exports de shell explícitamente cuando se necesite:

```sh
paperclipai worktree env
# o:
eval "$(paperclipai worktree env)"
```

### Referencia del CLI de worktree

**`pnpm paperclipai worktree init [options]`** — Crea config/env local del repo y una instancia aislada para el worktree actual.

| Opción | Descripción |
|---|---|
| `--name <name>` | Nombre visible usado para derivar el id de instancia |
| `--instance <id>` | Id de instancia aislada explícito |
| `--home <path>` | Raíz home para instancias de worktree (por defecto: `~/.paperclip-worktrees`) |
| `--from-config <path>` | config.json fuente para sembrar |
| `--from-data-dir <path>` | PAPERCLIP_HOME fuente usado al derivar la configuración fuente |
| `--from-instance <id>` | Id de instancia fuente (por defecto: `default`) |
| `--server-port <port>` | Puerto de servidor preferido |
| `--db-port <port>` | Puerto preferido de Postgres embebido |
| `--seed-mode <mode>` | Perfil de semilla: `minimal` o `full` (por defecto: `minimal`) |
| `--no-seed` | Omitir siembra de base de datos desde la instancia fuente |
| `--force` | Reemplazar la configuración local del repo y los datos de instancia aislada existentes |

Ejemplos:

```sh
paperclipai worktree init --no-seed
paperclipai worktree init --seed-mode full
paperclipai worktree init --from-instance default
paperclipai worktree init --from-data-dir ~/.paperclip
paperclipai worktree init --force
```

Repara un worktree gestionado por el repo ya creado y resiembra su instancia aislada desde la instalación principal por defecto:

```sh
cd ~/.paperclip/worktrees/PAP-884-ai-commits-component
pnpm paperclipai worktree init --force --seed-mode minimal \
  --name PAP-884-ai-commits-component \
  --from-config ~/.paperclip/instances/default/config.json
```

Eso reescribe el `.paperclip/config.json` + `.paperclip/.env` locales del worktree, recrea la instancia aislada bajo `~/.paperclip-worktrees/instances/<worktree-id>/` y preserva los contenidos del worktree de git en sí.

**`pnpm paperclipai worktree:make <name> [options]`** — Crea `~/NAME` como worktree de git, luego inicializa una instancia Paperclip aislada dentro. Esto combina `git worktree add` con `worktree init` en un solo paso.

| Opción | Descripción |
|---|---|
| `--start-point <ref>` | Ref remoto en el que basar la nueva rama (p. ej., `origin/main`) |
| `--instance <id>` | Id de instancia aislada explícito |
| `--home <path>` | Raíz home para instancias de worktree (por defecto: `~/.paperclip-worktrees`) |
| `--from-config <path>` | config.json fuente para sembrar |
| `--from-data-dir <path>` | PAPERCLIP_HOME fuente usado al derivar la configuración fuente |
| `--from-instance <id>` | Id de instancia fuente (por defecto: `default`) |
| `--server-port <port>` | Puerto de servidor preferido |
| `--db-port <port>` | Puerto preferido de Postgres embebido |
| `--seed-mode <mode>` | Perfil de semilla: `minimal` o `full` (por defecto: `minimal`) |
| `--no-seed` | Omitir siembra de base de datos desde la instancia fuente |
| `--force` | Reemplazar la configuración local del repo y los datos de instancia aislada existentes |

Ejemplos:

```sh
pnpm paperclipai worktree:make paperclip-pr-432
pnpm paperclipai worktree:make my-feature --start-point origin/main
pnpm paperclipai worktree:make experiment --no-seed
```

**`pnpm paperclipai worktree env [options]`** — Imprime exports de shell para la instancia Paperclip local del worktree actual.

| Opción | Descripción |
|---|---|
| `-c, --config <path>` | Ruta al archivo de configuración |
| `--json` | Imprime JSON en lugar de exports de shell |

Ejemplos:

```sh
pnpm paperclipai worktree env
pnpm paperclipai worktree env --json
eval "$(pnpm paperclipai worktree env)"
```

Para worktrees de ejecución de proyecto, Paperclip también puede ejecutar un comando de aprovisionamiento definido por el proyecto después de crear o reutilizar un worktree de git aislado. Configura esto en la política de workspace de ejecución del proyecto (`workspaceStrategy.provisionCommand`). El comando se ejecuta dentro del worktree derivado y recibe las variables de entorno `PAPERCLIP_WORKSPACE_*`, `PAPERCLIP_PROJECT_ID`, `PAPERCLIP_AGENT_ID` y `PAPERCLIP_ISSUE_*` para que cada repo pueda hacer bootstrap a su manera.

## Chequeos rápidos de salud

En otra terminal:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Esperado:

- `/api/health` retorna `{"status":"ok"}`
- `/api/companies` retorna un arreglo JSON

## Reiniciar base de datos local de dev

Para borrar los datos locales de dev y empezar de cero:

```sh
rm -rf ~/.paperclip/instances/default/db
pnpm dev
```

## Opcional: usar Postgres externo

Si defines `DATABASE_URL`, el servidor usará eso en lugar de PostgreSQL embebido.

## Respaldos automáticos de BD

Paperclip puede ejecutar respaldos automáticos de BD en un temporizador. Valores por defecto:

- habilitado
- cada 60 minutos
- retener 30 días
- directorio de respaldo: `~/.paperclip/instances/default/data/backups`

Configura esto en:

```sh
pnpm paperclipai configure --section database
```

Ejecuta un respaldo único manualmente:

```sh
pnpm paperclipai db:backup
# o:
pnpm db:backup
```

Overrides de entorno:

- `PAPERCLIP_DB_BACKUP_ENABLED=true|false`
- `PAPERCLIP_DB_BACKUP_INTERVAL_MINUTES=<minutes>`
- `PAPERCLIP_DB_BACKUP_RETENTION_DAYS=<days>`
- `PAPERCLIP_DB_BACKUP_DIR=/absolute/or/~/path`

## Secretos en dev

Las variables de entorno de agentes ahora soportan referencias de secretos. Por defecto, los valores de secretos se almacenan con cifrado local y solo las referencias de secretos se persisten en la configuración de agente.

- Ruta de clave local por defecto: `~/.paperclip/instances/default/secrets/master.key`
- Override del material de clave directamente: `PAPERCLIP_SECRETS_MASTER_KEY`
- Override de la ruta del archivo de clave: `PAPERCLIP_SECRETS_MASTER_KEY_FILE`

Modo estricto (recomendado fuera de máquinas locales confiables):

```sh
PAPERCLIP_SECRETS_STRICT_MODE=true
```

Cuando el modo estricto está habilitado, las claves de env sensibles (por ejemplo `*_API_KEY`, `*_TOKEN`, `*_SECRET`) deben usar referencias de secretos en lugar de valores planos inline.

Soporte de configuración del CLI:

- `pnpm paperclipai onboard` escribe una sección de configuración `secrets` por defecto (`local_encrypted`, modo estricto apagado, ruta de archivo de clave definida) y crea un archivo de clave local cuando se necesita.
- `pnpm paperclipai configure --section secrets` te permite actualizar proveedor/modo estricto/ruta de clave y crea el archivo de clave local cuando se necesita.
- `pnpm paperclipai doctor` valida la configuración del adaptador de secretos y puede crear un archivo de clave local faltante con `--repair`.

Helper de migración para secretos de env inline existentes:

```sh
pnpm secrets:migrate-inline-env         # dry run
pnpm secrets:migrate-inline-env --apply # aplicar migración
```

## Toggle de eliminación de empresa

La eliminación de empresa está pensada como capacidad de dev/depuración y puede deshabilitarse en runtime:

```sh
PAPERCLIP_ENABLE_COMPANY_DELETION=false
```

Comportamiento por defecto:

- `local_trusted`: habilitado
- `authenticated`: deshabilitado

## Operaciones de cliente del CLI

El CLI de Paperclip ahora incluye comandos de cliente del plano de control además de comandos de configuración.

Ejemplos rápidos:

```sh
pnpm paperclipai issue list --company-id <company-id>
pnpm paperclipai issue create --company-id <company-id> --title "Investigate checkout conflict"
pnpm paperclipai issue update <issue-id> --status in_progress --comment "Started triage"
```

Define valores por defecto una vez con perfiles de contexto:

```sh
pnpm paperclipai context set --api-base http://localhost:3100 --company-id <company-id>
```

Luego ejecuta comandos sin repetir flags:

```sh
pnpm paperclipai issue list
pnpm paperclipai dashboard get
```

Consulta la referencia completa de comandos en `doc/CLI.md`.

## Endpoints de incorporación de invitación OpenClaw

La incorporación de invitación orientada a agentes ahora expone documentos API legibles por máquina:

- `GET /api/invites/:token` retorna resumen de invitación más enlaces de incorporación e índice de habilidades.
- `GET /api/invites/:token/onboarding` retorna detalles del manifiesto de incorporación (endpoint de registro, plantilla de endpoint de reclamo, pistas de instalación de habilidades).
- `GET /api/invites/:token/onboarding.txt` retorna un documento de incorporación en texto plano pensado tanto para operadores humanos como para agentes (handoff estilo llm.txt), incluido mensaje opcional del invitador y candidatos sugeridos de host de red.
- `GET /api/skills/index` lista documentos de habilidad disponibles.
- `GET /api/skills/paperclip` retorna el markdown de la habilidad de latido de Paperclip.

## Prueba de humo de unión OpenClaw

Ejecuta el harness de humo de unión OpenClaw end-to-end:

```sh
pnpm smoke:openclaw-join
```

Lo que valida:

- creación de invitación para unión solo de agente
- solicitud de unión de agente usando `adapterType=openclaw`
- aprobación del tablero + semántica de reclamo de API key única
- entrega de callback en wakeup a un receptor webhook dockerizado estilo OpenClaw

Permisos requeridos:

- Este script realiza acciones gobernadas por el tablero (crear invitación, aprobar unión, despertar otro agente).
- En modo autenticado, ejecuta con autenticación del tablero vía `PAPERCLIP_AUTH_HEADER` o `PAPERCLIP_COOKIE`.

Flags opcionales de autenticación (para modo autenticado):

- `PAPERCLIP_AUTH_HEADER` (por ejemplo `Bearer ...`)
- `PAPERCLIP_COOKIE` (valor de header de cookie de sesión)

## Script de un comando para UI Docker de OpenClaw

Para arrancar OpenClaw en Docker e imprimir una URL de panel de navegador del host en un comando:

```sh
pnpm smoke:openclaw-docker-ui
```

Este script vive en `scripts/smoke/openclaw-docker-ui.sh` y automatiza clon/build/config/inicio para pruebas locales de UI de OpenClaw basadas en Compose.

Comportamiento de emparejamiento para este script de humo:

- por defecto `OPENCLAW_DISABLE_DEVICE_AUTH=1` (sin prompt de emparejamiento de UI de Control para humo local; no se requieren variables de env de emparejamiento extra)
- define `OPENCLAW_DISABLE_DEVICE_AUTH=0` para requerir emparejamiento de dispositivo estándar

Comportamiento de modelo para este script de humo:

- por defecto usa modelos OpenAI (`openai/gpt-5.2` + fallback OpenAI) para no requerir autenticación Anthropic por defecto

Comportamiento de estado para este script de humo:

- por defecto usa directorio de configuración aislado `~/.openclaw-paperclip-smoke`
- reinicia el estado del agente de humo en cada ejecución por defecto (`OPENCLAW_RESET_STATE=1`) para evitar deriva de proveedor/autenticación obsoleta

Comportamiento de red para este script de humo:

- autodetecta e imprime una URL de host de Paperclip alcanzable desde dentro de OpenClaw Docker
- el alias de host del lado del contenedor por defecto es `host.docker.internal` (haz override con `PAPERCLIP_HOST_FROM_CONTAINER` / `PAPERCLIP_HOST_PORT`)
- si Paperclip rechaza hostnames de contenedor en modo authenticated/private, permite `host.docker.internal` vía `pnpm paperclipai allowed-hostname host.docker.internal` y reinicia Paperclip
