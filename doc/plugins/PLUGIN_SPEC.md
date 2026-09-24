# Especificación del sistema de plugins de Paperclip

Estado: especificación completa propuesta para el sistema de plugins post-V1

Este documento es la especificación completa de la arquitectura de plugins y extensiones de Paperclip.
Amplía las breves notas sobre plugins de [doc/SPEC.md](../SPEC.md) y debe leerse junto con el análisis comparativo en [doc/plugins/ideas-from-opencode.md](./ideas-from-opencode.md).

Esto no forma parte del contrato de implementación de V1 en [doc/SPEC-implementation.md](../SPEC-implementation.md).
Es la arquitectura objetivo completa para el sistema de plugins que debe seguir a V1.

## Advertencias de la implementación actual

El código de este repo ahora incluye un runtime de plugins temprano y una UI de administración, pero aún no ofrece el modelo de despliegue completo descrito en esta especificación.

Hoy, el modelo de despliegue práctico es:

- single-tenant
- self-hosted
- de un solo nodo o con persistencia en el sistema de archivos

Limitaciones actuales a tener en cuenta:

- Los bundles de UI de plugins actualmente se ejecutan como JavaScript del mismo origen dentro de la app principal de Paperclip. Trata la UI de los plugins como código confiable, no como un límite de capacidad de frontend con sandbox.
- Las capacidades del manifiesto actualmente controlan las llamadas RPC del host en el lado del worker. No impiden que el código de UI del plugin llame directamente a las APIs HTTP ordinarias de Paperclip.
- Las instalaciones del runtime asumen un sistema de archivos local escribible para el directorio del paquete del plugin y el directorio de datos del plugin.
- Las instalaciones npm del runtime asumen que `npm` está disponible en el entorno de ejecución y que el host puede alcanzar el registro de paquetes configurado.
- Los paquetes npm publicados son el artefacto de instalación previsto para los plugins desplegados.
- Los plugins de ejemplo del repo bajo `packages/plugins/examples/` son comodidades de desarrollo. Funcionan desde un checkout del código fuente y no debe asumirse que existen en un build publicado genérico a menos que se incluyan explícitamente en ese build.
- La instalación dinámica de plugins aún no está lista para la nube en despliegues escalados horizontalmente o efímeros. Aún no hay un almacén de artefactos compartido, coordinación de instalación ni capa de distribución entre nodos.
- El runtime actual aún no incluye un kit real de componentes de UI para plugins provisto por el host, y no admite la subida/lectura de assets de plugins. Trátalos como ideas de alcance futuro en esta especificación, no como promesas de implementación actual.

En la práctica, esto significa que la implementación actual es adecuada para el desarrollo local y despliegues self-hosted persistentes, pero aún no para la distribución de plugins en la nube con múltiples instancias.

## 1. Alcance

Esta especificación cubre:

- empaquetado e instalación de plugins
- modelo de runtime
- modelo de confianza
- sistema de capacidades
- superficies de extensión de UI
- UI de ajustes de plugins
- contribuciones de herramientas de agente
- superficies de eventos, trabajos y webhooks
- comunicación entre plugins
- enfoque de tooling local para plugins de workspace
- persistencia en Postgres para extensiones
- desinstalación y ciclo de vida de datos
- observabilidad de plugins
- desarrollo y pruebas de plugins
- flujos de trabajo del operador
- ciclo de vida de plugins en caliente (sin reiniciar el servidor)
- versionado del SDK y reglas de compatibilidad

Esta especificación no cubre:

- un marketplace público
- multi-tenancy en la nube/SaaS
- migraciones arbitrarias de esquema de terceros en la primera versión del plugin
- UI de plugins con sandbox en iframe en la primera versión del plugin (los plugins se renderizan como módulos ES en slots de extensión del host)

## 2. Supuestos centrales

El diseño de plugins de Paperclip se basa en los siguientes supuestos:

1. Paperclip es single-tenant y self-hosted.
2. La instalación de plugins es global para la instancia.
3. Las "empresas" siguen siendo objetos de negocio centrales de Paperclip, pero no son límites de confianza de los plugins.
4. La gobernanza del panel, las puertas de aprobación, los topes duros de presupuesto y las invariantes centrales de tareas siguen siendo propiedad del núcleo de Paperclip.
5. Los proyectos ya tienen un modelo de workspace real vía `project_workspaces`, y los plugins locales/de runtime deben construirse sobre eso en lugar de inventar una abstracción de workspace separada.

## 3. Objetivos

El sistema de plugins debe:

1. Permitir a los operadores instalar plugins globales para toda la instancia.
2. Permitir a los plugins agregar capacidades importantes sin editar el núcleo de Paperclip.
3. Mantener intactas la gobernanza central y la auditoría.
4. Admitir tanto plugins locales/de runtime como conectores SaaS externos.
5. Admitir futuras categorías de plugins como:
   - nuevos adaptadores de agente
   - seguimiento de ingresos
   - base de conocimiento
   - sincronización con issue trackers
   - métricas/paneles
   - tooling de archivos/proyectos
6. Usar contratos simples, explícitos y tipados.
7. Mantener los fallos aislados para que un plugin no tumbe toda la instancia.

## 4. No objetivos

El primer sistema de plugins no debe:

1. Permitir que plugins arbitrarios sobrescriban rutas centrales o invariantes centrales.
2. Permitir que plugins arbitrarios muten la lógica de aprobación, autenticación, checkout de issues o aplicación de presupuesto.
3. Permitir que plugins arbitrarios de terceros ejecuten migraciones libres de la BD.
4. Depender de carpetas de plugins locales al proyecto como `.paperclip/plugins`.
5. Depender de comportamiento automático de instalación y ejecución al arrancar el servidor desde archivos de configuración arbitrarios.

## 5. Terminología

### 5.1 Instancia

El único despliegue de Paperclip que un operador instala y controla.

### 5.2 Empresa

Un objeto de negocio de primera clase de Paperclip dentro de la instancia.

### 5.3 Workspace de proyecto

Un workspace adjunto a un proyecto a través de `project_workspaces`.
Los plugins resuelven rutas de workspace desde este modelo para localizar directorios locales para operaciones de archivos, terminal, git y procesos.

### 5.4 Módulo de plataforma

Una extensión confiable en proceso cargada directamente por el núcleo de Paperclip.

Ejemplos:

- adaptadores de agente
- proveedores de almacenamiento
- proveedores de secretos
- backends de registros de ejecución

### 5.5 Plugin

Un paquete de extensión instalable para toda la instancia, cargado a través del runtime de plugins de Paperclip.

Ejemplos:

- Sincronización con Linear
- Sincronización con GitHub Issues
- Widgets de Grafana
- Sincronización de ingresos con Stripe
- explorador de archivos
- terminal
- flujo de trabajo de git

### 5.6 Worker de plugin

El proceso de runtime usado para un plugin.
En esta especificación, los plugins de terceros se ejecutan fuera de proceso por defecto.

### 5.7 Capacidad

Un permiso nombrado que el host otorga a un plugin.
Los plugins solo pueden llamar a APIs del host cubiertas por las capacidades otorgadas.

## 6. Clases de extensión

Paperclip tiene dos clases de extensión.

## 6.1 Módulos de plataforma

Los módulos de plataforma son:

- confiables
- en proceso
- integrados al host
- de bajo nivel

Usan registros explícitos, no el protocolo general de workers de plugins.

Superficies de módulos de plataforma:

- `registerAgentAdapter()`
- `registerStorageProvider()`
- `registerSecretProvider()`
- `registerRunLogStore()`

Los módulos de plataforma son el lugar adecuado para:

- nuevos paquetes de adaptadores de agente
- nuevos backends de almacenamiento
- nuevos backends de secretos
- otros sistemas internos del host que necesitan integración directa con el proceso o la BD

## 6.2 Plugins

Los plugins son:

- instalados globalmente por instancia
- cargados a través del runtime de plugins
- aditivos
- controlados por capacidades
- aislados del núcleo vía un SDK estable y un protocolo de host

Categorías de plugins:

- `connector`
- `workspace`
- `automation`
- `ui`

Un plugin puede declarar más de una categoría.

## 7. Workspaces de proyecto

Paperclip ya tiene un modelo de workspace concreto:

- los proyectos exponen `workspaces`
- los proyectos exponen `primaryWorkspace`
- la base de datos contiene `project_workspaces`
- las rutas de proyecto ya gestionan workspaces

