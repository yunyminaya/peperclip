# Modelo de producto de espacio de trabajo, producto de trabajo y flujo de PR

## Contexto

Paperclip necesita admitir dos formas de trabajar muy diferentes pero igualmente válidas:

- un desarrollador solo trabajando directamente en `master`, o en una carpeta que ni siquiera es un repo git
- un flujo de trabajo de ingeniería más grande con ramas aisladas, vistas previas, pull requests y automatización de limpieza

Hoy, Paperclip ya tiene los inicios de este modelo:

- los `projects` pueden llevar política de espacio de trabajo de ejecución
- los `project_workspaces` ya existen como un objeto durable con alcance de proyecto
- los issues pueden llevar ajustes de espacio de trabajo de ejecución
- los servicios de tiempo de ejecución pueden adjuntarse a un espacio de trabajo o issue

Lo que falta es un modelo de producto y UI claros que hagan estas capacidades comprensibles y operables.

El principal riesgo de producto es sobrecargar un concepto para hacer demasiado:

- hacer que los subissues hagan el trabajo de ramas o PRs
- hacer que los proyectos sean demasiado pesados en infraestructura
- hacer que los espacios de trabajo sean tan ocultos que los usuarios no puedan formar un modelo mental
- hacer que Paperclip se sienta como una herramienta de revisión de código en lugar de un plano de control

## Objetivos

1. Mantener `project` lo suficientemente ligero para seguir siendo un contenedor de planificación.
2. Hacer que el comportamiento del espacio de trabajo sea comprensible tanto para proyectos git como no git.
3. Admitir tres flujos de trabajo reales sin forzar uno:
   - flujos de trabajo de espacio de trabajo compartido / edición directa
   - flujos de trabajo de espacio de trabajo de issue aislado
   - flujos de trabajo de integración de rama de larga vida u operador
4. Proveer un lugar de primera clase para ver las salidas del trabajo:
   - vistas previas
   - PRs
   - ramas
   - commits
   - documentos y artefactos
5. Mantener simples la navegación principal y el tablero de tareas.
6. Actualizar sin fricción a los usuarios existentes de Paperclip al nuevo modelo sin forzar reconfiguración disruptiva.
7. Admitir despliegues de Paperclip alojados en la nube donde la ejecución ocurre en entornos remotos o gestionados por adaptador en lugar de workers locales.

## No objetivos

- Convertir Paperclip en un producto completo de revisión de código
- Requerir que cada issue tenga su propia rama o PR
- Requerir que cada proyecto configure automatización de código/espacio de trabajo
- Hacer de los espacios de trabajo una primitiva de navegación global de nivel superior en V1
- Requerir una ruta de sistema de archivos local o checkout git local para usar ejecución consciente de espacios de trabajo

## Decisiones centrales de producto

### 1. El proyecto sigue siendo el objeto de planificación

Un `project` sigue siendo lo que agrupa el trabajo alrededor de un entregable o iniciativa.

Puede tener:

- ningún código en absoluto
- una base de código/espacio de trabajo predeterminado
- varias bases de código/espacios de trabajo

No se requiere que los proyectos se vuelvan pesados.

### 2. El espacio de trabajo de proyecto es un objeto de primera clase, pero con alcance bajo el proyecto

Un `project workspace` es la base de código o entorno raíz durable para un proyecto.

Ejemplos:

- una carpeta local en disco
- un checkout de repo git
- una raíz de paquete de monorepo
- una carpeta de diseño/docs no git
- una referencia de base de código gestionada por adaptador remoto

Este es el ancla estable que los operadores configuran una vez.

No debería ser un elemento de barra lateral de nivel superior en la app principal. Debería vivir bajo la experiencia del proyecto.

### 3. El espacio de trabajo de ejecución es un objeto de tiempo de ejecución de primera clase

Un `execution workspace` es donde una ejecución o issue específico realmente se ejecuta.

Ejemplos:

- el propio espacio de trabajo de proyecto compartido
- un git worktree aislado
- un checkout de rama de operador de larga vida
- un sandbox remoto gestionado por adaptador
- un entorno aislado de rama/sesión de un proveedor de agentes en la nube

Este objeto debe registrarse explícitamente para que Paperclip pueda:

- mostrar dónde ocurrió el trabajo
- adjuntar vistas previas y servicios de tiempo de ejecución
- enlazar PRs y ramas
- decidir el comportamiento de limpieza
- admitir reutilización entre múltiples issues relacionados

### 4. Los PRs son producto de trabajo, no el modelo central de issue

Un PR es una salida del trabajo, no la unidad de planificación.

Paperclip debería tratar los PRs como un tipo de producto de trabajo enlazado de vuelta a:

- el issue
- el espacio de trabajo de ejecución
- opcionalmente el espacio de trabajo de proyecto

La automatización específica de git debería vivir bajo la política de espacio de trabajo, no bajo la abstracción central de issue.

### 5. Los usuarios existentes deben actualizarse automáticamente

Paperclip ya tiene usuarios y datos existentes de proyecto/tarea. Cualquier modelo nuevo debe preservar la continuidad.

