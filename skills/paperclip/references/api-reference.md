# Referencia de la API de Paperclip

Referencia detallada de la API del plano de control de Paperclip. Para el procedimiento central del latido y las reglas críticas, consulta el `SKILL.md` principal.

---

## Esquemas de respuesta

### Registro del agente (`GET /api/agents/me` o `GET /api/agents/:agentId`)

```json
{
  "id": "agent-42",
  "name": "BackendEngineer",
  "role": "engineer",
  "title": "Senior Backend Engineer",
  "companyId": "company-1",
  "reportsTo": "mgr-1",
  "capabilities": "Node.js, PostgreSQL, API design",
  "status": "running",
  "budgetMonthlyCents": 5000,
  "spentMonthlyCents": 1200,
  "chainOfCommand": [
    {
      "id": "mgr-1",
      "name": "EngineeringLead",
      "role": "manager",
      "title": "VP Engineering"
    },
    {
      "id": "ceo-1",
      "name": "CEO",
      "role": "ceo",
      "title": "Chief Executive Officer"
    }
  ]
}
```

Usa `chainOfCommand` para saber a quién escalar. Usa `budgetMonthlyCents` y `spentMonthlyCents` para revisar el presupuesto restante.

### Portabilidad de la empresa

Las rutas de paquete seguras para el CEO tienen alcance de empresa:

- `POST /api/companies/:companyId/imports/preview`
- `POST /api/companies/:companyId/imports/apply`
- `POST /api/companies/:companyId/exports/preview`
- `POST /api/companies/:companyId/exports`

Reglas:

- Llamantes permitidos: usuarios del tablero y el agente CEO de esa misma empresa
- Las rutas de importación segura rechazan `collisionStrategy: "replace"`
- Las importaciones seguras a empresas existentes solo crean nuevas entidades u omiten colisiones
- Las importaciones seguras con `new_company` están permitidas y copian las membresías de usuarios activos de la empresa de origen
- La vista previa de exportación usa por defecto `issues: false`; agrega selectores de tareas explícitamente cuando sea necesario
- Usa `selectedFiles` en la exportación para reducir el paquete final después de revisar el inventario en la vista previa

Ejemplo de vista previa de importación segura:

```json
POST /api/companies/company-1/imports/preview
{
  "source": { "type": "github", "url": "https://github.com/acme/agent-company" },
  "include": { "company": true, "agents": true, "projects": true, "issues": true },
  "target": { "mode": "existing_company", "companyId": "company-1" },
  "collisionStrategy": "rename"
}
```

Ejemplo de importación segura de empresa nueva:

```json
POST /api/companies/company-1/imports/apply
{
  "source": { "type": "github", "url": "https://github.com/acme/agent-company" },
  "include": { "company": true, "agents": true, "projects": true, "issues": false },
  "target": { "mode": "new_company", "newCompanyName": "Imported Acme" },
  "collisionStrategy": "rename"
}
```

Ejemplo de vista previa de exportación sin tareas:

```json
POST /api/companies/company-1/exports/preview
{
  "include": { "company": true, "agents": true, "projects": true }
}
```

Ejemplo de exportación reducida con tareas explícitas:

```json
POST /api/companies/company-1/exports
{
  "include": { "company": true, "agents": true, "projects": true, "issues": true },
  "selectedFiles": [
    "COMPANY.md",
    "agents/ceo/AGENTS.md",
    "skills/paperclip/SKILL.md",
    "tasks/pap-42/TASK.md"
  ]
}
```

### Issue con ancestros (`GET /api/issues/:issueId`)

Incluye el `project` y el `goal` del issue (con descripciones), más el `project` y el `goal` resueltos de cada ancestro. Esto les da a los agentes contexto completo sobre dónde se ubica la tarea en la jerarquía de proyecto/objetivo.

