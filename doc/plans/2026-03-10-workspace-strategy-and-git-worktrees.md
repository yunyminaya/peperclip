# Estrategia de espacios de trabajo y git worktrees

## Contexto

`PAP-447` pregunta cómo Paperclip debería admitir flujos de codificación impulsados por worktrees para agentes de codificación locales sin convertir eso en un requisito universal de producto.

El caso de uso motivador es fuerte:

- cuando inicia un issue, un agente de codificación local puede querer su propio checkout aislado
- el agente puede necesitar una rama dedicada y una ruta predecible para hacer push más adelante
- el agente puede necesitar iniciar uno o más servicios de tiempo de ejecución de espacio de trabajo de larga vida, descubrir puertos o URLs alcanzables, y reportarlos de vuelta en el issue
- el flujo de trabajo debería reutilizar la misma instancia de Paperclip y base de datos embebida en lugar de crear un entorno en blanco
- la autenticación de agentes locales debería seguir siendo de baja fricción

Al mismo tiempo, no queremos codificar rígidamente "cada agente usa git worktrees" en Paperclip:

- algunos operadores usan Paperclip para gestionar Paperclip y quieren worktrees intensivamente
- otros operadores no querrán worktrees en absoluto
- no todo adaptador se ejecuta en un repositorio git local
- no todo adaptador se ejecuta en la misma máquina que Paperclip
- Claude y Codex exponen diferentes affordances integradas, así que Paperclip no debería sobreajustarse a una herramienta

## Decisión central de producto

Paperclip debería modelar **espacios de trabajo de ejecución**, no **worktrees**.

Más específicamente:

- el ancla durable es el **espacio de trabajo de proyecto** o checkout de repo
- un issue puede derivar un **espacio de trabajo de ejecución** temporal de ese espacio de trabajo de proyecto
- una implementación de un espacio de trabajo de ejecución es un **git worktree**
- los adaptadores deciden si usar ese espacio de trabajo derivado y cómo

Esto mantiene portable la abstracción:

- `project workspace` es el concepto a nivel de repo/proyecto
- `execution workspace` es el checkout/cwd de tiempo de ejecución para una ejecución
- `git worktree` es una estrategia para crear ese espacio de trabajo de ejecución
- `workspace runtime services` son procesos de larga vida o vistas previas adjuntos a ese espacio de trabajo

Esto también mantiene válida la abstracción para adaptadores no locales:

- los adaptadores locales pueden recibir un cwd real del sistema de archivos producido por Paperclip
- los adaptadores remotos o en la nube pueden recibir la misma intención de ejecución en forma estructurada y realizarla dentro de su propio entorno
- Paperclip no debería asumir que todo adaptador puede ver o usar directamente una ruta del sistema de archivos del host

## Respuesta a las preguntas principales de encuadre

### ¿Los worktrees son para agentes o para repos/proyectos?

Deberían tratarse como **infraestructura con alcance de repo/proyecto**, no identidad de agente.

El objeto estable es el espacio de trabajo de proyecto. Los agentes van y vienen, la propiedad cambia, y el mismo issue puede reasignarse. Un git worktree es un checkout derivado de un espacio de trabajo de repo para una tarea o issue específico. El agente lo usa, pero no debería ser dueño de la abstracción.

Si Paperclip hace los worktrees primero de agente, difuminará:

- directorios home de agentes
- raíces de repo de proyecto
- ramas/checkouts específicos de issue

Eso hace más difíciles la reutilización, reasignación, limpieza y visibilidad de UI.

### ¿Cómo preservamos la opcionalidad?

Haciendo la estrategia de espacio de trabajo de ejecución **opt-in en la capa de adaptador/configuración**, no una invariante global.

Los valores predeterminados deberían seguir siendo:

- resolución existente de espacio de trabajo de proyecto
- resume existente de sesión de tarea
- fallback existente de home de agente

Entonces los agentes de codificación locales pueden optar por una estrategia como `git_worktree`.

### ¿Cómo lo hacemos portable y apropiado para el adaptador?

Dividiendo responsabilidades:

- el núcleo de Paperclip resuelve y registra el estado del espacio de trabajo de ejecución
- un ayudante compartido de tiempo de ejecución local puede implementar estrategias de checkout basadas en git
- cada adaptador lanza su herramienta dentro del cwd resuelto usando flags específicos del adaptador

Esto evita forzar un modelo con forma de Claude o con forma de Codex sobre todos los adaptadores.

También evita forzar un modelo de sistema de archivos del host sobre agentes en la nube. Un adaptador en la nube puede interpretar la misma estrategia solicitada como:

- crear un checkout sandbox fresco desde repo + ref
- crear una rama/espacio de trabajo aislado dentro del entorno remoto del proveedor
- ignorar campos solo locales como el cwd del host mientras aún respeta la intención de rama/ref/aislamiento
## Requisitos de producto y UX

El modelo técnico actual es direccionalmente correcto, pero la superficie de producto necesita una separación más clara entre:

- el concepto genérico multi-adaptador de un **espacio de trabajo de ejecución**
- el concepto de implementación git local visible al usuario de un **checkout de issue aislado**
- el detalle específico de implementación git de un **git worktree**

Esos no deberían colapsarse en una etiqueta en la UI.

### Recomendación de terminología

Para el texto de producto/UI:

- usar **espacio de trabajo de ejecución** para el concepto genérico multi-adaptador
- usar **checkout de issue aislado** para la funcionalidad orientada al usuario cuando queremos decir "este issue obtiene su propia rama/checkout"
- reservar **git worktree** para vistas avanzadas o de detalle de implementación

Eso le da a Paperclip espacio para admitir:

- git worktrees locales
- checkouts de sandbox remoto
- espacios de trabajo remotos gestionados por adaptador

sin enseñar a los usuarios que "espacio de trabajo" siempre significa "git worktree en mi máquina".

### Los valores predeterminados a nivel de proyecto deberían impulsar la funcionalidad

El lugar principal donde esto debería configurarse es el **proyecto**, no el formulario del agente.

Razonamiento:

- si un repo/proyecto quiere checkouts de issue aislados es principalmente una decisión de flujo de trabajo de proyecto
- la mayoría de los operadores no quieren configurar JSON de tiempo de ejecución por agente
- los agentes deberían heredar la política de espacios de trabajo del proyecto a menos que haya una fuerte sobrescritura específica del adaptador
- el tablero necesita un lugar para expresar valores predeterminados de flujo de trabajo de repo como branching, PRs, limpieza y ciclo de vida de vistas previas

Así que el proyecto debería ser dueño de un ajuste como:

- `isolatedIssueCheckouts.enabled` o equivalente

y ese debería ser el impulsor predeterminado para nuevos issues en ese proyecto.

### El uso a nivel de issue debería seguir siendo opcional

Incluso cuando un proyecto admite checkouts de issue aislados, no todo issue debería forzarse a uno.

Ejemplos:

- un arreglo pequeño puede estar bien en el espacio de trabajo principal del proyecto
- un operador puede querer trabajar directamente en una rama de larga vida
- un usuario del tablero puede querer crear una tarea sin pagar el overhead de configuración/limpieza

Así que el modelo debería ser:

- el proyecto define si los checkouts de issue aislados están disponibles y cuáles son los valores predeterminados
- cada issue puede optar por entrar o salir al crearse
- el valor predeterminado del issue puede heredarse del proyecto

Esto no debería requerir mostrar configuración avanzada de adaptador en los flujos normales de creación de issues.

### Los servicios de tiempo de ejecución usualmente deberían estar ocultos del formulario del agente

El JSON crudo actual de servicios de tiempo de ejecución es demasiado de bajo nivel como UI primaria para la mayoría de los agentes locales.

Para `claude_local` y `codex_local`, el comportamiento probable deseado es:

- Paperclip maneja los servicios de tiempo de ejecución de espacios de trabajo bajo el capó usando política de proyecto/espacio de trabajo
- los operadores no necesitan escribir a mano JSON genérico de tiempo de ejecución en el formulario del agente
- si un adaptador específico de proveedor más adelante necesita configuración de tiempo de ejecución más rica, darle una UI construida a propósito en lugar de JSON genérico por defecto

Así que la recomendación de UI es:

- mantener el JSON de servicios de tiempo de ejecución fuera de la experiencia predeterminada de edición de agente local
- permitirlo solo detrás de una sección avanzada o modo experto específico del adaptador
- mover los ajustes comunes de flujo de trabajo a los ajustes de automatización de espacios de trabajo a nivel de proyecto

### El flujo de trabajo de pull request necesita propiedad explícita y reglas de aprobación

Una vez que Paperclip está creando checkouts de issue aislados, implícitamente está tocando un flujo de trabajo mayor:

- creación de ramas
- inicio/detención de servicios de tiempo de ejecución
- commit y push
- creación de PR
- limpieza después de merge o abandono

Eso significa que el producto necesita un modelo explícito de **quién es dueño de la creación de PR y la preparación para merge**.

Como mínimo hay dos modos válidos:

- creación de PR gestionada por el agente
- creación de PR con aprobación requerida

Y probablemente tres puntos de decisión distintos:

1. ¿debería el agente hacer commit automáticamente?
2. ¿debería el agente abrir el PR automáticamente?
3. ¿abrir o marcar listo requiere aprobación del tablero?

Esos no deberían estar enterrados dentro de prompts de adaptador. Son política de flujo de trabajo.

### Los flujos de trabajo de operadores humanos son diferentes de los flujos de trabajo de aislamiento de issue

Un operador humano puede querer una rama de integración personal de larga vida como `dotta` y puede no querer que cada tarea cree un nuevo baile de rama/espacio de trabajo.

Ese es un flujo de trabajo legítimo y debería admitirse directamente.

Así que Paperclip debería distinguir:

- **flujos de trabajo de checkout de issue aislado**: optimizados para paralelismo de agentes y aislamiento con alcance de issue
- **flujos de trabajo de rama personal**: optimizados para un humano u operador haciendo múltiples cambios relacionados en una rama de larga vida y creando PRs de vuelta a la rama principal cuando convenga

Esto implica:

- los checkouts de issue aislados deberían ser opcionales incluso cuando están disponibles
- los ajustes de flujo de trabajo de proyecto deberían admitir una ruta de "usar la rama base directamente" o "usar la rama de operador preferida"
- la política de PR no debería asumir que cada unidad de trabajo mapea 1:1 a una nueva rama o PR
## Modelo de UX recomendado

### 1. Ajustes de "Execution Workspace" a nivel de proyecto

Los proyectos deberían tener un área de ajustes dedicada para automatización de espacios de trabajo.

Estructura sugerida:

- `Execution Workspaces`
  - `Enable isolated issue checkouts`
  - `Default for new issues`
  - `Checkout implementation`
  - `Branch and PR behavior`
  - `Runtime services`
  - `Cleanup behavior`

Para un proyecto local respaldado por git, el lenguaje visible puede ser más concreto:

- `Enable isolated issue checkouts`
- `Implementation: Git worktree`

Para proyectos remotos o gestionados por adaptador, la misma sección puede decir en su lugar:

- `Implementation: Adapter-managed workspace`

### 2. La creación de issues debería exponer un opt-in simple

Al crear un issue dentro de un proyecto con soporte de espacios de trabajo de ejecución habilitado:

- mostrar un checkbox o toggle como `Use isolated issue checkout`
- valor predeterminado desde el ajuste de proyecto
- ocultar controles avanzados de espacios de trabajo a menos que el operador haya expandido una sección avanzada

Si el proyecto no admite espacios de trabajo de ejecución, no mostrar el control en absoluto.

Esto mantiene la UI predeterminada ligera mientras preserva el control.

### 3. La configuración del agente debería ser mayormente basada en herencia

El formulario del agente no debería ser el lugar principal donde los operadores ensamblan la política de worktree/tiempo de ejecución para agentes locales comunes.

En su lugar:

- los agentes de codificación locales heredan la política de espacios de trabajo de ejecución del proyecto
- el formulario del agente solo expone una sobrescritura cuando es verdaderamente necesario
- la configuración JSON cruda es solo avanzada

Eso significa que el caso común se vuelve:

- configurar el proyecto una vez
- asignar un agente de codificación local
- crear issues con comportamiento opcional de checkout aislado

### 4. El detalle avanzado de implementación aún puede existir

Aún debería haber una vista avanzada para usuarios avanzados que muestre:

- payload de estrategia de espacio de trabajo de ejecución
- payload de intención de servicios de tiempo de ejecución
- sobrescrituras específicas del adaptador

Pero eso debería tratarse como una superficie de experto/depuración, no el modelo mental predeterminado.

## Modelo de política de flujo de trabajo recomendado

### Política de realización de espacios de trabajo

Valores de política sugeridos:

- `shared_project_workspace`
- `isolated_issue_checkout`
- `adapter_managed_isolated_workspace`

Para proyectos git locales, `isolated_issue_checkout` puede mapear a `git_worktree`.

### Política de ramas

Campos sugeridos de política de ramas a nivel de proyecto:

- `baseBranch`
- `branchMode`: `issue_scoped | operator_branch | project_primary`
- `branchTemplate` para ramas con alcance de issue
- `operatorPreferredBranch` para flujos de trabajo humanos/de operador

Esto permite:

- ramas estrictas de issue para agentes
- ramas personales de larga vida para humanos
- uso directo del espacio de trabajo primario del proyecto cuando se desee

### Política de pull request

Campos sugeridos de política de PR a nivel de proyecto:

- `prMode`: `none | agent_may_open | agent_auto_open | approval_required`
- `autoPushOnDone`: boolean
- `requireApprovalBeforeOpen`: boolean
- `requireApprovalBeforeReady`: boolean
- `defaultBaseBranch`

