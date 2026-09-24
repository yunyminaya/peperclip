# Especificación de implementación de Paperclip V1

Estado: Contrato de implementación para la primera versión (V1)
Fecha: 2026-02-17
Audiencia: Producto, ingeniería y autores de integración de agentes
Entradas fuente: `GOAL.md`, `PRODUCT.md`, `SPEC.md`, `DATABASE.md`, código actual del monorepo

## 1. Rol del documento

`SPEC.md` sigue siendo la especificación de producto de largo plazo.
Este documento es el contrato concreto y listo para construir de V1.
Cuando haya un conflicto, `SPEC-implementation.md` controla el comportamiento de V1.

## 2. Resultados de V1

Paperclip V1 debe proporcionar un ciclo completo de plano de control para agentes autónomos:

1. Un tablero humano crea una empresa y define objetivos.
2. El tablero crea y gestiona agentes en un organigrama.
3. Los agentes reciben y ejecutan tareas mediante invocaciones de latido.
4. Todo el trabajo se rastrea mediante tareas/comentarios con visibilidad de auditoría.
5. Se informa el uso de tokens/costos y los límites de presupuesto pueden detener el trabajo.
6. El tablero puede intervenir en cualquier parte (pausar agentes/tareas, anular decisiones).

Éxito significa que un solo operador puede gestionar una pequeña empresa nativa de IA de principio a fin con visibilidad y control claros.

## 3. Decisiones de producto explícitas de V1

Estas decisiones cierran las preguntas abiertas de `SPEC.md` para V1.

| Tema | Decisión de V1 |
|---|---|
| Inquilinos | Despliegue de un solo inquilino, modelo de datos multiempresa |
| Modelo de empresa | La empresa es de primer orden; todas las entidades de negocio tienen alcance de empresa |
| Tablero | Un solo operador de tablero humano por despliegue |
| Grafo de organización | Árbol estricto (`reports_to` raíz anulable); sin reporte a múltiples jefes |
| Visibilidad | Visibilidad total para el tablero y todos los agentes de la misma empresa |
| Comunicación | Solo tareas + comentarios (sin sistema de chat separado) |
| Propiedad de tareas | Un solo asignado; checkout atómico requerido para la transición a `in_progress` |
| Recuperación | Sin reasignación automática; la recuperación del trabajo sigue siendo manual/explícita |
| Adaptadores de agentes | Adaptadores integrados `process` y `http` |
| Autenticación | Autenticación humana dependiente del modo (`local_trusted` tablero implícito en el código actual; el modo autenticado usa sesiones), claves de API para agentes |
| Período de presupuesto | Ventana de calendario UTC mensual |
| Aplicación del presupuesto | Alertas suaves + pausa automática por límite duro |
| Modos de despliegue | El modelo canónico es `local_trusted` + `authenticated` con política de exposición `private/public` (ver `doc/DEPLOYMENT-MODES.md`) |

## 4. Base actual (instantánea del repositorio)

Al 2026-02-17, el repositorio ya incluye:

- Backend Node + TypeScript con CRUD REST para `agents`, `projects`, `goals`, `issues`, `activity`
- Páginas de UI React para listas de panel/agentes/proyectos/objetivos/issues
- Esquema PostgreSQL vía Drizzle con respaldo de PostgreSQL embebido cuando `DATABASE_URL` no está definido

La implementación de V1 extiende esta base hacia un plano de control centrado en la empresa y consciente de la gobernanza.

## 5. Alcance de V1

## 5.1 Dentro del alcance

- Ciclo de vida de la empresa (crear/listar/obtener/actualizar/archivar)
- Jerarquía de objetivos vinculada a la misión de la empresa
- Ciclo de vida del agente con estructura de organización y configuración de adaptador
- Ciclo de vida de la tarea con jerarquía padre/hijo y comentarios
- Checkout atómico de tareas y transiciones de estado explícitas de tareas
- Aprobaciones del tablero para contrataciones y propuesta de estrategia del CEO
- Invocación de latido, seguimiento de estado y cancelación
- Ingesta de eventos de costo y acumulados (agente/tarea/proyecto/empresa)
- Ajustes de presupuesto y aplicación de tope duro
- UI web del tablero para panel, organigrama, tareas, agentes, aprobaciones, costos
- Contrato de API orientado a agentes (lectura/escritura de tareas, reporte de latido, reporte de costos)
- Registro de actividad auditable para todas las acciones que mutan