Los plugins que necesitan tooling local (exploración de archivos, git, terminales, seguimiento de procesos) pueden resolver rutas de workspace a través de las APIs de workspace de proyecto y luego operar en el sistema de archivos, lanzar procesos y ejecutar comandos git directamente. El host no envuelve estas operaciones: los plugins son dueños de sus propias implementaciones.

## 8. Modelo de instalación

La instalación de plugins es global y la realiza el operador.

No hay tabla de instalación por empresa ni interruptor de activar/desactivar por empresa.

Si un plugin necesita mapeos específicos de objetos de negocio, estos se almacenan como configuración del plugin o estado del plugin.

Ejemplos:

- una instalación global del plugin de Linear
- mapeos de la empresa A al equipo X de Linear y de la empresa B al equipo Y de Linear
- una instalación global del plugin de git
- estado de workspace por proyecto almacenado bajo `project_workspace`

## 8.1 Disposición en disco

Los plugins viven bajo el directorio de instancia de Paperclip.

Disposición sugerida:

- `~/.paperclip/instances/default/plugins/package.json`
- `~/.paperclip/instances/default/plugins/node_modules/`
- `~/.paperclip/instances/default/plugins/.cache/`
- `~/.paperclip/instances/default/data/plugins/<plugin-id>/`

El directorio de instalación del paquete y el directorio de datos del plugin están separados.

Este modelo en disco es la razón por la que la implementación actual espera un sistema de archivos de host persistente y escribible. La replicación de artefactos segura para la nube es trabajo futuro.

## 8.2 Comandos del operador

Paperclip debería agregar comandos CLI:

- `pnpm paperclipai plugin list`
- `pnpm paperclipai plugin install <package[@version]>`
- `pnpm paperclipai plugin uninstall <plugin-id>`
- `pnpm paperclipai plugin upgrade <plugin-id> [version]`
- `pnpm paperclipai plugin doctor <plugin-id>`

Estos comandos son operaciones a nivel de instancia.

## 8.3 Proceso de instalación

El proceso de instalación es:

1. Resolver el paquete npm y la versión.
2. Instalar en el directorio de plugins de la instancia.
3. Leer y validar el manifiesto del plugin.
4. Rechazar versiones incompatibles de la API de plugins.
5. Mostrar al operador las capacidades solicitadas.
6. Persistir el registro de instalación en Postgres.
7. Iniciar el worker del plugin y ejecutar salud/validación.
8. Marcar el plugin como `ready` o `error`.

Para la implementación actual, este flujo de instalación debe leerse como un flujo de trabajo de un solo host. Una instalación exitosa escribe paquetes en el host local, y otros nodos de la app no recibirán ese plugin automáticamente a menos que se agregue un futuro mecanismo de distribución compartida.

## 9. Orden de carga y precedencia

El orden de carga debe ser determinista.

1. módulos centrales de plataforma
2. plugins first-party integrados
3. plugins instalados ordenados por:
   - orden explícito configurado por el operador si existe
   - de lo contrario, el `id` del manifiesto

Reglas:

- las contribuciones de plugins son aditivas por defecto
- los plugins no pueden sobrescribir rutas centrales ni acciones centrales por colisión de nombres
- los IDs de slot de UI se nombran automáticamente con el espacio de nombres del ID del plugin (p. ej. `@paperclip/plugin-linear:sync-health-widget`), por lo que las colisiones entre plugins son estructuralmente imposibles
- si un solo plugin declara IDs de slot duplicados dentro de su propio manifiesto, el host debe rechazarlo al momento de la instalación

## 10. Contrato del paquete

Cada paquete de plugin debe exportar un manifiesto, un entrypoint de worker y opcionalmente un bundle de UI.

Disposición sugerida del paquete:

- `dist/manifest.js`
- `dist/worker.js`
- `dist/ui/` (opcional, contiene el bundle frontend del plugin)

Claves sugeridas de `package.json`:

```json
{
  "name": "@paperclip/plugin-linear",
  "version": "0.1.0",
  "paperclipPlugin": {
    "manifest": "./dist/manifest.js",
    "worker": "./dist/worker.js",
    "ui": "./dist/ui/"
  }
}
```

## 10.1 Forma del manifiesto

Forma normativa del manifiesto:

```ts
export interface PaperclipPluginManifestV1 {
  id: string;
  apiVersion: 1;
  version: string;
  displayName: string;
  description: string;
  categories: Array<"connector" | "workspace" | "automation" | "ui">;
  minimumPaperclipVersion?: string;
  capabilities: string[];
  entrypoints: {
    worker: string;
    ui?: string;
  };
  instanceConfigSchema?: JsonSchema;
  jobs?: PluginJobDeclaration[];
  webhooks?: PluginWebhookDeclaration[];
  tools?: Array<{
    name: string;
    displayName: string;
    description: string;
    parametersSchema: JsonSchema;
  }>;
  ui?: {
    slots: Array<{
      type: "page" | "detailTab" | "dashboardWidget" | "sidebar" | "settingsPage";
      id: string;
      displayName: string;
      /** Which export name in the UI bundle provides this component */
      exportName: string;
      /** For detailTab: which entity types this tab appears on */
      entityTypes?: Array<"project" | "issue" | "agent" | "goal" | "run">;
    }>;
  };
}
```

Reglas:

- `id` debe ser globalmente único
- `id` normalmente debe ser igual al nombre del paquete npm
- `apiVersion` debe coincidir con la versión de la API de plugins admitida por el host
- `capabilities` debe ser estático y visible al momento de la instalación
- el esquema de configuración debe ser compatible con JSON Schema
- `entrypoints.ui` apunta al directorio que contiene el bundle de UI construido
- `ui.slots` declara qué slots de extensión llena el plugin, para que el host sepa qué montar sin cargar el bundle de forma anticipada; cada slot referencia un `exportName` del bundle de UI

## 11. Herramientas de agente

Los plugins pueden contribuir herramientas que los agentes de Paperclip pueden usar durante las ejecuciones.

### 11.1 Declaración de herramientas

Los plugins declaran herramientas en su manifiesto:

```ts
tools?: Array<{
  name: string;
  displayName: string;
  description: string;
  parametersSchema: JsonSchema;
}>;
```

Los nombres de herramientas se nombran automáticamente con el espacio de nombres del ID del plugin en runtime (p. ej. `linear:search-issues`), por lo que los plugins no pueden ocultar herramientas centrales ni las herramientas de otros plugins.

### 11.2 Ejecución de herramientas

Cuando un agente invoca una herramienta de plugin durante una ejecución, el host enruta la llamada al worker del plugin vía un método RPC `executeTool`:

- `executeTool(input)` — recibe el nombre de la herramienta, los parámetros parseados y el contexto de ejecución (ID de agente, ID de ejecución, ID de empresa, ID de proyecto)

El worker ejecuta la lógica de la herramienta y devuelve un resultado tipado. El host aplica las puertas de capacidad: un plugin debe declarar `agent.tools.register` para contribuir herramientas, y las herramientas individuales pueden requerir capacidades adicionales (p. ej. `http.outbound` para herramientas que llaman a APIs externas).

### 11.3 Disponibilidad de herramientas

Por defecto, las herramientas de plugin están disponibles para todos los agentes. El operador puede restringir la disponibilidad de herramientas por agente o por proyecto a través de la configuración del plugin.

Las herramientas de plugin aparecen en la lista de herramientas del agente junto a las herramientas centrales, pero se distinguen visualmente en la UI como contribuidas por plugins.

### 11.4 Restricciones

- Las herramientas de plugin no deben sobrescribir ni ocultar herramientas centrales por nombre.
- Las herramientas de plugin deben ser idempotentes donde sea posible.
- La ejecución de herramientas está sujeta a los mismos límites de timeout y recursos que otras llamadas al worker de plugins.
- Los resultados de herramientas se incluyen en los registros de ejecución.

## 12. Modelo de runtime

## 12.1 Modelo de proceso

Los plugins de terceros se ejecutan fuera de proceso por defecto.

Runtime por defecto:

- El servidor de Paperclip inicia un proceso worker por plugin instalado
- el proceso worker es un proceso Node
- el host y el worker se comunican por JSON-RPC sobre stdio

Este diseño provee:

- aislamiento de fallos
- límites de logging más claros
- límites de recursos más fáciles
- un límite de confianza más limpio que la ejecución arbitraria en proceso

## 12.2 Responsabilidades del host

El host es responsable de:

- instalación de paquetes
- validación de manifiesto
- aplicación de capacidades
- supervisión de procesos
- programación de trabajos
- enrutamiento de webhooks
- escrituras del registro de actividad
- resolución de secretos
- registro de rutas de UI