Esto mantiene explícito y gobernable el comportamiento de PR.

### Política de limpieza

Campos sugeridos de limpieza a nivel de proyecto:

- `stopRuntimeServicesOnDone`
- `removeIsolatedCheckoutOnDone`
- `removeIsolatedCheckoutOnMerged`
- `deleteIssueBranchOnMerged`
- `retainFailedWorkspaceForInspection`

Estos importan porque la automatización de espacios de trabajo no es solo configuración. La ruta de limpieza es parte del producto.
## Recomendaciones de diseño para el problema actual de UI

Basado en las preocupaciones anteriores, la UI debería cambiar de estas maneras:

### UI de agente

- eliminar el JSON genérico de servicios de tiempo de ejecución de la superficie predeterminada de configuración de agente local
- mantener el JSON crudo de espacio de trabajo/tiempo de ejecución solo detrás de ajustes avanzados
- preferir herencia desde ajustes de proyecto para `claude_local` y `codex_local`
- solo agregar UI de tiempo de ejecución específica del adaptador cuando un adaptador verdaderamente necesite ajustes que Paperclip no puede inferir

### UI de proyecto

- agregar una sección de ajustes de espacios de trabajo de ejecución a nivel de proyecto
- permitir habilitar checkouts de issue aislados para ese proyecto
- almacenar allí el comportamiento predeterminado de issue
- exponer allí los valores predeterminados de rama, PR, servicios de tiempo de ejecución y limpieza

### UI de creación de issue

- mostrar `Use isolated issue checkout` solo cuando el proyecto tiene soporte de espacios de trabajo de ejecución habilitado
- mantenerlo como un opt-in/out a nivel de issue, con valor predeterminado del proyecto
- ocultar detalles avanzados de espacios de trabajo de ejecución a menos que se soliciten

## Consecuencias para la especificación

Esto cambia el énfasis del plan de una manera útil:

- el proyecto se convierte en el dueño principal de configuración de flujo de trabajo
- el issue se convierte en la unidad de opt-in/out para comportamiento de checkout aislado
- el agente se convierte en un ejecutor que usualmente hereda la política de flujo de trabajo
- el JSON crudo de tiempo de ejecución se convierte en una representación avanzada/interna, no la UX principal

También aclara que la creación de PR y la limpieza no son notas laterales opcionales. Son partes centrales de la superficie de producto de automatización de espacios de trabajo.

## Lista de verificación concreta de integración

Esta sección convierte los requisitos de producto anteriores en un plan de implementación concreto para la base de código actual.

### Regla guía de precedencia

El orden de decisión de tiempo de ejecución debería volverse:

1. sobrescritura de espacio de trabajo de ejecución a nivel de issue
2. política de espacio de trabajo de ejecución a nivel de proyecto
3. sobrescritura de adaptador a nivel de agente
4. comportamiento predeterminado actual

Ese es el cambio arquitectónico clave. Hoy la implementación está demasiado centrada en configuración de agente para la UX deseada.

## Nombres de campos propuestos

### Campos a nivel de proyecto

Agregar un objeto de política de espacio de trabajo de ejecución propiedad del proyecto. Forma compartida sugerida:

```ts
type ProjectExecutionWorkspacePolicy = {
  enabled: boolean;
  defaultMode: "inherit_project_default" | "shared_project_workspace" | "isolated_issue_checkout";
  implementation: "git_worktree" | "adapter_managed";
  branchPolicy: {
    baseBranch: string | null;
    branchMode: "issue_scoped" | "operator_branch" | "project_primary";
    branchTemplate: string | null;
    operatorPreferredBranch: string | null;
  };
  pullRequestPolicy: {
    mode: "none" | "agent_may_open" | "agent_auto_open" | "approval_required";
    autoPushOnDone: boolean;
    requireApprovalBeforeOpen: boolean;
    requireApprovalBeforeReady: boolean;
    defaultBaseBranch: string | null;
  };
  cleanupPolicy: {
    stopRuntimeServicesOnDone: boolean;
    removeExecutionWorkspaceOnDone: boolean;
    removeExecutionWorkspaceOnMerged: boolean;
    deleteIssueBranchOnMerged: boolean;
    retainFailedWorkspaceForInspection: boolean;
  };
  runtimeServices: {
    mode: "disabled" | "project_default";
    services?: Array<Record<string, unknown>>;
  };
};
```

Notas:

- `enabled` controla si el proyecto expone en absoluto el comportamiento de checkout de issue aislado
- `defaultMode` controla los valores predeterminados de creación de issue
- `implementation` se mantiene lo suficientemente genérico para adaptadores locales o remotos
- la configuración de servicios de tiempo de ejecución se mantiene anidada aquí, no en el formulario predeterminado del agente

### Campos a nivel de issue

Agregar campos de opt-in/sobrescritura propiedad del issue. Forma sugerida:

```ts
type IssueExecutionWorkspaceSettings = {
  mode?: "inherit_project_default" | "shared_project_workspace" | "isolated_issue_checkout";
  branchOverride?: string | null;
  pullRequestModeOverride?: "inherit" | "none" | "agent_may_open" | "agent_auto_open" | "approval_required";
};
```

Esto usualmente debería estar oculto detrás de UI simple:

- un checkbox como `Use isolated issue checkout`
- controles avanzados solo cuando se necesiten

### Campos a nivel de agente

Mantener la configuración de espacio de trabajo/tiempo de ejecución a nivel de agente, pero reposicionarla como solo sobrescritura avanzada.

Semántica sugerida:

- si está ausente, heredar política de proyecto + issue
- si está presente, sobrescribir solo el detalle de implementación necesario para ese adaptador
## Cambios de tipos y API compartidos

### 1. Tipos de proyecto compartidos

Archivos a cambiar primero:

- `packages/shared/src/types/project.ts`
- `packages/shared/src/validators/project.ts`

Agregar:

- `executionWorkspacePolicy?: ProjectExecutionWorkspacePolicy | null`

### 2. Tipos de issue compartidos

Archivos a cambiar:

- `packages/shared/src/types/issue.ts`
- `packages/shared/src/validators/issue.ts`

Agregar:

- `executionWorkspaceSettings?: IssueExecutionWorkspaceSettings | null`

### 3. Esquema de BD

Si queremos que estos campos persistan directamente en entidades existentes en lugar de vivir en JSON opaco:

- `packages/db/src/schema/projects.ts`
- `packages/db/src/schema/issues.ts`
- generación de migración en `packages/db/src/migrations/`

Primer corte recomendado:

- almacenar la política de proyecto como JSONB en `projects`
- almacenar la sobrescritura de ajuste de issue como JSONB en `issues`

Eso minimiza el churn de esquema mientras el modelo de producto aún se mueve.

Columnas sugeridas:

- `projects.execution_workspace_policy jsonb`
- `issues.execution_workspace_settings jsonb`

