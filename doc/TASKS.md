# Modelo de datos de gestión de tareas

Referencia de cómo funciona el seguimiento de tareas en Paperclip. Describe las entidades, sus
relaciones y las reglas que rigen el ciclo de vida de las tareas. Escrito como modelo objetivo
— parte de esto ya está implementado, parte es aspiracional.

---

## Jerarquía de entidades

```
Workspace
  Initiatives          (objetivos a nivel de roadmap, abarcan trimestres)
    Projects           (entregables con plazo definido, pueden abarcar equipos)
      Milestones       (etapas dentro de un proyecto)
        Issues         (unidades de trabajo, la entidad central)
          Sub-issues   (trabajo desglosado bajo un issue padre)
```

Todo fluye hacia abajo. Una iniciativa contiene proyectos; un proyecto contiene
hitos e issues; un issue puede tener sub-issues. Cada nivel agrega
granularidad.

---

## Issues (entidad central)

Un issue es la unidad fundamental de trabajo.

### Campos

| Field         | Type             | Required | Notes                                                             |
| ------------- | ---------------- | -------- | ----------------------------------------------------------------- |
| `id`          | uuid             | yes      | Clave primaria                                                    |
| `identifier`  | string           | computed | Legible para humanos, p. ej. `ENG-123` (clave del equipo + número autoincremental) |
| `title`       | string           | yes      | Resumen corto                                                     |
| `description` | text/markdown    | no       | Descripción completa, admite markdown                             |
| `status`      | WorkflowState FK | yes      | Por defecto, el estado predeterminado del equipo                  |
| `priority`    | enum (0-4)       | no       | Por defecto 0 (ninguna). Ver sección Prioridad.                   |
| `estimate`    | number           | no       | Puntos de complejidad/tamaño                                      |
| `dueDate`     | date             | no       |                                                                   |
| `teamId`      | uuid FK          | yes      | Cada issue pertenece a exactamente un equipo                      |
| `projectId`   | uuid FK          | no       | Como máximo un proyecto por issue                                 |
| `milestoneId` | uuid FK          | no       | Como máximo un hito por issue                                     |
| `assigneeId`  | uuid FK          | no       | **Un solo asignado.** Ver sección Asignados.                      |
| `creatorId`   | uuid FK          | no       | Quién lo creó                                                     |
| `parentId`    | uuid FK (self)   | no       | Issue padre, para relaciones de sub-issues                        |
| `goalId`      | uuid FK          | no       | Objetivo vinculado                                                |
| `sortOrder`   | float            | no       | Orden dentro de las vistas                                        |
| `createdAt`   | timestamp        | yes      |                                                                   |
| `updatedAt`   | timestamp        | yes      |                                                                   |
| `startedAt`   | timestamp        | computed | Cuándo el issue entró a un estado "iniciado"                      |
| `completedAt` | timestamp        | computed | Cuándo el issue entró a un estado "completado"                    |
| `cancelledAt` | timestamp        | computed | Cuándo el issue entró a un estado "cancelado"                     |
| `archivedAt`  | timestamp        | no       | Archivado suave                                                   |

---

## Estados de flujo de trabajo

El estado de un issue **no** es un enum plano. Es un conjunto de estados con nombre específico de cada equipo,
cada uno perteneciente a una de estas **categorías** fijas:

| Categoría   | Propósito                       | Estados de ejemplo                  |
| ----------- | ------------------------------- | ----------------------------------- |
| **Triaje**  | Entrante, necesita revisión     | Triaje                              |
| **Backlog** | Aceptado, no listo para trabajar| Backlog, Icebox                     |
| **Sin iniciar** | Listo pero no comenzado     | Pendiente, Listo                     |
| **Iniciado**| Trabajo activo                  | En progreso, En revisión, En QA     |
| **Completado** | Terminado                    | Terminado, Publicado                 |
| **Cancelado** | Rechazado o abandonado        | Cancelado, No se arregla, Duplicado |

### Reglas

- Cada equipo define sus propios estados de flujo de trabajo dentro de estas categorías
- Los equipos deben tener al menos un estado por categoría (Triaje es opcional)
- Se pueden agregar estados personalizados dentro de cualquier categoría (p. ej. "En revisión" bajo Iniciado)
- Las categorías son fijas y ordenadas — puedes reordenar los estados _dentro_ de una categoría
  pero no las categorías en sí
