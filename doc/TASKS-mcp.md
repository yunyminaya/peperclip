# Interfaz MCP de gestión de tareas

Contratos de funciones para el sistema de gestión de tareas de Paperclip. Define las
operaciones disponibles para los agentes (y herramientas externas) vía MCP. Consulta
[TASKS.md](./TASKS.md) para el modelo de datos subyacente.

Todas las operaciones devuelven JSON. Los ID son UUID. Las marcas de tiempo son ISO 8601.
Los identificadores de issues (p. ej. `ENG-123`) se aceptan en cualquier lugar donde se
espere un `id` de issue.

---

## Issues

### `list_issues`

Lista y filtra issues en el workspace.

| Parameter         | Type     | Required | Notes                                                                                           |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------- |
| `query`           | string   | no       | Búsqueda de texto libre en título y descripción                                                  |
| `teamId`          | string   | no       | Filtrar por equipo                                                                              |
| `status`         | string   | no       | Filtrar por estado de flujo de trabajo específico                                               |
| `stateType`       | string   | no       | Filtrar por categoría de estado: `triage`, `backlog`, `unstarted`, `started`, `completed`, `cancelled` |
| `assigneeId`      | string   | no       | Filtrar por asignado (id de agente)                                                             |
| `projectId`       | string   | no       | Filtrar por proyecto                                                                           |
| `parentId`        | string   | no       | Filtrar por issue padre (devuelve sub-issues)                                                   |
| `labelIds`        | string[] | no       | Filtrar a issues con TODAS estas etiquetas                                                     |
| `priority`        | number   | no       | Filtrar por prioridad (0-4)                                                                     |
| `includeArchived` | boolean  | no       | Incluir issues archivados. Por defecto: false                                                   |
| `orderBy`         | string   | no       | `created`, `updated`, `priority`, `due_date`. Por defecto: `created`                             |
| `limit`           | number   | no       | Máximo de resultados. Por defecto: 50                                                           |
| `after`           | string   | no       | Cursor para paginación hacia adelante                                                           |
| `before`          | string   | no       | Cursor para paginación hacia atrás                                                              |

**Devuelve:** `{ issues: Issue[], pageInfo: { hasNextPage, endCursor, hasPreviousPage, startCursor } }`

---

### `get_issue`

Recupera un solo issue por ID o identificador, con todas las relaciones expandidas.

| Parameter | Type   | Required | Notes                                              |
| --------- | ------ | -------- | -------------------------------------------------- |
| `id`      | string | yes      | UUID o identificador legible para humanos (p. ej. `ENG-123`) |

**Devuelve:** objeto `Issue` completo que incluye:

- `state` (WorkflowState expandido)
- `assignee` (Agente expandido, si está establecido)
- `labels` (Label[] expandido)
- `relations` (IssueRelation[] con los issues relacionados expandidos)
- `children` (resúmenes de sub-issues: id, identifier, title, state, assignee)
- `parent` (resumen, si este es un sub-issue)
- `comments` (Comment[], los más recientes primero)

---

### `create_issue`

Crea un nuevo issue.

| Parameter     | Type     | Required | Notes                                         |
| ------------- | -------- | -------- | --------------------------------------------- |
| `title`       | string   | yes      |                                               |
| `teamId`      | string   | yes      | Equipo al que pertenece el issue              |
| `description` | string   | no       | Markdown                                      |
| `status`     | string   | no       | Estado de flujo de trabajo. Por defecto: el estado predeterminado del equipo |
| `priority`    | number   | no       | 0-4. Por defecto: 0 (ninguna)                 |
| `estimate`    | number   | no       | Estimación en puntos                          |
| `dueDate`     | string   | no       | Fecha ISO                                     |
| `assigneeId`  | string   | no       | Agente a asignar                              |
| `projectId`   | string   | no       | Proyecto a asociar                            |
| `milestoneId` | string   | no       | Hito dentro del proyecto                      |
| `parentId`    | string   | no       | Issue padre (lo convierte en sub-issue)       |
| `goalId`      | string   | no       | Objetivo vinculado                            |
| `labelIds`    | string[] | no       | Etiquetas a aplicar                           |
| `sortOrder`   | number   | no       | Orden dentro de las vistas                    |

**Devuelve:** objeto `Issue` creado con los campos calculados (`identifier`, `createdAt`, etc.)

**Efectos secundarios:**