## 12.3 Responsabilidades del worker

El worker del plugin es responsable de:

- validar su propia configuración
- manejar eventos de dominio
- manejar trabajos programados
- manejar webhooks
- servir datos y manejar acciones para la propia UI del plugin vía `getData` y `performAction`
- invocar servicios del host a través del SDK
- reportar información de salud

## 12.4 Política de fallos

Si un worker falla:

- marcar el estado del plugin como `error`
- mostrar el error en la UI de salud del plugin
- mantener el resto de la instancia funcionando
- reintentar el arranque con backoff limitado
- no tumbar otros plugins ni servicios centrales

## 12.5 Política de apagado ordenado

Cuando el host necesita detener un worker de plugin (para actualización, desinstalación o apagado de la instancia):

1. El host envía `shutdown()` al worker.
2. El worker tiene 10 segundos para terminar el trabajo en curso y salir limpiamente.
3. Si el worker no sale dentro del plazo, el host envía SIGTERM.
4. Si el worker no sale dentro de 5 segundos después de SIGTERM, el host envía SIGKILL.
5. Cualquier ejecución de trabajo en curso se marca como `cancelled` con una nota que indica apagado forzado.
6. Cualquier llamada en curso a `getData` o `performAction` devuelve un error al puente.

El plazo de apagado debería ser configurable por plugin en la configuración del plugin para los plugins que necesitan períodos de drenaje más largos.

## 13. Protocolo host-worker

El host debe admitir los siguientes métodos RPC del worker.

Métodos requeridos:

- `initialize(input)`
- `health()`
- `shutdown()`

Métodos opcionales:

- `validateConfig(input)`
- `configChanged(input)`
- `onEvent(input)`
- `runJob(input)`
- `handleWebhook(input)`
- `getData(input)`
- `performAction(input)`
- `executeTool(input)`

### 13.1 `initialize`

Se llama una vez al arrancar el worker.

La entrada incluye:

- manifiesto del plugin
- configuración resuelta del plugin
- información de la instancia
- versión de la API del host

### 13.2 `health`

Devuelve:

- estado
- error actual si existe
- diagnósticos opcionales reportados por el plugin

### 13.3 `validateConfig`

Se ejecuta después de cambios de configuración y al arrancar.

Devuelve:

- `ok`
- advertencias
- errores

### 13.4 `configChanged`

Se llama cuando el operador actualiza la configuración de instancia del plugin en runtime.

La entrada incluye:

- nueva configuración resuelta

Si el worker implementa este método, aplica la nueva configuración sin reiniciar. Si el worker no implementa este método, el host reinicia el proceso worker con la nueva configuración (apagado ordenado y luego reinicio).

### 13.5 `onEvent`

Recibe un evento de dominio tipado de Paperclip.

Semántica de entrega:

- al menos una vez
- el plugin debe ser idempotente
- sin garantía de orden global entre todos los tipos de eventos
- el orden por entidad es de mejor esfuerzo pero no garantizado después de reintentos

### 13.6 `runJob`

Ejecuta un trabajo programado declarado.

El host provee:

- clave del trabajo
- origen del disparador
- id de ejecución
- metadatos de programación

### 13.7 `handleWebhook`

Recibe un payload de webhook entrante enrutado por el host.

El host provee:

- clave del endpoint
- encabezados
- cuerpo crudo
- cuerpo parseado si aplica
- id de solicitud

### 13.8 `getData`

Devuelve datos del plugin solicitados por los propios componentes de UI del plugin.

La UI del plugin llama al puente del host, que reenvía la solicitud al worker. El worker devuelve JSON tipado que los propios componentes frontend del plugin renderizan.

La entrada incluye:

- clave de datos (definida por el plugin, p. ej. `"sync-health"`, `"issue-detail"`)
- contexto (id de empresa, id de proyecto, id de entidad, etc.)
- parámetros de consulta opcionales

### 13.9 `performAction`

Ejecuta una acción explícita del plugin iniciada por la UI del panel.

Ejemplos:

- "resync now"
- "link GitHub issue"
- "create branch from issue"
- "restart process"

### 13.10 `executeTool`

Ejecuta una herramienta de agente contribuida por el plugin durante una ejecución.

El host provee:

- nombre de la herramienta (sin el prefijo del espacio de nombres del plugin)
- parámetros parseados que coinciden con el esquema declarado de la herramienta
- contexto de ejecución: ID de agente, ID de ejecución, ID de empresa, ID de proyecto

El worker ejecuta la herramienta y devuelve un resultado tipado (contenido de texto, datos estructurados o error).
## 14. Superficie del SDK

Los plugins no hablan directamente con la BD.
Los plugins no leen material secreto crudo de la configuración persistida.

El SDK expuesto a los workers debe proveer clientes tipados del host.

Clientes SDK requeridos:

- `ctx.config`
- `ctx.events`
- `ctx.jobs`
- `ctx.http`
- `ctx.secrets`
- `ctx.assets`
- `ctx.activity`
- `ctx.state`
- `ctx.entities`
- `ctx.projects`
- `ctx.issues`
- `ctx.agents`
- `ctx.goals`
- `ctx.data`
- `ctx.actions`
- `ctx.tools`
- `ctx.logger`

`ctx.data` y `ctx.actions` registran manejadores que la propia UI del plugin llama a través del puente del host. `ctx.data.register(key, handler)` respalda `usePluginData(key)` en el frontend. `ctx.actions.register(key, handler)` respalda `usePluginAction(key)`.

Los plugins que necesitan operaciones de sistema de archivos, git, terminal o procesos las manejan directamente usando APIs estándar de Node o librerías. El host provee metadatos de workspace de proyecto a través de `ctx.projects` para que los plugins puedan resolver rutas de workspace, pero el host no actúa como proxy de operaciones de bajo nivel del SO.

## 14.1 Ejemplo de forma del SDK

```ts
/** Top-level helper for defining a plugin with type checking */
export function definePlugin(definition: PluginDefinition): PaperclipPlugin;

/** Re-exported from Zod for config schema definitions */
export { z } from "zod";

export interface PluginContext {
  manifest: PaperclipPluginManifestV1;
  config: {
    get(): Promise<Record<string, unknown>>;
  };
  events: {
    on(name: string, fn: (event: unknown) => Promise<void>): void;
    on(name: string, filter: EventFilter, fn: (event: unknown) => Promise<void>): void;
    emit(name: string, payload: unknown): Promise<void>;
  };
  jobs: {
    register(key: string, input: { cron: string }, fn: (job: PluginJobContext) => Promise<void>): void;
  };
  state: {
    get(input: ScopeKey): Promise<unknown | null>;
    set(input: ScopeKey, value: unknown): Promise<void>;
    delete(input: ScopeKey): Promise<void>;
  };
  entities: {
    upsert(input: PluginEntityUpsert): Promise<void>;
    list(input: PluginEntityQuery): Promise<PluginEntityRecord[]>;
  };
  data: {
    register(key: string, handler: (params: Record<string, unknown>) => Promise<unknown>): void;
  };
  actions: {
    register(key: string, handler: (params: Record<string, unknown>) => Promise<unknown>): void;
  };
  tools: {
    register(name: string, input: PluginToolDeclaration, fn: (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>): void;
  };
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  };
}

export interface EventFilter {
  projectId?: string;
  companyId?: string;
  agentId?: string;
  [key: string]: unknown;
}
```

## 15. Modelo de capacidades

Las capacidades son obligatorias y estáticas.
Cada plugin las declara por adelantado.

El host aplica las capacidades en la capa del SDK y rechaza llamadas fuera del conjunto otorgado.

## 15.1 Categorías de capacidad

### Lectura de datos

- `companies.read`
- `projects.read`
- `project.workspaces.read`
- `issues.read`
- `issue.comments.read`
- `agents.read`
- `goals.read`
- `activity.read`
- `costs.read`

### Escritura de datos

- `issues.create`
- `issues.update`
- `issue.comments.create`
- `assets.write`
- `assets.read`
- `activity.log.write`
- `metrics.write`

### Estado de plugin

- `plugin.state.read`
- `plugin.state.write`

### Runtime / Integración

- `events.subscribe`
- `events.emit`
- `jobs.schedule`
- `webhooks.receive`
- `http.outbound`
- `secrets.read-ref`

### Herramientas de agente

- `agent.tools.register`

### UI

- `instance.settings.register`
- `ui.sidebar.register`
- `ui.page.register`
- `ui.detailTab.register`
- `ui.dashboardWidget.register`
- `ui.action.register`