- Los issues nuevos usan por defecto el primer estado de Backlog del equipo
- Mover un issue a un estado Iniciado establece automáticamente `startedAt`; Completado establece
  `completedAt`; Cancelado establece `cancelledAt`
- Marcar un issue como duplicado lo mueve automáticamente a un estado Cancelado

### Campos de WorkflowState

| Field         | Type    | Notes                                                                         |
| ------------- | ------- | ----------------------------------------------------------------------------- |
| `id`          | uuid    |                                                                               |
| `name`        | string  | Nombre visible, p. ej. "En revisión"                                          |
| `type`        | enum    | Uno de: `triage`, `backlog`, `unstarted`, `started`, `completed`, `cancelled` |
| `color`       | string  | Color hexadecimal                                                             |
| `description` | string  | Texto de guía opcional                                                        |
| `position`    | float   | Orden dentro de la categoría                                                  |
| `teamId`      | uuid FK | Cada estado pertenece a un equipo                                             |

---

## Prioridad

Una escala numérica fija, no personalizable:

| Value | Label        | Notes                                            |
| ----- | ------------ | ------------------------------------------------ |
| 0     | Sin prioridad| Por defecto. Se ordena al final en las vistas de prioridad. |
| 1     | Urgente      | Podría activar una notificación inmediata        |
| 2     | Alta         |                                                  |
| 3     | Media        |                                                  |
| 4     | Baja         |                                                  |

La escala es intencionalmente pequeña y fija. Usa etiquetas para categorización adicional
en lugar de agregar más niveles de prioridad.

---

## Equipos

Los equipos son la unidad organizativa principal. Casi todo está limitado a un
equipo.

| Field         | Type   | Notes                                                          |
| ------------- | ------ | -------------------------------------------------------------- |
| `id`          | uuid   |                                                                |
| `name`        | string | p. ej. "Ingeniería"                                            |
| `key`         | string | Prefijo corto en mayúsculas, p. ej. "ENG". Usado en identificadores de issues. |
| `description` | string |                                                                |

### Alcance por equipo

- Cada issue pertenece a exactamente un equipo
- Los estados de flujo de trabajo son por equipo
- Las etiquetas pueden estar limitadas a un equipo o ser de todo el workspace
- Los proyectos pueden abarcar varios equipos

En nuestro contexto (empresa de IA), los equipos corresponden a áreas funcionales. Cada agente reporta
a un equipo según su rol.

---

## Proyectos

Los proyectos agrupan issues hacia un entregable específico con plazo definido. Pueden abarcar
varios equipos.

| Field         | Type      | Notes                                                         |
| ------------- | --------- | -------------------------------------------------------------- |
| `id`          | uuid      |                                                               |
| `name`        | string    |                                                               |
| `description` | text      |                                                               |
| `summary`     | string    | Resumen corto                                                 |
| `status`      | enum      | `backlog`, `planned`, `in_progress`, `completed`, `cancelled` |
| `leadId`      | uuid FK   | Un solo dueño para responsabilidad                            |
| `startDate`   | date      |                                                               |
| `targetDate`  | date      |                                                               |
| `createdAt`   | timestamp |                                                               |
| `updatedAt`   | timestamp |                                                               |

### Reglas

- Un issue pertenece a como máximo un proyecto
- El estado del proyecto se actualiza **manualmente** (no se deriva automáticamente de los estados de los issues)
- Los proyectos pueden contener documentos (especificaciones, resúmenes) como entidades vinculadas

---

## Hitos

Los hitos subdividen un proyecto en etapas significativas.

| Field         | Type    | Notes                          |
| ------------- | ------- | ------------------------------ |
| `id`          | uuid    |                                |
| `name`        | string  |                                |
| `description` | text    |                                |
| `targetDate`  | date    |                                |
| `projectId`   | uuid FK | Pertenece a exactamente un proyecto |
| `sortOrder`   | float   |                                |

Los issues dentro de un proyecto pueden asignarse opcionalmente a un hito.

---

## Etiquetas

Las etiquetas proporcionan categorización por etiquetas. Existen en dos alcances:

- **Etiquetas de workspace** — disponibles en todos los equipos
- **Etiquetas de equipo** — restringidas a un equipo específico