## Cambios de resolución del lado del servidor

### 4. Ruta de lectura/escritura de servicio de proyecto

Archivos:

- `server/src/services/projects.ts`
- rutas de proyecto en `server/src/routes/projects.ts`

Tareas:

- aceptar y validar la política de espacio de trabajo de ejecución de proyecto
- devolverla desde las cargas útiles de API de proyecto
- aplicar el alcance de empresa como de costumbre

### 5. Ruta de creación/actualización de servicio de issue

Archivos:

- `server/src/services/issues.ts`
- `server/src/routes/issues.ts`

Tareas:

- aceptar `executionWorkspaceSettings` a nivel de issue
- al crear un issue en un proyecto con espacios de trabajo de ejecución habilitados, usar como valor predeterminado el ajuste del issue desde la política de proyecto si no se proporciona explícitamente
- mantener simple la carga útil del issue para clientes normales; los campos avanzados pueden ser opcionales

### 6. Resolución de latido y ejecución

Archivo principal:

- `server/src/services/heartbeat.ts`

El comportamiento actual debería refactorizarse para que la resolución de espacios de trabajo se base en:

- ajuste de issue
- luego política de proyecto
- luego sobrescritura de adaptador

Trabajo técnico específico:

- cargar la política de espacio de trabajo de ejecución de proyecto durante la resolución de ejecución
- cargar los ajustes de espacio de trabajo de ejecución de issue durante la resolución de ejecución
- derivar un objeto de decisión de espacio de trabajo de ejecución efectivo antes del lanzamiento del adaptador
- mantener la configuración del adaptador solo como sobrescritura

Ayudante interno sugerido:

```ts
type EffectiveExecutionWorkspaceDecision = {
  mode: "shared_project_workspace" | "isolated_issue_checkout";
  implementation: "git_worktree" | "adapter_managed" | "project_primary";
  branchPolicy: {...};
  pullRequestPolicy: {...};
  cleanupPolicy: {...};
  runtimeServices: {...};
};
```

## Cambios de UI

### 7. UI de ajustes de proyecto

Archivos probables:

- `ui/src/components/ProjectProperties.tsx`
- páginas de detalle/ajustes de proyecto bajo `ui/src/pages/`
- cliente de API de proyecto en `ui/src/api/projects.ts`

Agregar una sección propiedad del proyecto:

- `Execution Workspaces`
  - habilitar checkouts de issue aislados
  - valor predeterminado para nuevos issues
  - tipo de implementación
  - ajustes de rama
  - ajustes de PR
  - ajustes de limpieza
  - valores predeterminados de servicios de tiempo de ejecución

Regla importante de UX:

- la configuración de servicios de tiempo de ejecución no debería usar JSON crudo por defecto
- si el primer corte debe usar JSON internamente, envolverlo en un formulario estructurado mínimo o divulgación avanzada

### 8. UI de creación/edición de issue

Archivos probables:

- componentes de UI de creación de issue y superficies de edición de detalle de issue en `ui/src/pages/`
- cliente de API de issue en `ui/src/api/issues.ts`

Agregar:

- toggle `Use isolated issue checkout`, solo cuando la política de proyecto lo habilita
- controles avanzados de comportamiento de espacio de trabajo solo cuando se expanden

No mostrar:

- JSON crudo de servicios de tiempo de ejecución
- payloads crudos de estrategia

en el flujo predeterminado de creación de issue.

### 9. Limpieza de UI de agente

Archivos:

- `ui/src/adapters/local-workspace-runtime-fields.tsx`
- `ui/src/adapters/codex-local/config-fields.tsx`
- `ui/src/adapters/claude-local/config-fields.tsx`

Dirección técnica:

- mantener la superficie de configuración existente como sobrescritura avanzada
- eliminarla del flujo de formulario predeterminado para agentes de codificación locales
- agregar texto explicativo de que la política de espacio de trabajo de ejecución de proyecto se hereda a menos que se sobrescriba

## Cambios de adaptador y orquestación

### 10. Comportamiento de adaptador local

Archivos:

- `packages/adapters/codex-local/src/ui/build-config.ts`
- `packages/adapters/claude-local/src/ui/build-config.ts`
- rutas de ejecución de adaptador local que ya consumen env/contexto

Tareas:

- seguir aceptando contexto de espacio de trabajo/tiempo de ejecución resuelto desde el latido
- dejar de asumir que la configuración del agente es la fuente primaria de política de espacios de trabajo
- preservar el soporte de sobrescritura específica del adaptador

### 11. Orquestación de servicios de tiempo de ejecución

Archivos:

- `server/src/services/workspace-runtime.ts`

Tareas:

- aceptar valores predeterminados de servicios de tiempo de ejecución desde la política efectiva de proyecto/issue
- mantener el JSON de servicios de tiempo de ejecución de configuración de adaptador solo como sobrescritura
- preservar la portabilidad para adaptadores remotos
## Flujo de trabajo de pull request y limpieza

### 12. Ejecución de política de PR

Esto no está completamente implementado hoy y debería tratarse como una capa de orquestación separada.

Archivos probables:

- `server/src/services/heartbeat.ts`
- futuros ayudantes de integración git/proveedor

Decisiones necesarias:

- cuando el issue pasa a done, ¿debería Paperclip hacer auto-commit?
- ¿debería hacer auto-push?
- ¿debería abrir un PR automáticamente?
- ¿la apertura/preparación de PR debería estar controlada por aprobación?

Enfoque sugerido:

- almacenar la política de PR en el proyecto
- resolver la política de PR efectiva por issue/ejecución
- emitir acciones explícitas de flujo de trabajo en lugar de depender solo del texto del prompt

### 13. Ejecución de política de limpieza

Archivos probables:

- `server/src/services/workspace-runtime.ts`
- `server/src/services/heartbeat.ts`
- cualquier futuro hook de detección de merge

Comportamientos necesarios:

- detener servicios de tiempo de ejecución en done o merged
- eliminar el checkout aislado en done o merged
- eliminar la rama en merged si la política lo dice
- opcionalmente retener el espacio de trabajo fallido para inspección

## Secuencia recomendada de primera implementación

Para integrar estas ideas sin desestabilizar el sistema, implementar en este orden:

1. Agregar campos de política de proyecto a tipos compartidos, validadores, BD, servicios, rutas y UI de proyecto.
2. Agregar campos de ajuste de espacio de trabajo de ejecución a nivel de issue a tipos compartidos, validadores, BD, servicios, rutas y UI de creación/edición de issue.
3. Refactorizar el latido para computar la política efectiva de espacio de trabajo de ejecución desde issue -> proyecto -> sobrescritura de agente.
4. Cambiar la UI de agente local para que el JSON de espacio de trabajo/tiempo de ejecución se vuelva solo avanzado.
5. Mover el comportamiento predeterminado de servicios de tiempo de ejecución a ajustes de proyecto.
6. Agregar almacenamiento y resolución explícitos de política de PR.
7. Agregar almacenamiento y resolución explícitos de política de limpieza.