- Si se establece `parentId`, hereda `projectId` del padre (salvo que se proporcione explícitamente)
- `identifier` se genera automáticamente a partir de la clave del equipo + el siguiente número de secuencia

---

### `update_issue`

Actualiza un issue existente.

| Parameter     | Type     | Required | Notes                                        |
| ------------- | -------- | -------- | -------------------------------------------- |
| `id`          | string   | yes      | UUID o identificador                          |
| `title`       | string   | no       |                                              |
| `description` | string   | no       |                                              |
| `status`     | string   | no       | Transición a un nuevo estado de flujo de trabajo |
| `priority`    | number   | no       | 0-4                                          |
| `estimate`    | number   | no       |                                              |
| `dueDate`     | string   | no       | Fecha ISO, o `null` para borrar              |
| `assigneeId`  | string   | no       | Id de agente, o `null` para desasignar        |
| `projectId`   | string   | no       | Id de proyecto, o `null` para quitarlo del proyecto |
| `milestoneId` | string   | no       | Id de hito, o `null` para borrar             |
| `parentId`    | string   | no       | Cambiar de padre, o `null` para promover a independiente |
| `goalId`      | string   | no       | Id de objetivo, o `null` para desvincular    |
| `labelIds`    | string[] | no       | **Reemplaza** todas las etiquetas (no es aditivo) |
| `teamId`      | string   | no       | Mover a un equipo diferente                  |
| `sortOrder`   | number   | no       | Orden dentro de las vistas                   |

**Devuelve:** objeto `Issue` actualizado.

**Efectos secundarios:**

- Cambiar `status` a un estado con categoría `started` establece `startedAt` (si aún no está establecido)
- Cambiar `status` a `completed` establece `completedAt`
- Cambiar `status` a `cancelled` establece `cancelledAt`
- Mover a `completed`/`cancelled` con el cierre automático de sub-issues habilitado completa los sub-issues abiertos
- Cambiar `teamId` reasigna el identificador (p. ej. `ENG-42` → `DES-18`); el identificador anterior se conserva en `previousIdentifiers`

---

### `archive_issue`

Archiva suavemente un issue. Establece `archivedAt`. No elimina.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

**Devuelve:** `{ success: true }`

---

### `list_my_issues`

Lista los issues asignados a un agente específico. Envoltorio conveniente de
`list_issues` con `assigneeId` preestablecido.

| Parameter   | Type   | Required | Notes                             |
| ----------- | ------ | -------- | --------------------------------- |
| `agentId`   | string | yes      | El agente cuyos issues se listan   |
| `stateType` | string | no       | Filtrar por categoría de estado   |
| `orderBy`   | string | no       | Por defecto: `priority`           |
| `limit`     | number | no       | Por defecto: 50                   |

**Devuelve:** Misma forma que `list_issues`.

---

## Estados de flujo de trabajo

### `list_workflow_states`

Lista los estados de flujo de trabajo de un equipo, agrupados por categoría.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `teamId`  | string | yes      |

**Devuelve:** `{ states: WorkflowState[] }` — ordenado por categoría (triage, backlog, unstarted, started, completed, cancelled), luego por `position` dentro de cada categoría.

---

### `get_workflow_state`

Busca un estado de flujo de trabajo por nombre o ID.

| Parameter | Type   | Required | Notes              |
| --------- | ------ | -------- | ------------------ |
| `teamId`  | string | yes      |                    |
| `query`   | string | yes      | Nombre de estado o UUID |

**Devuelve:** Un solo objeto `WorkflowState`.

---

## Equipos

### `list_teams`

Lista todos los equipos en el workspace.

| Parameter | Type   | Required | Notes                  |
| --------- | ------ | -------- | -------------- |
| `query`   | string | no       | Filtrar por nombre     |

**Devuelve:** `{ teams: Team[] }`

---

### `get_team`

Obtiene un equipo por nombre, clave o ID.

| Parameter | Type   | Required | Notes                   |
| --------- | ------ | -------- | ----------------------- |
| `query`   | string | yes      | Nombre, clave o UUID del equipo |

**Devuelve:** Un solo objeto `Team`.

---

## Proyectos

### `list_projects`

Lista los proyectos en el workspace.