El producto debería llevar los installs existentes por defecto a un modo de compatibilidad sensato:

- los proyectos existentes sin configuración de espacio de trabajo siguen funcionando sin cambios
- los `project_workspaces` existentes se convierten en los objetos durables de `project workspace`
- la política de espacio de trabajo de ejecución de proyecto existente se mapea hacia adelante en lugar de descartarse
- los issues sin campos explícitos de espacio de trabajo siguen heredando el comportamiento actual

Esta migración debería sentirse aditiva, no como un flujo obligatorio de re-incorporación.
### 6. Paperclip alojado en la nube debe ser un modo de despliegue de primera clase

Paperclip no puede asumir que se está ejecutando en la misma máquina que el código.

En despliegues en la nube, Paperclip puede:

- ejecutarse en Vercel u otro host serverless
- no tener un proceso worker local de larga vida
- delegar la ejecución a un agente de codificación remoto o sandbox gestionado por proveedor
- recibir de vuelta una rama, PR, URL de vista previa o artefacto desde ese entorno remoto

Por lo tanto el modelo debe ser portable:

- el `project workspace` puede ser gestionado remotamente, no local
- el `execution workspace` puede no tener un `cwd` local
- los `runtime services` pueden rastrearse por referencia de proveedor y URL en lugar de un proceso del host
- la recolección de producto de trabajo debe manejar vistas previas y PRs de propiedad externa

### 7. Los subissues siguen siendo estructura de planificación y propiedad

Los subissues son para descomposición y propiedad paralela.

No son lo mismo que:

- una rama
- un worktree
- un PR
- una vista previa

Pueden correlacionarse con esas cosas, pero no deberían sobrecargarse para significarlas.

## Terminología

Usar estos términos consistentemente en el texto del producto:

- `Project`: contenedor de planificación
- `Project workspace`: base de código/raíz durable configurada
- `Execution workspace`: espacio de trabajo de tiempo de ejecución real usado para la ejecución de un issue
- `Isolated issue workspace`: término orientado al usuario para un espacio de trabajo derivado específico de un issue
- `Work product`: vistas previas, PRs, ramas, commits, artefactos, docs
- `Runtime service`: un proceso o servicio que Paperclip posee o rastrea para un espacio de trabajo

Usar estos términos consistentemente en mensajes de migración y despliegue:

- `Compatible mode`: comportamiento existente preservado sin nueva automatización de espacio de trabajo
- `Adapter-managed workspace`: espacio de trabajo realizado por un proveedor de ejecución remoto o en la nube

Evitar enseñar a los usuarios que "workspace" siempre significa "git worktree en mi máquina".

## Modelo de objetos de producto

## 1. Proyecto

Objeto existente. Sin cambio fundamental de rol.

### Comportamiento requerido

- puede existir sin configuración de código/espacio de trabajo
- puede tener cero o más espacios de trabajo de proyecto
- puede definir valores predeterminados de ejecución que los nuevos issues heredan

### Campos propuestos

- `id`
- `companyId`
- `name`
- `description`
- `status`
- `goalIds`
- `leadAgentId`
- `targetDate`
- `executionWorkspacePolicy`
- `workspaces[]`
- `primaryWorkspace`

## 2. Espacio de trabajo de proyecto

Objeto durable, configurado, de base de código/raíz con alcance de proyecto.

Esto debería evolucionar desde la tabla actual `project_workspaces` hacia un objeto de producto más explícito.

### Motivación

Esto separa:

- "¿qué base de código/raíz usa este proyecto?"

de:

- "¿en qué entorno de ejecución temporal se ejecutó este issue?"

Eso mantiene el modelo simple para usuarios solos mientras aún admite automatización avanzada.
También permite que los despliegues de Paperclip alojados en la nube apunten a bases de código y remotos sin pretender que el host de Paperclip tiene acceso directo al sistema de archivos.

### Campos propuestos

- `id`
- `companyId`
- `projectId`
- `name`
- `sourceType`
  - `local_path`
  - `git_repo`
  - `remote_managed`
  - `non_git_path`
- `cwd`
- `repoUrl`
- `defaultRef`
- `isPrimary`
- `visibility`
  - `default`
  - `advanced`
- `setupCommand`
- `cleanupCommand`
- `metadata`
- `createdAt`
- `updatedAt`

### Notas

- `sourceType=non_git_path` es importante para que los proyectos no git sean de primera clase.
- `setupCommand` y `cleanupCommand` deberían permitirse aquí para bootstrap de raíz de espacio de trabajo, incluso cuando no se usa ejecución aislada.
- Para un monorepo, múltiples espacios de trabajo de proyecto pueden apuntar a diferentes raíces o paquetes bajo un repo.
- `sourceType=remote_managed` es importante para despliegues en la nube donde la base de código durable se define por metadatos de proveedor/repo en lugar de una ruta de checkout local.

## 3. Política de espacio de trabajo de ejecución de proyecto

Valores predeterminados a nivel de proyecto para cómo se ejecutan los issues.