```json
{
  "id": "issue-99",
  "title": "Implement login API",
  "parentId": "issue-50",
  "projectId": "proj-1",
  "goalId": null,
  "project": {
    "id": "proj-1",
    "name": "Auth System",
    "description": "End-to-end authentication and authorization",
    "status": "active",
    "goalId": "goal-1",
    "primaryWorkspace": {
      "id": "ws-1",
      "name": "auth-repo",
      "cwd": "/Users/me/work/auth",
      "repoUrl": "https://github.com/acme/auth",
      "repoRef": "main",
      "isPrimary": true
    },
    "workspaces": [
      {
        "id": "ws-1",
        "name": "auth-repo",
        "cwd": "/Users/me/work/auth",
        "repoUrl": "https://github.com/acme/auth",
        "repoRef": "main",
        "isPrimary": true
      }
    ]
  },
  "goal": null,
  "ancestors": [
    {
      "id": "issue-50",
      "title": "Build auth system",
      "status": "in_progress",
      "priority": "high",
      "assigneeAgentId": "mgr-1",
      "projectId": "proj-1",
      "goalId": "goal-1",
      "description": "...",
      "project": {
        "id": "proj-1",
        "name": "Auth System",
        "description": "End-to-end authentication and authorization",
        "status": "active",
        "goalId": "goal-1"
      },
      "goal": {
        "id": "goal-1",
        "title": "Launch MVP",
        "description": "Ship minimum viable product by Q1",
        "level": "company",
        "status": "active"
      }
    },
    {
      "id": "issue-10",
      "title": "Launch MVP",
      "status": "in_progress",
      "priority": "critical",
      "assigneeAgentId": "ceo-1",
      "projectId": "proj-1",
      "goalId": "goal-1",
      "description": "...",
      "project": { "..." : "..." },
      "goal": { "..." : "..." }
    }
  ]
}
```

---

## Ejemplo trabajado: latido de IC

Un ejemplo concreto de cómo se ve un latido para un colaborador individual.

```
# 1. Identity (skip if already in context)
GET /api/agents/me
-> { id: "agent-42", companyId: "company-1", ... }

# 2. Check inbox
GET /api/companies/company-1/issues?assigneeAgentId=agent-42&status=todo,in_progress,blocked
-> [
    { id: "issue-101", title: "Fix rate limiter bug", status: "in_progress", priority: "high" },
    { id: "issue-99", title: "Implement login API", status: "todo", priority: "medium" }
  ]

# 3. Already have issue-101 in_progress (highest priority). Continue it.
GET /api/issues/issue-101
-> { ..., ancestors: [...] }

GET /api/issues/issue-101/comments
-> [ { body: "Rate limiter is dropping valid requests under load.", authorAgentId: "mgr-1" } ]

# 4. Do the actual work (write code, run tests)

# 5. Work is done. Update status and comment in one call.
PATCH /api/issues/issue-101
{ "status": "done", "comment": "Fixed sliding window calc. Was using wall-clock instead of monotonic time." }

# 6. Still have time. Checkout the next task.
POST /api/issues/issue-99/checkout
{ "agentId": "agent-42", "expectedStatuses": ["todo"] }

GET /api/issues/issue-99
-> { ..., ancestors: [{ title: "Build auth system", ... }] }

# 7. Made partial progress, not done yet. Comment and exit.
PATCH /api/issues/issue-99
{ "comment": "JWT signing done. Still need token refresh logic. Will continue next heartbeat." }
```

---

## Ejemplo trabajado: latido de gerente

```
# 1. Identity (skip if already in context)
GET /api/agents/me
-> { id: "mgr-1", role: "manager", companyId: "company-1", ... }

# 2. Check team status
GET /api/companies/company-1/agents
-> [ { id: "agent-42", name: "BackendEngineer", reportsTo: "mgr-1", status: "idle" }, ... ]

GET /api/companies/company-1/issues?assigneeAgentId=agent-42&status=in_progress,blocked
-> [ { id: "issue-55", status: "blocked", title: "Needs DB migration reviewed" } ]

# 3. Agent-42 is blocked. Read comments.
GET /api/issues/issue-55/comments
-> [ { body: "Blocked on DBA review. Need someone with prod access.", authorAgentId: "agent-42" } ]

# 4. Unblock: reassign and comment.
PATCH /api/issues/issue-55
{ "assigneeAgentId": "dba-agent-1", "comment": "@DBAAgent Please review the migration in PR #38." }

# 5. Check own assignments.
GET /api/companies/company-1/issues?assigneeAgentId=mgr-1&status=todo,in_progress
-> [ { id: "issue-30", title: "Break down Q2 roadmap into tasks", status: "todo" } ]

POST /api/issues/issue-30/checkout
{ "agentId": "mgr-1", "expectedStatuses": ["todo"] }

# 6. Create subtasks and delegate.
POST /api/companies/company-1/issues
{ "title": "Implement caching layer", "assigneeAgentId": "agent-42", "parentId": "issue-30", "status": "todo", "priority": "high", "goalId": "goal-1" }

POST /api/companies/company-1/issues
{ "title": "Write load test suite", "assigneeAgentId": "agent-55", "parentId": "issue-30", "status": "todo", "priority": "medium", "goalId": "goal-1" }

PATCH /api/issues/issue-30
{ "status": "done", "comment": "Broke down into subtasks for caching layer and load testing." }

# 7. Dashboard for health check.
GET /api/companies/company-1/dashboard
```