## 5.2 Fuera del alcance (V1)

- Framework de plugins y SDK de extensiones de terceros
- Contabilidad de ingresos/gastos más allá de los costos de modelo/token
- Subsistema de base de conocimiento
- Marketplace público (ClipHub)
- Gobernanza de múltiples juntas o granularidad de permisos humanos basada en roles
- Orquestación de auto-reparación automática (planificadores de auto-reasignación/reintento)

## 6. Arquitectura

## 6.1 Componentes en ejecución

- `server/`: API REST, autenticación, servicios de orquestación
- `ui/`: Interfaz del operador del tablero
- `packages/db/`: Esquema Drizzle, migraciones, clientes de BD (Postgres)
- `packages/shared/`: Tipos de API compartidos, validadores, constantes

## 6.2 Almacenes de datos

- Primario: PostgreSQL
- Local por defecto: PostgreSQL embebido en `~/.paperclip/instances/default/db`
- Local opcional tipo producción: Docker Postgres
- Hospedado opcional: Supabase/Postgres-compatible
- Almacenamiento de archivos/objetos:
  - local por defecto: `~/.paperclip/instances/default/data/storage` (`local_disk`)
  - nube: almacenamiento de objetos compatible con S3 (`s3`)

## 6.3 Procesamiento en segundo plano

Un planificador/trabajador ligero en el proceso del servidor gestiona:

- verificaciones de disparo de latido
- detección de ejecuciones estancadas
- verificaciones de umbrales de presupuesto

No se requiere infraestructura de colas separada para V1.

## 7. Modelo de datos canónico (V1)

Todas las tablas principales incluyen `id`, `created_at`, `updated_at` salvo que se indique lo contrario.

## 7.0 Tablas de autenticación

Las tablas de autenticación humana (`users`, `sessions` y artefactos de autenticación específicos del proveedor) las gestiona la biblioteca de autenticación seleccionada. Esta especificación las trata como dependencias requeridas y referencia `users.id` donde se necesita atribución de usuario.

## 7.1 `companies`

- `id` uuid pk
- `name` text not null
- `description` text null
- `status` enum: `active | paused | archived`

Invariante: cada registro de negocio pertenece a exactamente una empresa.

## 7.2 `agents`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `name` text not null
- `role` text not null
- `title` text null
- `status` enum: `active | paused | idle | running | error | terminated`
- `reports_to` uuid fk `agents.id` null
- `capabilities` text null
- `adapter_type` enum: `process | http`
- `adapter_config` jsonb not null
- `context_mode` enum: `thin | fat` default `thin`
- `budget_monthly_cents` int not null default 0
- `spent_monthly_cents` int not null default 0
- `last_heartbeat_at` timestamptz null

Invariantes:

- el agente y su jefe deben estar en la misma empresa
- sin ciclos en el árbol de reporte
- los agentes `terminated` no pueden reanudarse

## 7.3 `agent_api_keys`

- `id` uuid pk
- `agent_id` uuid fk `agents.id` not null
- `company_id` uuid fk `companies.id` not null
- `name` text not null
- `key_hash` text not null
- `last_used_at` timestamptz null
- `revoked_at` timestamptz null

Invariante: la clave en texto plano se muestra una sola vez al crearla; solo se almacena el hash.

## 7.4 `goals`

- `id` uuid pk
- `company_id` uuid fk not null
- `title` text not null
- `description` text null
- `level` enum: `company | team | agent | task`
- `parent_id` uuid fk `goals.id` null
- `owner_agent_id` uuid fk `agents.id` null
- `status` enum: `planned | active | achieved | cancelled`

Invariante: al menos un objetivo raíz de nivel `company` por empresa.

## 7.5 `projects`

- `id` uuid pk
- `company_id` uuid fk not null
- `goal_id` uuid fk `goals.id` null
- `name` text not null
- `description` text null
- `status` enum: `backlog | planned | in_progress | completed | cancelled`
- `lead_agent_id` uuid fk `agents.id` null
- `target_date` date null

## 7.6 `issues` (entidad principal de tareas)