## 15.2 Capacidades prohibidas

El host no debe exponer capacidades para:

- decisiones de aprobación
- anulación de presupuesto
- evasión de autenticación
- anulación del bloqueo de checkout de issues
- acceso directo a la BD

## 15.3 Reglas de actualización

Si una actualización de plugin agrega capacidades:

1. el host debe marcar el plugin como `upgrade_pending`
2. el operador debe aprobar explícitamente el nuevo conjunto de capacidades
3. la nueva versión no pasa a `ready` hasta que la aprobación se completa

## 16. Sistema de eventos

El host debe emitir eventos de dominio tipados a los que los plugins pueden suscribirse.

Conjunto mínimo de eventos:

- `company.created`
- `company.updated`
- `project.created`
- `project.updated`
- `project.workspace_created`
- `project.workspace_updated`
- `project.workspace_deleted`
- `issue.created`
- `issue.updated`
- `issue.comment.created`
- `agent.created`
- `agent.updated`
- `agent.status_changed`
- `agent.run.started`
- `agent.run.finished`
- `agent.run.failed`
- `agent.run.cancelled`
- `approval.created`
- `approval.decided`
- `cost_event.created`
- `activity.logged`

Cada evento debe incluir:

- id de evento
- tipo de evento
- fecha de ocurrencia
- metadatos del actor cuando aplique
- metadatos de la entidad principal
- payload tipado

### 16.1 Filtrado de eventos

Los plugins pueden proveer un filtro opcional al suscribirse a eventos. El filtro es evaluado por el host antes de despachar al worker, por lo que los eventos filtrados nunca cruzan el límite del proceso.

Campos de filtro admitidos:

- `projectId` — solo recibe eventos de un proyecto específico
- `companyId` — solo recibe eventos de una empresa específica
- `agentId` — solo recibe eventos de un agente específico

Los filtros son opcionales. Si se omiten, el plugin recibe todos los eventos del tipo suscrito. Los filtros pueden combinarse (p. ej. filtrar por empresa y proyecto a la vez).

### 16.2 Eventos entre plugins

Los plugins pueden emitir eventos personalizados usando `ctx.events.emit(name, payload)`. Los eventos emitidos por plugins usan un tipo de evento con espacio de nombres: `plugin.<pluginId>.<eventName>`.

Otros plugins pueden suscribirse a estos eventos usando la misma API `ctx.events.on()`:

```ts
ctx.events.on("plugin.@paperclip/plugin-git.push-detected", async (event) => {
  // react to the git plugin detecting a push
});
```

Reglas:

- Los eventos de plugin requieren la capacidad `events.emit`.
- Los eventos de plugin no son eventos de dominio centrales: no aparecen en el registro de actividad central a menos que el plugin emisor los registre explícitamente.
- Los eventos de plugin siguen la misma semántica de entrega de al menos una vez que los eventos centrales.
- El host no debe permitir que los plugins emitan eventos en el espacio de nombres central (eventos sin el prefijo `plugin.`).

## 17. Trabajos programados

Los plugins pueden declarar trabajos programados en su manifiesto.

Reglas de trabajos:

1. Cada trabajo tiene una `job_key` estable.
2. El host es el programador de referencia.
3. El host impide la ejecución traslapada de la misma combinación plugin/trabajo a menos que se permita explícitamente más adelante.
4. Cada ejecución de trabajo se registra en Postgres.
5. Los trabajos fallidos son reintentables.

## 18. Webhooks

Los plugins pueden declarar endpoints de webhook en su manifiesto.

Forma de la ruta de webhook:

- `POST /api/plugins/:pluginId/webhooks/:endpointKey`

Reglas:

1. El host es dueño de la ruta pública.
2. El worker recibe el cuerpo de la solicitud a través de `handleWebhook`.
3. La verificación de firma ocurre en el código del plugin usando referencias de secretos resueltas por el host.
4. Cada entrega se registra.
5. El manejo de webhooks debe ser idempotente.

## 19. Modelo de extensión de UI

Los plugins envían su propia UI frontend como un módulo React empaquetado. El host carga la UI de plugins en slots de extensión designados y provee un puente para que el frontend del plugin se comunique con su propio worker backend y con las APIs del host.

### Cómo funciona en la práctica la publicación de UI de plugins

El directorio `dist/ui/` de un plugin contiene un bundle React construido. El host sirve este bundle y lo carga en la página cuando el usuario navega a una superficie del plugin (una página de plugin, una pestaña de detalle, un widget de panel, etc.).

**El host provee, el plugin renderiza:**

1. El host define **slots de extensión** — puntos de montaje designados en la UI donde pueden aparecer componentes de plugin (páginas, pestañas, widgets, entradas de barra lateral, barras de acción).
2. El bundle de UI del plugin exporta componentes nombrados para cada slot que quiere llenar.
3. El host monta el componente del plugin en el slot, pasándole un objeto **puente del host**.
4. El componente del plugin usa el puente para obtener datos de su propio worker (vía `getData`), llamar acciones (vía `performAction`), leer el contexto del host (empresa actual, proyecto, entidad) y usar primitivas de UI compartidas del host (tokens de diseño, componentes comunes).

**Ejemplo concreto: un plugin de Linear envía un widget de panel.**

El bundle de UI del plugin exporta:

```tsx
// dist/ui/index.tsx
import { usePluginData, usePluginAction, MetricCard, StatusBadge } from "@paperclipai/plugin-sdk/ui";

export function DashboardWidget({ context }: PluginWidgetProps) {
  const { data, loading } = usePluginData("sync-health", { companyId: context.companyId });
  const resync = usePluginAction("resync");

  if (loading) return <Spinner />;

  return (
    <div>
      <MetricCard label="Synced Issues" value={data.syncedCount} trend={data.trend} />
      {data.mappings.map(m => (
        <StatusBadge key={m.id} label={m.label} status={m.status} />
      ))}
      <button onClick={() => resync({ companyId: context.companyId })}>Resync Now</button>
    </div>
  );
}
```

**Qué pasa en runtime:**

1. El usuario abre el panel. El host ve que el plugin de Linear registró una exportación `DashboardWidget`.
2. El host monta el componente `DashboardWidget` del plugin en el slot de widget de panel, pasando `context` (empresa actual, usuario, etc.) y el puente.
3. `usePluginData("sync-health", ...)` llama a través del puente → host → RPC `getData` del worker del plugin → devuelve JSON → el componente del plugin lo renderiza como quiera.
4. Cuando el usuario hace clic en "Resync Now", `usePluginAction("resync")` llama a través del puente → host → RPC `performAction` del worker del plugin.

**Lo que controla el host:**

- El host decide **dónde** aparecen los componentes de plugin (qué slots existen y cuándo se montan).
- El host provee el **puente** — la UI del plugin no puede hacer solicitudes de red arbitrarias ni acceder a internos del host directamente.
- El host aplica **puertas de capacidad** — si el worker de un plugin no tiene una capacidad, el puente rechaza la llamada aunque la UI la solicite.
- El host provee **tokens de diseño y componentes compartidos** vía `@paperclipai/plugin-sdk/ui` para que los plugins puedan igualar el lenguaje visual del host sin estar obligados.

**Lo que controla el plugin:**

- El plugin decide **cómo** renderizar sus datos — es dueño de sus componentes React, disposición, interacciones y gestión de estado.
- El plugin decide **qué datos** obtener y **qué acciones** exponer.
- El plugin puede usar cualquier patrón de React (hooks, contexto, librerías de componentes de terceros) dentro de su bundle.

### 19.0.1 SDK de UI de plugin (`@paperclipai/plugin-sdk/ui`)

El SDK incluye una exportación de subruta `ui` que los frontends de plugins importan. Esta subruta provee:

- **Hooks de puente**: `usePluginData(key, params)`, `usePluginAction(key)`, `useHostContext()`
- **Tokens de diseño**: colores, espaciado, tipografía, sombras que igualan el tema del host
- **Componentes compartidos**: `MetricCard`, `StatusBadge`, `DataTable`, `LogView`, `ActionBar`, `Spinner`, etc.
- **Definiciones de tipos**: `PluginPageProps`, `PluginWidgetProps`, `PluginDetailTabProps`

Se anima a los plugins a usar los componentes compartidos, pero no es obligatorio. Un plugin puede renderizar UI completamente personalizada siempre que se comunique a través del puente.

### 19.0.2 Aislamiento de bundle

