# Especificación de implementación técnica de espacios de trabajo

## Rol de este documento

Este documento traduce [workspace-product-model-and-work-product.md](/Users/dotta/paperclip-subissues/doc/plans/workspace-product-model-and-work-product.md) en un plan de ingeniería listo para implementar.

Es intencionalmente concreto:

- forma de esquema y migración
- actualizaciones de contratos compartidos
- cambios de rutas y servicios
- cambios de UI
- reglas de despliegue y compatibilidad

Este es el objetivo de implementación para el primer segmento de entrega consciente de espacios de trabajo.

## Decisiones fijadas

Estas decisiones se tratan como resueltas para esta implementación:

1. Agregar ahora una nueva tabla durable `execution_workspaces`.
2. Cada issue tiene como máximo un espacio de trabajo de ejecución actual a la vez.
3. Los `issues` obtienen `project_workspace_id` y `execution_workspace_id` explícitos.
4. La reutilización de espacios de trabajo está dentro del alcance para V1.
5. La funcionalidad se controla en la UI mediante `/instance/settings > Experimental > Workspaces`.
6. El control es solo de UI. Los cambios de modelo de backend y las migraciones siempre se envían.
7. Los usuarios existentes se actualizan a valores predeterminados que preservan compatibilidad.
8. `project_workspaces` evoluciona en su lugar en lugar de ser reemplazado.
9. El producto de trabajo es primero de issue, con enlaces opcionales a espacios de trabajo de ejecución y servicios de tiempo de ejecución.
10. GitHub es el único proveedor de PR en el primer segmento.
11. Tanto los modos de ejecución `adapter_managed` como `cloud_sandbox` están dentro del alcance.
12. Los controles de espacio de trabajo se envían primero dentro de las propiedades de proyecto existentes, no en un área nueva de navegación global.
13. Los subissues están fuera del alcance para este segmento de implementación.

## No objetivos

- Construir un sistema completo de revisión de código
- Resolver la UX de subissues en este segmento
- Implementar definiciones de espacios de trabajo compartidos reutilizables entre proyectos en este segmento
- Retrabajar todo el comportamiento actual de servicios de tiempo de ejecución antes de introducir espacios de trabajo de ejecución

## Línea base existente

El repositorio ya tiene:

- `project_workspaces`
- `projects.execution_workspace_policy`
- `issues.execution_workspace_settings`
- persistencia de servicios de tiempo de ejecución en `workspace_runtime_services`
- realización local de git-worktree en `workspace-runtime.ts`

Esta implementación debería construirse sobre esa línea base en lugar de bifurcarla.

## Terminología

- `Project workspace`: base de código/raíz durable configurada para un proyecto
- `Execution workspace`: espacio de trabajo de tiempo de ejecución real usado para uno o más issues
- `Work product`: salida orientada al usuario como PR, vista previa, rama, commit, artefacto, documento
- `Runtime service`: proceso o servicio propiedad o rastreado para un espacio de trabajo
- `Compatibility mode`: comportamiento existente preservado para instalaciones actualizadas sin opt-in explícito de espacios de trabajo

## Resumen de arquitectura

El primer segmento debería introducir tres capas explícitas:

1. `Project workspace`
   - registro de base de código durable existente con alcance de proyecto
   - extendido para admitir formas locales, git, no git y gestionadas remotamente

2. `Execution workspace`
   - nuevo registro de tiempo de ejecución durable
   - representa contexto de ejecución compartido, aislado, de rama de operador o gestionado remotamente

3. `Issue work product`
   - nuevo registro de salida durable
   - almacena PRs, vistas previas, ramas, commits, artefactos y documentos

El issue sigue siendo la unidad de planificación y propiedad.
El espacio de trabajo de ejecución sigue siendo la unidad de tiempo de ejecución.
El producto de trabajo sigue siendo la unidad de entregable/salida.

## Topología de configuración y despliegue

## Corrección importante

Este repositorio ya usa `PAPERCLIP_DEPLOYMENT_MODE` para comportamiento de autenticación/despliegue (`local_trusted | authenticated`).

No sobrecargar esa variable para la topología de ejecución de espacios de trabajo.

## Nueva variable de entorno

Agregar una pista separada de host de ejecución:

- `PAPERCLIP_EXECUTION_TOPOLOGY=local|cloud|hybrid`

Valor predeterminado:

- si no está definida, tratar como `local`

Propósito:

- influye en los valores predeterminados y la validación para la configuración de espacios de trabajo
- no cambia la semántica actual de autenticación/despliegue
- no rompe instalaciones existentes

### Semántica

- `local`
  - Paperclip puede crear worktrees, procesos y rutas locales del host
- `cloud`
  - Paperclip debería asumir que no hay gestión durable de espacios de trabajo de ejecución locales del host
  - los flujos gestionados por adaptador y de sandbox en la nube deberían tratarse como de primera clase
- `hybrid`
  - ambas estrategias de ejecución local y remota pueden existir

Esto es una baranda y ayuda de valores predeterminados, no un motor duro de políticas en el primer segmento.

## Ajustes de instancia

Agregar una nueva sección `Experimental` bajo `/instance/settings`.

### Nuevo ajuste

- `experimental.workspaces: boolean`

Reglas:

- valor predeterminado `false`
- control solo de UI
- almacenado en la configuración de instancia o respuesta de API de ajustes de instancia
- las rutas de backend y migraciones permanecen disponibles incluso cuando es false

### Comportamiento de UI cuando está apagado

- ocultar controles de issue específicos de espacios de trabajo
- ocultar configuración de proyecto específica de espacios de trabajo
- ocultar la pestaña `Work Product` del issue si de otro modo estaría vacía
- no eliminar ni invalidar ningún dato de espacio de trabajo almacenado

## Modelo de datos

## 1. Extender `project_workspaces`

La tabla actual existe y debería evolucionar en su lugar.

### Nuevas columnas

- `source_type text not null default 'local_path'`
  - `local_path | git_repo | non_git_path | remote_managed`
- `default_ref text null`
- `visibility text not null default 'default'`
  - `default | advanced`
- `setup_command text null`
- `cleanup_command text null`
- `remote_provider text null`
  - ejemplos: `github`, `openai`, `anthropic`, `custom`
- `remote_workspace_ref text null`
- `shared_workspace_key text null`
  - reservado para futuras definiciones de espacios de trabajo compartidos entre proyectos

### Reglas de backfill

- si la fila existente tiene `repo_url`, rellenar `source_type='git_repo'`
- si no, si la fila existente tiene `cwd`, rellenar `source_type='local_path'`
- si no, rellenar `source_type='remote_managed'`
- copiar el `repo_ref` existente en `default_ref`

### Índices

- retener los índices actuales
- agregar `(project_id, source_type)`
- agregar `(company_id, shared_workspace_key)` no único para soporte futuro

## 2. Agregar `execution_workspaces`

Crear una nueva tabla durable.

### Columnas

- `id uuid pk`
- `company_id uuid not null`
- `project_id uuid not null`
- `project_workspace_id uuid null`
- `source_issue_id uuid null`
- `mode text not null`
  - `shared_workspace | isolated_workspace | operator_branch | adapter_managed | cloud_sandbox`
- `strategy_type text not null`
  - `project_primary | git_worktree | adapter_managed | cloud_sandbox`
- `name text not null`
- `status text not null default 'active'`
  - `active | idle | in_review | archived | cleanup_failed`
- `cwd text null`
- `repo_url text null`
- `base_ref text null`
- `branch_name text null`
- `provider_type text not null default 'local_fs'`
  - `local_fs | git_worktree | adapter_managed | cloud_sandbox`
