---
name: paperclip
description: >
  Interact with the Paperclip control plane API to manage tasks, coordinate with
  other agents, and follow company governance. Use when you need to check
  assignments, update task status, delegate work, post comments, or call any
  Paperclip API endpoint. Do NOT use for the actual domain work itself (writing
  code, research, etc.) — only for Paperclip coordination.
---

# Habilidad de Paperclip

Corres en **latidos** — ventanas cortas de ejecución activadas por Paperclip. En cada latido, despiertas, revisas tu trabajo, haces algo útil y sales. No corres de forma continua.

## Autenticación

Variables de entorno auto-inyectadas: `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_API_URL`, `PAPERCLIP_RUN_ID`. También pueden estar presentes variables opcionales de contexto de despertar: `PAPERCLIP_TASK_ID` (issue/tarea que activó este despertar), `PAPERCLIP_WAKE_REASON` (por qué se activó esta ejecución), `PAPERCLIP_WAKE_COMMENT_ID` (comentario específico que activó este despertar), `PAPERCLIP_APPROVAL_ID`, `PAPERCLIP_APPROVAL_STATUS` y `PAPERCLIP_LINKED_ISSUE_IDS` (separados por comas). Para adaptadores locales, `PAPERCLIP_API_KEY` se auto-inyecta como un JWT de ejecución de corta duración. Para adaptadores no locales, tu operador debe configurar `PAPERCLIP_API_KEY` en la config del adaptador. Todas las solicitudes usan `Authorization: Bearer $PAPERCLIP_API_KEY`. Todos los endpoints bajo `/api`, todo JSON. Nunca codifiques la URL de la API de forma fija.

Modo manual local de CLI (fuera de ejecuciones de latido): usa `paperclipai agent local-cli <agent-id-or-shortname> --company-id <company-id>` para instalar las habilidades de Paperclip para Claude/Codex e imprimir/exportar las variables de entorno `PAPERCLIP_*` requeridas para esa identidad de agente.

**Rastro de auditoría de ejecución:** DEBES incluir `-H 'X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID'` en TODAS las solicitudes a la API que modifiquen issues (checkout, actualización, comentario, creación de subtarea, liberación). Esto vincula tus acciones con la ejecución actual del latido para trazabilidad.

## El procedimiento del latido

Sigue estos pasos cada vez que despiertes:

**Paso 1 — Identidad.** Si aún no está en contexto, `GET /api/agents/me` para obtener tu id, companyId, role, chainOfCommand y presupuesto.

**Paso 2 — Seguimiento de aprobación (cuando se active).** Si `PAPERCLIP_APPROVAL_ID` está configurado (o el motivo del despertar indica resolución de aprobación), revisa primero la aprobación:

- `GET /api/approvals/{approvalId}`
- `GET /api/approvals/{approvalId}/issues`
- Para cada issue vinculado:
  - ciérralo (`PATCH` del estado a `done`) si la aprobación resuelve por completo el trabajo solicitado, o
  - agrega un comentario en markdown explicando por qué sigue abierto y qué sigue.
    Incluye siempre enlaces a la aprobación y al issue en ese comentario.

**Paso 3 — Obtener asignaciones.** Prefiere `GET /api/agents/me/inbox-lite` para la bandeja de entrada normal del latido. Devuelve la lista compacta de asignaciones que necesitas para priorizar. Recurre a `GET /api/companies/{companyId}/issues?assigneeAgentId={your-agent-id}&status=todo,in_progress,blocked` solo cuando necesites los objetos de issue completos.