Los bundles de UI de plugins se cargan como módulos ES estándar, no en iframes. Esto da a los plugins rendimiento completo de renderizado y acceso a los tokens de diseño del host.

Reglas de aislamiento:

- Los bundles de plugin no deben importar de internos del host. Solo pueden importar de `@paperclipai/plugin-sdk/ui` y sus propias dependencias.
- Los bundles de plugin no deben acceder a `window.fetch` o `XMLHttpRequest` directamente para llamadas a la API del host. Toda la comunicación con el host pasa por el puente.
- El host puede aplicar reglas de Content Security Policy que restringen el acceso de red del plugin solo al endpoint del puente.
- Los bundles de plugin deben ser analizables estáticamente — sin `import()` dinámico de URLs fuera del propio bundle del plugin.

Si más adelante se necesita aislamiento más fuerte, el host puede pasar a montaje basado en iframe para plugins no confiables sin cambiar el código fuente del plugin (la API del puente se mantiene igual).

### 19.0.3 Servido de bundle

Los bundles de UI de plugins deben ser ESM preconstruidos. El host no compila ni transforma código de UI de plugin en runtime.

El host sirve el directorio `dist/ui/` del plugin como assets estáticos bajo una ruta con espacio de nombres:

- `/_plugins/:pluginId/ui/*`

Cuando el host renderiza un slot de extensión, importa dinámicamente el módulo de entrada de UI del plugin desde esta ruta, resuelve la exportación nombrada declarada en `ui.slots[].exportName` y la monta en el slot.

En desarrollo, el host puede admitir una sobreescritura `devUiUrl` en la configuración del plugin que apunte a un servidor de desarrollo local (p. ej. Vite) para que los autores de plugins puedan usar hot-reload durante el desarrollo sin reconstruir.

## 19.1 Rutas globales del operador

- `/settings/plugins`
- `/settings/plugins/:pluginId`

Estas rutas son a nivel de instancia.

## 19.2 Rutas de contexto de empresa

- `/:companyPrefix/plugins/:pluginId`

Estas rutas existen porque la UI del panel está organizada alrededor de empresas aunque la instalación de plugins sea global.

## 19.3 Pestañas de detalle

Los plugins pueden agregar pestañas a:

- detalle de proyecto
- detalle de issue
- detalle de agente
- detalle de objetivo
- detalle de ejecución

Patrón de ruta recomendado:

- `/:companyPrefix/<entity>/:id?tab=<plugin-tab-id>`

## 19.4 Widgets de panel

Los plugins pueden agregar tarjetas o secciones al panel.

## 19.5 Entradas de barra lateral

Los plugins pueden agregar enlaces de barra lateral a:

- ajustes globales de plugin
- páginas de plugin de contexto de empresa

## 19.6 Componentes compartidos en `@paperclipai/plugin-sdk/ui`

El SDK del host incluye componentes compartidos que los plugins pueden importar para construir rápidamente UIs que igualen la apariencia del host. Son bloques de construcción de conveniencia, no un requisito.

| Componente | Qué renderiza | Uso típico |
|---|---|---|
| `MetricCard` | Un solo número con etiqueta, tendencia/sparkline opcional | KPIs, conteos, tasas |
| `StatusBadge` | Indicador de estado en línea (ok/warning/error/info) | Salud de sincronización, estado de conexión |
| `DataTable` | Filas y columnas con ordenamiento y paginación opcionales | Listas de issues, historial de trabajos, listas de procesos |
| `TimeseriesChart` | Gráfico de líneas o barras con puntos de datos con marca de tiempo | Tendencias de ingresos, volumen de sincronización, tasas de error |
| `MarkdownBlock` | Texto markdown renderizado | Descripciones, texto de ayuda, notas |
| `KeyValueList` | Pares etiqueta/valor en disposición de lista de definición | Metadatos de entidad, resumen de configuración |
| `ActionBar` | Fila de botones conectados a `usePluginAction` | Resincronizar, crear rama, reiniciar proceso |
| `LogView` | Salida de log desplazable con marcas de tiempo | Entregas de webhooks, salida de trabajos, logs de procesos |
| `JsonTree` | Árbol JSON colapsable para depuración | Respuestas crudas de API, inspección de estado de plugin |
| `Spinner` | Indicador de carga | Estados de obtención de datos |

Los plugins también pueden usar componentes completamente personalizados. Los componentes compartidos existen para reducir boilerplate y mantener consistencia visual, no para limitar lo que los plugins pueden renderizar.

## 19.7 Propagación de errores a través del puente

Los hooks del puente deben devolver errores estructurados para que la UI del plugin pueda manejar fallos con elegancia.

`usePluginData` devuelve:

```ts
{
  data: T | null;
  loading: boolean;
  error: PluginBridgeError | null;
}
```

`usePluginAction` devuelve una función asíncrona que o bien resuelve con el resultado o lanza un `PluginBridgeError`.

Forma de `PluginBridgeError`:

```ts
interface PluginBridgeError {
  code: "WORKER_UNAVAILABLE" | "CAPABILITY_DENIED" | "WORKER_ERROR" | "TIMEOUT" | "UNKNOWN";
  message: string;
  /** Original error details from the worker, if available */
  details?: unknown;
}
```

Códigos de error:

- `WORKER_UNAVAILABLE` — el worker del plugin no está en ejecución (falló, apagándose, aún no iniciado)
- `CAPABILITY_DENIED` — el plugin no tiene la capacidad requerida para esta operación
- `WORKER_ERROR` — el worker devolvió un error desde su manejador `getData` o `performAction`
- `TIMEOUT` — el worker no respondió dentro del timeout configurado
- `UNKNOWN` — fallo inesperado a nivel de puente

La subruta `@paperclipai/plugin-sdk/ui` también debería exportar un componente `ErrorBoundary` que los autores de plugins pueden usar para atrapar errores de renderizado sin tumbar la página del host.

## 19.8 UI de ajustes de plugin

Cada plugin que declare un `instanceConfigSchema` en su manifiesto obtiene un formulario de ajustes autogenerado en `/settings/plugins/:pluginId`. El host renderiza el formulario desde el JSON Schema.

El formulario autogenerado admite:

- entradas de texto, entradas numéricas, interruptores, desplegables de selección derivados de tipos de esquema y enums
- objetos anidados renderizados como fieldsets
- arreglos renderizados como grupos de campos repetibles con controles de agregar/eliminar
- campos de referencia de secreto: cualquier propiedad de esquema anotada con `"format": "secret-ref"` se renderiza como un selector de secreto que resuelve a través del sistema de proveedores de secretos de Paperclip en lugar de una entrada de texto simple
- mensajes de validación derivados de restricciones del esquema (`required`, `minLength`, `pattern`, `minimum`, etc.)
- una acción "Test Connection" si el plugin declara un método RPC `validateConfig` — el host lo llama y muestra el resultado en línea

Para plugins que necesitan UX de ajustes más rica más allá de lo que JSON Schema puede expresar, el plugin puede declarar un slot `settingsPage` en `ui.slots`. Cuando está presente, el host renderiza el propio componente React del plugin en lugar del formulario autogenerado. El componente del plugin se comunica con su worker a través del puente estándar para leer y escribir configuración.

Ambos enfoques coexisten: un plugin puede usar el formulario autogenerado para configuración simple y agregar un slot de página de ajustes personalizada para configuración avanzada o paneles operativos.

## 20. Tooling local

Los plugins que necesitan operaciones de sistema de archivos, git, terminal o procesos las implementan directamente. El host no envuelve ni actúa como proxy de estas operaciones.

El host provee metadatos de workspace a través de `ctx.projects` (listar workspaces, obtener el workspace principal, resolver workspace desde issue o agente/ejecución). Los plugins usan estos metadatos para resolver rutas locales y luego operan en el sistema de archivos, lanzan procesos, ejecutan `git` en shell o abren sesiones PTY usando APIs estándar de Node o las librerías que elijan.

Esto mantiene el host liviano: no necesita mantener una superficie de API paralela para cada operación a nivel de SO que un plugin pueda necesitar. Los plugins son dueños de su propia lógica para exploración de archivos, flujos de trabajo de git, sesiones de terminal y gestión de procesos.

## 21. Persistencia y Postgres

## 21.1 Principios de base de datos

1. Los datos centrales de Paperclip permanecen en tablas first-party.
2. La mayoría de los datos propiedad de plugins comienzan en tablas de extensión genéricas.
3. Los datos de plugin deberían delimitarse a objetos Paperclip existentes antes de introducir nuevas tablas.
4. Las migraciones arbitrarias de esquema de terceros están fuera del alcance del primer sistema de plugins.