- `provider_ref text null`
- `derived_from_execution_workspace_id uuid null`
- `last_used_at timestamptz not null default now()`
- `opened_at timestamptz not null default now()`
- `closed_at timestamptz null`
- `cleanup_eligible_at timestamptz null`
- `cleanup_reason text null`
- `metadata jsonb null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Claves foráneas

- `company_id -> companies.id`
- `project_id -> projects.id`
- `project_workspace_id -> project_workspaces.id on delete set null`
- `source_issue_id -> issues.id on delete set null`
- `derived_from_execution_workspace_id -> execution_workspaces.id on delete set null`

### Índices

- `(company_id, project_id, status)`
- `(company_id, project_workspace_id, status)`
- `(company_id, source_issue_id)`
- `(company_id, last_used_at desc)`
- `(company_id, branch_name)` no único

## 3. Extender `issues`

Agregar vinculación explícita de espacios de trabajo.

### Nuevas columnas

- `project_workspace_id uuid null`
- `execution_workspace_id uuid null`
- `execution_workspace_preference text null`
  - `inherit | shared_workspace | isolated_workspace | operator_branch | reuse_existing`

### Claves foráneas

- `project_workspace_id -> project_workspaces.id on delete set null`
- `execution_workspace_id -> execution_workspaces.id on delete set null`

### Reglas de backfill

- todos los issues existentes obtienen valores null
- null debería interpretarse como comportamiento de compatibilidad/herencia

### Invariantes

- si `project_workspace_id` está definido, debe pertenecer al proyecto y empresa del issue
- si `execution_workspace_id` está definido, debe pertenecer a la empresa del issue
- si `execution_workspace_id` está definido, el `project_id` del espacio de trabajo referenciado debe coincidir con el `project_id` del issue
## 4. Agregar `issue_work_products`

Crear una nueva tabla durable para salidas.

### Columnas

- `id uuid pk`
- `company_id uuid not null`
- `project_id uuid null`
- `issue_id uuid not null`
- `execution_workspace_id uuid null`
- `runtime_service_id uuid null`
- `type text not null`
  - `preview_url | runtime_service | pull_request | branch | commit | artifact | document`
- `provider text not null`
  - `paperclip | github | vercel | s3 | custom`
- `external_id text null`
- `title text not null`
- `url text null`
- `status text not null`
  - `active | ready_for_review | approved | changes_requested | merged | closed | failed | archived`
- `review_state text not null default 'none'`
  - `none | needs_board_review | approved | changes_requested`
- `is_primary boolean not null default false`
- `health_status text not null default 'unknown'`
  - `unknown | healthy | unhealthy`
- `summary text null`
- `metadata jsonb null`
- `created_by_run_id uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Claves foráneas

- `company_id -> companies.id`
- `project_id -> projects.id on delete set null`
- `issue_id -> issues.id on delete cascade`
- `execution_workspace_id -> execution_workspaces.id on delete set null`
- `runtime_service_id -> workspace_runtime_services.id on delete set null`
- `created_by_run_id -> heartbeat_runs.id on delete set null`

### Índices

- `(company_id, issue_id, type)`
- `(company_id, execution_workspace_id, type)`
- `(company_id, provider, external_id)`
- `(company_id, updated_at desc)`

## 5. Extender `workspace_runtime_services`

Esta tabla ya existe y debería seguir siendo el sistema de registro para servicios propiedad/rastreados.

### Nueva columna

- `execution_workspace_id uuid null`

### Clave foránea

- `execution_workspace_id -> execution_workspaces.id on delete set null`

### Comportamiento

- los servicios de tiempo de ejecución siguen siendo primero de espacio de trabajo
- las UIs de issue deberían exponerlos a través de espacios de trabajo de ejecución vinculados y productos de trabajo

## Contratos compartidos

## 1. `packages/shared`

### Actualizar tipos y validadores de espacios de trabajo de proyecto

Agregar campos:

- `sourceType`
- `defaultRef`
- `visibility`
- `setupCommand`
- `cleanupCommand`
- `remoteProvider`
- `remoteWorkspaceRef`
- `sharedWorkspaceKey`

### Agregar tipos y validadores de espacios de trabajo de ejecución

Nuevos tipos compartidos:

- `ExecutionWorkspace`
- `ExecutionWorkspaceMode`
- `ExecutionWorkspaceStatus`
- `ExecutionWorkspaceProviderType`

### Agregar tipos y validadores de producto de trabajo

Nuevos tipos compartidos:

- `IssueWorkProduct`
- `IssueWorkProductType`
- `IssueWorkProductStatus`
- `IssueWorkProductReviewState`

### Actualizar tipos y validadores de issue

Agregar:

- `projectWorkspaceId`
- `executionWorkspaceId`
- `executionWorkspacePreference`
- `workProducts?: IssueWorkProduct[]`

### Extender el contrato de política de ejecución de proyecto

Reemplazar la política estrecha actual con una forma más explícita:

- `enabled`
- `defaultMode`
  - `shared_workspace | isolated_workspace | operator_branch | adapter_default`
- `allowIssueOverride`
- `defaultProjectWorkspaceId`
- `workspaceStrategy`
- `branchPolicy`
- `pullRequestPolicy`
- `runtimePolicy`
- `cleanupPolicy`

No intentar codificar cada posible campo específico de proveedor en V1. Mantener la extensibilidad específica de proveedor en JSON anidado donde se necesite.

## Cambios en la capa de servicios

## 1. Servicio de proyecto

Actualizar el CRUD de espacios de trabajo de proyecto para manejar el esquema extendido.

### Reglas requeridas

- al definir un espacio de trabajo primario, limpiar `is_primary` en los hermanos
- `source_type=remote_managed` puede tener `cwd` null
- los espacios de trabajo locales/respaldados por git aún deberían requerir uno de `cwd` o `repo_url`
- preservar el comportamiento actual para llamadores existentes que solo envían `cwd/repoUrl/repoRef`

## 2. Servicio de issue

Actualizar los flujos de creación/actualización para manejar la vinculación explícita de espacios de trabajo.

### Comportamiento de creación

Resolver valores predeterminados en este orden:

1. `projectWorkspaceId` explícito de la solicitud
2. `project.executionWorkspacePolicy.defaultProjectWorkspaceId`
3. el espacio de trabajo primario del proyecto
4. null

Resolver `executionWorkspacePreference`:

1. campo explícito de la solicitud
2. valor predeterminado de la política de proyecto
3. fallback de compatibilidad a `inherit`

No crear un espacio de trabajo de ejecución al momento de crear el issue a menos que:

- `reuse_existing` se elija explícitamente y se proporcione `executionWorkspaceId`

De otro modo, la realización del espacio de trabajo ocurre cuando comienza la ejecución.

### Comportamiento de actualización

- permitir cambiar `projectWorkspaceId` solo si el espacio de trabajo pertenece al mismo proyecto
- permitir definir `executionWorkspaceId` solo si pertenece a la misma empresa y proyecto
- no destruir ni reenlazar automáticamente productos de trabajo históricos cuando cambia la vinculación de espacios de trabajo

## 3. Servicio de realización de espacios de trabajo

Refactorizar `workspace-runtime.ts` para que la realización produzca o reutilice una fila de `execution_workspaces`.

### Nuevo flujo

Entrada:

- issue
- espacio de trabajo de proyecto
- política de ejecución de proyecto
- pista de topología de ejecución
- configuración de adaptador/tiempo de ejecución

Salida:

- registro de espacio de trabajo de ejecución realizado
- metadatos de cwd/proveedor de tiempo de ejecución

### Modos requeridos

- `shared_workspace`
  - reutilizar un espacio de trabajo de ejecución estable que represente el espacio de trabajo primario/compartido del proyecto
- `isolated_workspace`
  - crear o reutilizar un espacio de trabajo de ejecución aislado derivado
- `operator_branch`
  - crear o reutilizar un espacio de trabajo de rama de larga vida
- `adapter_managed`
  - crear un espacio de trabajo de ejecución con referencias de proveedor y `cwd` opcional null
- `cloud_sandbox`
  - igual que gestionado por adaptador, pero con semántica explícita de sandbox remoto

### Reglas de reutilización

Cuando se solicita `reuse_existing`:

- listar solo espacios de trabajo de ejecución activos o usados recientemente
- solo para el mismo proyecto
- solo para el mismo espacio de trabajo de proyecto si se especifica uno
- excluir espacios de trabajo archivados y con limpieza fallida

### Realización de espacio de trabajo compartido

Para modo de compatibilidad y proyectos de espacio de trabajo compartido:

- crear un espacio de trabajo de ejecución estable por espacio de trabajo de proyecto cuando se necesite por primera vez
- reutilizarlo para ejecuciones posteriores

Esto evita una rama de caso especial en la vinculación posterior de producto de trabajo.

## 4. Integración de servicios de tiempo de ejecución

Cuando se inician o reutilizan servicios de tiempo de ejecución:

- poblar `execution_workspace_id`
- seguir poblando `project_workspace_id`, `project_id` e `issue_id`

Cuando un servicio de tiempo de ejecución produce una URL:

- opcionalmente crear o actualizar una fila vinculada de `issue_work_products` de tipo `runtime_service` o `preview_url`

## 5. Reporte de PR y vistas previas

Agregar un servicio para crear/actualizar `issue_work_products`.

### Tipos de producto V1 admitidos

- `pull_request`
- `preview_url`
- `runtime_service`
- `branch`
- `commit`
- `artifact`
- `document`

### Reporte de PR de GitHub

Para V1, GitHub es el único proveedor con semántica más rica.

Estados admitidos:

- `draft`
- `ready_for_review`
- `approved`
- `changes_requested`
- `merged`
- `closed`

Representar estos en `status` y `review_state` en lugar de inventar una tabla PR separada en V1.

## Rutas y API

## 1. Rutas de espacios de trabajo de proyecto

Extender las rutas existentes:

- `GET /projects/:id/workspaces`
- `POST /projects/:id/workspaces`
- `PATCH /projects/:id/workspaces/:workspaceId`
- `DELETE /projects/:id/workspaces/:workspaceId`

### Nuevos campos aceptados/devueltos

- `sourceType`
- `defaultRef`
- `visibility`
- `setupCommand`
- `cleanupCommand`
- `remoteProvider`
- `remoteWorkspaceRef`

## 2. Rutas de espacios de trabajo de ejecución

Agregar:

- `GET /companies/:companyId/execution-workspaces`
  - filtros:
    - `projectId`
    - `projectWorkspaceId`
    - `status`
    - `issueId`
    - `reuseEligible=true`
- `GET /execution-workspaces/:id`
- `PATCH /execution-workspaces/:id`
  - actualizar solo campos de estado/metadatos/limpieza en V1

No agregar navegación de nivel superior para estas rutas aún.

## 3. Rutas de producto de trabajo

Agregar:

- `GET /issues/:id/work-products`
- `POST /issues/:id/work-products`
- `PATCH /work-products/:id`
- `DELETE /work-products/:id`

### Permisos de mutación V1

- el tablero puede crear/actualizar/eliminar todo
- los agentes pueden crear/actualizar para issues que tienen asignados o están ejecutando actualmente
- la eliminación generalmente debería archivar en lugar de eliminar duro una vez vinculado a salida histórica

## 4. Rutas de issue

Extender las cargas útiles existentes de creación/actualización para aceptar:

- `projectWorkspaceId`
- `executionWorkspacePreference`
- `executionWorkspaceId`

Extender `GET /issues/:id` para devolver:

- `projectWorkspaceId`
- `executionWorkspaceId`
- `executionWorkspacePreference`
- `currentExecutionWorkspace`
- `workProducts[]`

## 5. Rutas de ajustes de instancia

Agregar soporte para:

- leer/escribir `experimental.workspaces`

Esto es solo un control de UI.

Si aún no hay almacenamiento genérico de ajustes de instancia, el primer segmento puede almacenar esto en el mecanismo existente de configuración/ajustes de instancia usado por `/instance/settings`.

## Cambios de UI

## 1. `/instance/settings`

Agregar sección:

- `Experimental`
  - `Enable Workspaces`

Cuando está apagado:

- ocultar nuevas affordances específicas de espacios de trabajo
- no alterar el comportamiento existente de proyecto o issue

## 2. Propiedades de proyecto

No crear aún una pestaña `Code` separada.
Enviar primero dentro de las propiedades de proyecto existentes.

### Agregar o rehabilitar secciones

- `Project Workspaces`
- `Execution Defaults`
- `Provisioning`
- `Pull Requests`
- `Previews and Runtime`
- `Cleanup`

### Reglas de visualización

- mostrar solo cuando `experimental.workspaces=true`
- mantener el texto lo suficientemente genérico para configuraciones locales y remotas
- mostrar campos específicos de git solo cuando `sourceType=git_repo`
- mostrar campos específicos de ruta local solo cuando no es `remote_managed`

## 3. Diálogo de creación de issue

Cuando el flag experimental de espacios de trabajo está activado y el proyecto seleccionado tiene automatización de espacios de trabajo o espacios de trabajo:

### Campos básicos

- `Codebase`
  - seleccionar de espacios de trabajo de proyecto
  - predeterminado a la política predeterminada o espacio de trabajo primario