Esta es la principal superficie de configuración orientada al operador.

### Motivación

Esto permite que Paperclip admita:

- edición directa en un espacio de trabajo compartido
- espacios de trabajo aislados para paralelismo de issues
- flujos de trabajo de rama de integración de larga vida
- ejecución remota de agente en la nube que devuelve una rama o PR

sin forzar a cada issue o agente a exponer configuración de tiempo de ejecución de bajo nivel.

### Campos propuestos

- `enabled: boolean`
- `defaultMode`
  - `shared_workspace`
  - `isolated_workspace`
  - `operator_branch`
  - `adapter_default`
- `allowIssueOverride: boolean`
- `defaultProjectWorkspaceId: uuid | null`
- `workspaceStrategy`
  - `type`
    - `project_primary`
    - `git_worktree`
    - `adapter_managed`
  - `baseRef`
  - `branchTemplate`
  - `worktreeParentDir`
  - `provisionCommand`
  - `teardownCommand`
- `branchPolicy`
  - `namingTemplate`
  - `allowReuseExisting`
  - `preferredOperatorBranch`
- `pullRequestPolicy`
  - `mode`
    - `disabled`
    - `manual`
    - `agent_may_open_draft`
    - `approval_required_to_open`
    - `approval_required_to_mark_ready`
  - `baseBranch`
  - `titleTemplate`
  - `bodyTemplate`
- `runtimePolicy`
  - `allowWorkspaceServices`
  - `defaultServicesProfile`
  - `autoHarvestOwnedUrls`
- `cleanupPolicy`
  - `mode`
    - `manual`
    - `when_issue_terminal`
    - `when_pr_closed`
    - `retention_window`
  - `retentionHours`
  - `keepWhilePreviewHealthy`
  - `keepWhileOpenPrExists`
## 4. Vinculación de espacio de trabajo de issue

Selección a nivel de issue del comportamiento de ejecución.

Esto debería seguir siendo ligero en el caso normal y solo exponer controles más ricos cuando sea relevante.

### Motivación

No todo issue en un proyecto de código debería crear un nuevo espacio de trabajo derivado.

Ejemplos:

- un arreglo diminuto puede ejecutarse en el espacio de trabajo compartido
- tres issues relacionados pueden compartir intencionalmente una rama de integración
- un operador solo puede estar trabajando directamente en `master`

### Campos propuestos en `issues`

- `projectWorkspaceId: uuid | null`
- `executionWorkspacePreference`
  - `inherit`
  - `shared_workspace`
  - `isolated_workspace`
  - `operator_branch`
  - `reuse_existing`
- `preferredExecutionWorkspaceId: uuid | null`
- `executionWorkspaceSettings`
  - mantener aquí los campos avanzados de sobrescritura por issue

### Reglas

- si el proyecto no tiene automatización de espacio de trabajo, todos estos campos pueden ser null
- si el proyecto tiene un espacio de trabajo primario, la creación de issues debería usarlo silenciosamente por defecto
- `reuse_existing` es solo avanzado y debería apuntar a espacios de trabajo de ejecución activos, no a todo el universo de espacios de trabajo
- los issues existentes sin estos campos deberían comportarse como `inherit` durante la migración

## 5. Espacio de trabajo de ejecución

Un registro durable para un espacio de trabajo de tiempo de ejecución compartido o derivado.

Este es el objeto faltante que hace manejables la limpieza, las vistas previas, los PRs y la reutilización de ramas.

### Motivación

Sin un registro explícito de `execution workspace`, Paperclip no tiene dónde adjuntar de forma estable:

- identidad derivada de rama/worktree
- propiedad de vista previa activa
- enlace de PR
- estado de limpieza
- comportamiento de "reutilizar esta rama de integración existente"
- identidad de sesión de proveedor remoto

### Nuevo objeto propuesto

`execution_workspaces`

### Campos propuestos

- `id`
- `companyId`
- `projectId`
- `projectWorkspaceId`
- `sourceIssueId`
- `mode`
  - `shared_workspace`
  - `isolated_workspace`
  - `operator_branch`
  - `adapter_managed`
- `strategyType`
  - `project_primary`
  - `git_worktree`
  - `adapter_managed`
- `name`
- `status`
  - `active`
  - `idle`
  - `in_review`
  - `archived`
  - `cleanup_failed`
- `cwd`
- `repoUrl`
- `baseRef`
- `branchName`
- `providerRef`
- `providerType`
  - `local_fs`
  - `git_worktree`
  - `adapter_managed`
  - `cloud_sandbox`
- `derivedFromExecutionWorkspaceId`
- `lastUsedAt`
- `openedAt`
- `closedAt`
- `cleanupEligibleAt`
- `cleanupReason`
- `metadata`
- `createdAt`
- `updatedAt`

### Notas

- `sourceIssueId` es el issue que originalmente causó que el espacio de trabajo se creara, no necesariamente el único issue enlazado a él después.
- múltiples issues pueden enlazarse al mismo espacio de trabajo de ejecución en un flujo de trabajo de rama de larga vida.
- `cwd` puede ser null para espacios de trabajo de ejecución remotos; la identidad de proveedor y los enlaces de producto de trabajo aún hacen útil el objeto.