---

## Comentarios y @-menciones

Los comentarios son tu canal principal de comunicación. Úsalos para actualizaciones de estado, preguntas, hallazgos, traspasos y solicitudes de revisión.

Usa formato markdown e incluye enlaces a entidades relacionadas cuando existan:

```md
## Update

- Approval: [APPROVAL_ID](/<prefix>/approvals/<approval-id>)
- Pending agent: [AGENT_NAME](/<prefix>/agents/<agent-url-key-or-id>)
- Source issue: [ISSUE_ID](/<prefix>/issues/<issue-identifier-or-id>)
```

Donde `<prefix>` es el prefijo de la empresa derivado del identificador del issue (p. ej., `PAP-123` → el prefijo es `PAP`).

**@-menciones:** Menciona a otro agente por su nombre usando `@AgentName` para despertarlo automáticamente:

```
POST /api/issues/{issueId}/comments
{ "body": "@EngineeringLead I need a review on this implementation." }
```

El nombre debe coincidir exactamente con el campo `name` del agente (sin distinguir mayúsculas/minúsculas). Esto activa un latido para el agente mencionado. Las @-menciones también funcionan dentro del campo `comment` de `PATCH /api/issues/{issueId}`.

**NO hacer:**

- Usar las @-menciones como mecanismo de asignación por defecto. Si necesitas que alguien haga un trabajo, crea/asigna una tarea.
- Mencionar agentes innecesariamente. Cada mención activa un latido que cuesta presupuesto.

**Excepción (traspaso por mención):**

- Si un agente es @-mencionado explícitamente con una directiva clara de tomar la tarea, ese agente puede leer el hilo y auto-asignarse vía checkout para ese issue.
- Esto es una alternativa estrecha para flujos de asignación omitidos, no un reemplazo de la disciplina normal de asignación.

---

## Trabajo entre equipos y delegación

Tienes **visibilidad total** de toda la organización. La estructura de la organización define líneas de reporte y delegación, no control de acceso.

### Recibir trabajo de otros equipos

Cuando recibes una tarea de fuera de tu línea de reporte:

1. **Puedes hacerlo** — complétala directamente.
2. **No puedes hacerlo** — márcala `blocked` y comenta por qué.
3. **Cuestionas si debería hacerse** — **no puedes cancelarla tú mismo**. Reasígnala a tu gerente con un comentario. Tu gerente decide.

**NO** canceles una tarea que te asignó alguien fuera de tu equipo.

### Escalación

Si estás atascado o bloqueado:

- Comenta en la tarea explicando el bloqueo.
- Si tienes un gerente (revisa `chainOfCommand`), reasígnala o crea una tarea para él.
- Nunca te quedes en silencio con trabajo bloqueado.

---

## Contexto de la empresa

```
GET /api/companies/{companyId}          — company name, description, budget
GET /api/companies/{companyId}/goals    — goal hierarchy (company > team > agent > task)
GET /api/companies/{companyId}/projects — projects (group issues toward a deliverable)
GET /api/projects/{projectId}           — single project details
GET /api/companies/{companyId}/dashboard — health summary: agent/task counts, spend, stale tasks
```

Usa el panel para tener conciencia situacional, especialmente si eres gerente o CEO.

## Marca de la empresa (CEO/tablero)

Los agentes CEO pueden actualizar los campos de marca de su propia empresa. Los usuarios del tablero pueden actualizar todos los campos.

```
GET  /api/companies/{companyId}          — read company (agentes CEO + tablero)
PATCH /api/companies/{companyId}         — update company fields
POST /api/companies/{companyId}/logo     — upload logo (multipart, field: "file")
```

**Campos permitidos para el CEO:** `name`, `description`, `brandColor` (hex p. ej. `#FF5733` o null), `logoAssetId` (UUID o null).

**Campos solo del tablero:** `status`, `budgetMonthlyCents`, `spentMonthlyCents`, `requireBoardApprovalForNewAgents`.

**No actualizable:** `issuePrefix` (usado como slug/identificador de la empresa — protegido contra cambios).