- `Execution mode`
  - `Project default`
  - `Shared workspace`
  - `Isolated workspace`
  - `Operator branch`

### Sección avanzada

- `Reuse existing execution workspace`

Este control debería consultar solo:

- mismo proyecto
- misma base de código si se selecciona
- espacios de trabajo activos/recientes
- etiquetas compactas con rama o nombre de espacio de trabajo

No exponer todos los espacios de trabajo de ejecución en una lista ruidosa sin filtrar.

## 4. Detalle de issue

Agregar una pestaña `Work Product` cuando:

- el flag experimental está activado, o
- el issue ya tiene productos de trabajo

### Mostrar

- resumen del espacio de trabajo de ejecución actual
- tarjetas de PR
- tarjetas de vistas previas
- filas de rama/commit
- artefactos/documentos

Agregar chips compactos de encabezado:

- base de código
- espacio de trabajo
- conteo/estado de PR
- estado de vista previa

## 5. Página de detalle de espacio de trabajo de ejecución

Agregar una ruta de detalle pero sin elemento de navegación.

Enlazada desde:

- pestaña de producto de trabajo del issue
- paneles de proyecto/espacio de trabajo de ejecución

### Mostrar

- identidad y estado
- origen de espacio de trabajo de proyecto
- issue fuente
- issues vinculados
- info de rama/ref/proveedor
- servicios de tiempo de ejecución
- productos de trabajo
- estado de limpieza
## Comportamiento de tiempo de ejecución y adaptadores

## 1. Adaptadores locales

Para adaptadores locales:

- seguir usando las rutas existentes de realización de cwd/worktree
- persistir el resultado como espacios de trabajo de ejecución
- adjuntar servicios de tiempo de ejecución y producto de trabajo al espacio de trabajo de ejecución y al issue

## 2. Adaptadores remotos o en la nube

Para adaptadores remotos:

- permitir espacios de trabajo de ejecución con `cwd` null
- requerir metadatos de proveedor suficientes para identificar el espacio de trabajo/sesión remoto
- permitir la creación de producto de trabajo sin ninguna propiedad de proceso local del host

Ejemplos:

- un agente de codificación en la nube abre una rama y PR en GitHub
- una URL de vista previa de Vercel se reporta de vuelta como un producto de trabajo de vista previa
- un sandbox remoto emite URLs de artefactos

## 3. Flujo de trabajo de PR consciente de aprobaciones

V1 debería admitir un seguimiento de estado de PR más rico, pero no un motor completo de revisión.

### Acciones requeridas

- `open_pr`
- `mark_ready`

### Estados de revisión requeridos

- `draft`
- `ready_for_review`
- `approved`
- `changes_requested`
- `merged`
- `closed`

### Enfoque de almacenamiento

- representarlos como `issue_work_products` con `type='pull_request'`
- usar `status` y `review_state`
- almacenar detalles específicos de proveedor en `metadata`

## Plan de migración

## 1. Instalaciones existentes

La postura de migración es compatible hacia atrás por defecto.

### Garantías

- ningún proyecto existente debe editarse antes de seguir funcionando
- ningún flujo de issue existente debería empezar a requerir entrada de espacios de trabajo
- todas las nuevas columnas nullables deben preservar el comportamiento actual cuando están ausentes

## 2. Migración de espacios de trabajo de proyecto

Migrar `project_workspaces` en su lugar.

### Backfill

- derivar `source_type`
- copiar `repo_ref` a `default_ref`
- dejar los nuevos campos opcionales en null

## 3. Migración de issue

No rellenar `project_workspace_id` ni `execution_workspace_id` en todos los issues existentes.

Razón:

- la migración más segura es preservar el comportamiento actual de tiempo de ejecución y vincular explícitamente solo cuando se usen nuevos flujos conscientes de espacios de trabajo

Interpretar los issues antiguos como:

- `executionWorkspacePreference = inherit`
- comportamiento de compatibilidad/compartido

## 4. Migración de historial de tiempo de ejecución

No intentar una reconstrucción histórica perfecta de espacios de trabajo de ejecución en la migración misma.

En su lugar:

- crear registros de espacios de trabajo de ejecución hacia adelante desde la primera nueva ejecución
- opcionalmente agregar más adelante una herramienta de backfill para servicios de tiempo de ejecución recientes si resulta valiosa