## 6. Enlace de issue a espacio de trabajo de ejecución

Un issue puede necesitar enlazarse a uno o más espacios de trabajo de ejecución a lo largo del tiempo.

Ejemplos:

- un issue comienza en un espacio de trabajo compartido y luego se mueve a uno aislado
- un intento fallido se archiva y se crea un nuevo espacio de trabajo
- varios issues comparten intencionalmente un espacio de trabajo de rama de operador

### Nuevo objeto propuesto

`issue_execution_workspaces`

### Campos propuestos

- `issueId`
- `executionWorkspaceId`
- `relationType`
  - `current`
  - `historical`
  - `preferred`
- `createdAt`
- `updatedAt`

### Simplificación de UI

La mayoría de los issues solo debería mostrar un espacio de trabajo actual en la UI principal. Los enlaces históricos pertenecen a vistas avanzadas/de historial.

## 7. Producto de trabajo

Concepto paraguas orientado al usuario para las salidas del trabajo.

### Motivación

Paperclip necesita un solo lugar para mostrar:

- "aquí está la vista previa"
- "aquí está el PR"
- "aquí está la rama"
- "aquí está el commit"
- "aquí está el artefacto/reporte/doc"

sin convertir los issues en un volcado crudo de detalles de adaptador.

### Nuevo objeto propuesto

`issue_work_products`

### Campos propuestos

- `id`
- `companyId`
- `projectId`
- `issueId`
- `executionWorkspaceId`
- `runtimeServiceId`
- `type`
  - `preview_url`
  - `runtime_service`
  - `pull_request`
  - `branch`
  - `commit`
  - `artifact`
  - `document`
- `provider`
  - `paperclip`
  - `github`
  - `gitlab`
  - `vercel`
  - `netlify`
  - `custom`
- `externalId`
- `title`
- `url`
- `status`
  - `active`
  - `ready_for_review`
  - `merged`
  - `closed`
  - `failed`
  - `archived`
- `reviewState`
  - `none`
  - `needs_board_review`
  - `approved`
  - `changes_requested`
- `isPrimary`
- `healthStatus`
  - `unknown`
  - `healthy`
  - `unhealthy`
- `summary`
- `metadata`
- `createdByRunId`
- `createdAt`
- `updatedAt`

### Comportamiento

- los PRs se almacenan aquí como `type=pull_request`
- las vistas previas se almacenan aquí como `type=preview_url` o `runtime_service`
- los procesos propiedad de Paperclip deberían actualizar salud/estado automáticamente
- los proveedores externos deberían al menos almacenar enlace, proveedor, id externo y el último estado conocido
- los agentes en la nube deberían poder crear registros de producto de trabajo sin que Paperclip sea dueño del host de ejecución
## Modelo de página y UI

## 1. Navegación global

No agregar `Workspaces` como un elemento de barra lateral de nivel superior en V1.

### Motivación

Eso haría que todo el producto se sintiera pesado en infraestructura, incluso para empresas que no usan automatización de código.

### La navegación global se mantiene

- Panel
- Bandeja de entrada
- Empresas
- Agentes
- Objetivos
- Proyectos
- Issues
- Aprobaciones

Los espacios de trabajo y el producto de trabajo deberían exponerse a través de vistas de detalle de proyecto e issue.

## 2. Detalle de proyecto

Agregar una sub-navegación de proyecto que mantenga la planificación primero y el código segundo.

### Pestañas

- `Overview`
- `Issues`
- `Code`
- `Activity`

Futuro opcional:

- `Outputs`

### Pestaña `Overview`

Resumen con la planificación primero:

- estado del proyecto
- objetivos
- líder
- conteos de issues
- progreso de nivel superior
- últimos resúmenes importantes de producto de trabajo

### Pestaña `Issues`

- por defecto solo issues de nivel superior
- mostrar rollups de issue padre:
  - conteo de hijos
  - `x/y` hechos
  - insignias de vista previa/PR activos
- toggle opcional: `Show subissues`

### Pestaña `Code`

Esta es la principal superficie de configuración y visibilidad de espacios de trabajo.

#### Sección: `Project Workspaces`

Listar los espacios de trabajo de proyecto durables para el proyecto.

Columnas de tarjeta/lista:

- nombre del espacio de trabajo
- tipo de fuente
- ruta o repo
- ref predeterminada
- insignia primario/predeterminado
- conteo de espacios de trabajo de ejecución activos
- conteo de issues activos
- conteo de vistas previas activas
- tipo de hosting / proveedor cuando es gestionado remotamente

Acciones:

- `Add workspace`
- `Edit`
- `Set default`
- `Archive`

#### Sección: `Execution Defaults`

Campos:

- `Enable workspace automation`
- `Default issue execution mode`
  - `Shared workspace`
  - `Isolated workspace`
  - `Operator branch`
  - `Adapter default`
