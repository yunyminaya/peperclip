# Modelo de producto de espacio de trabajo, producto de trabajo y flujo de PR

## Contexto

Paperclip necesita admitir dos formas muy diferentes pero igualmente válidas de trabajar:

- un desarrollador en solitario trabajando directamente en `master`, o en una carpeta que ni siquiera es un repositorio git
- un flujo de trabajo de ingeniería más grande con ramas aisladas, vistas previas, pull requests y automatización de limpieza

Hoy, Paperclip ya tiene los inicios de este modelo:

- los `projects` pueden llevar política de espacio de trabajo de ejecución
- los `project_workspaces` ya existen como un objeto durable con alcance de proyecto
- los issues pueden llevar ajustes de espacio de trabajo de ejecución
- los servicios de tiempo de ejecución pueden adjuntarse a un espacio de trabajo o issue

Lo que falta es un modelo de producto claro y una UI que hagan estas capacidades comprensibles y operables.

El principal riesgo de producto es sobrecargar un concepto para que haga demasiado:

- hacer que los subissues hagan el trabajo de ramas o PRs
- hacer que los proyectos sean demasiado pesados en infraestructura
- hacer que los espacios de trabajo sean tan ocultos que los usuarios no puedan formarse un modelo mental
- hacer que Paperclip se sienta como una herramienta de revisión de código en lugar de un plano de control

## Objetivos

1. Mantener `project` lo suficientemente ligero para seguir siendo un contenedor de planificación.
2. Hacer que el comportamiento del espacio de trabajo sea comprensible tanto para proyectos git como no git.
3. Admitir tres flujos de trabajo reales sin forzar uno:
   - flujos de trabajo de espacio de trabajo compartido / edición directa
   - flujos de trabajo de espacios de trabajo aislados por issue
   - flujos de trabajo de rama de integración de larga duración o de operador
4. Proporcionar un lugar de primera clase para ver las salidas del trabajo:
   - vistas previas
   - PRs
   - ramas
   - commits
   - documentos y artefactos
5. Mantener simples la navegación principal y el tablero de tareas.
6. Actualizar sin problemas a los usuarios existentes de Paperclip al nuevo modelo sin forzar una reconfiguración disruptiva.
7. Admitir despliegues de Paperclip alojados en la nube donde la ejecución ocurre en entornos remotos o gestionados por adaptador en lugar de workers locales.

## No objetivos

- Convertir Paperclip en un producto completo de revisión de código
- Requerir que cada issue tenga su propia rama o PR
- Requerir que cada proyecto configure automatización de código/espacio de trabajo
- Hacer que los espacios de trabajo sean una primitiva de navegación global de nivel superior en V1
- Requerir una ruta de sistema de archivos local o un checkout git local para usar ejecución consciente del espacio de trabajo

## Decisiones centrales de producto

### 1. El proyecto sigue siendo el objeto de planificación

Un `project` sigue siendo lo que agrupa el trabajo en torno a un entregable o iniciativa.

Puede tener:

- ningún código
- una base de código/espacio de trabajo predeterminado
- varias bases de código/espacios de trabajo

No se requiere que los proyectos se vuelvan pesados.

### 2. El espacio de trabajo de proyecto es un objeto de primera clase, pero con alcance bajo el proyecto

Un `project workspace` es la base de código o entorno raíz durable para un proyecto.

Ejemplos:

- una carpeta local en disco
- un checkout de repositorio git
- una raíz de paquete de monorepo
- una carpeta de diseño/documentos no git
- una referencia de base de código gestionada por adaptador remoto

Este es el ancla estable que los operadores configuran una vez.

No debería ser un elemento de sidebar de nivel superior en la app principal. Debería vivir bajo la experiencia del proyecto.

### 3. El espacio de trabajo de ejecución es un objeto de tiempo de ejecución de primera clase

Un `execution workspace` es donde una ejecución o issue específica realmente se ejecuta.

Ejemplos:

- el propio espacio de trabajo de proyecto compartido
- un worktree git aislado
- un checkout de rama de operador de larga duración
- un sandbox remoto gestionado por adaptador
- el entorno aislado de rama/sesión de un proveedor de agentes en la nube

Este objeto debe registrarse explícitamente para que Paperclip pueda:

- mostrar dónde ocurrió el trabajo
- adjuntar vistas previas y servicios de tiempo de ejecución
- vincular PRs y ramas
- decidir el comportamiento de limpieza
- admitir la reutilización entre múltiples issues relacionados

### 4. Los PRs son producto de trabajo, no el modelo central de issue

