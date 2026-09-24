---
title: Comandos del plano de control
summary: Comandos de issues, agentes, aprobaciones y panel
---

Comandos del lado del cliente para gestionar issues, agentes, aprobaciones y más.

## Comandos de issues

```sh
# Listar issues
pnpm paperclipai issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Obtener detalles del issue
pnpm paperclipai issue get <issue-id-or-identifier>

# Crear issue
pnpm paperclipai issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Actualizar issue
pnpm paperclipai issue update <issue-id> [--status in_progress] [--comment "..."]

# Agregar comentario
pnpm paperclipai issue comment <issue-id> --body "..." [--reopen]

# Reservar tarea
pnpm paperclipai issue checkout <issue-id> --agent-id <agent-id>

# Liberar tarea
pnpm paperclipai issue release <issue-id>
```

## Comandos de empresa

```sh
pnpm paperclipai company list
pnpm paperclipai company get <company-id>

# Exportar a un paquete de carpeta portable (escribe manifiesto + archivos markdown)
pnpm paperclipai company export <company-id> --out ./exports/acme --include company,agents

# Vista previa de la importación (sin escrituras)
pnpm paperclipai company import \
  <owner>/<repo>/<path> \
  --target existing \
  --company-id <company-id> \
  --ref main \
  --collision rename \
  --dry-run

# Aplicar la importación
pnpm paperclipai company import \
  ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Comandos de agentes

```sh
pnpm paperclipai agent list
pnpm paperclipai agent get <agent-id>
```

## Comandos de aprobaciones

```sh
# Listar aprobaciones
pnpm paperclipai approval list [--status pending]

# Obtener aprobación
pnpm paperclipai approval get <approval-id>

# Crear aprobación
pnpm paperclipai approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Aprobar
pnpm paperclipai approval approve <approval-id> [--decision-note "..."]

# Rechazar
pnpm paperclipai approval reject <approval-id> [--decision-note "..."]

# Solicitar revisión
pnpm paperclipai approval request-revision <approval-id> [--decision-note "..."]

# Reenviar
pnpm paperclipai approval resubmit <approval-id> [--payload '{"..."}']

# Comentar
pnpm paperclipai approval comment <approval-id> --body "..."
```

## Comandos de actividad

```sh
pnpm paperclipai activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Panel

```sh
pnpm paperclipai dashboard get
```

## Latido

```sh
pnpm paperclipai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