## Definición de terminado para este cambio de producto

Este cambio de diseño está completo cuando todo es cierto:

- los ajustes de proyecto son dueños de la política predeterminada de espacios de trabajo
- la creación de issue expone un opt-in/out simple cuando está disponible
- los formularios de agente local ya no requieren JSON crudo de tiempo de ejecución para casos comunes
- el latido resuelve el comportamiento efectivo de espacio de trabajo desde precedencia de proyecto + issue + sobrescritura
- el comportamiento de PR y limpieza se modela como política explícita, no comportamiento de prompt implícito
- el lenguaje de UI distingue el espacio de trabajo de ejecución de los detalles de implementación de git worktree local

## Lo que el código actual ya admite

Paperclip ya tiene la base correcta para un modelo primero de proyecto.

### El espacio de trabajo de proyecto ya es de primera clase

- `project_workspaces` ya existe en `packages/db/src/schema/project_workspaces.ts`
- el tipo compartido `ProjectWorkspace` ya incluye `cwd`, `repoUrl` y `repoRef` en `packages/shared/src/types/project.ts`
- los docs ya declaran que los agentes usan el espacio de trabajo primario del proyecto para tareas con alcance de proyecto en `docs/api/goals-and-projects.md`

### El latido ya resuelve el espacio de trabajo en el orden correcto

La resolución actual de ejecución ya prefiere:

1. espacio de trabajo de proyecto
2. cwd de sesión de tarea previa
3. fallback de home de agente

Ver `server/src/services/heartbeat.ts`.

### El resume de sesión ya es consciente de cwd

Ambos adaptadores de codificación locales tratan la continuidad de sesión como ligada a cwd:

- Codex: `packages/adapters/codex-local/src/server/execute.ts`
- Claude: `packages/adapters/claude-local/src/server/execute.ts`

Eso significa que el punto de inserción limpio es antes de la ejecución del adaptador: resolver primero el cwd final de ejecución, luego dejar que el adaptador se ejecute normalmente.

### La autenticación local generada por el servidor ya existe

Para adaptadores locales generados por el servidor, Paperclip ya inyecta un JWT local de corta vida:

- Creación de JWT: `server/src/services/heartbeat.ts`
- inyección de env del adaptador:
  - `packages/adapters/codex-local/src/server/execute.ts`
  - `packages/adapters/claude-local/src/server/execute.ts`

La ruta manual-local de bootstrap aún es más débil en modo autenticado, pero ese es un problema relacionado de ergonomía de autenticación, no una razón para hacer de los worktrees una invariante central.
## Observaciones de herramientas desde docs de proveedores

Los docs de herramientas enlazados admiten un modelo de lanzamiento primero de proyecto y específico del adaptador.

### Codex

- La app Codex tiene un concepto nativo de worktree para tareas paralelas en repos git
- Codex CLI documenta ejecutarse en un directorio de trabajo elegido y reanudar sesiones desde el directorio de trabajo actual
- Codex CLI no presenta una sola abstracción portable de worktree CLI de primera clase que Paperclip debería replicar directamente

Implicación:

- para `codex_local`, Paperclip usualmente debería crear/seleccionar el checkout por sí mismo y luego lanzar Codex dentro de ese cwd

### Claude

- Claude documenta flujos explícitos de git worktree para sesiones paralelas
- Claude CLI admite `--worktree` / `-w`
- las sesiones de Claude también siguen ligadas al contexto de directorio

Implicación:

- `claude_local` puede opcionalmente usar el `--worktree` nativo
- pero Paperclip aún debería tratar eso como una optimización de adaptador, no el modelo canónico multi-adaptador

## Adaptadores locales vs remotos

Este plan debe tomar en cuenta explícitamente que muchos adaptadores no son locales.

Ejemplos:

- adaptadores CLI locales como `codex_local` y `claude_local`
- agentes de codificación alojados en la nube como agentes cloud de Cursor
- futuros modos de agente alojados de Codex o Claude
- adaptadores sandbox personalizados construidos sobre E2B, Cloudflare o entornos similares

Estos adaptadores no todos comparten las mismas capacidades:

- algunos pueden usar git worktrees del host directamente
- algunos pueden clonar un repo y crear ramas remotamente
- algunos pueden exponer un concepto de espacio de trabajo virtual sin equivalente directo de git worktree
- algunos pueden no permitir ningún estado de sistema de archivos persistente

Por eso, Paperclip debería separar:

- **intención de espacio de trabajo de ejecución**: qué comportamiento de aislamiento/rama/repo queremos
- **realización del adaptador**: cómo un adaptador específico implementa ese comportamiento

### Intención de espacio de trabajo de ejecución

Paperclip debería poder expresar intenciones como:

- usar directamente el espacio de trabajo primario del proyecto
- crear un checkout aislado con alcance de issue
- basar el trabajo en una ref de repo dada
- derivar un nombre de rama desde el issue
- exponer una o más URLs de vista previa o servicio alcanzables si se inician servicios de tiempo de ejecución

### Realización del adaptador

Los adaptadores deberían ser libres de mapear esa intención a su propio entorno:

- adaptador local: crear un git worktree del host y ejecutarse en ese cwd
- adaptador sandbox en la nube: clonar el repo en un sandbox, crear una rama allí, y devolver metadatos del sandbox
- agente de codificación remoto alojado: llamar APIs del proveedor que crean un espacio de trabajo/hilo remoto ligado a la rama/ref solicitada

La restricción importante es que el adaptador reporta de vuelta los metadatos de espacio de trabajo de ejecución realizado en una forma normalizada, incluso si la implementación subyacente no es un git worktree.

## Modelo propuesto

Usar tres capas:

1. `project workspace`
2. `execution workspace`
3. `workspace runtime services`
4. `adapter session`

### 1. Espacio de trabajo de proyecto

Ancla de repo de larga vida.

Ejemplos:

- `./paperclip`
- URL de repo y ref base
- checkout primario para un proyecto

### 2. Espacio de trabajo de ejecución

Checkout de tiempo de ejecución derivado para un issue/ejecución específico.

Ejemplos:

- uso directo del espacio de trabajo primario del proyecto
- git worktree derivado del espacio de trabajo de proyecto
- checkout de sandbox remoto derivado de URL de repo + ref
- checkout personalizado producido por un script específico del adaptador

### 3. Sesión de adaptador

Procesos de larga vida o semi-larga vida asociados con un espacio de trabajo.

Ejemplos:

- servidor web local
- worker en segundo plano
- URL de vista previa de sandbox
- observador de pruebas
- proceso de túnel

Estos no son específicos de Paperclip. Son una propiedad común de trabajar en un espacio de trabajo de dev, sea local o remoto.

### 4. Sesión de adaptador