- `Default codebase`
- `Allow issue override`

#### Sección: `Provisioning`

Campos:

- `Setup command`
- `Cleanup command`
- `Implementation`
  - `Shared workspace`
  - `Git worktree`
  - `Adapter-managed`
- `Base ref`
- `Branch naming template`
- `Derived workspace parent directory`

Ocultar campos específicos de git cuando el espacio de trabajo seleccionado no está respaldado por git.
Ocultar campos específicos de ruta local cuando el espacio de trabajo seleccionado es gestionado remotamente.

#### Sección: `Pull Requests`

Campos:

- `PR workflow`
  - `Disabled`
  - `Manual`
  - `Agent may open draft PR`
  - `Approval required to open PR`
  - `Approval required to mark ready`
- `Default base branch`
- `PR title template`
- `PR body template`

#### Sección: `Previews and Runtime`

Campos:

- `Allow workspace runtime services`
- `Default services profile`
- `Harvest owned preview URLs`
- `Track external preview URLs`

#### Sección: `Cleanup`

Campos:

- `Cleanup mode`
  - `Manual`
  - `When issue is terminal`
  - `When PR closes`
  - `After retention window`
- `Retention window`
- `Keep while preview is active`
- `Keep while PR is open`
## 3. Flujo de agregar espacio de trabajo de proyecto

Punto de entrada: `Project > Code > Add workspace`

### Campos del formulario

- `Name`
- `Source type`
  - `Local folder`
  - `Git repo`
  - `Non-git folder`
  - `Remote managed`
- `Local path`
- `Repository URL`
- `Remote provider`
- `Remote workspace reference`
- `Default ref`
- `Set as default workspace`
- `Setup command`
- `Cleanup command`

### Comportamiento

- si el tipo de fuente es no git, ocultar la configuración específica de rama/PR
- si el tipo de fuente es git, mostrar ref y campos avanzados de rama opcionales
- si el tipo de fuente es gestionado remotamente, mostrar campos de proveedor/referencia y ocultar la configuración solo de ruta local
- para usuarios solos simples, esto puede ser un campo de ruta y un botón de guardar

## 4. Flujo de creación de issue

La creación de issues debería seguir siendo simple por defecto.

### Comportamiento predeterminado

Si el proyecto seleccionado:

- no tiene automatización de espacio de trabajo: no mostrar UI de espacio de trabajo
- tiene un espacio de trabajo de proyecto predeterminado y modo de ejecución predeterminado: heredar silenciosamente

### Mostrar una sección `Workspace` solo cuando sea relevante

#### Campos básicos

- `Codebase`
  - espacio de trabajo de proyecto seleccionado por defecto
- `Execution mode`
  - `Project default`
  - `Shared workspace`
  - `Isolated workspace`
  - `Operator branch`

#### Campo solo avanzado

- `Reuse existing execution workspace`

Este dropdown debería mostrar solo espacios de trabajo de ejecución activos para el espacio de trabajo de proyecto seleccionado, con etiquetas como:

- `dotta/integration-branch`
- `PAP-447-add-worktree-support`
- `shared primary workspace`

### Regla importante

No mostrar por defecto un selector que contenga cada posible objeto de espacio de trabajo.

El flujo normal debería sentirse como:

- elegir proyecto
- opcionalmente elegir base de código
- opcionalmente elegir modo de ejecución

no:

- elegir de una larga lista mixta de raíces, worktrees derivados, vistas previas y nombres de rama

### Regla de migración

Para usuarios existentes, la creación de issues debería seguir viéndose igual hasta que un proyecto habilite explícitamente un comportamiento de espacio de trabajo más rico.

## 5. Detalle de issue

El detalle de issue debería exponer el espacio de trabajo y el producto de trabajo claramente, pero sin convertirse en una UI de host de código.

### Chips de encabezado

Mostrar chips compactos de resumen cerca del área de título/estado:

- `Codebase: Web App`
- `Workspace: Shared`
- `Workspace: PAP-447-add-worktree-support`
- `PR: Open`
- `Preview: Healthy`

### Pestañas

- `Comments`
- `Subissues`
- `Work Product`
- `Activity`

### Pestaña `Work Product`

Secciones:

- `Current workspace`
- `Previews`
- `Pull requests`
- `Branches and commits`
- `Artifacts and documents`

#### Panel de espacio de trabajo actual

Campos:

- nombre del espacio de trabajo
- modo
- rama
- ref base
- último uso
- conteo de issues enlazados
- estado de limpieza

Acciones:

- `Open workspace details`
- `Mark in review`
- `Request cleanup`

#### Tarjetas de pull request

Campos:

- título
- proveedor
- estado
- estado de revisión
- rama enlazada
- marcas de tiempo de abierto/listo/fusionado

Acciones:

- `Open PR`
- `Refresh status`
- `Solicitar revisión del tablero`

#### Tarjetas de vista previa

Campos:

- título
- URL
- proveedor
- salud
- propiedad
- actualizado en

Acciones:

- `Open preview`
- `Refresh`
- `Archive`