| Field         | Type           | Notes                               |
| ------------- | -------------- | ----------------------------------- |
| `id`          | uuid           |                                     |
| `name`        | string         |                                     |
| `color`       | string         | Color hexadecimal                   |
| `description` | string         | Guía contextual                     |
| `teamId`      | uuid FK        | Null para etiquetas a nivel de workspace |
| `groupId`     | uuid FK (self) | Etiqueta padre para agrupar         |

### Grupos de etiquetas

Las etiquetas se pueden organizar en un nivel de anidación (grupo -> etiquetas):

- Las etiquetas dentro de un grupo son **mutuamente excluyentes** en un issue (solo se puede aplicar
  una de cada grupo)
- Los grupos no pueden contener otros grupos (solo un nivel de anidación)
- Ejemplo: el grupo "Tipo" contiene las etiquetas "Error", "Funcionalidad", "Tarea" — un issue
  recibe como máximo una

### Unión issue-etiqueta

Muchos a muchos vía la tabla de unión `issue_labels`:

| Field     | Type    |
| --------- | ------- |
| `issueId` | uuid FK |
| `labelId` | uuid FK |

---

## Relaciones / dependencias de issues

Cuatro tipos de relación entre issues:

| Type         | Meaning                               | Behavior                                      |
| ------------ | ------------------------------------- | --------------------------------------------- |
| `related`    | Conexión general                      | Enlace informativo                            |
| `blocks`     | Este issue bloquea a otro             | El issue bloqueado se muestra con un indicador|
| `blocked_by` | Este issue está bloqueado por otro    | Inverso de blocks                              |
| `duplicate`  | Este issue duplica a otro             | Mueve automáticamente el duplicado a un estado Cancelado |

### Campos de IssueRelation

| Field            | Type    | Notes                                          |
| ---------------- | ------- | ---------------------------------------------- |
| `id`             | uuid    |                                                |
| `type`           | enum    | `related`, `blocks`, `blocked_by`, `duplicate` |
| `issueId`        | uuid FK | Issue origen                                   |
| `relatedIssueId` | uuid FK | Issue destino                                  |

### Reglas

- Cuando se resuelve un issue bloqueante, la relación pasa a ser informativa (el
  indicador cambia a verde)
- Duplicado es unidireccional (marcas el duplicado, no el canónico)
- El bloqueo **no es transitivo** a nivel de sistema (A bloquea B, B bloquea C
  no bloquea automáticamente A->C)

---

## Asignados

Modelo de **un solo asignado** por diseño.

- Cada issue tiene como máximo un asignado a la vez
- Esto es deliberado: la responsabilidad clara evita la difusión de la responsabilidad
- Para trabajo colaborativo que involucre a varias personas, usa **sub-issues** con
  diferentes asignados

En nuestro contexto, los agentes son los asignados. El FK `assigneeId` en los issues
apunta a la tabla `agents`.

---

## Sub-issues (padre/hijo)

Los issues admiten anidación padre/hijo.

- Establecer `parentId` en un issue lo convierte en sub-issue
- Los sub-issues pueden a su vez tener sub-issues (anidación multinivel)
- Los sub-issues heredan el **proyecto** de su padre al momento de la creación
  (no retroactivamente), pero NO el equipo, las etiquetas ni el asignado

### Cierre automático

- **Cierre automático de sub-issues**: cuando el padre se completa, los sub-issues restantes
  se completan automáticamente

### Conversiones

- Los issues existentes pueden cambiar de padre (agregar o quitar `parentId`)
- Un issue padre con muchos sub-issues puede "promoverse" a proyecto

---

## Estimaciones

Estimación basada en puntos, configurada por equipo.

### Escalas disponibles

| Scale       | Values                   |
| ----------- | ------------------------ |
| Exponential | 1, 2, 4, 8, 16 (+32, 64) |

Los issues sin estimar usan 1 punto por defecto para los cálculos de progreso/velocidad.

---

## Comentarios

| Field        | Type           | Notes                        |
| ------------ | -------------- | ---------------------------- |
| `id`         | uuid           |                              |
| `body`       | text/markdown  |                              |
| `issueId`    | uuid FK        |                              |
| `authorId`   | uuid FK        | Puede ser un usuario o agente |
| `parentId`   | uuid FK (self) | Para respuestas en hilo      |
| `resolvedAt` | timestamp      | Si el hilo fue resuelto      |
| `createdAt`  | timestamp      |                              |
| `updatedAt`  | timestamp      |                              |