Un PR es una salida del trabajo, no la unidad de planificación.

Paperclip debería tratar los PRs como un tipo de producto de trabajo vinculado de vuelta a:

- el issue
- el espacio de trabajo de ejecución
- opcionalmente el espacio de trabajo de proyecto

La automatización específica de git debería vivir bajo la política de espacio de trabajo, no bajo la abstracción central de issue.

### 5. Los usuarios existentes deben actualizarse automáticamente

Paperclip ya tiene usuarios y datos existentes de proyectos/tareas. Cualquier modelo nuevo debe preservar la continuidad.

El producto debería poner por defecto las instalaciones existentes en un modo de compatibilidad sensato:

- los proyectos existentes sin configuración de espacio de trabajo siguen funcionando sin cambios
- los `project_workspaces` existentes se convierten en los objetos durables de `project workspace`
- la política de espacio de trabajo de ejecución de proyecto existente se mapea hacia adelante en lugar de descartarse
- los issues sin campos explícitos de espacio de trabajo siguen heredando el comportamiento actual

Esta migración debería sentirse aditiva, no como un flujo obligatorio de reincorporación.

### 6. Paperclip alojado en la nube debe ser un modo de despliegue de primera clase

Paperclip no puede asumir que se ejecuta en la misma máquina que el código.

En despliegues en la nube, Paperclip puede:

- ejecutarse en Vercel u otro host serverless
- no tener un proceso worker local de larga duración
- delegar la ejecución a un agente de codificación remoto o un sandbox gestionado por proveedor
- recibir de vuelta una rama, PR, URL de vista previa o artefacto desde ese entorno remoto

Por lo tanto, el modelo debe ser portable:

- el `project workspace` puede ser gestionado remotamente, no local
- el `execution workspace` puede no tener `cwd` local
- los `runtime services` pueden rastrearse por referencia de proveedor y URL en lugar de un proceso host
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
- `Work product`: vistas previas, PRs, ramas, commits, artefactos, documentos
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
- puede definir valores de ejecución predeterminados que los nuevos issues heredan

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

Objeto de base de código/raíz durable, configurado, con alcance de proyecto.

Esto debería evolucionar desde la tabla actual `project_workspaces` hacia un objeto de producto más explícito.

### Motivación

Esto separa:

- "¿qué base de código/raíz usa este proyecto?"

de:

- "¿en qué entorno de ejecución temporal se ejecutó este issue?"

Eso mantiene el modelo simple para usuarios en solitario mientras admite automatización avanzada.
También permite que los despliegues de Paperclip alojados en la nube apunten a bases de código y remotos sin pretender que el host de Paperclip tenga acceso directo al sistema de archivos.

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
- `setupCommand` y `cleanupCommand` deberían permitirse aquí para el arranque de la raíz del espacio de trabajo, incluso cuando no se use ejecución aislada.
- Para un monorepo, múltiples espacios de trabajo de proyecto pueden apuntar a diferentes raíces o paquetes bajo un mismo repositorio.
- `sourceType=remote_managed` es importante para despliegues en la nube donde la base de código durable se define por metadatos de proveedor/repositorio en lugar de una ruta de checkout local.

## 3. Política de espacio de trabajo de ejecución de proyecto

Valores predeterminados a nivel de proyecto para cómo se ejecutan los issues.

Esta es la principal superficie de configuración orientada al operador.

### Motivación

Esto permite que Paperclip admita:

- edición directa en un espacio de trabajo compartido
- espacios de trabajo aislados para paralelismo de issues
- flujos de trabajo de rama de integración de larga duración
- ejecución remota de agentes en la nube que devuelve una rama o PR

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

## 4. Enlace de espacio de trabajo de issue

Selección a nivel de issue del comportamiento de ejecución.

Esto debería seguir siendo ligero en el caso normal y solo mostrar controles más ricos cuando sea relevante.

### Motivación

No cada issue en un proyecto de código debería crear un nuevo espacio de trabajo derivado.

Ejemplos:

- una pequeña corrección puede ejecutarse en el espacio de trabajo compartido
- tres issues relacionados pueden compartir intencionalmente una rama de integración
- un operador en solitario puede estar trabajando directamente en `master`

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

- si el proyecto no tiene automatización de espacio de trabajo, todos estos campos pueden ser nulos
- si el proyecto tiene un espacio de trabajo principal, la creación de issues debería usarlo por defecto en silencio
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