## 21.2 Reutilización de tablas centrales

Si los datos pasan a formar parte del modelo de producto real de Paperclip, deberían convertirse en una tabla first-party.

Ejemplos:

- `project_workspaces` ya es first-party
- si Paperclip decide más adelante que el estado de git es dato de producto central, también debería convertirse en una tabla first-party

## 21.3 Tablas requeridas

### `plugins`

- `id` uuid pk
- `plugin_key` text unique not null
- `package_name` text not null
- `version` text not null
- `api_version` int not null
- `categories` text[] not null
- `manifest_json` jsonb not null
- `status` enum: `installed | ready | error | upgrade_pending`
- `install_order` int null
- `installed_at` timestamptz not null
- `updated_at` timestamptz not null
- `last_error` text null

Índices:

- unique `plugin_key`
- `status`

### `plugin_config`

- `id` uuid pk
- `plugin_id` uuid fk `plugins.id` unique not null
- `config_json` jsonb not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null
- `last_error` text null

### `plugin_state`

- `id` uuid pk
- `plugin_id` uuid fk `plugins.id` not null
- `scope_kind` enum: `instance | company | project | project_workspace | agent | issue | goal | run`
- `scope_id` uuid/text null
- `namespace` text not null
- `state_key` text not null
- `value_json` jsonb not null
- `updated_at` timestamptz not null

Restricciones:

- unique `(plugin_id, scope_kind, scope_id, namespace, state_key)`

Ejemplos:

- IDs externos de Linear delimitados por `issue`
- cursores de sincronización de GitHub delimitados por `project`
- preferencias del explorador de archivos delimitadas por `project_workspace`
- metadatos de rama de git delimitados por `project_workspace`
- metadatos de proceso delimitados por `project_workspace` o `run`

### `plugin_jobs`

- `id` uuid pk
- `plugin_id` uuid fk `plugins.id` not null
- `scope_kind` enum nullable
- `scope_id` uuid/text null
- `job_key` text not null
- `schedule` text null
- `status` enum: `idle | queued | running | error`
- `next_run_at` timestamptz null
- `last_started_at` timestamptz null
- `last_finished_at` timestamptz null
- `last_succeeded_at` timestamptz null
- `last_error` text null

Restricciones:

- unique `(plugin_id, scope_kind, scope_id, job_key)`

### `plugin_job_runs`

- `id` uuid pk
- `plugin_job_id` uuid fk `plugin_jobs.id` not null
- `plugin_id` uuid fk `plugins.id` not null
- `status` enum: `queued | running | succeeded | failed | cancelled`
- `trigger` enum: `schedule | manual | retry`
- `started_at` timestamptz null
- `finished_at` timestamptz null
- `error` text null
- `details_json` jsonb null

Índices:

- `(plugin_id, started_at desc)`
- `(plugin_job_id, started_at desc)`

### `plugin_webhook_deliveries`

- `id` uuid pk
- `plugin_id` uuid fk `plugins.id` not null
- `scope_kind` enum nullable
- `scope_id` uuid/text null
- `endpoint_key` text not null
- `status` enum: `received | processed | failed | ignored`
- `request_id` text null
- `headers_json` jsonb null
- `body_json` jsonb null
- `received_at` timestamptz not null
- `handled_at` timestamptz null
- `response_code` int null
- `error` text null

Índices:

- `(plugin_id, received_at desc)`
- `(plugin_id, endpoint_key, received_at desc)`

### `plugin_entities` (opcional pero recomendada)

- `id` uuid pk
- `plugin_id` uuid fk `plugins.id` not null
- `entity_type` text not null
- `scope_kind` enum not null
- `scope_id` uuid/text null
- `external_id` text null
- `title` text null
- `status` text null
- `data_json` jsonb not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Índices:

- `(plugin_id, entity_type, external_id)` unique cuando `external_id` no es null
- `(plugin_id, scope_kind, scope_id, entity_type)`

Casos de uso:

- issues de Linear importados
- issues de GitHub importados
- registros de proceso propiedad del plugin
- enlaces de métricas externas propiedad del plugin

## 21.4 Cambios al registro de actividad

El registro de actividad debería extender `actor_type` para incluir `plugin`.

Nuevo enum de actor:

- `agent`
- `user`
- `system`
- `plugin`

Las mutaciones originadas por plugins deberían escribir:

- `actor_type = plugin`
- `actor_id = <plugin-id>`

## 21.5 Migraciones de plugin

El primer sistema de plugins no permite migraciones arbitrarias de terceros.

Más adelante, si las tablas personalizadas se vuelven necesarias, el sistema puede agregar una ruta de migración solo para módulos confiables.

## 22. Secretos

La configuración de plugin nunca debe persistir valores secretos crudos.

Reglas:

1. La configuración de plugin almacena solo referencias de secretos.
2. Las referencias de secretos se resuelven a través del sistema existente de proveedores de secretos de Paperclip.
3. Los workers de plugin reciben secretos resueltos solo al momento de la ejecución.
4. Los valores de secretos nunca deben escribirse en:
   - JSON de configuración de plugin
   - registros de actividad
   - filas de entrega de webhooks
   - mensajes de error

## 23. Auditoría

Todas las acciones de mutación originadas por plugins deben ser auditables.

Requisitos mínimos:

- entrada del registro de actividad para cada mutación
- historial de ejecuciones de trabajos
- historial de entregas de webhooks
- página de salud del plugin
- historial de instalación/actualización en `plugins`

## 24. UX del operador

## 24.1 Ajustes globales

La página global de ajustes de plugins debe mostrar:

- plugins instalados
- versiones
- estado
- capacidades solicitadas
- errores actuales
- acciones de instalar/actualizar/eliminar

## 24.2 Página de ajustes del plugin

Cada plugin puede exponer:

- formulario de configuración derivado de `instanceConfigSchema`
- detalles de salud
- historial reciente de trabajos
- historial reciente de webhooks
- lista de capacidades

Ruta:

- `/settings/plugins/:pluginId`

## 24.3 Página de plugin de contexto de empresa

Cada plugin puede exponer una página principal de contexto de empresa:

- `/:companyPrefix/plugins/:pluginId`

Esta página es donde los usuarios del panel hacen la mayor parte del trabajo diario.

## 25. Desinstalación y ciclo de vida de datos

Cuando un plugin se desinstala, el host debe manejar los datos propiedad del plugin de forma explícita.

### 25.1 Proceso de desinstalación

1. El host envía `shutdown()` al worker y sigue la política de apagado ordenado.
2. El host marca el estado del plugin como `uninstalled` en la tabla `plugins` (borrado lógico).
3. Los datos propiedad del plugin (`plugin_state`, `plugin_entities`, `plugin_jobs`, `plugin_job_runs`, `plugin_webhook_deliveries`, `plugin_config`) se conservan por un período de gracia configurable (por defecto: 30 días).
4. Durante el período de gracia, el operador puede reinstalar el mismo plugin y recuperar su estado.
5. Después del período de gracia, el host purga todos los datos propiedad del plugin desinstalado.
6. El operador puede forzar la purga inmediata vía CLI: `pnpm paperclipai plugin purge <plugin-id>`.

### 25.2 Consideraciones de datos en actualización

Las actualizaciones de plugins no migran automáticamente el estado del plugin. Si la forma de `value_json` de un plugin cambia entre versiones:

- El worker del plugin es responsable de migrar su propio estado en el primer acceso después de la actualización.
- El host no ejecuta migraciones de esquema definidas por plugins.
- Los plugins deberían versionar sus claves de estado o usar un campo de versión de esquema dentro de `value_json` para detectar y manejar cambios de formato.

### 25.3 Ciclo de vida de actualización

Al actualizar un plugin:

1. El host envía `shutdown()` al worker viejo.
2. El host espera a que el worker viejo drene el trabajo en curso (respetando el plazo de apagado).
3. Cualquier trabajo en curso que no se complete dentro del plazo se marca como `cancelled`.
4. El host instala la nueva versión e inicia el nuevo worker.
5. Si la nueva versión agrega capacidades, el plugin entra en `upgrade_pending` y el operador debe aprobar antes de que el nuevo worker pase a `ready`.

### 25.4 Ciclo de vida de plugins en caliente

La instalación, desinstalación, actualización y cambios de configuración de plugins **deben** surtir efecto sin reiniciar el servidor de Paperclip. Esto es un requisito normativo, no opcional.