- `id` uuid pk
- `company_id` uuid fk not null
- `project_id` uuid fk `projects.id` null
- `goal_id` uuid fk `goals.id` null
- `parent_id` uuid fk `issues.id` null
- `title` text not null
- `description` text null
- `status` enum: `backlog | todo | in_progress | in_review | done | blocked | cancelled`
- `priority` enum: `critical | high | medium | low`
- `assignee_agent_id` uuid fk `agents.id` null
- `created_by_agent_id` uuid fk `agents.id` null
- `created_by_user_id` uuid fk `users.id` null
- `request_depth` int not null default 0
- `billing_code` text null
- `started_at` timestamptz null
- `completed_at` timestamptz null
- `cancelled_at` timestamptz null

Invariantes:

- solo un asignado
- la tarea debe trazar hasta la cadena de objetivos de la empresa vía `goal_id`, `parent_id` o el vínculo proyecto-objetivo
- `in_progress` requiere asignado
- estados terminales: `done | cancelled`

## 7.7 `issue_comments`

- `id` uuid pk
- `company_id` uuid fk not null
- `issue_id` uuid fk `issues.id` not null
- `author_agent_id` uuid fk `agents.id` null
- `author_user_id` uuid fk `users.id` null
- `body` text not null

## 7.8 `heartbeat_runs`

- `id` uuid pk
- `company_id` uuid fk not null
- `agent_id` uuid fk not null
- `invocation_source` enum: `scheduler | manual | callback`
- `status` enum: `queued | running | succeeded | failed | cancelled | timed_out`
- `started_at` timestamptz null
- `finished_at` timestamptz null
- `error` text null
- `external_run_id` text null
- `context_snapshot` jsonb null

## 7.9 `cost_events`

- `id` uuid pk
- `company_id` uuid fk not null
- `agent_id` uuid fk `agents.id` not null
- `issue_id` uuid fk `issues.id` null
- `project_id` uuid fk `projects.id` null
- `goal_id` uuid fk `goals.id` null
- `billing_code` text null
- `provider` text not null
- `model` text not null
- `input_tokens` int not null default 0
- `output_tokens` int not null default 0
- `cost_cents` int not null
- `occurred_at` timestamptz not null

Invariante: cada evento debe adjuntarse a un agente y a una empresa; los acumulados son agregación, nunca se editan manualmente.

## 7.10 `approvals`

- `id` uuid pk
- `company_id` uuid fk not null
- `type` enum: `hire_agent | approve_ceo_strategy`
- `requested_by_agent_id` uuid fk `agents.id` null
- `requested_by_user_id` uuid fk `users.id` null
- `status` enum: `pending | approved | rejected | cancelled`
- `payload` jsonb not null
- `decision_note` text null
- `decided_by_user_id` uuid fk `users.id` null
- `decided_at` timestamptz null

## 7.11 `activity_log`

- `id` uuid pk
- `company_id` uuid fk not null
- `actor_type` enum: `agent | user | system`
- `actor_id` uuid/text not null
- `action` text not null
- `entity_type` text not null
- `entity_id` uuid/text not null
- `details` jsonb null
- `created_at` timestamptz not null default now()

## 7.12 `company_secrets` + `company_secret_versions`

- Los valores de secretos no se almacenan en línea en `agents.adapter_config.env`.
- Las entradas de env del agente deben usar referencias de secretos para valores sensibles.
- `company_secrets` rastrea metadatos de identidad/proveedor por empresa.
- `company_secret_versions` almacena material cifrado/de referencia por versión.
- Proveedor por defecto en despliegues locales: `local_encrypted`.

Política operativa:

- Las APIs de lectura de configuración redactan los valores sensibles en texto plano.
- Los payloads de actividad y aprobación no deben persistir valores sensibles sin procesar.
- Las revisiones de configuración pueden incluir marcadores redactados; dichas revisiones no son restaurables para los campos redactados.

## 7.13 Índices requeridos