Continuidad de conversación y estado de tiempo de ejecución de Claude/Codex, que sigue siendo consciente de cwd y debería seguir el espacio de trabajo de ejecución en lugar de definirlo.
## Superficie de configuración recomendada

Introducir una estrategia genérica de espacio de trabajo de ejecución en la configuración del adaptador.

Forma de ejemplo:

```json
{
  "workspaceStrategy": {
    "type": "project_primary"
  }
}
```

O:

```json
{
  "workspaceStrategy": {
    "type": "git_worktree",
    "baseRef": "origin/main",
    "branchTemplate": "{{issue.identifier}}-{{slug}}",
    "worktreeParentDir": ".paperclip/instances/default/worktrees/projects/{{project.id}}",
    "cleanupPolicy": "on_merged",
    "startDevServer": true,
    "devServerCommand": "pnpm dev",
    "devServerReadyUrlTemplate": "http://127.0.0.1:{{port}}/api/health"
  }
}
```

Los adaptadores remotos pueden usar en su lugar formas como:

```json
{
  "workspaceStrategy": {
    "type": "isolated_checkout",
    "provider": "adapter_managed",
    "baseRef": "origin/main",
    "branchTemplate": "{{issue.identifier}}-{{slug}}"
  }
}
```

El punto importante es que `git_worktree` es un valor de estrategia para adaptadores que pueden usarlo, no el contrato universal.

### Servicios de tiempo de ejecución de espacio de trabajo

No modelar esto como un flag `devServer` específico de Paperclip.

En su lugar, modelarlo como una lista genérica de servicios de tiempo de ejecución adjuntos al espacio de trabajo.

Forma de ejemplo:

```json
{
  "workspaceRuntime": {
    "services": [
      {
        "name": "web",
        "description": "Primary app server for this workspace",
        "command": "pnpm dev",
        "cwd": ".",
        "env": {
          "DATABASE_URL": "${workspace.env.DATABASE_URL}"
        },
        "port": {
          "type": "auto"
        },
        "readiness": {
          "type": "http",
          "urlTemplate": "http://127.0.0.1:${port}/api/health"
        },
        "expose": {
          "type": "url",
          "urlTemplate": "http://127.0.0.1:${port}"
        },
        "reuseScope": "project_workspace",
        "lifecycle": "shared",
        "stopPolicy": {
          "type": "idle_timeout",
          "idleSeconds": 1800
        }
      }
    ]
  }
}
```

Este contrato es intencionalmente genérico:

- `command` puede iniciar cualquier proceso adjunto al espacio de trabajo, no solo un servidor web
- la reutilización de base de datos se maneja a través de inyección de env/configuración, no un caso especial específico de producto
- los adaptadores locales y remotos pueden realizar la misma intención de servicio de manera diferente

### Intención de servicio vs realización de servicio

Paperclip debería distinguir entre:

- **intención de servicio**: qué tipo de tiempo de ejecución compañero quiere el espacio de trabajo
- **realización de servicio**: cómo un adaptador local o remoto realmente lo inicia y expone

Ejemplos:

- adaptador local:
  - inicia `pnpm dev`
  - asigna un puerto libre del host
  - hace health-check a una URL localhost
  - reporta `{ pid, port, url }`
- adaptador sandbox en la nube:
  - inicia un proceso de vista previa dentro del sandbox
  - recibe una URL de vista previa del proveedor
  - reporta `{ sandboxId, previewUrl }`
- agente de codificación remoto alojado:
  - puede pedir al proveedor que cree un entorno de vista previa
  - reporta metadatos de espacio de trabajo/servicio nativos del proveedor

Paperclip debería normalizar los metadatos reportados sin requerir que todo adaptador parezca un proceso local del host.

Mantener posibles las sobrescrituras a nivel de issue a través de la forma existente `assigneeAdapterOverrides` en `packages/shared/src/types/issue.ts`.
## Responsabilidades por capa

### Núcleo de Paperclip

El núcleo de Paperclip debería:

- resolver el espacio de trabajo de proyecto base para el issue
- resolver o solicitar un espacio de trabajo de ejecución
- resolver o solicitar servicios de tiempo de ejecución de espacio de trabajo cuando están configurados
- inyectar metadatos de espacio de trabajo de ejecución en el contexto de ejecución
- persistir suficientes metadatos para visibilidad de tablero y limpieza
- gestionar hooks de ciclo de vida alrededor de inicio/fin de ejecución donde se necesite

El núcleo de Paperclip no debería:

- requerir worktrees para todos los agentes
- asumir que todo adaptador es local y respaldado por git
- asumir que todo servicio de tiempo de ejecución es un proceso localhost con un PID
- codificar prompts de worktree específicos de herramienta como comportamiento central de producto

### Ayudante compartido de tiempo de ejecución local

Un ayudante compartido del lado del servidor debería manejar la mecánica git local:

- validar la raíz del repo
- crear/seleccionar rama
- crear/seleccionar git worktree
- asignar un puerto libre
- opcionalmente iniciar y rastrear un servidor de dev
- devolver `{ cwd, branchName, url }`

Este ayudante puede ser reutilizado por:

- `codex_local`
- `claude_local`
- futuros adaptadores locales como equivalentes de Cursor/OpenCode

Este ayudante es intencionalmente solo para adaptadores locales. Los adaptadores remotos no deberían forzarse a través de un ayudante git local del host.

### Gestor compartido de servicios de tiempo de ejecución

Además del ayudante git local, Paperclip debería definir un contrato genérico de gestor de servicios de tiempo de ejecución.

Su trabajo es:

- decidir si un servicio configurado debería reutilizarse o iniciarse fresco
- asignar puertos locales cuando se necesite
- iniciar y monitorear procesos locales cuando la realización de adaptador/tiempo de ejecución es local del host
- registrar metadatos de servicio normalizados para realizaciones remotas
- ejecutar chequeos de readiness
- exponer URLs y estado de servicio al tablero
- aplicar política de apagado

Este gestor no debería estar codificado rígidamente a "servidores de dev". Debería funcionar para cualquier proceso compañero de espacio de trabajo de larga vida.

### Adaptador

El adaptador debería:

- aceptar el cwd de ejecución resuelto
- o aceptar la intención estructurada de espacio de trabajo de ejecución cuando no hay cwd de host disponible
- aceptar la intención estructurada de servicios de tiempo de ejecución de espacio de trabajo cuando la orquestación de servicios se delega al adaptador
- lanzar su herramienta con flags específicos del adaptador
- mantener su propia semántica de continuidad de sesión

Por ejemplo:

- `codex_local`: ejecutarse dentro de cwd, probablemente con `--cd` o cwd de proceso
- `claude_local`: ejecutarse dentro de cwd, opcionalmente usar `--worktree` cuando ayude
- adaptador sandbox remoto: crear su propio espacio de trabajo aislado desde la intención de repo/ref/rama y reportar de vuelta a Paperclip los metadatos de espacio de trabajo remoto realizado