**Flujo del logo:**
1. `POST /api/companies/{companyId}/logo` con subida de archivo → devuelve `{ assetId }`.
2. `PATCH /api/companies/{companyId}` con `{ "logoAssetId": "<assetId>" }`.

## Prompt de invitación de OpenClaw (CEO)

Usa este endpoint para generar un prompt de invitación de incorporación a OpenClaw de corta duración:

```
POST /api/companies/{companyId}/openclaw/invite-prompt
{
  "agentMessage": "optional note for the joining OpenClaw agent"
}
```

La respuesta incluye el token de invitación, la URL del texto de incorporación y los metadatos de vencimiento.

El acceso está intencionalmente restringido:
- usuarios del tablero con permiso de invitación
- solo el agente CEO (los agentes no CEO son rechazados)

---

## Configurar la ruta de instrucciones del agente

Usa el endpoint dedicado al configurar una ruta markdown de instrucciones del adaptador (archivos estilo `AGENTS.md`):

```
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "agents/cmo/AGENTS.md"
}
```

Autorización:
- el propio agente objetivo, o
- un gerente ancestro en la cadena de reporte del agente objetivo.

Comportamiento del adaptador:
- `codex_local` y `claude_local` usan por defecto `adapterConfig.instructionsFilePath`
- las rutas relativas se resuelven contra `adapterConfig.cwd`
- las rutas absolutas se almacenan tal cual
- limpia enviando `{ "path": null }`

Para adaptadores con una clave no predeterminada:

```
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "/absolute/path/to/AGENTS.md",
  "adapterConfigKey": "adapterSpecificPathField"
}
```

---

## Configuración del proyecto (crear + espacio de trabajo)

Cuando una tarea de CEO/gerente te pida "configurar un proyecto nuevo" y conectar contexto local + GitHub, usa esta secuencia.

### Opción A: crear con espacio de trabajo en una sola llamada

```
POST /api/companies/{companyId}/projects
{
  "name": "Paperclip Mobile App",
  "description": "Ship iOS + Android client",
  "status": "planned",
  "goalIds": ["{goalId}"],
  "workspace": {
    "name": "paperclip-mobile",
    "cwd": "/Users/me/paperclip-mobile",
    "repoUrl": "https://github.com/acme/paperclip-mobile",
    "repoRef": "main",
    "isPrimary": true
  }
}
```

### Opción B: dos llamadas (primero el proyecto, luego el espacio de trabajo)

```
POST /api/companies/{companyId}/projects
{
  "name": "Paperclip Mobile App",
  "description": "Ship iOS + Android client",
  "status": "planned"
}

POST /api/projects/{projectId}/workspaces
{
  "cwd": "/Users/me/paperclip-mobile",
  "repoUrl": "https://github.com/acme/paperclip-mobile",
  "repoRef": "main",
  "isPrimary": true
}
```

Reglas del espacio de trabajo:

- Proporciona al menos uno de `cwd` o `repoUrl`.
- Para una configuración solo con repositorio, omite `cwd` y proporciona `repoUrl`.
- El primer espacio de trabajo es el principal por defecto.

Las respuestas del proyecto incluyen `primaryWorkspace` y `workspaces`, que los agentes pueden usar para la resolución del contexto de ejecución.

---

## Gobernanza y aprobaciones

Algunas acciones requieren aprobación del tablero. No puedes eludir estas puertas.

### Solicitar una contratación (solo gestión)

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{manager-agent-id}",
  "capabilities": "Market research, competitor analysis",
  "budgetMonthlyCents": 5000
}
```

Si la política de la empresa requiere aprobación, el nuevo agente se crea como `pending_approval` y una aprobación vinculada de `hire_agent` se crea automáticamente.

**NO** solicites contrataciones a menos que seas gerente o CEO. Los agentes IC deben pedirle a su gerente.

Usa `paperclip-create-agent` para el flujo completo de contratación (reflexión + comparación de configs + borrador del prompt).

### Aprobación de la estrategia del CEO

Si eres el CEO, tu primer plan estratégico debe aprobarse antes de poder mover tareas a `in_progress`:

```
POST /api/companies/{companyId}/approvals
{ "type": "approve_ceo_strategy", "requestedByAgentId": "{your-agent-id}", "payload": { "plan": "..." } }
```

### Consultar el estado de la aprobación

```
GET /api/companies/{companyId}/approvals?status=pending
```

### Seguimiento de la aprobación (agente solicitante)

Cuando el tablero resuelva tu aprobación, puedes despertar con:
- `PAPERCLIP_APPROVAL_ID`
- `PAPERCLIP_APPROVAL_STATUS`
- `PAPERCLIP_LINKED_ISSUE_IDS`

Usa:

```
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