La arquitectura ya lo admite: los plugins se ejecutan como workers fuera de proceso con importaciones ESM dinámicas, puentes IPC y tablas de enrutamiento gestionadas por el host. Esta sección hace el requisito explícito para que las implementaciones no retrocedan.

#### 25.4.1 Instalación en caliente

Cuando un plugin se instala en runtime:

1. El host resuelve y valida el manifiesto sin detener los servicios existentes.
2. El host lanza un nuevo proceso worker para el plugin.
3. El host registra las suscripciones de eventos, programaciones de trabajos, endpoints de webhooks y declaraciones de herramientas de agente del plugin en las tablas de enrutamiento en vivo.
4. El host carga la ruta del bundle de UI del plugin en el registro de slots de extensión para que el frontend pueda descubrirlo en la siguiente navegación o vía una notificación en vivo.
5. El plugin entra en estado `ready` (o `upgrade_pending` si se requiere aprobación de capacidades).

Ningún otro plugin ni servicio del host se interrumpe.

#### 25.4.2 Desinstalación en caliente

Cuando un plugin se desinstala en runtime:

1. El host envía `shutdown()` y sigue la política de apagado ordenado (Sección 12.5).
2. El host elimina las suscripciones de eventos, programaciones de trabajos, endpoints de webhooks y declaraciones de herramientas de agente del plugin de las tablas de enrutamiento en vivo.
3. El host elimina el bundle de UI del plugin del registro de slots de extensión. Cualquier componente de UI de plugin montado actualmente se desmonta y se reemplaza con un marcador de posición o se elimina por completo.
4. El host marca el plugin como `uninstalled` e inicia el período de gracia de retención de datos (Sección 25.1).

No se necesita reiniciar el servidor.

#### 25.4.3 Actualización en caliente

Cuando un plugin se actualiza en runtime:

1. El host sigue el ciclo de vida de actualización (Sección 25.3): apaga el worker viejo, inicia el nuevo worker.
2. Si la nueva versión cambia suscripciones de eventos, programaciones de trabajos, endpoints de webhooks o herramientas de agente, el host intercambia atómicamente los registros viejos por los nuevos.
3. Si la nueva versión incluye un bundle de UI actualizado, el host invalida cualquier asset de bundle en caché y notifica al frontend para recargar los componentes de UI del plugin. Los usuarios activos ven la UI actualizada en la siguiente navegación o vía una notificación de recarga en vivo.
4. Si el `apiVersion` del manifiesto no cambia y no se agregan nuevas capacidades, la actualización se completa sin interacción del operador.

#### 25.4.4 Cambio de configuración en caliente

Cuando un operador actualiza la configuración de instancia de un plugin en runtime:

1. El host escribe la nueva configuración en `plugin_config`.
2. El host envía una notificación `configChanged` al worker en ejecución vía IPC.
3. El worker recibe la nueva configuración a través de `ctx.config` y la aplica sin reiniciar. Si el plugin necesita reinicializar conexiones (p. ej. un nuevo token de API), lo hace internamente.
4. Si el plugin no maneja `configChanged`, el host reinicia el proceso worker con la nueva configuración (apagado ordenado y luego reinicio).

#### 25.4.5 Invalidación de caché del frontend

El host debe versionar las URLs de los bundles de UI de plugins (p. ej. `/_plugins/:pluginId/ui/:version/*` o rutas basadas en hash de contenido) para que las cachés del navegador no sirvan bundles obsoletos después de una actualización o reinstalación.

El host debería emitir un evento `plugin.ui.updated` que el frontend escucha para disparar la reimportación de módulos de plugin actualizados sin una recarga completa de la página.

#### 25.4.6 Gestión de procesos worker

El gestor de procesos de plugin del host debe admitir:

- iniciar un worker para un plugin recién instalado sin afectar otros workers
- detener un worker de un plugin desinstalado sin afectar otros workers
- reemplazar un worker durante una actualización (detener el viejo, iniciar el nuevo) de forma atómica desde la perspectiva de la tabla de enrutamiento
- reiniciar un worker después de un fallo sin intervención del operador (con backoff)

Cada proceso worker es independiente. No hay un pool de procesos compartido ni mecanismo de reinicio por lotes.

## 26. Observabilidad de plugins

### 26.1 Logging

Los workers de plugin usan `ctx.logger` para emitir logs estructurados. El host captura estos logs y los almacena en un formato consultable.

Reglas de almacenamiento de logs:

- Los logs de plugin se almacenan en una tabla `plugin_logs` o se agregan a un archivo de log bajo el directorio de datos del plugin.
- Cada entrada de log incluye: ID de plugin, marca de tiempo, nivel, mensaje y metadatos estructurados opcionales.
- Los logs son consultables desde la página de ajustes del plugin en la UI.
- Los logs tienen un período de retención configurable (por defecto: 7 días).
- El host captura `stdout` y `stderr` del proceso worker como logs de respaldo aunque el worker no use `ctx.logger`.

### 26.2 Panel de salud

La página de ajustes del plugin debe mostrar:

- estado actual del worker (en ejecución, error, detenido)
- tiempo activo desde el último reinicio
- entradas de log recientes
- historial de ejecuciones de trabajos con tasas de éxito/fallo
- historial de entregas de webhooks con tasas de éxito/fallo
- último resultado de chequeo de salud y diagnósticos
- uso de recursos si está disponible (memoria, CPU)

### 26.3 Alertas

El host debería emitir eventos internos cuando la salud del plugin se degrade. Estos usan el espacio de nombres `plugin.*` (no eventos de dominio centrales) y no aparecen en el registro de actividad central:

- `plugin.health.degraded` — el worker reporta errores o falla chequeos de salud
- `plugin.health.recovered` — el worker se recuperó de un estado de error
- `plugin.worker.crashed` — el proceso worker terminó inesperadamente
- `plugin.worker.restarted` — el worker se reinició después de un fallo

Estos eventos pueden ser consumidos por otros plugins (p. ej. un plugin de notificaciones) o mostrarse en el panel.

## 27. Desarrollo y pruebas de plugins

### 27.1 `@paperclipai/plugin-test-harness`

El host debería publicar un paquete de test harness que los autores de plugins usan para desarrollo local y pruebas.

El test harness provee:

- un host simulado que implementa la interfaz completa del SDK (`ctx.config`, `ctx.events`, `ctx.state`, etc.)
- capacidad de enviar eventos sintéticos y verificar respuestas de manejadores
- capacidad de disparar ejecuciones de trabajos y verificar efectos secundarios
- capacidad de simular llamadas `getData` y `performAction` como si vinieran del puente de UI
- capacidad de simular llamadas `executeTool` como si vinieran de una ejecución de agente
- almacenes de estado y entidades en memoria para assertions
- conjuntos de capacidades configurables para probar rutas de denegación de capacidad

Ejemplo de uso:

```ts
import { createTestHarness } from "@paperclipai/plugin-test-harness";
import manifest from "../dist/manifest.js";
import { register } from "../dist/worker.js";

const harness = createTestHarness({ manifest, capabilities: manifest.capabilities });
await register(harness.ctx);

// Simulate an event
await harness.emit("issue.created", { issueId: "iss-1", projectId: "proj-1" });

// Verify state was written
const state = await harness.state.get({ pluginId: manifest.id, scopeKind: "issue", scopeId: "iss-1", namespace: "sync", stateKey: "external-id" });
expect(state).toBeDefined();

// Simulate a UI data request
const data = await harness.getData("sync-health", { companyId: "comp-1" });
expect(data.syncedCount).toBeGreaterThan(0);
```

### 27.2 Desarrollo local de plugins

Para desarrollar un plugin contra una instancia de Paperclip en ejecución:

- El operador instala el plugin desde una ruta local: `pnpm paperclipai plugin install ./path/to/plugin`
- El host observa el directorio del plugin en busca de cambios y reinicia el worker al reconstruir.
- `devUiUrl` en la configuración del plugin puede apuntar a un servidor de desarrollo Vite local para hot-reload de UI.
- La página de ajustes del plugin muestra logs en tiempo real del worker para depuración.

### 27.3 Plantilla inicial de plugin

El host debería publicar una plantilla inicial (`create-paperclip-plugin`) que genere:

- `package.json` con las claves `paperclipPlugin` correctas
- manifiesto con valores de marcador
- entrada de worker con importaciones de tipos del SDK y ejemplo de manejador de eventos
- entrada de UI con ejemplo de `DashboardWidget` usando hooks de puente
- archivo de prueba usando el test harness
- configuración de compilación (esbuild o similar) para ambos bundles, worker y UI
- `.gitignore` y `tsconfig.json`
## 28. Mapeos de ejemplo