## 6. Detalle de espacio de trabajo de ejecución

Se puede llegar desde una pestaña de código de proyecto o una pestaña de producto de trabajo de issue.

No necesita estar en la barra lateral principal.

### Secciones

- identidad
- issue fuente
- issues enlazados
- rama/ref
- identidad de proveedor/sesión
- servicios de tiempo de ejecución activos
- vistas previas
- PRs
- estado de limpieza
- historial de eventos/actividad

### Motivación

Aquí es donde van los usuarios avanzados cuando necesitan inspeccionar la mecánica. La mayoría de los usuarios no debería necesitarlo en el flujo normal.

## 7. Comportamiento de bandeja de entrada

La bandeja de entrada debería exponer eventos accionables de producto de trabajo, no cada detalle de implementación.

### Mostrar elementos de bandeja de entrada para

- issue asignado o actualizado
- PR necesita revisión del tablero
- PR abierto o marcado listo
- vista previa no saludable
- limpieza de espacio de trabajo fallida
- servicio de tiempo de ejecución fallido
- ejecución remota de agente en la nube devolvió PR o vista previa que necesita revisión

### No mostrar por defecto

- cada latido de espacio de trabajo
- cada actualización de rama
- cada creación de espacio de trabajo derivado

### Estilo de visualización

Si el elemento de bandeja de entrada es sobre una vista previa o PR, mostrar el contexto del issue con él:

- identificador y título del issue
- issue padre si este es un subissue
- nombre del espacio de trabajo si es relevante

## 8. Lista de issues y Kanban

Mantener la lista y el tablero con la planificación primero.

### Comportamiento predeterminado

- mostrar issues de nivel superior por defecto
- mostrar rollups de padre para subissues
- no aplanar cada detalle de ejecución hijo en el tablero principal

### Adornos de fila/tarjeta

Para issues con producto de trabajo enlazado, mostrar insignias compactas:

- `1 PR`
- `2 previews`
- `shared workspace`
- `isolated workspace`

### Filtros avanzados opcionales

- `Has PR`
- `Has preview`
- `Workspace mode`
- `Codebase`
## Plan de actualización y migración

## 1. Postura de migración a nivel de producto

La migración debe ser silenciosa por defecto y preservar compatibilidad.

No se debería forzar a los usuarios existentes a:

- crear nuevos objetos de espacio de trabajo a mano antes de poder seguir trabajando
- re-etiquetar issues antiguos
- aprender nuevos conceptos de espacio de trabajo antes de que los flujos básicos de issue sigan funcionando

## 2. Migración de proyecto existente

En la actualización:

- los registros existentes de `project_workspaces` se retienen y muestran como `Project Workspaces`
- el espacio de trabajo primario actual sigue siendo la base de código predeterminada
- la política de espacio de trabajo de ejecución de proyecto existente se mapea a la nueva superficie `Project Execution Workspace Policy`
- los proyectos sin política de espacio de trabajo de ejecución permanecen en modo compatible/compartido

## 3. Migración de issue existente

En la actualización:

- los issues existentes usan `executionWorkspacePreference=inherit` por defecto
- si un issue ya tiene ajustes de espacio de trabajo de ejecución, mapearlos hacia adelante directamente
- si un issue no tiene datos explícitos de espacio de trabajo, preservar el comportamiento existente y no forzar una elección visible al usuario

## 4. Migración de ejecución/tiempo de ejecución existente

En la actualización:

- los servicios de tiempo de ejecución activos o recientes pueden rellenarse en el historial de espacios de trabajo de ejecución donde sea factible
- el historial faltante no debería bloquear el despliegue; la corrección hacia adelante importa más que la reconstrucción histórica perfecta

## 5. UX de despliegue

Usar lenguaje aditivo en la UI:

- `Code`
- `Workspace automation`
- `Optional`
- `Advanced`

Evitar texto de migración que implique que los usuarios estaban usando el producto "mal" anteriormente.

## Requisitos de despliegue en la nube

## 1. El host de Paperclip y el host de ejecución deben estar desacoplados

Paperclip puede ejecutarse:

- localmente con acceso directo al sistema de archivos
- en un host de app en la nube como Vercel
- en una configuración híbrida con job runners externos

El modelo de espacio de trabajo debe funcionar en los tres.

## 2. La ejecución remota debe admitir reporte de producto de trabajo de primera clase

Un agente en la nube debería poder:

- resolver un espacio de trabajo de proyecto
- realizar un espacio de trabajo de ejecución gestionado por adaptador remotamente
- producir una rama
- abrir o actualizar un PR
- emitir URLs de vista previa
- registrar artefactos

sin que el host de Paperclip ejecute git local o procesos locales de vista previa.

## 3. Los supuestos solo locales deben ser opcionales

Lo siguiente debe ser opcional, no requerido:

- `cwd` local
- CLI git local
- directorios de worktree gestionados por el host
- procesos de vista previa de larga vida propiedad del host

## 4. Misma superficie de producto, diferente comportamiento de proveedor