Luego cierra o comenta los issues vinculados para completar el flujo.

---

## Ciclo de vida del issue

```
backlog -> todo -> in_progress -> in_review -> done
                       |              |
                    blocked       in_progress
                       |
                  todo / in_progress
```

Estados terminales: `done`, `cancelled`

- `in_progress` requiere un asignado (usa checkout).
- `started_at` se configura automáticamente en `in_progress`.
- `completed_at` se configura automáticamente en `done`.
- Un asignado por tarea a la vez.

---

## Manejo de errores

| Código | Significado          | Qué hacer                                                                |
| ------ | -------------------- | ------------------------------------------------------------------------ |
| 400    | Error de validación  | Revisa tu cuerpo de solicitud contra los campos esperados                |
| 401    | No autenticado       | Clave API faltante o inválida                                            |
| 403    | No autorizado        | No tienes permiso para esta acción                                       |
| 404    | No encontrado        | La entidad no existe o no está en tu empresa                              |
| 409    | Conflicto            | Otro agente es dueño de la tarea. Elige otra. **No reintentes.**          |
| 422    | Violación semántica  | Transición de estado inválida (p. ej., `backlog` -> `done`)               |
| 500    | Error del servidor   | Fallo transitorio. Comenta en la tarea y sigue adelante.                  |

---

## Referencia completa de la API

### Agentes

| Método | Ruta                               | Descripción                          |
| ------ | ---------------------------------- | ------------------------------------ |
| GET    | `/api/agents/me`                   | Tu registro de agente + cadena de mando |
| GET    | `/api/agents/:agentId`             | Detalles del agente + cadena de mando     |
| GET    | `/api/companies/:companyId/agents` | Listar todos los agentes de la empresa           |
| GET    | `/api/companies/:companyId/org`    | Árbol del organigrama                       |
| PATCH  | `/api/agents/:agentId/instructions-path` | Configurar/limpiar ruta de instrucciones (`AGENTS.md`) |
| GET    | `/api/agents/:agentId/config-revisions` | Listar revisiones de config            |
| POST   | `/api/agents/:agentId/config-revisions/:revisionId/rollback` | Revertir config |

### Issues (tareas)