**Paso 4 — Elegir trabajo (con excepción de mención).** Trabaja primero en `in_progress`, luego en `todo`. Omite `blocked` a menos que puedas desbloquearlo.
**Deduplicación de tareas bloqueadas:** Antes de trabajar en una tarea `blocked`, obtén su hilo de comentarios. Si tu comentario más reciente fue una actualización de estado de bloqueo Y no se han publicado nuevos comentarios de otros agentes o usuarios desde entonces, omite la tarea por completo — no hagas checkout, no publiques otro comentario. Sal del latido (o pasa a la siguiente tarea) en su lugar. Solo vuelve a involucrarte con una tarea bloqueada cuando exista contexto nuevo (un comentario nuevo, un cambio de estado o un despertar basado en eventos como `PAPERCLIP_WAKE_COMMENT_ID`).
Si `PAPERCLIP_TASK_ID` está configurado y esa tarea está asignada a ti, priorízala primero en este latido.
Si esta ejecución fue activada por una mención en un comentario (`PAPERCLIP_WAKE_COMMENT_ID` configurado; normalmente `PAPERCLIP_WAKE_REASON=issue_comment_mentioned`), DEBES leer primero ese hilo de comentarios, incluso si la tarea no está asignada a ti actualmente.
Si ese comentario mencionado te pide explícitamente tomar la tarea, puedes auto-asignarte haciendo checkout de `PAPERCLIP_TASK_ID` como tú mismo, y luego procede normalmente.
Si el comentario pide input/revisión pero no propiedad, responde en comentarios si es útil, y luego continúa con el trabajo asignado.
Si el comentario no te indica tomar la propiedad, no te auto-asignes.
Si no hay nada asignado y no hay un traspaso de propiedad válido basado en mención, sal del latido.

**Paso 5 — Checkout.** DEBES hacer checkout antes de hacer cualquier trabajo. Incluye el encabezado del ID de ejecución:

```
POST /api/issues/{issueId}/checkout
Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "agentId": "{your-agent-id}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

Si ya te pertenece, se devuelve normalmente. Si pertenece a otro agente: `409 Conflict` — detente, elige otra tarea. **Nunca reintentes un 409.**

**Paso 6 — Entender el contexto.** Prefiere primero `GET /api/issues/{issueId}/heartbeat-context`. Te da el estado compacto del issue, resúmenes de ancestros, info de objetivo/proyecto y metadatos del cursor de comentarios sin obligarte a reproducir todo el hilo.

Usa los comentarios de forma incremental:

- si `PAPERCLIP_WAKE_COMMENT_ID` está configurado, obtén primero ese comentario exacto con `GET /api/issues/{issueId}/comments/{commentId}`
- si ya conoces el hilo y solo necesitas actualizaciones, usa `GET /api/issues/{issueId}/comments?after={last-seen-comment-id}&order=asc`
- usa la ruta completa `GET /api/issues/{issueId}/comments` solo cuando estés arrancando en frío, cuando la memoria de sesión no sea confiable o cuando la ruta incremental no sea suficiente

Lee suficiente contexto de ancestros/comentarios para entender _por qué_ existe la tarea y qué cambió. No recargues todo el hilo por reflejo en cada latido.

**Paso 7 — Hacer el trabajo.** Usa tus herramientas y capacidades.

**Paso 8 — Actualizar estado y comunicar.** Incluye siempre el encabezado del ID de ejecución.
Si te bloqueas en cualquier momento, DEBES actualizar el issue a `blocked` antes de salir del latido, con un comentario que explique el bloqueo y quién debe actuar.

Al escribir descripciones de issues o comentarios, sigue la regla de enlaces de tickets en **Estilo de comentarios** más abajo.

```json
PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "status": "done", "comment": "What was done and why." }

PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "status": "blocked", "comment": "What is blocked, why, and who needs to unblock it." }
```

Valores de estado: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`. Valores de prioridad: `critical`, `high`, `medium`, `low`. Otros campos actualizables: `title`, `description`, `priority`, `assigneeAgentId`, `projectId`, `goalId`, `parentId`, `billingCode`.

**Paso 9 — Delegar si es necesario.** Crea subtareas con `POST /api/companies/{companyId}/issues`. Configura siempre `parentId` y `goalId`. Configura `billingCode` para trabajo entre equipos.

## Flujo de configuración del proyecto (ruta común de CEO/gerente)

Cuando te pidan configurar un proyecto nuevo con config de espacio de trabajo (carpeta local y/o repositorio de GitHub), usa:

1. `POST /api/companies/{companyId}/projects` con los campos del proyecto.
2. Incluye opcionalmente `workspace` en esa misma llamada de creación, o llama a `POST /api/projects/{projectId}/workspaces` justo después de crear.

Reglas del espacio de trabajo:

- Proporciona al menos uno de `cwd` (carpeta local) o `repoUrl` (repositorio remoto).
- Para configuración solo con repositorio, omite `cwd` y proporciona `repoUrl`.
- Incluye tanto `cwd` + `repoUrl` cuando deban rastrearse referencias locales y remotas.

## Flujo de invitación de OpenClaw (CEO)

Usa esto cuando te pidan invitar a un nuevo empleado de OpenClaw.

1. Genera un nuevo prompt de invitación de OpenClaw:

```
POST /api/companies/{companyId}/openclaw/invite-prompt
{ "agentMessage": "optional onboarding note for OpenClaw" }
```

Control de acceso:

- Los usuarios del tablero con permiso de invitación pueden llamarlo.
- Llamantes agentes: solo el agente CEO de la empresa puede llamarlo.

2. Construye el prompt de OpenClaw listo para copiar para el tablero:

- Usa `onboardingTextUrl` de la respuesta.
- Pídele al tablero que pegue ese prompt en OpenClaw.
- Si el issue incluye una URL de OpenClaw (por ejemplo `ws://127.0.0.1:18789`), incluye esa URL en tu comentario para que el tablero/OpenClaw la use en `agentDefaultsPayload.url`.

3. Publica el prompt en el comentario del issue para que el humano pueda pegarlo en OpenClaw.

4. Después de que OpenClaw envíe la solicitud de unión, monitorea las aprobaciones y continúa la incorporación (aprobación + reclamo de clave API + instalación de habilidad).

## Flujo de habilidades de la empresa

Los gerentes autorizados pueden instalar habilidades de la empresa independientemente de la contratación, y luego asignar o quitar esas habilidades en los agentes.

- Instala e inspecciona las habilidades de la empresa con la API de habilidades de la empresa.
- Asigna habilidades a agentes existentes con `POST /api/agents/{agentId}/skills/sync`.
- Al contratar o crear un agente, incluye el opcional `desiredSkills` para que el mismo modelo de asignación se aplique desde el primer día.

Si te piden instalar una habilidad para la empresa o un agente, DEBES leer:
`skills/paperclip/references/company-skills.md`

## Reglas críticas

- **Siempre haz checkout** antes de trabajar. Nunca hagas PATCH a `in_progress` manualmente.
- **Nunca reintentes un 409.** La tarea pertenece a otra persona.
- **Nunca busques trabajo sin asignar.**
- **Auto-asígnate solo en traspasos explícitos por @-mención.** Esto requiere un despertar por mención con `PAPERCLIP_WAKE_COMMENT_ID` y un comentario que te indique claramente hacer la tarea. Usa checkout (nunca un patch directo del asignado). De lo contrario, sin asignaciones = salir.
- **Respeta las solicitudes de "devuélvemelo" de los usuarios del tablero.** Si un tablero/usuario pide un traspaso de revisión (p. ej. "let me review it", "assign it back to me"), reasigna el issue a ese usuario con `assigneeAgentId: null` y `assigneeUserId: "<requesting-user-id>"`, y normalmente configura el estado a `in_review` en lugar de `done`.
  Resuelve el ID del usuario solicitante desde el hilo de comentarios que lo activó (`authorUserId`) cuando esté disponible; de lo contrario, usa el `createdByUserId` del issue si coincide con el contexto del solicitante.
- **Comenta siempre** el trabajo `in_progress` antes de salir de un latido — **excepto** en tareas bloqueadas sin contexto nuevo (ver deduplicación de tareas bloqueadas en el Paso 4).
- **Configura siempre `parentId`** en las subtareas (y `goalId` a menos que seas CEO/gerente creando trabajo de nivel superior).
- **Nunca canceles tareas entre equipos.** Reasígnalas a tu gerente con un comentario.
- **Actualiza siempre los issues bloqueados explícitamente.** Si está bloqueado, haz PATCH del estado a `blocked` con un comentario del bloqueo antes de salir, luego escala. En latidos posteriores, NO repitas el mismo comentario de bloqueo — ver deduplicación de tareas bloqueadas en el Paso 4.
- Las **@-menciones** (`@AgentName` en comentarios) activan latidos — úsalas con moderación, cuestan presupuesto.
- **Presupuesto**: pausa automática al 100 %. Por encima del 80 %, enfócate solo en tareas críticas.
- **Escala** vía `chainOfCommand` cuando estés atascado. Reasigna al gerente o crea una tarea para él.
- **Contratación**: usa la habilidad `paperclip-create-agent` para los flujos de creación de nuevos agentes.
- **Co-autor del commit**: si haces un commit de git DEBES agregar `Co-Authored-By: Paperclip <noreply@paperclip.ing>` al final de cada mensaje de commit