| Parameter         | Type    | Required | Notes                                                                           |
| ----------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `teamId`          | string  | no       | Filtrar a proyectos que contengan issues de este equipo                         |
| `status`          | string  | no       | Filtrar por estado: `backlog`, `planned`, `in_progress`, `completed`, `cancelled` |
| `includeArchived` | boolean | no       | Por defecto: false                                                              |
| `limit`           | number  | no       | Por defecto: 50                                                                 |
| `after`           | string  | no       | Cursor                                                                          |

**Devuelve:** `{ projects: Project[], pageInfo }`

---

### `get_project`

Obtiene un proyecto por nombre o ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `query`   | string | yes      |

**Devuelve:** Un solo objeto `Project` que incluye `milestones[]` y conteo de issues por categoría de estado.

---

### `create_project`

| Parameter     | Type   | Required |
| ------------- | ------ | -------- |
| `name`        | string | yes      |
| `description` | string | no       |
| `summary`     | string | no       |
| `leadId`      | string | no       |
| `startDate`   | string | no       |
| `targetDate`  | string | no       |

**Devuelve:** objeto `Project` creado. El estado usa `backlog` por defecto.

---

### `update_project`

| Parameter     | Type   | Required |
| ------------- | ------ | -------- |
| `id`          | string | yes      |
| `name`        | string | no       |
| `description` | string | no       |
| `summary`     | string | no       |
| `status`      | string | no       |
| `leadId`      | string | no       |
| `startDate`   | string | no       |
| `targetDate`  | string | no       |

**Devuelve:** objeto `Project` actualizado.

---

### `archive_project`

Archiva suavemente un proyecto. Establece `archivedAt`. No elimina.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

**Devuelve:** `{ success: true }`

---

## Hitos

### `list_milestones`

| Parameter   | Type   | Required |
| ----------- | ------ | -------- |
| `projectId` | string | yes      |

**Devuelve:** `{ milestones: Milestone[] }` — ordenado por `sortOrder`.

---

### `get_milestone`

Obtiene un hito por ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

**Devuelve:** Un solo objeto `Milestone` con conteo de issues por categoría de estado.

---

### `create_milestone`

| Parameter     | Type   | Required |
| ------------- | ------ | -------- |
| `projectId`   | string | yes      |
| `name`        | string | yes      |
| `description` | string | no       |
| `targetDate`  | string | no       |
| `sortOrder`   | number | no       | Orden dentro del proyecto |

**Devuelve:** objeto `Milestone` creado.

---

### `update_milestone`

| Parameter     | Type   | Required |
| ------------- | ------ | -------- |
| `id`          | string | yes      |
| `name`        | string | no       |
| `description` | string | no       |
| `targetDate`  | string | no       |
| `sortOrder`   | number | no       | Orden dentro del proyecto |

**Devuelve:** objeto `Milestone` actualizado.

---

## Etiquetas

### `list_labels`

Lista las etiquetas disponibles para un equipo (incluye etiquetas a nivel de workspace).

| Parameter | Type   | Required | Notes                                     |
| --------- | ------ | -------- | ----------------------------------------- |
| `teamId`  | string | no       | Si se omite, devuelve solo etiquetas de workspace |

**Devuelve:** `{ labels: Label[] }` — agrupadas por grupo de etiquetas, las etiquetas sin grupo se listan por separado.

---

### `get_label`

Obtiene una etiqueta por nombre o ID.

| Parameter | Type   | Required | Notes              |
| --------- | ------ | -------- | ------------------ |
| `query`   | string | yes      | Nombre de etiqueta o UUID |

**Devuelve:** Un solo objeto `Label`.

---

### `create_label`

| Parameter     | Type   | Required | Notes                               |
| ------------- | ------ | -------- | ----------------------------------- |
| `name`        | string | yes      |                                     |
| `color`       | string | no       | Color hexadecimal. Se asigna automáticamente si se omite |
| `description` | string | no       |                                     |
| `teamId`      | string | no       | Omitir para etiqueta a nivel de workspace |
| `groupId`     | string | no       | Grupo de etiquetas padre          |

**Devuelve:** objeto `Label` creado.

---

### `update_label`

| Parameter     | Type   | Required |
| ------------- | ------ | -------- |
| `id`          | string | yes      |
| `name`        | string | no       |
| `color`       | string | no       |
| `description` | string | no       |

**Devuelve:** objeto `Label` actualizado.

---

## Relaciones de issues

### `list_issue_relations`

Lista todas las relaciones de un issue.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `issueId` | string | yes      |

**Devuelve:** `{ relations: IssueRelation[] }` — cada una con el `relatedIssue` expandido (resumen: id, identifier, title, state).