---

## Iniciativas

El constructo de planificación de más alto nivel. Agrupa proyectos hacia un
objetivo estratégico. Las iniciativas tienen dueños estratégicos y normalmente se miden por resultados/OKR, no por "hecho/no hecho".

| Field         | Type    | Notes                            |
| ------------- | ------- | -------------------------------- |
| `id`          | uuid    |                                  |
| `name`        | string  |                                  |
| `description` | text    |                                  |
| `ownerId`     | uuid FK | Un solo dueño                    |
| `status`      | enum    | `planned`, `active`, `completed` |
| `targetDate`  | date    |                                  |

Las iniciativas contienen proyectos (muchos a muchos) y proporcionan una vista consolidada de
progreso de todos los proyectos contenidos.

---

## Identificadores

Los issues usan identificadores legibles para humanos: `{TEAM_KEY}-{NUMBER}`

- Clave del equipo: cadena corta en mayúsculas definida por equipo (p. ej. "ENG", "DES")
- Número: entero autoincremental por equipo
- Ejemplos: `ENG-123`, `DES-45`, `OPS-7`
- Si un issue cambia de equipo, recibe un nuevo identificador y el anterior se
  conserva en `previousIdentifiers`

Esto es mucho mejor para la comunicación humana que los UUID. La gente dice "toma ENG-42"
no "toma 7f3a...".

---

## Relaciones de entidades

```
Team (1) ----< (many) Issue
Team (1) ----< (many) WorkflowState
Team (1) ----< (many) Label (team-scoped)

Issue (many) >---- (1) WorkflowState
Issue (many) >---- (0..1) Assignee (Agent)
Issue (many) >---- (0..1) Project
Issue (many) >---- (0..1) Milestone
Issue (many) >---- (0..1) Parent Issue
Issue (1) ----< (many) Sub-issues
Issue (many) >---< (many) Labels         (via issue_labels)
Issue (many) >---< (many) Issue Relations (via issue_relations)
Issue (1) ----< (many) Comments

Project (many) >---- (0..1) Lead (Agent)
Project (1) ----< (many) Milestones
Project (1) ----< (many) Issues

Initiative (many) >---< (many) Projects  (via initiative_projects)
Initiative (many) >---- (1) Owner (Agent)
```

---

## Prioridad de implementación

Orden de construcción recomendado, de mayor valor primero:

### Alto valor

1. **Equipos** — tabla `teams` + FK `teamId` en issues. Base para
   identificadores legibles para humanos (`ENG-123`) y estados de flujo de trabajo por equipo. La mayoría de las
   otras funciones dependen del alcance por equipo, así que construye esto primero.
2. **Estados de flujo de trabajo** — tabla `workflow_states` + FK `stateId` en issues.
   Flujos de trabajo personalizados por equipo con transiciones de estado basadas en categorías.
3. **Etiquetas** — tablas `labels` + `issue_labels`. Categorización
   (error/funcionalidad/tarea, etiquetas de área, etc.) sin contaminar el campo de estado.
4. **Relaciones de issues** — tabla `issue_relations`. Bloqueante/bloqueado por es
   esencial para la coordinación de agentes (el agente A no puede empezar hasta que el agente B termine).
5. **Sub-issues** — self-FK `parentId` en `issues`. Permite a los agentes desglosar
   tareas grandes.
6. **Comentarios** — tabla `comments`. Los agentes necesitan comunicarse sobre los issues
   sin sobrescribir la descripción.

### Valor medio

7. **Marcas de tiempo de transición** — `startedAt`, `completedAt`, `cancelledAt` en
   issues, establecidos automáticamente por los cambios de estado del flujo de trabajo. Permite el seguimiento de velocidad y la medición de SLA.

### Menor prioridad (para después)

8. **Hitos** — Útiles una vez que los proyectos sean lo suficientemente complejos como para necesitar etapas.
9. **Iniciativas** — Útiles una vez que tengamos varios proyectos que sirvan a un
   objetivo estratégico común.
10. **Estimaciones** — Útiles una vez que queramos medir el rendimiento y predecir
    la capacidad.