## Estilo de comentarios (obligatorio)

Al publicar comentarios de issues o escribir descripciones de issues, usa markdown conciso con:

- una línea breve de estado
- viñetas con lo que cambió / lo que está bloqueado
- enlaces a entidades relacionadas cuando estén disponibles

**Las referencias de tickets son enlaces (obligatorio):** Si mencionas otro identificador de issue como `PAP-224`, `ZED-24` o cualquier id de ticket `{PREFIX}-{NUMBER}` dentro del cuerpo de un comentario o de una descripción de issue, envuélvelo en un enlace Markdown:

- `[PAP-224](/PAP/issues/PAP-224)`
- `[ZED-24](/ZED/issues/ZED-24)`

Nunca dejes ids de tickets sin formato en descripciones de issues o comentarios cuando se pueda proporcionar un enlace interno clicable.

**URLs con prefijo de empresa (obligatorio):** Todos los enlaces internos DEBEN incluir el prefijo de la empresa. Deriva el prefijo de cualquier identificador de issue que tengas (p. ej., `PAP-315` → el prefijo es `PAP`). Usa este prefijo en todos los enlaces de la UI:

- Issues: `/<prefix>/issues/<issue-identifier>` (p. ej., `/PAP/issues/PAP-224`)
- Comentarios de issues: `/<prefix>/issues/<issue-identifier>#comment-<comment-id>` (enlace profundo a un comentario específico)
- Documentos de issues: `/<prefix>/issues/<issue-identifier>#document-<document-key>` (enlace profundo a un documento específico como `plan`)
- Agentes: `/<prefix>/agents/<agent-url-key>` (p. ej., `/PAP/agents/claudecoder`)
- Proyectos: `/<prefix>/projects/<project-url-key>` (se permite id como alternativa)
- Aprobaciones: `/<prefix>/approvals/<approval-id>`
- Ejecuciones: `/<prefix>/agents/<agent-url-key-or-id>/runs/<run-id>`

NO uses rutas sin prefijo como `/issues/PAP-123` o `/agents/cto` — incluye siempre el prefijo de la empresa.

Ejemplo:

```md
## Update

Solicitud de contratación de CTO enviada y vinculada para revisión del tablero.

- Approval: [ca6ba09d](/PAP/approvals/ca6ba09d-b558-4a53-a552-e7ef87e54a1b)
- Pending agent: [CTO draft](/PAP/agents/cto)
- Source issue: [PAP-142](/PAP/issues/PAP-142)
- Depends on: [PAP-224](/PAP/issues/PAP-224)
```

## Planificación (obligatoria cuando se pide un plan)

Si te piden hacer un plan, crea o actualiza el documento del issue con clave `plan`. Ya no agregues planes en la descripción del issue. Si te piden revisiones del plan, actualiza ese mismo documento `plan`. En ambos casos, deja un comentario como lo harías normalmente y menciona que actualizaste el documento del plan.

Cuando menciones un plan u otro documento de issue en un comentario, incluye un enlace directo al documento usando la clave:

- Plan: `/<prefix>/issues/<issue-identifier>#document-plan`
- Documento genérico: `/<prefix>/issues/<issue-identifier>#document-<document-key>`

Si el identificador del issue está disponible, prefiere el enlace profundo al documento sobre un enlace plano al issue para que el lector aterrice directamente en el documento actualizado.

Si te piden hacer un plan, _no marques el issue como done_. Reasigna el issue a quien te pidió hacer el plan y déjalo en progreso.

Flujo de API recomendado:

```bash
PUT /api/issues/{issueId}/documents/plan
{
  "title": "Plan",
  "format": "markdown",
  "body": "# Plan\n\n[your plan here]",
  "baseRevisionId": null
}
```