Para servicios de tiempo de ejecución:

- adaptador local o gestor de host compartido: iniciar el proceso local y devolver metadatos locales del host
- adaptador remoto: crear o reutilizar la vista previa/servicio remoto y devolver metadatos remotos normalizados

## Adiciones mínimas de modelo de datos

No crear aún una tabla `worktrees` completamente de primera clase.

Empezar más pequeño registrando metadatos derivados de espacio de trabajo de ejecución en ejecuciones, issues, o ambos.

Campos sugeridos a introducir:

- `executionWorkspaceStrategy`
- `executionWorkspaceCwd`
- `executionBranchName`
- `executionWorkspaceStatus`
- `executionServiceRefs`
- `executionCleanupStatus`

Estos pueden vivir primero en `heartbeat_runs.context_snapshot` o metadatos de ejecución adyacentes, con un movimiento opcional posterior a una tabla dedicada si la UI y los flujos de trabajo de limpieza lo justifican.

Para servicios de tiempo de ejecución específicamente, Paperclip eventualmente debería rastrear campos normalizados como:

- `serviceName`
- `serviceKind`
- `scopeType`
- `scopeId`
- `status`
- `command`
- `cwd`
- `envFingerprint`
- `port`
- `url`
- `provider`
- `providerRef`
- `startedByRunId`
- `ownerAgentId`
- `lastUsedAt`
- `stopPolicy`
- `healthStatus`

La primera implementación puede mantener esto en metadatos de ejecución si se necesita, pero la forma de largo plazo es un registro genérico de servicios de tiempo de ejecución en lugar de campos únicos de URL de servidor.

## Plan de implementación concreto

## Fase 1: Definir contratos compartidos

1. Introducir un contrato compartido de estrategia de espacio de trabajo de ejecución en `packages/shared`.
2. Agregar soporte de esquema de configuración de adaptador para:
   - `workspaceStrategy.type`
   - `baseRef`
   - `branchTemplate`
   - `worktreeParentDir`
   - `cleanupPolicy`
   - ajustes opcionales de servicios de tiempo de ejecución de espacio de trabajo
3. Mantener el flag existente `useProjectWorkspace` funcionando como un control de compatibilidad de nivel más bajo.
4. Distinguir campos de realización local de campos de intención genéricos para que los adaptadores remotos no se vean forzados a consumir valores de cwd del host.
5. Definir un contrato genérico `workspaceRuntime.services[]` con:
   - nombre de servicio
   - comando o intención gestionada por proveedor
   - sobrescrituras de env
   - chequeos de readiness
   - metadatos de exposición
   - alcance de reutilización
   - ciclo de vida
   - política de detención

Aceptación:

- la configuración del adaptador puede expresar `project_primary` y `git_worktree`
- la configuración sigue siendo opcional y compatible hacia atrás
- los servicios de tiempo de ejecución se expresan genéricamente, no como flags de servidor de dev solo de Paperclip

## Fase 2: Resolver espacio de trabajo de ejecución en el latido

1. Extender la resolución de espacio de trabajo del latido para que pueda devolver un resultado de espacio de trabajo de ejecución más rico.
2. Mantener el orden actual de fallback, pero distinguir:
   - espacio de trabajo de proyecto base
   - espacio de trabajo de ejecución derivado
3. Inyectar detalles de espacio de trabajo de ejecución resueltos en `context.paperclipWorkspace` para adaptadores locales y en un payload genérico de intención de espacio de trabajo de ejecución para adaptadores que necesitan realización remota estructurada.
4. Resolver la intención de servicios de tiempo de ejecución configurados junto al espacio de trabajo de ejecución para que el adaptador o gestor de host reciba un contrato completo de tiempo de ejecución de espacio de trabajo.

Puntos de contacto principales:

- `server/src/services/heartbeat.ts`

Aceptación:

- las ejecuciones siguen funcionando sin cambios cuando no hay estrategia configurada
- el contexto resuelto indica claramente qué estrategia produjo el cwd

## Fase 3: Agregar ayudante compartido de espacio de trabajo git local

1. Crear un módulo ayudante del lado del servidor para estrategias de checkout de repo local.
2. Implementar la estrategia `git_worktree`:
   - validar el repo git en el cwd del espacio de trabajo base
   - derivar el nombre de rama desde el issue
   - crear o reutilizar una ruta de worktree
   - detectar colisiones limpiamente
3. Devolver metadatos estructurados:
   - cwd final
   - nombre de rama
   - ruta de worktree
   - raíz del repo

Aceptación:

- el ayudante es reutilizable fuera de un solo adaptador
- la creación de worktree es determinista para un issue/configuración dado
- los adaptadores remotos no se ven afectados por este ayudante

## Fase 4: Ciclo de vida opcional de servidor de dev

Renombrar esta fase conceptualmente a **ciclo de vida de servicios de tiempo de ejecución de espacio de trabajo**.

1. Agregar inicio opcional de servicios de tiempo de ejecución en la creación de espacio de trabajo de ejecución.
2. Admitir ambos:
   - servicios locales gestionados por el host
   - servicios remotos gestionados por el adaptador
3. Para servicios locales:
   - asignar un puerto libre antes del lanzamiento cuando se requiera
   - iniciar el comando configurado en el cwd correcto
   - ejecutar chequeos de readiness
   - registrar los metadatos realizados
4. Para servicios remotos:
   - dejar que el adaptador devuelva metadatos de servicio normalizados después del aprovisionamiento
   - no asumir PID ni acceso localhost
5. Publicar o actualizar metadatos visibles del issue con las URLs y etiquetas de servicio.

Aceptación:

- el inicio de servicios de tiempo de ejecución sigue siendo opt-in
- las fallas producen registros de ejecución accionables y comentarios de issue
- la misma BD embebida / instancia de Paperclip puede reutilizarse a través de inyección de env/configuración cuando sea apropiado
- las realizaciones de servicios remotos se representan sin pretender ser procesos locales

## Fase 5: Reutilización, seguimiento y apagado de servicios de tiempo de ejecución

1. Introducir un registro genérico de servicios de tiempo de ejecución.
2. Cada servicio debería rastrearse con:
   - `scopeType`: `project_workspace | execution_workspace | run | agent`
   - `scopeId`
   - `serviceName`
   - `status`
   - `command` o metadatos de proveedor
   - `cwd` si es local
   - `envFingerprint`
   - `port`
   - `url`
   - `provider` / `providerRef`
   - `ownerAgentId`
   - `startedByRunId`
   - `lastUsedAt`
   - `stopPolicy`
3. Introducir un `reuseKey` determinista, por ejemplo:
   - `projectWorkspaceId + serviceName + envFingerprint`
4. Política de reutilización:
   - si existe un servicio saludable con la misma clave de reutilización, adjuntarse a él
   - de otro modo iniciar un nuevo servicio