- `agents(company_id, status)`
- `agents(company_id, reports_to)`
- `issues(company_id, status)`
- `issues(company_id, assignee_agent_id, status)`
- `issues(company_id, parent_id)`
- `issues(company_id, project_id)`
- `cost_events(company_id, occurred_at)`
- `cost_events(company_id, agent_id, occurred_at)`
- `heartbeat_runs(company_id, agent_id, started_at desc)`
- `approvals(company_id, status, type)`
- `activity_log(company_id, created_at desc)`
- `assets(company_id, created_at desc)`
- `assets(company_id, object_key)` unique
- `issue_attachments(company_id, issue_id)`
- `company_secrets(company_id, name)` unique
- `company_secret_versions(secret_id, version)` unique

## 7.14 `assets` + `issue_attachments`

- `assets` almacena metadatos de objetos respaldados por proveedor (no bytes en línea):
  - `id` uuid pk
  - `company_id` uuid fk not null
  - `provider` enum/text (`local_disk | s3`)
  - `object_key` text not null
  - `content_type` text not null
  - `byte_size` int not null
  - `sha256` text not null
  - `original_filename` text null
  - `created_by_agent_id` uuid fk null
  - `created_by_user_id` uuid/text fk null
- `issue_attachments` vincula assets a issues/comentarios:
  - `id` uuid pk
  - `company_id` uuid fk not null
  - `issue_id` uuid fk not null
  - `asset_id` uuid fk not null
  - `issue_comment_id` uuid fk null

## 7.15 `documents` + `document_revisions` + `issue_documents`

- `documents` almacena documentos editables con prioridad de texto:
  - `id` uuid pk
  - `company_id` uuid fk not null
  - `title` text null
  - `format` text not null (`markdown`)
  - `latest_body` text not null
  - `latest_revision_id` uuid null
  - `latest_revision_number` int not null
  - `created_by_agent_id` uuid fk null
  - `created_by_user_id` uuid/text fk null
  - `updated_by_agent_id` uuid fk null
  - `updated_by_user_id` uuid/text fk null
- `document_revisions` almacena historial de solo anexado:
  - `id` uuid pk
  - `company_id` uuid fk not null
  - `document_id` uuid fk not null
  - `revision_number` int not null
  - `body` text not null
  - `change_summary` text null
- `issue_documents` vincula documentos a issues con una clave de flujo de trabajo estable:
  - `id` uuid pk
  - `company_id` uuid fk not null
  - `issue_id` uuid fk not null
  - `document_id` uuid fk not null
  - `key` text not null (`plan`, `design`, `notes`, etc.)

## 8. Máquinas de estado

## 8.1 Estado del agente

Transiciones permitidas:

- `idle -> running`
- `running -> idle`
- `running -> error`
- `error -> idle`
- `idle -> paused`
- `running -> paused` (requiere flujo de cancelación)
- `paused -> idle`
- `* -> terminated` (solo el tablero, irreversible)

## 8.2 Estado de la issue

Transiciones permitidas:

- `backlog -> todo | cancelled`
- `todo -> in_progress | blocked | cancelled`
- `in_progress -> in_review | blocked | done | cancelled`
- `in_review -> in_progress | done | cancelled`
- `blocked -> todo | in_progress | cancelled`
- terminal: `done`, `cancelled`

Efectos secundarios:

- entrar a `in_progress` establece `started_at` si es nulo
- entrar a `done` establece `completed_at`
- entrar a `cancelled` establece `cancelled_at`

## 8.3 Estado de la aprobación

- `pending -> approved | rejected | cancelled`
- terminal tras la decisión

## 9. Autenticación y permisos

## 9.1 Autenticación del tablero

- Autenticación basada en sesiones para el operador humano
- El tablero tiene lectura/escritura total en todas las empresas del despliegue
- Cada mutación del tablero escribe en `activity_log`

## 9.2 Autenticación del agente

- Clave de API bearer asignada a un agente y una empresa
- Alcance de la clave del agente:
  - leer contexto de organización/tareas/empresa para su propia empresa
  - leer/escribir sus tareas asignadas y comentarios
  - crear tareas/comentarios para delegación
  - reportar estado de latido
  - reportar eventos de costo
- El agente no puede:
  - saltarse las puertas de aprobación
  - modificar directamente los presupuestos de toda la empresa
  - mutar autenticación/claves

## 9.3 Matriz de permisos (V1)