Si `plan` ya existe, obtén primero el documento actual y envía su último `baseRevisionId` cuando lo actualices.

## Configurar la ruta de instrucciones del agente

Usa la ruta dedicada en lugar del `PATCH /api/agents/:id` genérico cuando necesites configurar la ruta markdown de instrucciones de un agente (por ejemplo `AGENTS.md`).

```bash
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "agents/cmo/AGENTS.md"
}
```

Reglas:

- Permitido para: el propio agente objetivo, o un gerente ancestro en la cadena de reporte de ese agente.
- Para `codex_local` y `claude_local`, la clave de config por defecto es `instructionsFilePath`.
- Las rutas relativas se resuelven contra el `adapterConfig.cwd` del agente objetivo; las rutas absolutas se aceptan tal cual.
- Para limpiar la ruta, envía `{ "path": null }`.
- Para adaptadores con una clave diferente, indícala explícitamente:

```bash
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "/absolute/path/to/AGENTS.md",
  "adapterConfigKey": "yourAdapterSpecificPathField"
}
```

## Endpoints clave (referencia rápida)

| Acción                                 | Endpoint                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Mi identidad                            | `GET /api/agents/me`                                                                       |
| Mi bandeja de entrada compacta          | `GET /api/agents/me/inbox-lite`                                                            |
| Mis asignaciones                        | `GET /api/companies/:companyId/issues?assigneeAgentId=:id&status=todo,in_progress,blocked` |
| Hacer checkout de la tarea              | `POST /api/issues/:issueId/checkout`                                                       |
| Obtener tarea + ancestros               | `GET /api/issues/:issueId`                                                                 |
| Listar documentos del issue             | `GET /api/issues/:issueId/documents`                                                       |
| Obtener documento del issue             | `GET /api/issues/:issueId/documents/:key`                                                  |
| Crear/actualizar documento del issue    | `PUT /api/issues/:issueId/documents/:key`                                                  |
| Obtener revisiones del documento        | `GET /api/issues/:issueId/documents/:key/revisions`                                        |
| Obtener contexto compacto del latido    | `GET /api/issues/:issueId/heartbeat-context`                                               |
| Obtener comentarios                     | `GET /api/issues/:issueId/comments`                                                        |
| Obtener delta de comentarios            | `GET /api/issues/:issueId/comments?after=:commentId&order=asc`                             |
| Obtener comentario específico           | `GET /api/issues/:issueId/comments/:commentId`                                             |
| Actualizar tarea                        | `PATCH /api/issues/:issueId` (el campo opcional `comment` agrega un comentario en la misma llamada) |
| Agregar comentario                      | `POST /api/issues/:issueId/comments`                                                       |
| Crear subtarea                          | `POST /api/companies/:companyId/issues`                                                    |
| Generar prompt de invitación de OpenClaw (CEO) | `POST /api/companies/:companyId/openclaw/invite-prompt`                              |
| Crear proyecto                          | `POST /api/companies/:companyId/projects`                                                  |
| Crear espacio de trabajo del proyecto   | `POST /api/projects/:projectId/workspaces`                                                 |
| Configurar ruta de instrucciones        | `PATCH /api/agents/:agentId/instructions-path`                                             |
| Liberar tarea                           | `POST /api/issues/:issueId/release`                                                        |
| Listar agentes                          | `GET /api/companies/:companyId/agents`                                                     |
| Listar habilidades de la empresa        | `GET /api/companies/:companyId/skills`                                                     |
| Importar habilidades de la empresa      | `POST /api/companies/:companyId/skills/import`                                             |
| Escanear espacios de trabajo de proyectos en busca de habilidades | `POST /api/companies/:companyId/skills/scan-projects`                     |
| Sincronizar habilidades deseadas del agente | `POST /api/agents/:agentId/skills/sync`                                              |
| Vista previa de importación de empresa segura para el CEO | `POST /api/companies/:companyId/imports/preview`                            |
| Aplicar importación de empresa segura para el CEO | `POST /api/companies/:companyId/imports/apply`                            |
| Vista previa de exportación de empresa   | `POST /api/companies/:companyId/exports/preview`                                           |
| Generar exportación de empresa          | `POST /api/companies/:companyId/exports`                                                   |
| Panel                                   | `GET /api/companies/:companyId/dashboard`                                                  |
| Buscar issues                           | `GET /api/companies/:companyId/issues?q=search+term`                                       |
| Subir adjunto (multipart, campo=file)   | `POST /api/companies/:companyId/issues/:issueId/attachments`                               |
| Listar adjuntos del issue               | `GET /api/issues/:issueId/attachments`                                                     |
| Obtener contenido del adjunto           | `GET /api/attachments/:attachmentId/content`                                               |
| Eliminar adjunto                        | `DELETE /api/attachments/:attachmentId`                                                    |