5. Distinguir clases de ciclo de vida:
   - `shared`: reutilizable entre ejecuciones, usualmente con alcance de `project_workspace`
   - `ephemeral`: ligado a `execution_workspace` o `run`
6. Política de apagado:
   - alcance `run`: detener cuando termina la ejecución
   - alcance `execution_workspace`: detener cuando el espacio de trabajo se limpia
   - alcance `project_workspace`: detener en timeout de inactividad, detención explícita, o eliminación de espacio de trabajo
   - alcance `agent`: detener cuando la propiedad se transfiere o la política del agente lo requiere
7. Política de salud:
   - chequeo de readiness al inicio
   - chequeos de liveness periódicos o bajo demanda
   - marcar no saludable antes de matar cuando sea posible

Aceptación:

- Paperclip puede decidir si reutilizar o iniciar un servicio fresco deterministamente
- los servicios locales y remotos comparten un modelo de seguimiento normalizado
- el apagado es impulsado por política en lugar de implícito
- el tablero puede entender por qué un servicio se mantuvo, reutilizó o detuvo

## Fase 6: Integración de adaptador

1. Actualizar `codex_local` para consumir el cwd de espacio de trabajo de ejecución resuelto.
2. Actualizar `claude_local` para consumir el cwd de espacio de trabajo de ejecución resuelto.
3. Definir un contrato normalizado de adaptador para adaptadores remotos que reciben intención de espacio de trabajo de ejecución en lugar de un cwd local del host.
4. Opcionalmente permitir rutas de optimización específicas de Claude usando el `--worktree` nativo, pero mantener la estrategia compartida de checkout del lado del servidor como canónica para adaptadores locales.
5. Definir cómo los adaptadores devuelven realizaciones de servicios de tiempo de ejecución:
   - referencia de servicio local gestionada por el host
   - referencia de servicio remota gestionada por el proveedor

Aceptación:

- el comportamiento del adaptador sigue sin cambios cuando la estrategia está ausente
- el resume de sesión sigue siendo seguro respecto a cwd
- ningún adaptador es forzado a comportamiento git
- los adaptadores remotos pueden implementar aislamiento equivalente sin pretender ser worktrees locales
- los adaptadores pueden reportar URLs de servicio y metadatos de ciclo de vida en una forma normalizada

## Fase 7: Visibilidad y comentarios de issue

1. Exponer metadatos de espacio de trabajo de ejecución en detalles de ejecución y opcionalmente en UI de detalle de issue:
   - estrategia
   - cwd
   - rama
   - refs de servicios de tiempo de ejecución
2. Exponer servicios de tiempo de ejecución con:
   - nombre de servicio
   - estado
   - URL
   - alcance
   - propietario
   - salud
3. Agregar salida estándar de comentario de issue cuando inicia una ejecución respaldada por worktree o aislada remotamente:
   - rama
   - ruta de worktree
   - URLs de servicio si están presentes

Aceptación:

- el tablero puede ver dónde está trabajando el agente
- el tablero puede ver qué servicios de tiempo de ejecución existen para ese espacio de trabajo
- el hilo del issue se convierte en la superficie de traspaso para nombres de rama y URLs alcanzables

## Fase 8: Políticas de limpieza

1. Implementar políticas de limpieza:
   - `manual`
   - `on_done`
   - `on_merged`
2. Para limpieza de worktree:
   - detener servicios de tiempo de ejecución rastreados si son propiedad del ciclo de vida del espacio de trabajo
   - eliminar el worktree
   - opcionalmente eliminar la rama local después del merge
3. Empezar con valores predeterminados conservadores:
   - no auto-eliminar nada a menos que esté configurado explícitamente

Aceptación:

- la limpieza es segura y reversible por defecto
- la limpieza basada en merge puede introducirse después de que el ciclo de vida básico sea estable

## Fase 9: Seguimiento de ergonomía de autenticación

Esto está relacionado, pero debería rastrearse por separado del trabajo de estrategia de espacios de trabajo.

Mejora necesaria:

- hacer más fácil el bootstrap manual de agente local en modo autenticado/privado, para que los operadores puedan convertirse en `codexcoder` o `claudecoder` localmente sin depender de un contexto CLI de autenticación de navegador ya establecido

Esto probablemente debería tomar la forma de un flujo de bootstrap de operador local, no un debilitamiento de los límites de autenticación de tiempo de ejecución.

## Estrategia de despliegue

1. Enviar primero el contrato de configuración compartido y los cambios de latido compatibles con no-op.
2. Pilotar solo con `codexcoder` y `claudecoder`.
3. Probar primero contra flujos de trabajo Paperclip-sobre-Paperclip.
4. Mantener `project_primary` como valor predeterminado para todos los agentes existentes.
5. Agregar exposición de UI y limpieza solo después de que la ruta central de tiempo de ejecución sea estable.

## Criterios de aceptación

1. El comportamiento de worktree es opcional, no un requisito global.
2. Los espacios de trabajo de proyecto siguen siendo el ancla canónica de repo.
3. Los agentes de codificación locales pueden optar por espacios de trabajo de ejecución aislados con alcance de issue.
4. El mismo modelo funciona tanto para `codex_local` como para `claude_local` sin forzar una abstracción específica de herramienta en el núcleo.
5. Los adaptadores remotos pueden consumir la misma intención de espacio de trabajo de ejecución sin requerir acceso al sistema de archivos local del host.
6. La continuidad de sesión sigue siendo correcta porque cada adaptador reanuda relativo a su espacio de trabajo de ejecución realizado.
7. Los servicios de tiempo de ejecución de espacio de trabajo se modelan genéricamente, no como toggles de servidor de dev específicos de Paperclip.
8. Los usuarios del tablero pueden ver información de rama/ruta/URL para ejecuciones respaldadas por worktree o aisladas remotamente.
9. La reutilización y el apagado de servicios son deterministas e impulsados por política.
10. La limpieza es conservadora por defecto.

## Alcance inicial recomendado

Para mantener esto manejable, la primera implementación debería:

- admitir solo adaptadores de codificación locales
- admitir solo `project_primary` y `git_worktree`
- evitar una nueva tabla de base de datos dedicada para worktrees
- empezar con una sola ruta de implementación de servicio de tiempo de ejecución gestionada por el host
- posponer la automatización de limpieza impulsada por merge hasta después de que inicio/ejecución/visibilidad básicos estén probados

Eso es suficiente para validar la forma local de producto sin congelar prematuramente la abstracción equivocada.

Expansión de seguimiento después de esa validación:

- definir el contrato de adaptador remoto para checkouts aislados gestionados por adaptador
- agregar una ruta de implementación de adaptador en la nube/sandbox
- normalizar los metadatos realizados para que los espacios de trabajo de ejecución locales y remotos aparezcan similarmente en la UI
- expandir el registro de servicios de tiempo de ejecución de servicios locales gestionados por el host a servicios remotos gestionados por el adaptador
