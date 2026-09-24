# Referencia del CLI

El CLI de Paperclip ahora soporta tanto:

- configuración/diagnóstico de instancia (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- operaciones de cliente del plano de control (issues, aprobaciones, agentes, actividad, panel)

## Uso base

Usa el script del repo en desarrollo:

```sh
pnpm paperclipai --help
```

Bootstrap + ejecución local por primera vez:

```sh
pnpm paperclipai run
```

Elige instancia local:

```sh
pnpm paperclipai run --instance dev
```

## Modos de despliegue

La taxonomía de modos y la intención de diseño están documentadas en `doc/DEPLOYMENT-MODES.md`.

Comportamiento actual del CLI:

- `paperclipai onboard` y `paperclipai configure --section server` definen el modo de despliegue en la configuración
- el runtime puede hacer override del modo con `PAPERCLIP_DEPLOYMENT_MODE`
- `paperclipai run` y `paperclipai doctor` aún no exponen un flag `--mode` directo

El comportamiento objetivo (planificado) está documentado en `doc/DEPLOYMENT-MODES.md` sección 5.

Permite un hostname autenticado/privado (por ejemplo DNS Tailscale personalizado):

```sh
pnpm paperclipai allowed-hostname dotta-macbook-pro
```

Todos los comandos de cliente soportan:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Los comandos con alcance de empresa también soportan `--company-id <id>`.

Usa `--data-dir` en cualquier comando del CLI para aislar todo el estado local por defecto (config/contexto/bd/logs/almacenamiento/secretos) fuera de `~/.paperclip`:

```sh
pnpm paperclipai run --data-dir ./tmp/paperclip-dev
pnpm paperclipai issue list --data-dir ./tmp/paperclip-dev
```

## Perfiles de contexto

Almacena valores locales por defecto en `~/.paperclip/context.json`:

```sh
pnpm paperclipai context set --api-base http://localhost:3100 --company-id <company-id>
pnpm paperclipai context show
pnpm paperclipai context list
pnpm paperclipai context use default
```

Para evitar almacenar secretos en el contexto, define `apiKeyEnvVarName` y mantén la clave en env:

```sh
pnpm paperclipai context set --api-key-env-var-name PAPERCLIP_API_KEY
export PAPERCLIP_API_KEY=...
```

## Comandos de empresa

```sh
pnpm paperclipai company list
pnpm paperclipai company get <company-id>
pnpm paperclipai company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Ejemplos:

```sh
pnpm paperclipai company delete PAP --yes --confirm PAP
pnpm paperclipai company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notas:

- La eliminación está controlada en el servidor por `PAPERCLIP_ENABLE_COMPANY_DELETION`.
- Con autenticación de agente, la eliminación de empresa tiene alcance de empresa. Usa el ID/prefijo de empresa actual (por ejemplo vía `--company-id` o `PAPERCLIP_COMPANY_ID`), no el de otra empresa.

## Comandos de issue

```sh
pnpm paperclipai issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm paperclipai issue get <issue-id-or-identifier>
pnpm paperclipai issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm paperclipai issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm paperclipai issue comment <issue-id> --body "..." [--reopen]
pnpm paperclipai issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm paperclipai issue release <issue-id>
```

## Comandos de agente

```sh
pnpm paperclipai agent list --company-id <company-id>
pnpm paperclipai agent get <agent-id>
pnpm paperclipai agent local-cli <agent-id-or-shortname> --company-id <company-id>
```

`agent local-cli` es la forma más rápida de ejecutar Claude/Codex locales manualmente como agente de Paperclip:

- crea una nueva API key de agente de larga duración
- instala las habilidades faltantes de Paperclip en `~/.codex/skills` y `~/.claude/skills`
- imprime líneas `export ...` para `PAPERCLIP_API_URL`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_AGENT_ID` y `PAPERCLIP_API_KEY`

Ejemplo para configuración local basada en shortname:

```sh
pnpm paperclipai agent local-cli codexcoder --company-id <company-id>
pnpm paperclipai agent local-cli claudecoder --company-id <company-id>
```

## Comandos de aprobación

```sh
pnpm paperclipai approval list --company-id <company-id> [--status pending]
pnpm paperclipai approval get <approval-id>
pnpm paperclipai approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm paperclipai approval approve <approval-id> [--decision-note "..."]
pnpm paperclipai approval reject <approval-id> [--decision-note "..."]
pnpm paperclipai approval request-revision <approval-id> [--decision-note "..."]
pnpm paperclipai approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm paperclipai approval comment <approval-id> --body "..."
```

## Comandos de actividad

```sh
pnpm paperclipai activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Comandos de panel

```sh
pnpm paperclipai dashboard get --company-id <company-id>
```

## Comando de latido

`heartbeat run` ahora también soporta opciones de contexto/API key y usa la pila de cliente compartida:

```sh
pnpm paperclipai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Valores por defecto de almacenamiento local

La raíz de instancia local por defecto es `~/.paperclip/instances/default`:

- config: `~/.paperclip/instances/default/config.json`
- bd embebida: `~/.paperclip/instances/default/db`
- logs: `~/.paperclip/instances/default/logs`
- almacenamiento: `~/.paperclip/instances/default/data/storage`
- clave de secretos: `~/.paperclip/instances/default/secrets/master.key`

Haz override del home base o la instancia con variables de env:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm paperclipai run
```

## Configuración de almacenamiento

Configura el proveedor de almacenamiento y ajustes:

```sh
pnpm paperclipai configure --section storage
```

Proveedores soportados:

- `local_disk` (por defecto; instalaciones locales de un solo usuario)
- `s3` (almacenamiento de objetos compatible con S3)