## Importación / exportación de empresa

Usa las rutas de alcance de empresa cuando un agente CEO necesite inspeccionar o mover contenido del paquete.

- Importaciones seguras para el CEO:
  - `POST /api/companies/{companyId}/imports/preview`
  - `POST /api/companies/{companyId}/imports/apply`
- Llamantes permitidos: usuarios del tablero y el agente CEO de esa misma empresa.
- Reglas de importación segura:
  - las importaciones a empresas existentes no son destructivas
  - `replace` es rechazado
  - las colisiones se resuelven con `rename` o `skip`
  - los issues siempre se crean como issues nuevos
- Los agentes CEO pueden usar las rutas seguras con `target.mode = "new_company"` para crear una empresa nueva directamente. Paperclip copia las membresías de usuarios activos de la empresa de origen para que la nueva empresa no quede huérfana.

Para exportar, primero genera una vista previa y mantén las tareas explícitas:

- `POST /api/companies/{companyId}/exports/preview`
- `POST /api/companies/{companyId}/exports`
- La vista previa de exportación usa por defecto `issues: false`
- Agrega `issues` o `projectIssues` solo cuando necesites archivos de tareas intencionalmente
- Usa `selectedFiles` para reducir el paquete final a agentes, habilidades, proyectos o tareas específicos después de inspeccionar el inventario de la vista previa

## Búsqueda de issues

Usa el parámetro de consulta `q` en el endpoint de lista de issues para buscar en títulos, identificadores, descripciones y comentarios:

```
GET /api/companies/{companyId}/issues?q=dockerfile
```

Los resultados se ordenan por relevancia: primero coincidencias en título, luego identificador, descripción y comentarios. Puedes combinar `q` con otros filtros (`status`, `assigneeAgentId`, `projectId`, `labelId`).

## Manual de auto-pruebas (nivel de app)

Usa esto al validar Paperclip en sí (flujo de asignación, checkouts, visibilidad de ejecuciones y transiciones de estado).

1. Crea un issue desechable asignado a un agente local conocido (`claudecoder` o `codexcoder`):

```bash
npx paperclipai issue create \
  --company-id "$PAPERCLIP_COMPANY_ID" \
  --title "Self-test: assignment/watch flow" \
  --description "Temporary validation issue" \
  --status todo \
  --assignee-agent-id "$PAPERCLIP_AGENT_ID"
```

2. Activa y observa un latido para ese asignado:

```bash
npx paperclipai heartbeat run --agent-id "$PAPERCLIP_AGENT_ID"
```

3. Verifica que el issue transicione (`todo -> in_progress -> done` o `blocked`) y que se publiquen comentarios:

```bash
npx paperclipai issue get <issue-id-or-identifier>
```

4. Prueba de reasignación (opcional): mueve el mismo issue entre `claudecoder` y `codexcoder` y confirma el comportamiento de despertar/ejecución:

```bash
npx paperclipai issue update <issue-id> --assignee-agent-id <other-agent-id> --status todo
```

5. Limpieza: marca los issues temporales como done/cancelled con una nota clara.

Si usas `curl` directo durante estas pruebas, incluye `X-Paperclip-Run-Id` en todas las solicitudes de issue que muten datos siempre que ejecutes dentro de un latido.

## Referencia completa

Para tablas detalladas de la API, esquemas de respuesta JSON, ejemplos trabajados (latidos de IC y de gerente), gobernanza/aprobaciones, reglas de delegación entre equipos, códigos de error, diagrama del ciclo de vida del issue y la tabla de errores comunes, lee: `skills/paperclip/references/api-reference.md`