La UI no debería dividirse en productos de "modo local" y "modo nube".

En su lugar:

- los proyectos locales muestran detalles de implementación de ruta/git
- los proyectos en la nube muestran detalles de proveedor/referencia
- ambos exponen los mismos objetos de alto nivel:
  - espacio de trabajo de proyecto
  - espacio de trabajo de ejecución
  - producto de trabajo
  - servicio de tiempo de ejecución o vista previa

## Patrones aprendidos de Worktrunk

Worktrunk es un punto de referencia útil porque está enfocado sin disculpas en flujos de trabajo de desarrollador basados en git-worktree.

Paperclip no debería copiar su encuadre de producto al por mayor, pero hay varios buenos patrones que vale la pena aplicar.

Referencias:

- `https://worktrunk.dev/tips-patterns/`
- `https://github.com/max-sixty/worktrunk`

## 1. Recursos deterministas por espacio de trabajo

Worktrunk trata un espacio de trabajo derivado como algo que puede ser dueño deterministamente de:

- puertos
- URLs locales
- bases de datos
- identidad de proceso de tiempo de ejecución

Este es un patrón fuerte para Paperclip.

### Recomendación

Los espacios de trabajo de ejecución deberían poder derivar y exponer deterministamente:

- URLs de vista previa
- asignaciones de puerto
- nombres de base de datos/esquema
- claves de reutilización de servicios de tiempo de ejecución

Esto hace las vistas previas y los servicios de tiempo de ejecución locales más predecibles y fáciles de gestionar entre muchos espacios de trabajo paralelos.

## 2. Los hooks de ciclo de vida deberían seguir siendo simples y explícitos

Worktrunk usa hooks prácticos de ciclo de vida como comandos orientados a crear/iniciar/eliminar/merge.

La lección principal no es construir un enorme motor de flujo de trabajo. La lección es dar a los usuarios unos pocos momentos de ciclo de vida bien definidos para adjuntar automatización.

### Recomendación

Paperclip debería mantener la automatización de espacios de trabajo centrada en un pequeño conjunto de hooks:

- `setup`
- `cleanup`
- opcionalmente `before_review`
- opcionalmente `after_merge` o `after_close`

Estos deberían seguir siendo preocupaciones de política de proyecto/espacio de trabajo, no convenciones de prompt de agente.

## 3. La visibilidad del estado del espacio de trabajo es una funcionalidad real de producto

La experiencia de listado/estado de Worktrunk está haciendo un trabajo importante de producto:

- qué espacios de trabajo existen
- en qué rama están
- qué servicios o URLs poseen
- si están activos o rancios

### Recomendación

Paperclip debería proveer la visibilidad equivalente en la superficie `Code` del proyecto:

- espacios de trabajo de ejecución activos
- issues enlazados
- PRs enlazados
- vistas previas/servicios de tiempo de ejecución enlazados
- elegibilidad de limpieza

Esto refuerza por qué `execution workspace` necesita ser un objeto registrado de primera clase.

## 4. Los espacios de trabajo de ejecución son islas de tiempo de ejecución, no solo checkouts

Una de las ideas implícitas más fuertes de Worktrunk es que un worktree no es solo código. A menudo es dueño de un entorno completo de tiempo de ejecución local.

### Recomendación

Paperclip debería tratar los espacios de trabajo de ejecución como el hogar natural para:

- servidores de dev
- procesos de vista previa
- credenciales de sandbox o referencias de proveedor
- identidad de rama/ref
- bootstrap de entorno local o remoto

Esto admite el modelo de `work product` y el modelo de servicio de tiempo de ejecución/vista previa propuesto arriba.

## 5. El estado de espacio de trabajo legible por máquina importa

Worktrunk expone estado estructurado que puede ser consumido por herramientas y automatización.

### Recomendación

Paperclip debería asegurar que los espacios de trabajo de ejecución y el producto de trabajo tengan superficies de API estructuradas limpias, no solo representación solo de UI.

Eso es importante para:

- agentes
- CLIs
- paneles
- futura automatización y herramientas de limpieza

## 6. La limpieza debería ser de primera clase, no una ocurrencia tardía

Worktrunk hace de la limpieza de crear/eliminar/merge parte del flujo de trabajo.

### Recomendación

Paperclip debería seguir tratando la política de limpieza como parte del modelo central de espacio de trabajo:

- cuándo se permite la limpieza
- qué bloquea la limpieza
- qué se archiva versus se destruye
- qué pasa cuando falla la limpieza

Esto valida la política de limpieza explícita propuesta antes en este plan.

## 7. Qué no copiar

También hay límites importantes a la analogía.

Paperclip no debería adoptar estos supuestos de Worktrunk como reglas universales de producto:

- cada espacio de trabajo de ejecución es un git worktree local
- el host de Paperclip tiene acceso directo a shell y sistema de archivos
- cada flujo de trabajo es centrado en merge
- cada usuario quiere detalle de espacio de trabajo a nivel de herramienta de desarrollador en la navegación principal

### Implicación de producto