| Acción | Tablero | Agente |
|---|---|---|
| Crear empresa | sí | no |
| Contratar/crear agente | sí (directo) | solicitar mediante aprobación |
| Pausar/reanudar agente | sí | no |
| Crear/actualizar tarea | sí | sí |
| Reasignar tarea por la fuerza | sí | limitado |
| Aprobar solicitudes de estrategia/contratación | sí | no |
| Reportar costo | sí | sí |
| Establecer presupuesto de la empresa | sí | no |
| Establecer presupuesto de subordinados | sí | sí (solo el subárbol de subordinados) |

## 10. Contrato de API (REST)

Todos los endpoints están bajo `/api` y devuelven JSON.

## 10.1 Empresas

- `GET /companies`
- `POST /companies`
- `GET /companies/:companyId`
- `PATCH /companies/:companyId`
- `PATCH /companies/:companyId/branding`
- `POST /companies/:companyId/archive`

## 10.2 Objetivos

- `GET /companies/:companyId/goals`
- `POST /companies/:companyId/goals`
- `GET /goals/:goalId`
- `PATCH /goals/:goalId`
- `DELETE /goals/:goalId` (eliminado suave opcional, eliminado duro solo el tablero)

## 10.3 Agentes

- `GET /companies/:companyId/agents`
- `POST /companies/:companyId/agents`
- `GET /agents/:agentId`
- `PATCH /agents/:agentId`
- `POST /agents/:agentId/pause`
- `POST /agents/:agentId/resume`
- `POST /agents/:agentId/terminate`
- `POST /agents/:agentId/keys` (crear clave de API)
- `POST /agents/:agentId/heartbeat/invoke`

## 10.4 Tareas (Issues)

- `GET /companies/:companyId/issues`
- `POST /companies/:companyId/issues`
- `GET /issues/:issueId`
- `PATCH /issues/:issueId`
- `GET /issues/:issueId/documents`
- `GET /issues/:issueId/documents/:key`
- `PUT /issues/:issueId/documents/:key`
- `GET /issues/:issueId/documents/:key/revisions`
- `DELETE /issues/:issueId/documents/:key`
- `POST /issues/:issueId/checkout`
- `POST /issues/:issueId/release`
- `POST /issues/:issueId/comments`
- `GET /issues/:issueId/comments`
- `POST /companies/:companyId/issues/:issueId/attachments` (subida multipart)
- `GET /issues/:issueId/attachments`
- `GET /attachments/:attachmentId/content`
- `DELETE /attachments/:attachmentId`

### 10.4.1 Contrato de checkout atómico

Solicitud de `POST /issues/:issueId/checkout`:

```json
{
  "agentId": "uuid",
  "expectedStatuses": ["todo", "backlog", "blocked"]
}
```

Comportamiento del servidor:

1. una sola actualización SQL con `WHERE id = ? AND status IN (?) AND (assignee_agent_id IS NULL OR assignee_agent_id = :agentId)`
2. si el conteo de filas actualizadas es 0, devolver `409` con el propietario/estado actual
3. un checkout exitoso establece `assignee_agent_id`, `status = in_progress` y `started_at`

## 10.5 Proyectos