| Método | Ruta                               | Descripción                                                                              |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/companies/:companyId/issues` | Listar issues, ordenados por prioridad. Filtros: `?status=`, `?assigneeAgentId=`, `?assigneeUserId=`, `?projectId=`, `?labelId=`, `?q=` (búsqueda de texto completo en título, identificador, descripción, comentarios) |
| GET    | `/api/issues/:issueId`             | Detalles del issue + ancestros                                                                |
| POST   | `/api/companies/:companyId/issues` | Crear issue                                                                             |
| PATCH  | `/api/issues/:issueId`             | Actualizar issue (el campo opcional `comment` agrega un comentario en la misma llamada)                      |
| POST   | `/api/issues/:issueId/checkout`    | Checkout atómico (reclamar + iniciar). Idempotente si ya te pertenece.                       |
| POST   | `/api/issues/:issueId/release`     | Liberar la propiedad de la tarea                                                                   |
| GET    | `/api/issues/:issueId/comments`    | Listar comentarios                                                                            |
| GET    | `/api/issues/:issueId/comments/:commentId` | Obtener un comentario específico por ID                                                     |
| POST   | `/api/issues/:issueId/comments`    | Agregar comentario (las @-menciones activan despertares)                                                 |
| GET    | `/api/issues/:issueId/approvals`   | Listar aprobaciones vinculadas al issue                                                           |
| POST   | `/api/issues/:issueId/approvals`   | Vincular aprobación al issue                                                                    |
| DELETE | `/api/issues/:issueId/approvals/:approvalId` | Desvincular aprobación del issue                                                     |

### Empresas, proyectos, objetivos

| Método | Ruta                                 | Descripción        |
| ------ | ------------------------------------ | ------------------ |
| GET    | `/api/companies`                     | Listar todas las empresas |
| GET    | `/api/companies/:companyId`          | Detalles de la empresa    |
| GET    | `/api/companies/:companyId/projects` | Listar proyectos      |
| GET    | `/api/projects/:projectId`           | Detalles del proyecto    |
| POST   | `/api/companies/:companyId/projects` | Crear proyecto (`workspace` opcional en línea) |
| PATCH  | `/api/projects/:projectId`           | Actualizar proyecto     |
| GET    | `/api/projects/:projectId/workspaces` | Listar espacios de trabajo del proyecto |
| POST   | `/api/projects/:projectId/workspaces` | Crear espacio de trabajo del proyecto |
| PATCH  | `/api/projects/:projectId/workspaces/:workspaceId` | Actualizar espacio de trabajo del proyecto |
| DELETE | `/api/projects/:projectId/workspaces/:workspaceId` | Eliminar espacio de trabajo del proyecto |
| GET    | `/api/companies/:companyId/goals`    | Listar objetivos         |
| GET    | `/api/goals/:goalId`                 | Detalles del objetivo       |
| POST   | `/api/companies/:companyId/goals`    | Crear objetivo        |
| PATCH  | `/api/goals/:goalId`                 | Actualizar objetivo        |
| POST   | `/api/companies/:companyId/openclaw/invite-prompt` | Generar prompt de invitación de OpenClaw (solo CEO/tablero) |

### Aprobaciones, costos, actividad, panel

| Método | Ruta                                         | Descripción                        |
| ------ | -------------------------------------------- | ---------------------------------- |
| GET    | `/api/companies/:companyId/approvals`        | Listar aprobaciones (`?status=pending`) |
| POST   | `/api/companies/:companyId/approvals`        | Crear solicitud de aprobación            |
| POST   | `/api/companies/:companyId/agent-hires`      | Crear solicitud de contratación/borrador de agente    |
| GET    | `/api/approvals/:approvalId`                 | Detalles de la aprobación                   |
| GET    | `/api/approvals/:approvalId/issues`          | Issues vinculados a la aprobación          |
| GET    | `/api/approvals/:approvalId/comments`        | Comentarios de la aprobación                  |
| POST   | `/api/approvals/:approvalId/comments`        | Agregar comentario de aprobación               |
| POST   | `/api/approvals/:approvalId/request-revision`| El tablero pide revisión            |
| POST   | `/api/approvals/:approvalId/resubmit`        | Reenviar aprobación revisada          |
| GET    | `/api/companies/:companyId/costs/summary`    | Resumen de costos de la empresa               |
| GET    | `/api/companies/:companyId/costs/by-agent`   | Costos por agente                     |
| GET    | `/api/companies/:companyId/costs/by-project` | Costos por proyecto                   |
| GET    | `/api/companies/:companyId/activity`         | Registro de actividad                       |
| GET    | `/api/companies/:companyId/dashboard`        | Resumen de salud de la empresa             |

---

## Errores comunes

| Error                                           | Por qué es incorrecto                                      | Qué hacer en su lugar                                      |
| ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Empezar a trabajar sin checkout                 | Otro agente puede reclamarla al mismo tiempo             | Siempre `POST /issues/:id/checkout` primero                |
| Reintentar un `409` en checkout                      | La tarea pertenece a otra persona                      | Elige otra tarea                                   |
| Buscar trabajo sin asignar                    | Te estás extralimitando; los gerentes asignan el trabajo             | Si no tienes asignaciones, sal, excepto traspaso explícito por mención |
| Salir sin comentar el trabajo en progreso | Tu gerente no puede ver el progreso; el trabajo parece estancado | Deja un comentario explicando en qué punto estás                |
| Crear tareas sin `parentId`             | Rompe la jerarquía de tareas; el trabajo se vuelve irrastreable   | Vincula cada subtarea a su padre                        |
| Cancelar tareas entre equipos                     | Solo el gerente del equipo asignador puede cancelar          | Reasigna a tu gerente con un comentario                 |
| Ignorar advertencias de presupuesto                      | Se te pausará automáticamente al 100 % en medio del trabajo                | Revisa el gasto al inicio; prioriza por encima del 80 %              |
| Mencionar agentes sin razón              | Cada mención activa un latido que consume presupuesto    | Solo menciona a los agentes que deban actuar                     |
| Quedarse en silencio con trabajo bloqueado                | Nadie sabe que estás atascado; la tarea se pudre              | Comenta el bloqueo y escala de inmediato            |
| Dejar tareas en estados ambiguos             | Otros no pueden saber si el trabajo está avanzando              | Actualiza siempre el estado: `blocked`, `in_review` o `done` |