- `sourceIssueId` es el issue que originalmente causó la creación del espacio de trabajo, no necesariamente el único issue vinculado a él después.
- múltiples issues pueden vincularse al mismo espacio de trabajo de ejecución en un flujo de trabajo de rama de larga duración.
- `cwd` puede ser nulo para espacios de trabajo de ejecución remotos; la identidad del proveedor y los enlaces de producto de trabajo aún hacen útil el objeto.

## 6. Enlace de issue a espacio de trabajo de ejecución

Un issue puede necesitar vincularse a uno o más espacios de trabajo de ejecución con el tiempo.

Ejemplos:

- un issue comienza en un espacio de trabajo compartido y luego se mueve a uno aislado
- un intento fallido se archiva y se crea un nuevo espacio de trabajo
- varios issues comparten intencionalmente un espacio de trabajo de rama de operador

### Objeto propuesto

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
- "aquí está el artefacto/reporte/documento"

sin convertir los issues en un volcado crudo de detalles del adaptador.

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

- Los PRs se almacenan aquí como `type=pull_request`
- las vistas previas se almacenan aquí como `type=preview_url` o `runtime_service`
- los procesos propios de Paperclip deberían actualizar salud/estado automáticamente
- los proveedores externos deberían al menos almacenar enlace, proveedor, id externo y el último estado conocido
- los agentes en la nube deberían poder crear registros de producto de trabajo sin que Paperclip sea dueño del host de ejecución

## Modelo de página y UI

## 1. Navegación global

No agregar `Workspaces` como elemento de sidebar de nivel superior en V1.

### Motivación

Eso haría que todo el producto se sintiera pesado en infraestructura, incluso para empresas que no usan automatización de código.

### La navegación global sigue siendo

- Panel
- Bandeja de entrada
- Empresas
- Agentes
- Objetivos
- Proyectos
- Issues
- Aprobaciones

Los espacios de trabajo y el producto de trabajo deberían mostrarse a través de las vistas de detalle de proyecto e issue.

## 2. Detalle de proyecto

Agregar una subnavegación de proyecto que mantenga la planificación primero y el código segundo.

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
- responsable
- conteos de issues
- progreso de nivel superior
- últimos resúmenes importantes de producto de trabajo

### Pestaña `Issues`

- por defecto solo issues de nivel superior
- mostrar resúmenes de issues padre:
  - conteo de hijos
  - `x/y` terminados
  - insignias activas de vista previa/PR
- interruptor opcional: `Show subissues`

### Pestaña `Code`

Esta es la principal superficie de configuración y visibilidad del espacio de trabajo.

#### Sección: `Project Workspaces`

Listar espacios de trabajo de proyecto durables para el proyecto.

Columnas de tarjeta/lista:

- nombre del espacio de trabajo
- tipo de fuente
- ruta o repositorio
- ref predeterminada
- insignia principal/predeterminada
- conteo de espacios de trabajo de ejecución activos
- conteo de issues activos
- conteo de vistas previas activas
- tipo de alojamiento / proveedor cuando es gestionado remotamente

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
- para usuarios simples en solitario, esto puede ser un campo de ruta y un botón de guardar

## 4. Flujo de creación de issue

La creación de issues debería seguir siendo simple por defecto.

### Comportamiento predeterminado

Si el proyecto seleccionado:

- no tiene automatización de espacio de trabajo: no mostrar UI de espacio de trabajo
- tiene un espacio de trabajo de proyecto predeterminado y modo de ejecución predeterminado: heredar en silencio

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

Este menú desplegable debería mostrar solo espacios de trabajo de ejecución activos para el espacio de trabajo de proyecto seleccionado, con etiquetas como:

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

El detalle de issue debería exponer el espacio de trabajo y el producto de trabajo con claridad, pero sin convertirse en una UI de alojamiento de código.

### Insignias de encabezado

Mostrar insignias compactas de resumen cerca del área de título/estado:

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
- conteo de issues vinculados
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
- rama vinculada
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

No necesita estar en el sidebar principal.

### Secciones

- identidad
- issue de origen
- issues vinculados
- rama/ref
- identidad de proveedor/sesión
- servicios de tiempo de ejecución activos
- vistas previas
- PRs
- estado de limpieza
- historial de eventos/actividad

### Motivación

Aquí es donde van los usuarios avanzados cuando necesitan inspeccionar la mecánica. La mayoría de los usuarios no debería necesitarlo en el flujo normal.

## 7. Comportamiento de la bandeja de entrada

La bandeja de entrada debería mostrar eventos de producto de trabajo accionables, no cada detalle de implementación.

### Mostrar elementos de bandeja de entrada para