---

### `create_issue_relation`

Crea una relación entre dos issues.

| Parameter        | Type   | Required | Notes                                          |
| ---------------- | ------ | -------- | ---------------------------------------------- |
| `issueId`        | string | yes      | Issue origen                                   |
| `relatedIssueId` | string | yes      | Issue destino                                  |
| `type`           | string | yes      | `related`, `blocks`, `blocked_by`, `duplicate` |

**Devuelve:** objeto `IssueRelation` creado.

**Efectos secundarios:**

- `duplicate` transiciona automáticamente el issue origen a un estado cancelado
- Crear `blocks` de A->B implica implícitamente que B está `blocked_by` A (ambas
  direcciones son visibles al consultar cualquiera de los issues)

---

### `delete_issue_relation`

Elimina una relación entre dos issues.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

**Devuelve:** `{ success: true }`

---

## Comentarios

### `list_comments`

Lista los comentarios de un issue.

| Parameter | Type   | Required | Notes       |
| --------- | ------ | -------- | ----------- |
| `issueId` | string | yes      |             |
| `limit`   | number | no       | Por defecto: 50 |

**Devuelve:** `{ comments: Comment[] }` — en hilo (comentarios de nivel superior con `children` anidados).

---

### `create_comment`

Agrega un comentario a un issue.

| Parameter  | Type   | Required | Notes                                 |
| ---------- | ------ | -------- | ------------------------------------- |
| `issueId`  | string | yes      |                                       |
| `body`     | string | yes      | Markdown                              |
| `parentId` | string | no       | Responder a un comentario existente (hilo) |

**Devuelve:** objeto `Comment` creado.

---

### `update_comment`

Actualiza el cuerpo de un comentario.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |
| `body`     | string | yes      |

**Devuelve:** objeto `Comment` actualizado.

---

### `resolve_comment`

Marca un hilo de comentarios como resuelto.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

**Devuelve:** `Comment` actualizado con `resolvedAt` establecido.

---

## Iniciativas

### `list_initiatives`

| Parameter | Type   | Required | Notes                            |
| --------- | ------ | -------- | -------------------------------- |
| `status`  | string | no       | `planned`, `active`, `completed` |
| `limit`   | number | no       | Por defecto: 50                  |

**Devuelve:** `{ initiatives: Initiative[] }`

---

### `get_initiative`

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `query`   | string | yes      |

**Devuelve:** Un solo objeto `Initiative` con `projects[]` expandidos (resúmenes con estado y conteo de issues).

---

### `create_initiative`

| Parameter     | Type   | Required |
| ------------- | ------ | -------- |
| `name`        | string | yes      |
| `description` | string | no       |
| `ownerId`     | string | no       |
| `targetDate`  | string | no       |
| `projectIds`  | string[] | no       |

**Devuelve:** objeto `Initiative` creado. El estado usa `planned` por defecto.

---

### `update_initiative`

| Parameter     | Type   | Required |
| ------------- | ------ | -------- |
| `id`          | string | yes      |
| `name`        | string | no       |
| `description` | string | no       |
| `status`      | string | no       |
| `ownerId`     | string | no       |
| `targetDate`  | string | no       |
| `projectIds`  | string[] | no       |

**Devuelve:** objeto `Initiative` actualizado.

---

### `archive_initiative`

Archiva suavemente una iniciativa. Establece `archivedAt`. No elimina.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

**Devuelve:** `{ success: true }`

---

## Resumen

| Entity        | list | get | create | update | delete/archive |
| ------------- | ---- | --- | ------ | ------ | -------------- |
| Issue         | x    | x   | x      | x      | archive        |
| WorkflowState | x    | x   | --     | --     | --             |
| Team          | x    | x   | --     | --     | --             |
| Project       | x    | x   | x      | x      | archive        |
| Milestone     | x    | x   | x      | x      | --             |
| Label         | x    | x   | x      | x      | --             |
| IssueRelation | x    | --  | x      | --     | x              |
| Comment       | x    | --  | x      | x      | resolve        |
| Initiative    | x    | x   | x      | x      | archive        |

**Total: 35 operaciones**

Los estados de flujo de trabajo y los equipos se configuran como administrador, no se crean vía el MCP.
El MCP es principalmente para que los agentes gestionen su trabajo: crear issues, actualizar
el estado, coordinarse vía relaciones y comentarios, y entender el contexto del proyecto.