## Orden de despliegue

## Fase 1: Esquema y contratos compartidos

1. extender `project_workspaces`
2. agregar `execution_workspaces`
3. agregar `issue_work_products`
4. extender `issues`
5. extender `workspace_runtime_services`
6. actualizar tipos y validadores compartidos

## Fase 2: Cableado de servicios

1. actualizar CRUD de espacios de trabajo de proyecto
2. actualizar resolución de creación/actualización de issue
3. refactorizar la realización de espacios de trabajo para persistir espacios de trabajo de ejecución
4. adjuntar servicios de tiempo de ejecución a espacios de trabajo de ejecución
5. agregar servicio de producto de trabajo y persistencia

## Fase 3: API y UI

1. agregar rutas de espacios de trabajo de ejecución
2. agregar rutas de producto de trabajo
3. agregar toggle de ajustes experimentales de instancia
4. rehabilitar y revisar la UI de espacios de trabajo de proyecto detrás del flag
5. agregar controles de espacios de trabajo de creación/actualización de issue detrás del flag
6. agregar pestaña de producto de trabajo de issue
7. agregar página de detalle de espacio de trabajo de ejecución

## Fase 4: Integraciones de proveedores

1. Reporte de PR de GitHub
2. reporte de URL de vista previa
3. vinculación de servicio de tiempo de ejecución a producto de trabajo
4. referencias de proveedor remoto/en la nube

## Criterios de aceptación

1. Las instalaciones existentes siguen comportándose de forma predecible sin reconfiguración requerida.
2. Los proyectos pueden definir espacios de trabajo de proyecto locales, git, no git y gestionados remotamente.
3. Los issues pueden seleccionar explícitamente un espacio de trabajo de proyecto y preferencia de ejecución.
4. Cada issue puede apuntar a un espacio de trabajo de ejecución actual.
5. Múltiples issues pueden reutilizar intencionalmente el mismo espacio de trabajo de ejecución.
6. Los espacios de trabajo de ejecución se persisten tanto para flujos de ejecución locales como remotos.
7. Los productos de trabajo pueden adjuntarse a issues con vinculación opcional de espacio de trabajo de ejecución.
8. Los PRs de GitHub pueden representarse con estados de ciclo de vida más ricos.
9. La UI principal sigue siendo simple cuando el flag experimental está apagado.
10. No se requiere navegación de nivel superior de espacios de trabajo para este primer segmento.

## Riesgos y mitigaciones

## Riesgo: demasiados conceptos de espacio de trabajo traslapados

Mitigación:

- mantener la UI de issue en `Codebase` y `Execution mode`
- reservar los detalles de espacios de trabajo de ejecución para páginas avanzadas

## Riesgo: romper proyectos actuales en la actualización

Mitigación:

- adiciones de esquema nullables
- migración de `project_workspaces` en su lugar
- valores predeterminados de compatibilidad

## Riesgo: supuestos solo locales filtrándose al modo nube

Mitigación:

- hacer `cwd` opcional para espacios de trabajo de ejecución
- usar `provider_type` y `provider_ref`
- usar `PAPERCLIP_EXECUTION_TOPOLOGY` como baranda de valores predeterminados

## Riesgo: convertir los PRs en un subsistema a medida demasiado pronto

Mitigación:

- representar PRs como productos de trabajo en V1
- mantener detalles específicos de proveedor en metadatos
- diferir una tabla PR dedicada a menos que el uso pruebe que es necesaria

## Primer segmento de ingeniería recomendado

Si queremos la implementación más estrecha útil:

1. extender `project_workspaces`
2. agregar `execution_workspaces`
3. extender `issues` con campos explícitos de espacios de trabajo
4. persistir espacios de trabajo de ejecución desde la realización existente de espacios de trabajo locales
5. agregar `issue_work_products`
6. mostrar controles de espacios de trabajo de proyecto y controles de espacios de trabajo de issue detrás del flag experimental
7. agregar pestaña `Work Product` de issue con visualización de PR/vista previa/servicio de tiempo de ejecución

Este segmento es suficiente para validar el modelo sin aún construir cada integración de proveedor o flujo de trabajo de limpieza.