Paperclip debería tomar prestados los buenos patrones de ejecución de Worktrunk mientras mantiene el modelo más amplio de Paperclip:

- el proyecto planifica el trabajo
- el espacio de trabajo define dónde ocurre el trabajo
- el producto de trabajo define qué salió del trabajo
- el git worktree sigue siendo una estrategia de implementación, no el producto en sí
## Reglas de comportamiento

## 1. La limpieza no debe depender de que los agentes recuerden `in_review`

Los agentes aún pueden usar `in_review`, pero el comportamiento de limpieza debe gobernarse por política y estado observado.

### Mantener vivo un espacio de trabajo de ejecución mientras cualquiera de estos sea cierto

- un issue enlazado es no terminal
- un PR enlazado está abierto
- una vista previa/servicio de tiempo de ejecución enlazado está activo
- el espacio de trabajo aún está dentro de la ventana de retención

### Ocultar en lugar de eliminar agresivamente

Los espacios de trabajo archivados o inactivos deberían ocultarse de las listas predeterminadas antes de limpiarse duramente.

## 2. Múltiples issues pueden compartir intencionalmente un espacio de trabajo de ejecución

Así es como Paperclip admite:

- dev solo en una rama compartida
- ramas de integración de operador
- funcionalidades relacionadas agrupadas en un PR

Esta es la razón clave para no forzar 1 issue = 1 espacio de trabajo = 1 PR.

## 3. Los espacios de trabajo de issue aislados siguen siendo opt-in

Incluso en un proyecto pesado en git, los espacios de trabajo aislados deberían ser opcionales.

Ejemplos donde el modo compartido es válido:

- arreglos diminutos de bugs
- prototipado sin ramas
- proyectos no git
- flujos de trabajo locales de un solo usuario

## 4. La política de PR pertenece a la política de espacio de trabajo respaldada por git

Las decisiones de automatización de PR deberían tomarse en la capa de política de proyecto/espacio de trabajo.

El issue solo debería:

- exponer el PR resultante
- enrutar aprobaciones/solicitudes de revisión
- mostrar estado y estado de revisión

## 5. El producto de trabajo es el unificador orientado al usuario

Las vistas previas, PRs, commits y artefactos deberían todos ser descubribles a través de una affordance consistente a nivel de issue.

Eso mantiene a Paperclip enfocado en coordinación y visibilidad en lugar de dividir las salidas entre muchos subsistemas ocultos.

## Orden de implementación recomendado

## Fase 1: Clarificar objetos actuales en UI

1. Exponer la pestaña `Project > Code`
2. Mostrar allí los espacios de trabajo de proyecto existentes
3. Rehabilitar la política de espacio de trabajo de ejecución a nivel de proyecto con texto revisado
4. Mantener simple la creación de issues con valores predeterminados heredados

## Fase 2: Agregar registro explícito de espacio de trabajo de ejecución

1. Agregar `execution_workspaces`
2. Enlazar ejecuciones, issues, vistas previas y PRs a él
3. Agregar página simple de detalle de espacio de trabajo de ejecución
4. Hacer `cwd` opcional y asegurar que los espacios de trabajo remotos gestionados por proveedor sean admitidos desde el día uno

## Fase 3: Agregar modelo de producto de trabajo

1. Agregar `issue_work_products`
2. Ingerir PRs, vistas previas, ramas, commits
3. Agregar pestaña `Work Product` de issue
4. Agregar elementos de bandeja de entrada para cambios accionables de estado de producto de trabajo
5. Admitir reporte de PR/vista previa creado por agente remoto sin propiedad local

## Fase 4: Agregar flujos de trabajo avanzados de reutilización y limpieza

1. Agregar `reuse existing execution workspace`
2. Agregar UI de ciclo de vida de limpieza
3. Agregar atajos de flujo de trabajo de rama de operador
4. Agregar recolección externa de vistas previas más rica
5. Agregar herramientas de migración/backfill donde mejore la continuidad para usuarios existentes

## Por qué este modelo es correcto

Este modelo mantiene el producto balanceado:

- lo suficientemente simple para usuarios solos
- lo suficientemente fuerte para equipos reales de ingeniería
- flexible para proyectos no git
- lo suficientemente explícito para gobernar PRs y vistas previas

Más importante, mantiene limpias las abstracciones:

- los proyectos planifican el trabajo
- los espacios de trabajo de proyecto definen las bases de código durables
- los espacios de trabajo de ejecución definen dónde se ejecutó el trabajo
- el producto de trabajo define qué salió del trabajo
- los PRs siguen siendo salidas, no el modelo central de tarea

También mantiene práctico el despliegue:

- los usuarios existentes pueden actualizarse sin ruptura de flujo de trabajo
- los installs local-first siguen siendo simples
- los despliegues de Paperclip alojados en la nube siguen siendo de primera clase

Ese es un mejor ajuste para Paperclip que cualquiera de los extremos:

- ocultar el comportamiento de espacio de trabajo hasta que nadie lo entienda
- o hacer que toda la app gire alrededor de la mecánica de host de código