Esta especificación admite directamente los siguientes tipos de plugin:

- `@paperclip/plugin-workspace-files`
- `@paperclip/plugin-terminal`
- `@paperclip/plugin-git`
- `@paperclip/plugin-linear`
- `@paperclip/plugin-github-issues`
- `@paperclip/plugin-grafana`
- `@paperclip/plugin-runtime-processes`
- `@paperclip/plugin-stripe`

## 29. Compatibilidad y versionado

### 29.1 Reglas de versión de API

1. El host admite una o más versiones explícitas de la API de plugins.
2. El manifiesto del plugin declara exactamente un `apiVersion`.
3. El host rechaza versiones no admitidas al momento de la instalación.
4. Las actualizaciones de plugins son acciones explícitas del operador.
5. La expansión de capacidades requiere aprobación explícita del operador.

### 29.2 Versionado del SDK

El host publica un único paquete SDK para autores de plugins:

- `@paperclipai/plugin-sdk` — el SDK completo de plugins

El paquete usa exportaciones de subruta para separar las preocupaciones de worker y UI:

- `@paperclipai/plugin-sdk` — SDK del lado del worker (contexto, eventos, estado, herramientas, logger, `definePlugin`, `z`)
- `@paperclipai/plugin-sdk/ui` — SDK frontend (hooks de puente, componentes compartidos, tokens de diseño)

Un solo paquete simplifica la gestión de dependencias para los autores de plugins: una dependencia, una versión, un changelog. Las exportaciones de subruta mantienen limpia la separación de bundles: el código del worker importa desde la raíz, el código de UI importa desde `/ui`. Las herramientas de compilación hacen tree-shaking en consecuencia para que el bundle del worker no incluya componentes React y el bundle de UI no incluya código solo de worker.

Reglas de versionado:

1. **Semver**: El SDK sigue versionado semántico estricto. Los saltos de versión mayor indican cambios disruptivos en la superficie del worker o de UI; las versiones menores agregan nuevas funciones de forma retrocompatible; las versiones de parche son solo correcciones de errores.
2. **Atado a la versión de API**: Cada versión mayor del SDK corresponde a exactamente un `apiVersion` de plugin. Cuando `@paperclipai/plugin-sdk@2.x` se publique, apunta a `apiVersion: 2`. Los plugins construidos con SDK 1.x siguen declarando `apiVersion: 1`.
3. **Soporte multiversión del host**: El host debe admitir al menos la versión actual y una anterior de `apiVersion` simultáneamente. Esto significa que los plugins construidos contra la versión mayor anterior del SDK siguen funcionando sin modificación. El host mantiene manejadores de protocolo IPC separados para cada versión de API admitida.
4. **Versión mínima del SDK en el manifiesto**: Los plugins declaran `sdkVersion` en el manifiesto como un rango semver (p. ej. `">=1.4.0 <2.0.0"`). El host lo valida al momento de la instalación y advierte si el rango declarado del plugin está fuera de las versiones de SDK admitidas por el host.
5. **Cronograma de deprecación**: Cuando se publica un nuevo `apiVersion`, la versión anterior entra en un período de deprecación de al menos 6 meses. Durante este período:
   - El host sigue cargando plugins que apuntan a la versión deprecada.
   - El host registra una advertencia de deprecación al arrancar el plugin.
   - La página de ajustes del plugin muestra un banner indicando que el plugin debería actualizarse.
   - Después de que termina el período de deprecación, el host puede dejar de admitir la versión vieja en una futura versión.
6. **Changelog del SDK y guías de migración**: Cada versión mayor del SDK debe incluir una guía de migración que documente cada cambio disruptivo, la nueva superficie de API y una ruta de actualización paso a paso para autores de plugins.
7. **Estabilidad de la superficie de UI**: Los cambios disruptivos a componentes de UI compartidos (eliminar un componente, cambiar props requeridos) o a tokens de diseño requieren un salto de versión mayor igual que los cambios de API del worker. El modelo de paquete único significa que ambas superficies se versionan juntas, evitando deriva entre la compatibilidad del worker y la de UI.

### 29.3 Matriz de compatibilidad de versiones

El host debería publicar una matriz de compatibilidad:

| Versión del host | Versiones de API admitidas | Rango de SDK |
|---|---|---|
| 1.0 | 1 | 1.x |
| 2.0 | 1, 2 | 1.x, 2.x |
| 3.0 | 2, 3 | 2.x, 3.x |

Esta matriz se publica en los documentos del host y es consultable vía `GET /api/plugins/compatibility`.

### 29.4 Flujo de trabajo del autor de plugin

Cuando se publica una nueva versión del SDK:

1. El autor del plugin actualiza la dependencia `@paperclipai/plugin-sdk`.
2. El autor del plugin sigue la guía de migración para actualizar el código.
3. El autor del plugin actualiza `apiVersion` y `sdkVersion` en el manifiesto.
4. El autor del plugin publica una nueva versión del plugin.
5. Los operadores actualizan el plugin en sus instancias. La versión vieja sigue funcionando hasta que se actualice explícitamente.

## 30. Orden de entrega recomendado

## Fase 1

- manifiesto de plugin
- CLI de instalación/listado/eliminación/actualización
- UI global de ajustes
- gestor de procesos de plugin
- aplicación de capacidades
- `plugins`, `plugin_config`, `plugin_state`, `plugin_jobs`, `plugin_job_runs`, `plugin_webhook_deliveries`
- bus de eventos
- trabajos
- webhooks
- página de ajustes
- carga de bundle de UI de plugin, puente del host y `@paperclipai/plugin-sdk/ui`
- montaje de slots de extensión para páginas, pestañas, widgets, entradas de barra lateral
- propagación de errores del puente (`PluginBridgeError`)
- formulario de ajustes autogenerado desde `instanceConfigSchema`
- herramientas de agente contribuidas por plugins
- eventos entre plugins (espacio de nombres `plugin.<pluginId>.*`)
- filtrado de eventos
- apagado ordenado con plazos configurables
- logging de plugin y panel de salud
- `@paperclipai/plugin-test-harness`
- plantilla inicial `create-paperclip-plugin`
- desinstalación con período de gracia de retención de datos
- ciclo de vida de plugins en caliente (instalación, desinstalación, actualización, cambio de configuración sin reiniciar el servidor)
- versionado del SDK con soporte multiversión del host y política de deprecación

Esta fase es suficiente para:

- Linear
- GitHub Issues
- Grafana
- Stripe
- explorador de archivos
- terminal
- flujo de trabajo de git
- seguimiento de procesos/servidores

Los plugins de workspace (explorador de archivos, terminal, git, seguimiento de procesos) no requieren APIs adicionales del host: resuelven rutas de workspace a través de `ctx.projects` y manejan operaciones de sistema de archivos, git, PTY y procesos directamente.

## Fase 2

- `plugin_entities` opcional
- sistemas de acciones más ricos
- ruta de migración para módulos confiables si realmente se necesita
- aislamiento basado en iframe para bundles de UI de plugins no confiables
- trabajo de ecosistema/distribución de plugins

## 31. Decisión final de diseño

Paperclip no debería implementar una bolsa genérica de hooks en proceso modelada directamente a partir de herramientas locales de programación.

Paperclip debería implementar:

- módulos de plataforma confiables para integración de bajo nivel con el host
- plugins fuera de proceso instalados globalmente para capacidades aditivas de toda la instancia
- herramientas de agente contribuidas por plugins (con espacio de nombres, controladas por capacidades)
- bundles de UI enviados por plugins renderizados en slots de extensión del host vía un puente tipado con propagación estructurada de errores
- UI de ajustes autogenerada desde el esquema de configuración, con páginas de ajustes personalizadas como opción
- eventos entre plugins para coordinación entre plugins
- filtrado de eventos en el lado del servidor para enrutamiento eficiente de eventos
- los plugins son dueños de su propia lógica de tooling local (sistema de archivos, git, terminal, procesos) directamente
- tablas de extensión genéricas para la mayoría del estado de plugins
- apagado ordenado, ciclo de vida de datos de desinstalación y observabilidad de plugins
- ciclo de vida de plugins en caliente: instalación, desinstalación, actualización y cambios de configuración sin reiniciar el servidor
- versionado del SDK con soporte multiversión del host y una política de deprecación clara
- test harness y plantilla inicial para baja fricción de autoría
- preservación estricta de la gobernanza central y las reglas de auditoría

Ese es el diseño objetivo completo para el sistema de plugins de Paperclip.