- issue asignado o actualizado
- PR necesita revisión del tablero
- PR abierto o marcado listo
- vista previa no saludable
- limpieza de espacio de trabajo fallida
- servicio de tiempo de ejecución fallido
- ejecución remota de agente en la nube devolvió PR o vista previa que necesita revisión

### No mostrar por defecto

- cada latido del espacio de trabajo
- cada actualización de rama
- cada creación de espacio de trabajo derivado

### Estilo de visualización

Si el elemento de la bandeja de entrada es sobre una vista previa o PR, mostrar el contexto del issue con él:

- identificador y título del issue
- issue padre si este es un subissue
- nombre del espacio de trabajo si es relevante

## 8. Lista de issues y Kanban

Mantener la lista y el tablero con la planificación primero.

### Comportamiento predeterminado

- mostrar issues de nivel superior por defecto
- mostrar resúmenes de padres para subissues
- no aplanar cada detalle de ejecución hijo en el tablero principal

### Adornos de fila/tarjeta

Para issues con producto de trabajo vinculado, mostrar insignias compactas:

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

La migración debe ser silenciosa por defecto y preservar la compatibilidad.

No se debería forzar a los usuarios existentes a:

- crear nuevos objetos de espacio de trabajo a mano antes de poder seguir trabajando
- reetiquetar issues antiguos
- aprender nuevos conceptos de espacio de trabajo antes de que los flujos básicos de issues sigan funcionando

## 2. Migración de proyecto existente

Al actualizar:

- los registros `project_workspaces` existentes se conservan y se muestran como `Project Workspaces`
- el espacio de trabajo principal actual sigue siendo la base de código predeterminada
- la política de espacio de trabajo de ejecución de proyecto existente se mapea a la nueva superficie de `Project Execution Workspace Policy`
- los proyectos sin política de espacio de trabajo de ejecución permanecen en modo compatible/compartido

## 3. Migración de issue existente

Al actualizar:

- los issues existentes usan por defecto `executionWorkspacePreference=inherit`
- si un issue ya tiene ajustes de espacio de trabajo de ejecución, mapearlos directamente hacia adelante
- si un issue no tiene datos explícitos de espacio de trabajo, preservar el comportamiento existente y no forzar una elección visible al usuario

## 4. Migración de ejecución/tiempo de ejecución existente

Al actualizar:

- los servicios de tiempo de ejecución activos o recientes pueden rellenarse hacia atrás en el historial del espacio de trabajo de ejecución donde sea factible
- el historial faltante no debería bloquear el despliegue; la corrección hacia adelante importa más que la reconstrucción histórica perfecta

## 5. UX de despliegue

Usar lenguaje aditivo en la UI:

- `Code`
- `Workspace automation`
- `Optional`
- `Advanced`

Evitar texto de migración que implique que los usuarios estaban usando el producto "mal" antes.

## Requisitos de despliegue en la nube

## 1. El host de Paperclip y el host de ejecución deben estar desacoplados

Paperclip puede ejecutarse:

- localmente con acceso directo al sistema de archivos
- en un host de app en la nube como Vercel
- en una configuración híbrida con ejecutores de jobs externos

El modelo de espacio de trabajo debe funcionar en los tres.

## 2. La ejecución remota debe admitir reporte de producto de trabajo de primera clase

Un agente en la nube debería poder:

- resolver un espacio de trabajo de proyecto
- realizar un espacio de trabajo de ejecución gestionado por adaptador de forma remota
- producir una rama
- abrir o actualizar un PR
- emitir URLs de vista previa
- registrar artefactos

sin que el host de Paperclip ejecute git local ni procesos locales de vista previa.

## 3. Los supuestos solo locales deben ser opcionales

Lo siguiente debe ser opcional, no requerido:

- `cwd` local
- CLI git local
- directorios de worktree gestionados por host
- procesos de vista previa de larga duración propios del host

## 4. Misma superficie de producto, diferente comportamiento de proveedor

La UI no debería dividirse en productos de "modo local" y "modo nube".

En cambio:

- los proyectos locales muestran detalles de implementación de ruta/git
- los proyectos en la nube muestran detalles de proveedor/referencia
- ambos muestran los mismos objetos de alto nivel:
  - espacio de trabajo de proyecto
  - espacio de trabajo de ejecución
  - producto de trabajo
  - servicio de tiempo de ejecución o vista previa

## Reglas de comportamiento

## 1. La limpieza no debe depender de que los agentes recuerden `in_review`

Los agentes aún pueden usar `in_review`, pero el comportamiento de limpieza debe regirse por la política y el estado observado.