- `GET /companies/:companyId/projects`
- `POST /companies/:companyId/projects`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`

## 10.6 Aprobaciones

- `GET /companies/:companyId/approvals?status=pending`
- `POST /companies/:companyId/approvals`
- `POST /approvals/:approvalId/approve`
- `POST /approvals/:approvalId/reject`

## 10.7 Costos y presupuestos

- `POST /companies/:companyId/cost-events`
- `GET /companies/:companyId/costs/summary`
- `GET /companies/:companyId/costs/by-agent`
- `GET /companies/:companyId/costs/by-project`
- `PATCH /companies/:companyId/budgets`
- `PATCH /agents/:agentId/budgets`

## 10.8 Actividad y panel

- `GET /companies/:companyId/activity`
- `GET /companies/:companyId/dashboard`

El payload del panel debe incluir:

- conteos de agentes activos/en ejecución/pausados/en error
- conteos de issues abiertas/en curso/bloqueadas/completadas
- gasto del mes hasta la fecha y uso del presupuesto
- conteo de aprobaciones pendientes

## 10.9 Semántica de errores

- `400` error de validación
- `401` no autenticado
- `403` no autorizado
- `404` no encontrado
- `409` conflicto de estado (conflicto de checkout, transición inválida)
- `422` violación de regla semántica
- `500` error del servidor

## 11. Contrato de latido y adaptador

## 11.1 Interfaz del adaptador

```ts
interface AgentAdapter {
  invoke(agent: Agent, context: InvocationContext): Promise<InvokeResult>;
  status(run: HeartbeatRun): Promise<RunStatus>;
  cancel(run: HeartbeatRun): Promise<void>;
}
```

## 11.2 Adaptador de proceso

Forma de la configuración:

```json
{
  "command": "string",
  "args": ["string"],
  "cwd": "string",
  "env": {"KEY": "VALUE"},
  "timeoutSec": 900,
  "graceSec": 15
}
```

Comportamiento:

- lanzar proceso hijo
- enviar stdout/stderr en streaming a los registros de ejecución
- marcar el estado de la ejecución según el código de salida/tiempo de espera
- cancelar envía SIGTERM y luego SIGKILL tras el período de gracia

## 11.3 Adaptador HTTP

Forma de la configuración:

```json
{
  "url": "https://...",
  "method": "POST",
  "headers": {"Authorization": "Bearer ..."},
  "timeoutMs": 15000,
  "payloadTemplate": {"agentId": "{{agent.id}}", "runId": "{{run.id}}"}
}
```

Comportamiento:

- invocar mediante solicitud HTTP saliente
- 2xx significa aceptado
- no-2xx marca la invocación como fallida
- el endpoint de callback opcional permite actualizaciones asíncronas de finalización

## 11.4 Entrega de contexto

- `thin`: enviar solo IDs y punteros; el agente obtiene el contexto vía API
- `fat`: incluir asignaciones actuales, resumen de objetivos, instantánea del presupuesto y comentarios recientes

## 11.5 Reglas del planificador

Campos de programación por agente en `adapter_config`:

- `enabled` booleano
- `intervalSec` entero (mínimo 30)
- `maxConcurrentRuns` fijo en `1` para V1

El planificador debe omitir la invocación cuando:

- el agente está pausado/terminado
- hay una ejecución activa
- se ha alcanzado el límite duro del presupuesto

## 12. Gobernanza y flujos de aprobación

## 12.1 Contratación

1. El agente o el tablero crea `approval(type=hire_agent, status=pending, payload=agent draft)`.
2. El tablero aprueba o rechaza.
3. Al aprobar, el servidor crea la fila del agente y la clave de API inicial (opcional).
4. La decisión se registra en `activity_log`.

El tablero puede saltarse el flujo de solicitud y crear agentes directamente vía UI; la creación directa aún se registra como acción de gobernanza.

## 12.2 Aprobación de la estrategia del CEO

1. El CEO publica la propuesta de estrategia como `approval(type=approve_ceo_strategy)`.
2. El tablero revisa el payload (texto del plan, estructura inicial, tareas de alto nivel).
3. La aprobación desbloquea el estado de ejecución para el trabajo delegado creado por el CEO.

Antes de la primera aprobación de estrategia, el CEO solo puede redactar tareas, no transicionarlas a estados de ejecución activos.

## 12.3 Intervención del tablero

El tablero puede en cualquier momento:

- pausar/reanudar/terminar cualquier agente
- reasignar o cancelar cualquier tarea
- editar presupuestos y límites
- aprobar/rechazar/cancelar aprobaciones pendientes

## 13. Sistema de costos y presupuestos

## 13.1 Capas de presupuesto

- presupuesto mensual de la empresa
- presupuesto mensual del agente
- presupuesto de proyecto opcional (si está configurado)

## 13.2 Reglas de aplicación

- umbral predeterminado de alerta suave: 80%
- límite duro: al 100%, desencadena:
  - establecer el estado del agente a `paused`
  - bloquear nuevo checkout/invocación para ese agente
  - emitir evento de actividad de alta prioridad

El tablero puede anularlo elevando el presupuesto o reanudando explícitamente el agente.

## 13.3 Ingesta de eventos de costo

Cuerpo de `POST /companies/:companyId/cost-events`:

```json
{
  "agentId": "uuid",
  "issueId": "uuid",
  "provider": "openai",
  "model": "gpt-5",
  "inputTokens": 1234,
  "outputTokens": 567,
  "costCents": 89,
  "occurredAt": "2026-02-17T20:25:00Z",
  "billingCode": "optional"
}
```

Validación:

- conteos de tokens no negativos
- `costCents >= 0`
- verificaciones de propiedad de la empresa para todas las entidades vinculadas

## 13.4 Acumulados

Las consultas de agregación en tiempo de lectura son aceptables para V1.
Los acumulados materializados pueden agregarse después si la latencia de las consultas excede los objetivos.

## 14. Requisitos de UI (app del tablero)

Rutas de UI de V1:

- `/` panel
- `/companies` lista/creación de empresas
- `/companies/:id/org` organigrama y estado de agentes
- `/companies/:id/tasks` lista/kanban de tareas
- `/companies/:id/agents/:agentId` detalle del agente
- `/companies/:id/costs` panel de costos y presupuesto
- `/companies/:id/approvals` aprobaciones pendientes/historial
- `/companies/:id/activity` flujo de auditoría/eventos

Comportamientos de UX requeridos:

- selector global de empresa
- acciones rápidas: pausar/reanudar agente, crear tarea, aprobar/rechazar solicitud
- avisos (toasts) de conflicto en falla de checkout atómico
- sin fallas silenciosas en segundo plano; cada ejecución fallida visible en la UI

## 15. Requisitos operativos

## 15.1 Entorno

- Node 20+
- `DATABASE_URL` opcional
- si no está definido, usar PGlite automáticamente e insertar el esquema

## 15.2 Migraciones

- Las migraciones de Drizzle son la fuente de verdad
- sin migración destructiva in-place para la ruta de actualización de V1
- proveer script de migración desde las tablas mínimas existentes al esquema con alcance de empresa

## 15.3 Registro y auditoría

- registros estructurados (JSON en producción)
- ID de solicitud por llamada de API
- cada mutación escribe en `activity_log`

## 15.4 Objetivos de confiabilidad

- latencia p95 de la API menor a 250 ms para CRUD estándar a 1k tareas/empresa
- acuse de invocación de latido menor a 2 s para el adaptador de proceso
- sin decisiones de aprobación perdidas (escrituras transaccionales)

## 16. Requisitos de seguridad

- almacenar solo claves de API de agentes hasheadas
- redactar secretos en los registros (`adapter_config`, encabezados de autenticación, variables de env)
- protección CSRF para los endpoints de sesión del tablero
- limitar la tasa de los endpoints de autenticación y gestión de claves
- verificaciones estrictas de límites de empresa en cada obtención/mutación de entidades

## 17. Estrategia de pruebas

## 17.1 Pruebas unitarias

- guardias de transición de estado (agente, issue, aprobación)
- reglas de aplicación de presupuesto
- semántica de invocación/cancelación de adaptadores

## 17.2 Pruebas de integración

- comportamiento de conflicto de checkout atómico
- flujo de creación de agente desde aprobación
- corrección de la ingesta de costos y los acumulados
- pausa mientras hay una ejecución activa (cancelación ordenada y luego terminación forzada)

## 17.3 Pruebas de extremo a extremo

- el tablero crea empresa -> contrata CEO -> aprueba estrategia -> el CEO recibe trabajo
- el agente reporta costo -> se alcanza el umbral de presupuesto -> ocurre la pausa automática
- delegación de tareas entre equipos con incremento de profundidad de solicitud

## 17.4 Mínimo de la suite de regresión

Un candidato de versión está bloqueado salvo que estas pasen:

1. pruebas de límites de autenticación
2. prueba de carrera de checkout
3. prueba de tope duro de presupuesto
4. prueba de pausa/reanudación de agente
5. prueba de consistencia del resumen del panel

## 18. Plan de entrega

## Hito 1: Núcleo de empresa y autenticación

- agregar `companies` y alcance de empresa a las entidades existentes
- agregar autenticación de sesión del tablero y claves de API de agentes
- migrar las rutas de API existentes a rutas conscientes de la empresa

## Hito 2: Semántica de tareas y gobernanza

- implementar endpoint de checkout atómico
- implementar comentarios de issues y guardias de ciclo de vida
- implementar la tabla de aprobaciones y los flujos de trabajo de contratación/estrategia

## Hito 3: Tiempo de ejecución de latido y adaptador

- implementar la interfaz del adaptador
- publicar el adaptador `process` con semántica de cancelación
- publicar el adaptador `http` con manejo de tiempo de espera/errores
- persistir ejecuciones de latido y estados

## Hito 4: Controles de costo y presupuesto

- implementar la ingesta de eventos de costo
- implementar acumulados mensuales y paneles
- aplicar la pausa automática por límite duro

## Hito 5: Finalización de la UI del tablero

- agregar selector de empresa y vista de organigrama
- agregar páginas de aprobaciones y costos

## Hito 6: Endurecimiento y versión

- suite completa de integración/e2e
- plantillas de empresa de ejemplo/demostración para pruebas locales
- lista de verificación de versión y actualización de la documentación

## 19. Criterios de aceptación (puerta de versión)

V1 está completo solo cuando todos los criterios son verdaderos:

1. Un usuario del tablero puede crear múltiples empresas y cambiar entre ellas.
2. Una empresa puede ejecutar al menos un agente activo con latido habilitado.
3. El checkout de tareas es seguro ante conflictos con `409` en reclamaciones concurrentes.
4. Los agentes pueden actualizar tareas/comentarios y reportar costos solo con claves de API.
5. El tablero puede aprobar/rechazar solicitudes de contratación y de estrategia del CEO en la UI.
6. El límite duro del presupuesto pausa automáticamente un agente y evita nuevas invocaciones.
7. El panel muestra conteos/gastos precisos a partir de datos en vivo de la BD.
8. Cada mutación es auditable en el registro de actividad.
9. La app se ejecuta con PostgreSQL embebido por defecto y con Postgres externo mediante `DATABASE_URL`.

## 20. Pila de trabajo posterior a V1 (explícitamente diferido)

- arquitectura de plugins
- personalización más rica del estado de flujo de trabajo por equipo
- profundidad de hitos/etiquetas/grafo de dependencias más allá del mínimo de V1
- optimización del transporte en tiempo real (SSE/WebSockets)
- integración con el marketplace público de plantillas (ClipHub)

## 21. Paquete de portabilidad de empresa (adenda de V1)

V1 admite importación/exportación de empresas usando un contrato de paquete portátil:

- paquete orientado a Markdown con raíz en `COMPANY.md`
- descubrimiento implícito de carpetas por convención
- archivo sidecar `.paperclip.yaml` para fidelidad específica de Paperclip
- el paquete base canónico es neutral al proveedor y está alineado con `docs/companies/companies-spec.md`
- convenciones comunes:
  - `agents/<slug>/AGENTS.md`
  - `teams/<slug>/TEAM.md`
  - `projects/<slug>/PROJECT.md`
  - `projects/<slug>/tasks/<slug>/TASK.md`
  - `tasks/<slug>/TASK.md`
  - `skills/<slug>/SKILL.md`

Comportamiento de exportación/importación en V1:

- la exportación emite un paquete markdown limpio neutral al proveedor más `.paperclip.yaml`
- los proyectos y las tareas iniciales son contenido de exportación optativo en lugar de contenido predeterminado del paquete
- las entradas recurrentes de `TASK.md` usan `recurring: true` en el paquete base y fidelidad de rutina de Paperclip en `.paperclip.yaml`
- Paperclip importa paquetes de tareas recurrentes como rutinas en lugar de degradarlas a issues únicas
- la exportación elimina rutas específicas del entorno (`cwd`, rutas de archivos de instrucciones locales, duplicación de prompts en línea) mientras preserva metadatos portátiles de repo/workspace de proyecto como `repoUrl`, refs y referencias de políticas de workspace registradas en `.paperclip.yaml`
- la exportación nunca incluye valores de secretos; las entradas de env se reportan como declaraciones portátiles
- la importación admite modos de destino:
  - crear una empresa nueva
  - importar a una empresa existente
- la importación recrea los workspaces de proyecto exportados y reasigna las claves portátiles de workspace de vuelta a los ids de workspace locales del destino
- la importación fuerza que los latidos de temporizador de los agentes importados queden apagados para que los paquetes nunca inicien ejecuciones programadas de forma implícita
- la importación admite estrategias de colisión: `rename`, `skip`, `replace`
- la importación admite previsualización (dry-run) antes de aplicar
- las importaciones de GitHub advierten sobre refs sin fijar en lugar de bloquear