### Mantener vivo un espacio de trabajo de ejecución mientras cualquiera de estos sea cierto

- un issue vinculado no es terminal
- un PR vinculado está abierto
- una vista previa/servicio de tiempo de ejecución vinculado está activo
- el espacio de trabajo aún está dentro de la ventana de retención

### Ocultar en lugar de eliminar agresivamente

Los espacios de trabajo archivados o inactivos deberían ocultarse de las listas predeterminadas antes de limpiarse por completo.

## 2. Múltiples issues pueden compartir intencionalmente un espacio de trabajo de ejecución

Así es como Paperclip admite:

- desarrollo en solitario en una rama compartida
- ramas de integración de operador
- funciones relacionadas agrupadas en un PR

Esta es la razón clave para no forzar 1 issue = 1 espacio de trabajo = 1 PR.

## 3. Los espacios de trabajo aislados de issue siguen siendo opt-in

Incluso en un proyecto muy git, los espacios de trabajo aislados deberían ser opcionales.

Ejemplos donde el modo compartido es válido:

- pequeñas correcciones de errores
- prototipado sin ramas
- proyectos no git
- flujos de trabajo locales de un solo usuario

## 4. La política de PR pertenece a la política de espacio de trabajo respaldada por git

Las decisiones de automatización de PR deberían tomarse en la capa de política de proyecto/espacio de trabajo.

El issue solo debería:

- mostrar el PR resultante
- enrutar aprobaciones/solicitudes de revisión
- mostrar estado y estado de revisión

## 5. El producto de trabajo es el unificador orientado al usuario

Las vistas previas, PRs, commits y artefactos deberían ser descubribles a través de una única affordance consistente a nivel de issue.

Eso mantiene a Paperclip enfocado en coordinación y visibilidad en lugar de dividir las salidas entre muchos subsistemas ocultos.

## Orden de implementación recomendado

## Fase 1: Aclarar los objetos actuales en la UI

1. Mostrar la pestaña `Project > Code`
2. Mostrar allí los espacios de trabajo de proyecto existentes
3. Rehabilitar la política de espacio de trabajo de ejecución a nivel de proyecto con texto revisado
4. Mantener simple la creación de issues con valores heredados predeterminados

## Fase 2: Agregar registro explícito de espacio de trabajo de ejecución

1. Agregar `execution_workspaces`
2. Vincular ejecuciones, issues, vistas previas y PRs a él
3. Agregar página simple de detalle de espacio de trabajo de ejecución
4. Hacer `cwd` opcional y garantizar que los espacios de trabajo remotos gestionados por proveedor se admitan desde el primer día

## Fase 3: Agregar modelo de producto de trabajo

1. Agregar `issue_work_products`
2. Ingerir PRs, vistas previas, ramas, commits
3. Agregar pestaña de `Work Product` al issue
4. Agregar elementos de bandeja de entrada para cambios de estado accionables de producto de trabajo
5. Admitir reporte de PR/vista previa creados por agentes remotos sin propiedad local

## Fase 4: Agregar reutilización avanzada y flujos de limpieza

1. Agregar `reuse existing execution workspace`
2. Agregar UI de ciclo de vida de limpieza
3. Agregar atajos de flujo de trabajo de rama de operador
4. Agregar recolección más rica de vistas previas externas
5. Agregar herramientas de migración/relleno donde mejore la continuidad para usuarios existentes

## Por qué este modelo es correcto

Este modelo mantiene el producto equilibrado:

- lo suficientemente simple para usuarios en solitario
- lo suficientemente sólido para equipos de ingeniería reales
- flexible para proyectos no git
- lo suficientemente explícito para gobernar PRs y vistas previas

Lo más importante, mantiene las abstracciones limpias:

- los proyectos planifican el trabajo
- los espacios de trabajo de proyecto definen las bases de código durables
- los espacios de trabajo de ejecución definen dónde se ejecutó el trabajo
- el producto de trabajo define qué salió del trabajo
- los PRs siguen siendo salidas, no el modelo central de tareas

También mantiene el despliegue práctico:

- los usuarios existentes pueden actualizarse sin rupturas de flujo de trabajo
- las instalaciones locales siguen siendo simples
- los despliegues de Paperclip alojados en la nube siguen siendo de primera clase

Eso encaja mejor con Paperclip que cualquiera de los extremos:

- ocultar el comportamiento del espacio de trabajo hasta que nadie lo entienda
- o hacer que toda la app gire en torno a la mecánica del alojamiento de código
