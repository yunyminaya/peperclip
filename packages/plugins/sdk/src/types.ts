/**
 * Tipos centrales del SDK del worker de plugins de Paperclip.
 *
 * Estos tipos definen la superficie pública estable de la API que los workers
 * de plugins importan desde `@paperclipai/plugin-sdk`. El host proporciona
 * una implementación concreta de `PluginContext` al plugin en el momento
 * de la inicialización.
 *
 * @see PLUGIN_SPEC.md §14 — Superficie SDK
 * @see PLUGIN_SPEC.md §29.2 — Versionado del SDK
 */

import type {
  PaperclipPluginManifestV1,
  PluginStateScopeKind,
  PluginEventType,
  PluginToolDeclaration,
  PluginLauncherDeclaration,
  Company,
  Project,
  Issue,
  IssueComment,
  IssueDocument,
  IssueDocumentSummary,
  Agent,
  Goal,
} from "@paperclipai/shared";

// ---------------------------------------------------------------------------
// Reexportaciones de @paperclipai/shared (los autores de plugins importan desde un solo lugar)
// ---------------------------------------------------------------------------

export type {
  PaperclipPluginManifestV1,
  PluginJobDeclaration,
  PluginWebhookDeclaration,
  PluginToolDeclaration,
  PluginUiSlotDeclaration,
  PluginUiDeclaration,
  PluginLauncherActionDeclaration,
  PluginLauncherRenderDeclaration,
  PluginLauncherDeclaration,
  PluginMinimumHostVersion,
  PluginRecord,
  PluginConfig,
  JsonSchema,
  PluginStatus,
  PluginCategory,
  PluginCapability,
  PluginUiSlotType,
  PluginUiSlotEntityType,
  PluginLauncherPlacementZone,
  PluginLauncherAction,
  PluginLauncherBounds,
  PluginLauncherRenderEnvironment,
  PluginStateScopeKind,
  PluginJobStatus,
  PluginJobRunStatus,
  PluginJobRunTrigger,
  PluginWebhookDeliveryStatus,
  PluginEventType,
  PluginBridgeErrorCode,
  Company,
  Project,
  Issue,
  IssueComment,
  IssueDocument,
  IssueDocumentSummary,
  Agent,
  Goal,
} from "@paperclipai/shared";

// ---------------------------------------------------------------------------
// Clave de ámbito: identifica dónde se almacena el estado del plugin
// ---------------------------------------------------------------------------

/**
 * Una clave de ámbito identifica la ubicación exacta donde se almacena el estado del plugin.
 * El ámbito se divide por `scopeKind` y `scopeId` opcional.
 *
 * Ejemplos:
 * - `{ scopeKind: "instance" }` — un único valor global para toda la instancia
 * - `{ scopeKind: "project", scopeId: "proj-uuid" }` — estado por proyecto
 * - `{ scopeKind: "issue", scopeId: "iss-uuid" }` — estado por issue
 *
 * @see PLUGIN_SPEC.md §21.3 `plugin_state`
 */
export interface ScopeKey {
  /** Tipo de objeto de Paperclip al que está acotado este estado. */
  scopeKind: PluginStateScopeKind;
  /** UUID o identificador de texto del objeto acotado. Omitir para el ámbito `instance`. */
  scopeId?: string;
  /** Subespacio de nombres opcional dentro del ámbito para evitar colisiones de claves. Por defecto `"default"`. */
  namespace?: string;
  /** La clave de estado dentro del espacio de nombres. */
  stateKey: string;
}

// ---------------------------------------------------------------------------
// Tipos de eventos
// ---------------------------------------------------------------------------

/**
 * Filtro opcional que se aplica al suscribirse a un evento. El host evalúa
 * el filtro en el servidor para que los eventos filtrados nunca crucen
 * el límite del proceso.
 *
 * Todos los campos del filtro son opcionales. Si se omiten, el plugin recibe
 * todos los eventos del tipo suscrito.
 *
 * @see PLUGIN_SPEC.md §16.1 — Event Filtering
 */
export interface EventFilter {
  /** Recibir solo eventos de este proyecto. */
  projectId?: string;
  /** Recibir solo eventos de esta empresa. */
  companyId?: string;
  /** Recibir solo eventos de este agente. */
  agentId?: string;
  /** Campos de filtro arbitrarios adicionales. */
  [key: string]: unknown;
}

/**
 * Envoltorio de cada evento de dominio entregado a un worker de plugin.
 *
 * @see PLUGIN_SPEC.md §16 — Event System
 */
export interface PluginEvent<TPayload = unknown> {
  /** Identificador único del evento (UUID). */
  eventId: string;
  /** El tipo de evento (p. ej. `"issue.created"`). */
  eventType: PluginEventType | `plugin.${string}`;
  /** Marca de tiempo ISO 8601 de cuándo ocurrió el evento. */
  occurredAt: string;
  /** ID del actor que causó el evento, si aplica. */
  actorId?: string;
  /** Tipo de actor: `"user"`, `"agent"`, `"system"` o `"plugin"`. */
  actorType?: "user" | "agent" | "system" | "plugin";
  /** Entidad principal involucrada en el evento. */
  entityId?: string;
  /** Tipo de la entidad principal. */
  entityType?: string;
  /** UUID de la empresa a la que pertenece este evento. */
  companyId: string;
  /** Carga útil tipada del evento. */
  payload: TPayload;
}

// ---------------------------------------------------------------------------
// Contexto de tarea
// ---------------------------------------------------------------------------

/**
 * Contexto pasado al manejador de una tarea de plugin cuando el host
 * dispara una ejecución programada.
 *
 * @see PLUGIN_SPEC.md §13.6 — `runJob`
 */
export interface PluginJobContext {
  /** Clave estable de la tarea que coincide con la declaración del manifiesto. */
  jobKey: string;
  /** UUID de esta instancia específica de ejecución de la tarea. */
  runId: string;
  /** Qué desencadenó esta ejecución. */
  trigger: "schedule" | "manual" | "retry";
  /** Marca de tiempo ISO 8601 de cuándo se programó el inicio de la ejecución. */
  scheduledAt: string;
}

// ---------------------------------------------------------------------------
// Contexto de ejecución de herramienta
// ---------------------------------------------------------------------------

/**
 * Contexto de ejecución pasado al manejador de una herramienta de plugin
 * cuando un agente invoca la herramienta.
 *
 * @see PLUGIN_SPEC.md §13.10 — `executeTool`
 */
export interface ToolRunContext {
  /** UUID del agente que invoca la herramienta. */
  agentId: string;
  /** UUID de la ejecución actual del agente. */
  runId: string;
  /** UUID de la empresa a la que pertenece la ejecución. */
  companyId: string;
  /** UUID del proyecto al que pertenece la ejecución. */
  projectId: string;
}

/**
 * Resultado devuelto por el manejador de una herramienta de plugin.
 *
 * @see PLUGIN_SPEC.md §13.10 — `executeTool`
 */
export interface ToolResult {
  /** Contenido de texto devuelto al agente. Requerido para respuestas exitosas. */
  content?: string;
  /** Datos estructurados devueltos junto con el contenido de texto o en su lugar. */
  data?: unknown;
  /** Si está presente, indica que la llamada a la herramienta falló. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Almacén de entidades del plugin
// ---------------------------------------------------------------------------

/**
 * Entrada para crear o actualizar una entidad propiedad del plugin.
 *
 * @see PLUGIN_SPEC.md §21.3 `plugin_entities`
 */
export interface PluginEntityUpsert {
  /** Tipo de entidad definido por el plugin (p. ej. `"linear-issue"`, `"github-pr"`). */
  entityType: string;
  /** Ámbito donde reside esta entidad. */
  scopeKind: PluginStateScopeKind;
  /** ID de ámbito opcional. */
  scopeId?: string;
  /** Identificador externo en el sistema remoto (p. ej. ID de issue de Linear). */
  externalId?: string;
  /** Título legible para mostrarse en la interfaz de Paperclip. */
  title?: string;
  /** Cadena de estado opcional. */
  status?: string;
  /** Blob completo de datos de la entidad. Debe ser serializable a JSON. */
  data: Record<string, unknown>;
}

/**
 * Registro de entidad propiedad de un plugin, tal como lo devuelve `ctx.entities.list()`.
 *
 * @see PLUGIN_SPEC.md §21.3 `plugin_entities`
 */
export interface PluginEntityRecord {
  /** Clave primaria UUID. */
  id: string;
  /** Tipo de entidad definido por el plugin. */
  entityType: string;
  /** Tipo de ámbito. */
  scopeKind: PluginStateScopeKind;
  /** ID de ámbito, si lo hay. */
  scopeId: string | null;
  /** Identificador externo, si lo hay. */
  externalId: string | null;
  /** Título legible. */
  title: string | null;
  /** Cadena de estado. */
  status: string | null;
  /** Datos completos de la entidad. */
  data: Record<string, unknown>;
  /** Marca de tiempo ISO 8601 de creación. */
  createdAt: string;
  /** Marca de tiempo ISO 8601 de última actualización. */
  updatedAt: string;
}

/**
 * Parámetros de consulta para `ctx.entities.list()`.
 */
export interface PluginEntityQuery {
  /** Filtrar por tipo de entidad. */
  entityType?: string;
  /** Filtrar por tipo de ámbito. */
  scopeKind?: PluginStateScopeKind;
  /** Filtrar por ID de ámbito. */
  scopeId?: string;
  /** Filtrar por ID externo. */
  externalId?: string;
  /** Número máximo de resultados a devolver. */
  limit?: number;
  /** Número de resultados a omitir (para paginación). */
  offset?: number;
}

// ---------------------------------------------------------------------------
// Metadatos del espacio de trabajo del proyecto (solo lectura vía ctx.projects)
// ---------------------------------------------------------------------------

/**
 * Metadatos del espacio de trabajo proporcionados por el host. Los plugins los usan
 * para resolver rutas locales del sistema de archivos para operaciones de
 * exploración de archivos, git, terminal y procesos.
 *
 * @see PLUGIN_SPEC.md §7 — Project Workspaces
 * @see PLUGIN_SPEC.md §20 — Local Tooling
 */
export interface PluginWorkspace {
  /** Clave primaria UUID. */
  id: string;
  /** UUID del proyecto padre. */
  projectId: string;
  /** Nombre para mostrar de este espacio de trabajo. */
  name: string;
  /** Ruta absoluta del sistema de archivos al directorio del espacio de trabajo. */
  path: string;
  /** Indica si este es el espacio de trabajo principal del proyecto. */
  isPrimary: boolean;
  /** Marca de tiempo ISO 8601 de creación. */
  createdAt: string;
  /** Marca de tiempo ISO 8601 de última actualización. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Superficies de la API del host expuestas vía PluginContext
// ---------------------------------------------------------------------------

/**
 * `ctx.config`: lee la configuración resuelta del operador para este plugin.
 *
 * Los workers de plugins reciben la configuración resuelta en la inicialización.
 * Usar `get()` para acceder a la configuración actual en cualquier momento. El host
 * llama a `configChanged` en el worker cuando el operador actualiza la
 * configuración en tiempo de ejecución.
 *
 * @see PLUGIN_SPEC.md §13.3 — `validateConfig`
 * @see PLUGIN_SPEC.md §13.4 — `configChanged`
 */
export interface PluginConfigClient {
  /**
   * Devuelve la configuración resuelta del operador para esta instancia del plugin.
   * El host valida los valores contra el `instanceConfigSchema` del plugin
   * antes de pasarlos al worker.
   */
  get(): Promise<Record<string, unknown>>;
}

/**
 * `ctx.events`: suscribirse a eventos de dominio de Paperclip y emitirlos.
 *
 * Requiere la capacidad `events.subscribe` para `on()`.
 * Requiere la capacidad `events.emit` para `emit()`.
 *
 * @see PLUGIN_SPEC.md §16 — Event System
 */
export interface PluginEventsClient {
  /**
   * Suscribirse a un evento de dominio central de Paperclip o a un evento
   * con espacio de nombres de plugin.
   *
   * @param name - Tipo de evento, p. ej. `"issue.created"` o `"plugin.@acme/linear.sync-done"`
   * @param fn - Manejador de evento asíncrono
   */
  on(name: PluginEventType | `plugin.${string}`, fn: (event: PluginEvent) => Promise<void>): () => void;

  /**
   * Suscribirse a un evento con un filtro opcional del lado del servidor.
   *
   * @param name - Tipo de evento
   * @param filter - Filtro del lado del servidor evaluado antes de despachar al worker
   * @param fn - Manejador de evento asíncrono
   * @returns Una función para cancelar la suscripción que elimina el manejador
   */
  on(name: PluginEventType | `plugin.${string}`, filter: EventFilter, fn: (event: PluginEvent) => Promise<void>): () => void;

  /**
   * Emitir un evento con espacio de nombres de plugin. Otros plugins con
   * `events.subscribe` pueden suscribirse usando `"plugin.<pluginId>.<eventName>"`.
   *
   * Requiere la capacidad `events.emit`.
   *
   * Los eventos emitidos por plugins reciben el espacio de nombres automáticamente:
   * si el ID del plugin es `"acme.linear"` y el nombre del evento es `"sync-done"`,
   * el tipo completo del evento se convierte en `"plugin.acme.linear.sync-done"`.
   *
   * @see PLUGIN_SPEC.md §16.2 — Plugin-to-Plugin Events
   *
   * @param name - Nombre simple del evento (p. ej. `"sync-done"`)
   * @param companyId - UUID de la empresa a la que pertenece este evento
   * @param payload - Carga útil del evento serializable a JSON
   */
  emit(name: string, companyId: string, payload: unknown): Promise<void>;
}

/**
 * `ctx.jobs`: registra manejadores para tareas programadas declaradas en el manifiesto.
 *
 * Requiere la capacidad `jobs.schedule`.
 *
 * @see PLUGIN_SPEC.md §17 — Scheduled Jobs
 */
export interface PluginJobsClient {
  /**
   * Registra un manejador para una tarea programada.
   *
   * La `key` debe coincidir con un `jobKey` declarado en el manifiesto del plugin.
   * El host llama a este manejador según el `schedule` declarado de la tarea.
   *
   * @param key - Clave de tarea que coincide con la declaración del manifiesto
   * @param fn - Manejador de tarea asíncrono
   */
  register(key: string, fn: (job: PluginJobContext) => Promise<void>): void;
}

/**
 * Un registro de lanzador en tiempo de ejecución usa la misma forma de declaración
 * que una entrada de lanzador del manifiesto.
 */
export type PluginLauncherRegistration = PluginLauncherDeclaration;

/**
 * `ctx.launchers`: registra declaraciones de lanzadores en tiempo de ejecución.
 */
export interface PluginLaunchersClient {
  /**
   * Registra metadatos de lanzador para que el host los descubra.
   *
   * Si un lanzador con el mismo id se registra más de una vez, la declaración
   * más reciente reemplaza a la anterior.
   */
  register(launcher: PluginLauncherRegistration): void;
}

/**
 * `ctx.http`: realiza solicitudes HTTP salientes.
 *
 * Requiere la capacidad `http.outbound`.
 *
 * @see PLUGIN_SPEC.md §15.1 — Capabilities: Runtime/Integration
 */
export interface PluginHttpClient {
  /**
   * Realiza una solicitud HTTP saliente.
   *
   * El host exige la capacidad `http.outbound` antes de permitir la llamada.
   * Los plugins también pueden usar el `fetch` estándar de Node u otras
   * bibliotecas directamente; este cliente existe para el rastreo gestionado
   * por el host y el registro de auditoría.
   *
   * @param url - URL de destino
   * @param init - Opciones estándar de `RequestInit`
   * @returns La respuesta
   */
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * `ctx.secrets`: resuelve referencias a secretos.
 *
 * Requiere la capacidad `secrets.read-ref`.
 *
 * Los plugins almacenan *referencias* a secretos en su configuración (p. ej. un
 * nombre de secreto). Este cliente resuelve la referencia mediante el sistema
 * de proveedores de secretos de Paperclip y devuelve el valor resuelto en el
 * momento de la ejecución.
 *
 * @see PLUGIN_SPEC.md §22 — Secrets
 */
export interface PluginSecretsClient {
  /**
   * Resuelve una referencia a un secreto a su valor actual.
   *
   * La referencia es un identificador de cadena que apunta a un secreto
   * configurado en el proveedor de secretos de Paperclip (p. ej. `"MY_API_KEY"`).
   *
   * Los valores de secretos se resuelven en el momento de la llamada y nunca
   * deben almacenarse en caché ni escribirse en registros, configuración u
   * otro almacenamiento persistente.
   *
   * @param secretRef - La cadena de referencia al secreto de la configuración del plugin
   * @returns El valor resuelto del secreto
   */
  resolve(secretRef: string): Promise<string>;
}

/**
 * Entrada para escribir un registro de actividad del plugin.
 *
 * @see PLUGIN_SPEC.md §21.4 — Activity Log Changes
 */
export interface PluginActivityLogEntry {
  /** UUID de la empresa a la que pertenece esta actividad. Requerido para auditoría. */
  companyId: string;
  /** Descripción legible de la actividad. */
  message: string;
  /** Tipo de entidad opcional al que se refiere esta actividad. */
  entityType?: string;
  /** ID de entidad opcional al que se refiere esta actividad. */
  entityId?: string;
  /** Metadatos adicionales opcionales. */
  metadata?: Record<string, unknown>;
}

/**
 * `ctx.activity`: escribe entradas de registro de actividad originadas por el plugin.
 *
 * Requiere la capacidad `activity.log.write`.
 *
 * @see PLUGIN_SPEC.md §21.4 — Activity Log Changes
 */
export interface PluginActivityClient {
  /**
   * Escribe una entrada de registro de actividad atribuida a este plugin.
   *
   * El host escribe la entrada con `actor_type = plugin` y
   * `actor_id = <pluginId>`.
   *
   * @param entry - La entrada de registro de actividad a escribir
   */
  log(entry: PluginActivityLogEntry): Promise<void>;
}

/**
 * `ctx.state`: lee y escribe estado clave-valor acotado al plugin.
 *
 * Cada plugin obtiene un espacio de nombres aislado: el estado escrito por el
 * plugin A nunca puede ser leído ni sobrescrito por el plugin B. Dentro de un
 * plugin, el estado se divide por una clave compuesta de cinco partes:
 * `(pluginId, scopeKind, scopeId, namespace, stateKey)`.
 *
 * **Tipos de ámbito**
 *
 * | `scopeKind` | `scopeId` | Uso típico |
 * |-------------|-----------|-------------|
 * | `"instance"` | omitir | Banderas globales, marcas de tiempo de última sincronización completa |
 * | `"company"` | UUID de empresa | Cursores de sincronización por empresa |
 * | `"project"` | UUID de proyecto | Ajustes por proyecto, seguimiento de ramas |
 * | `"project_workspace"` | UUID de espacio de trabajo | Estado por espacio de trabajo |
 * | `"agent"` | UUID de agente | Memoria por agente |
 * | `"issue"` | UUID de issue | Claves de idempotencia, IDs externos vinculados |
 * | `"goal"` | UUID de objetivo | Progreso por objetivo |
 * | `"run"` | UUID de ejecución | Puntos de control por ejecución |
 *
 * **Espacios de nombres**
 *
 * El campo opcional `namespace` (por defecto: `"default"`) permite agrupar
 * claves relacionadas dentro de un ámbito sin riesgo de colisiones entre
 * distintos subsistemas lógicos dentro del mismo plugin.
 *
 * **Seguridad**
 *
 * Nunca almacenar valores resueltos de secretos. Almacenar solo referencias a
 * secretos y resolverlas en el momento de la llamada vía `ctx.secrets.resolve()`.
 *
 * @example
 * ```ts
 * // Bandera global de instancia
 * await ctx.state.set({ scopeKind: "instance", stateKey: "schema-version" }, 2);
 *
 * // Clave de idempotencia por issue
 * const synced = await ctx.state.get({ scopeKind: "issue", scopeId: issueId, stateKey: "synced-to-linear" });
 * if (!synced) {
 *   await syncToLinear(issueId);
 *   await ctx.state.set({ scopeKind: "issue", scopeId: issueId, stateKey: "synced-to-linear" }, true);
 * }
 *
 * // Por proyecto, con espacio de nombres para dos integraciones
 * await ctx.state.set({ scopeKind: "project", scopeId: projectId, namespace: "linear", stateKey: "cursor" }, cursor);
 * await ctx.state.set({ scopeKind: "project", scopeId: projectId, namespace: "github", stateKey: "last-event" }, eventId);
 * ```
 *
 * Se requiere la capacidad `plugin.state.read` para `get()`.
 * Se requiere la capacidad `plugin.state.write` para `set()` y `delete()`.
 *
 * @see PLUGIN_SPEC.md §21.3 `plugin_state`
 */
export interface PluginStateClient {
  /**
   * Lee un valor de estado.
   *
   * Devuelve el valor JSON almacenado tal cual, o `null` si no se ha establecido
   * ninguna entrada para esta combinación de ámbito+clave. Los valores falsy
   * (`false`, `0`, `""`) se devuelven correctamente y no se confunden con
   * "no establecido".
   *
   * @param input - Clave de ámbito que identifica la entrada a leer
   * @returns El valor JSON almacenado, o `null` si no se ha establecido ningún valor
   */
  get(input: ScopeKey): Promise<unknown>;

  /**
   * Escribe un valor de estado. Crea la fila si no existe; la reemplaza
   * atómicamente (upsert) si existe. Seguro para llamadas concurrentes.
   *
   * Se acepta cualquier valor serializable a JSON: objetos, arreglos, cadenas,
   * números, booleanos y `null`.
   *
   * @param input - Clave de ámbito que identifica la entrada a escribir
   * @param value - Valor serializable a JSON a almacenar
   */
  set(input: ScopeKey, value: unknown): Promise<void>;

  /**
   * Elimina un valor de estado. No hace nada silenciosamente si la entrada no
   * existe (idempotente por diseño: seguro llamarlo sin un `get()` previo).
   *
   * @param input - Clave de ámbito que identifica la entrada a eliminar
   */
  delete(input: ScopeKey): Promise<void>;
}

/**
 * `ctx.entities`: crea y consulta registros de entidades propiedad del plugin.
 *
 * @see PLUGIN_SPEC.md §21.3 `plugin_entities`
 */
export interface PluginEntitiesClient {
  /**
   * Crea o actualiza un registro de entidad de plugin (upsert por `externalId`
   * dentro del ámbito dado, o por `id` si se proporciona).
   *
   * @param input - Datos de la entidad para upsert
   */
  upsert(input: PluginEntityUpsert): Promise<PluginEntityRecord>;

  /**
   * Consulta registros de entidades de plugin.
   *
   * @param query - Criterios de filtro
   * @returns Registros de entidades coincidentes
   */
  list(query: PluginEntityQuery): Promise<PluginEntityRecord[]>;
}

/**
 * `ctx.projects`: lee metadatos de proyectos y espacios de trabajo.
 *
 * Requiere la capacidad `projects.read`.
 * Requiere la capacidad `project.workspaces.read` para operaciones de espacio de trabajo.
 *
 * @see PLUGIN_SPEC.md §7 — Project Workspaces
 */
export interface PluginProjectsClient {
  /**
   * Lista los proyectos visibles para el plugin.
   *
   * Requiere la capacidad `projects.read`.
   */
  list(input: { companyId: string; limit?: number; offset?: number }): Promise<Project[]>;

  /**
   * Obtiene un solo proyecto por ID.
   *
   * Requiere la capacidad `projects.read`.
   */
  get(projectId: string, companyId: string): Promise<Project | null>;

  /**
   * Lista todos los espacios de trabajo adjuntos a un proyecto.
   *
   * @param projectId - UUID del proyecto
   * @param companyId - UUID de la empresa propietaria del proyecto
   * @returns Todos los espacios de trabajo del proyecto, ordenados con el principal primero
   */
  listWorkspaces(projectId: string, companyId: string): Promise<PluginWorkspace[]>;

  /**
   * Obtiene el espacio de trabajo principal de un proyecto.
   *
   * @param projectId - UUID del proyecto
   * @param companyId - UUID de la empresa propietaria del proyecto
   * @returns El espacio de trabajo principal, o `null` si no hay ningún espacio de trabajo configurado
   */
  getPrimaryWorkspace(projectId: string, companyId: string): Promise<PluginWorkspace | null>;

  /**
   * Resuelve el espacio de trabajo principal de un issue buscando el proyecto
   * del issue y devolviendo su espacio de trabajo principal.
   *
   * Este es un método de conveniencia que combina `issues.get()` y
   * `getPrimaryWorkspace()` en una sola llamada RPC.
   *
   * @param issueId - UUID del issue
   * @param companyId - UUID de la empresa propietaria del issue
   * @returns El espacio de trabajo principal del proyecto del issue, o `null`
   *   si el issue no tiene proyecto o el proyecto no tiene espacio de trabajo
   *
   * @see PLUGIN_SPEC.md §20 — Local Tooling
   */
  getWorkspaceForIssue(issueId: string, companyId: string): Promise<PluginWorkspace | null>;
}

/**
 * `ctx.data`: registra manejadores `getData` que respaldan `usePluginData()` en
 * los componentes frontend del plugin.
 *
 * La interfaz del plugin llama a `usePluginData(key, params)`, que se enruta a
 * través del puente del host hasta el manejador registrado del worker.
 *
 * @see PLUGIN_SPEC.md §13.8 — `getData`
 */
export interface PluginDataClient {
  /**
   * Registra un manejador para una clave de datos definida por el plugin.
   *
   * @param key - Identificador de cadena estable para este tipo de datos (p. ej. `"sync-health"`)
   * @param handler - Función asíncrona que recibe los parámetros de la solicitud y devuelve datos serializables a JSON
   */
  register(key: string, handler: (params: Record<string, unknown>) => Promise<unknown>): void;
}

/**
 * `ctx.actions`: registra manejadores `performAction` que respaldan
 * `usePluginAction()` en los componentes frontend del plugin.
 *
 * @see PLUGIN_SPEC.md §13.9 — `performAction`
 */
export interface PluginActionsClient {
  /**
   * Registra un manejador para una clave de acción definida por el plugin.
   *
   * @param key - Identificador de cadena estable para esta acción (p. ej. `"resync"`)
   * @param handler - Función asíncrona que recibe los parámetros de la acción y devuelve un resultado
   */
  register(key: string, handler: (params: Record<string, unknown>) => Promise<unknown>): void;
}

/**
 * `ctx.tools`: registra manejadores para herramientas de agente declaradas en el manifiesto.
 *
 * Requiere la capacidad `agent.tools.register`.
 *
 * Los nombres de herramientas reciben automáticamente el espacio de nombres del ID del plugin en tiempo de ejecución.
 *
 * @see PLUGIN_SPEC.md §11 — Agent Tools
 */
export interface PluginToolsClient {
  /**
   * Registra un manejador para una herramienta de agente contribuida por el plugin.
   *
   * @param name - Nombre de la herramienta que coincide con la declaración del manifiesto (sin prefijo de espacio de nombres)
   * @param declaration - Metadatos de la herramienta (displayName, description, parametersSchema)
   * @param fn - Manejador asíncrono que ejecuta la herramienta
   */
  register(
    name: string,
    declaration: Pick<PluginToolDeclaration, "displayName" | "description" | "parametersSchema">,
    fn: (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>,
  ): void;
}

/**
 * `ctx.logger`: registro estructurado desde el worker del plugin.
 *
 * La salida de registro es capturada por el host, almacenada y mostrada en el
 * panel de salud del plugin.
 *
 * @see PLUGIN_SPEC.md §26.1 — Logging
 */
export interface PluginLogger {
  /** Registra un mensaje informativo. */
  info(message: string, meta?: Record<string, unknown>): void;
  /** Registra una advertencia. */
  warn(message: string, meta?: Record<string, unknown>): void;
  /** Registra un error. */
  error(message: string, meta?: Record<string, unknown>): void;
  /** Registra un mensaje de depuración (puede suprimirse en producción). */
  debug(message: string, meta?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Métricas del plugin
// ---------------------------------------------------------------------------

/**
 * `ctx.metrics`: escribe métricas contribuidas por el plugin.
 *
 * Requiere la capacidad `metrics.write`.
 *
 * @see PLUGIN_SPEC.md §15.1 — Capabilities: Data Write
 */
export interface PluginMetricsClient {
  /**
   * Escribe un punto de datos de métrica numérica.
   *
   * @param name - Nombre de la métrica (el host le aplica el espacio de nombres del plugin)
   * @param value - Valor numérico
   * @param tags - Etiquetas clave-valor opcionales para filtrar
   */
  write(name: string, value: number, tags?: Record<string, string>): Promise<void>;
}

/**
 * `ctx.companies`: lee metadatos de empresas.
 *
 * Requiere la capacidad `companies.read`.
 */
export interface PluginCompaniesClient {
  /**
   * Lista las empresas visibles para este plugin.
   */
  list(input?: { limit?: number; offset?: number }): Promise<Company[]>;

  /**
   * Obtiene una empresa por ID.
   */
  get(companyId: string): Promise<Company | null>;
}

/**
 * `ctx.issues.documents`: lee y escribe documentos de issues.
 *
 * Requiere:
 * - `issue.documents.read` para `list` y `get`
 * - `issue.documents.write` para `upsert` y `delete`
 *
 * @see PLUGIN_SPEC.md §14 — Superficie SDK
 */
export interface PluginIssueDocumentsClient {
  /**
   * Lista todos los documentos adjuntos a un issue.
   *
   * Devuelve metadatos de resumen (id, key, title, format, timestamps) sin
   * el cuerpo completo del documento. Usar `get()` para obtener el cuerpo de
   * un documento específico.
   *
   * Requiere la capacidad `issue.documents.read`.
   */
  list(issueId: string, companyId: string): Promise<IssueDocumentSummary[]>;

  /**
   * Obtiene un solo documento por clave, incluyendo su contenido completo.
   *
   * Devuelve `null` si no existe ningún documento con la clave dada.
   *
   * Requiere la capacidad `issue.documents.read`.
   *
   * @param issueId - UUID del issue
   * @param key - Clave del documento (p. ej. `"plan"`, `"design-spec"`)
   * @param companyId - UUID de la empresa
   */
  get(issueId: string, key: string, companyId: string): Promise<IssueDocument | null>;

  /**
   * Crea o actualiza un documento en un issue.
   *
   * Si ya existe un documento con la clave dada, se actualiza y se crea una
   * nueva revisión. Si no existe, se crea.
   *
   * Requiere la capacidad `issue.documents.write`.
   *
   * @param input - Datos del documento incluyendo issueId, key, body y title/format/changeSummary opcionales
   */
  upsert(input: {
    issueId: string;
    key: string;
    body: string;
    companyId: string;
    title?: string;
    format?: string;
    changeSummary?: string;
  }): Promise<IssueDocument>;

  /**
   * Elimina un documento y todas sus revisiones.
   *
   * No hace nada silenciosamente si el documento no existe (idempotente).
   *
   * Requiere la capacidad `issue.documents.write`.
   *
   * @param issueId - UUID del issue
   * @param key - Clave del documento a eliminar
   * @param companyId - UUID de la empresa
   */
  delete(issueId: string, key: string, companyId: string): Promise<void>;
}

/**
 * `ctx.issues`: lee y modifica issues además de comentarios.
 *
 * Requiere:
 * - `issues.read` para operaciones de lectura
 * - `issues.create` para crear
 * - `issues.update` para actualizar
 * - `issue.comments.read` para `listComments`
 * - `issue.comments.create` para `createComment`
 * - `issue.documents.read` para `documents.list` y `documents.get`
 * - `issue.documents.write` para `documents.upsert` y `documents.delete`
 */
export interface PluginIssuesClient {
  list(input: {
    companyId: string;
    projectId?: string;
    assigneeAgentId?: string;
    status?: Issue["status"];
    limit?: number;
    offset?: number;
  }): Promise<Issue[]>;
  get(issueId: string, companyId: string): Promise<Issue | null>;
  create(input: {
    companyId: string;
    projectId?: string;
    goalId?: string;
    parentId?: string;
    title: string;
    description?: string;
    priority?: Issue["priority"];
    assigneeAgentId?: string;
  }): Promise<Issue>;
  update(
    issueId: string,
    patch: Partial<Pick<
      Issue,
      "title" | "description" | "status" | "priority" | "assigneeAgentId"
    >>,
    companyId: string,
  ): Promise<Issue>;
  listComments(issueId: string, companyId: string): Promise<IssueComment[]>;
  createComment(issueId: string, body: string, companyId: string): Promise<IssueComment>;
  /** Lee y escribe documentos de issues. Requiere `issue.documents.read` / `issue.documents.write`. */
  documents: PluginIssueDocumentsClient;
}

/**
 * `ctx.agents`: lee y gestiona agentes.
 *
 * Requiere `agents.read` para lecturas; `agents.pause` / `agents.resume` /
 * `agents.invoke` para operaciones de escritura.
 */
export interface PluginAgentsClient {
  list(input: { companyId: string; status?: Agent["status"]; limit?: number; offset?: number }): Promise<Agent[]>;
  get(agentId: string, companyId: string): Promise<Agent | null>;
  /** Pausa un agente. Lanza si el agente está terminado o no se encuentra. Requiere `agents.pause`. */
  pause(agentId: string, companyId: string): Promise<Agent>;
  /** Reanuda un agente pausado (establece el estado en inactivo). Lanza si está terminado, pending_approval o no se encuentra. Requiere `agents.resume`. */
  resume(agentId: string, companyId: string): Promise<Agent>;
  /** Invoca (despierta) un agente con un payload de prompt. Lanza si está pausado, terminado, pending_approval o no se encuentra. Requiere `agents.invoke`. */
  invoke(agentId: string, companyId: string, opts: { prompt: string; reason?: string }): Promise<{ runId: string }>;
  /** Crea, envía mensajes y cierra sesiones de chat de agentes. Requiere capacidades `agent.sessions.*`. */
  sessions: PluginAgentSessionsClient;
}

// ---------------------------------------------------------------------------
// Sesiones de agente: chat bidireccional con agentes
// ---------------------------------------------------------------------------

/**
 * Representa una sesión conversacional activa con un agente.
 * Corresponde a una fila `AgentTaskSession` en el host.
 */
export interface AgentSession {
  sessionId: string;
  agentId: string;
  companyId: string;
  status: "active" | "closed";
  createdAt: string;
}

/**
 * Un evento de flujo recibido durante una llamada `sendMessage` de la sesión.
 * Entregado vía notificaciones JSON-RPC del host al worker.
 */
export interface AgentSessionEvent {
  sessionId: string;
  runId: string;
  seq: number;
  /** El tipo de evento: "chunk" para datos de salida, "status" para cambios de estado de la ejecución, "done" para fin del flujo, "error" para fallos. */
  eventType: "chunk" | "status" | "done" | "error";
  stream: "stdout" | "stderr" | "system" | null;
  message: string | null;
  payload: Record<string, unknown> | null;
}

/**
 * Resultado de enviar un mensaje a una sesión.
 */
export interface AgentSessionSendResult {
  runId: string;
}

/**
 * `ctx.agents.sessions`: crea, envía mensajes y cierra sesiones de chat de agentes.
 *
 * Requiere `agent.sessions.create` para crear, `agent.sessions.list` para listar,
 * `agent.sessions.send` para sendMessage, `agent.sessions.close` para cerrar.
 */
export interface PluginAgentSessionsClient {
  /** Crea una nueva sesión conversacional con un agente. Requiere `agent.sessions.create`. */
  create(agentId: string, companyId: string, opts?: {
    taskKey?: string;
    reason?: string;
  }): Promise<AgentSession>;

  /** Lista las sesiones activas de un agente propiedad de este plugin. Requiere `agent.sessions.list`. */
  list(agentId: string, companyId: string): Promise<AgentSession[]>;

  /**
   * Envía un mensaje a una sesión y recibe eventos de flujo mediante el callback `onEvent`.
   * Devuelve inmediatamente con `{ runId }`. Los eventos se entregan de forma asíncrona.
   * Requiere `agent.sessions.send`.
   */
  sendMessage(sessionId: string, companyId: string, opts: {
    prompt: string;
    reason?: string;
    onEvent?: (event: AgentSessionEvent) => void;
  }): Promise<AgentSessionSendResult>;

  /** Cierra una sesión, liberando recursos. Requiere `agent.sessions.close`. */
  close(sessionId: string, companyId: string): Promise<void>;
}

/**
 * `ctx.goals`: lee y modifica objetivos.
 *
 * Requiere:
 * - `goals.read` para operaciones de lectura
 * - `goals.create` para crear
 * - `goals.update` para actualizar
 */
export interface PluginGoalsClient {
  list(input: {
    companyId: string;
    level?: Goal["level"];
    status?: Goal["status"];
    limit?: number;
    offset?: number;
  }): Promise<Goal[]>;
  get(goalId: string, companyId: string): Promise<Goal | null>;
  create(input: {
    companyId: string;
    title: string;
    description?: string;
    level?: Goal["level"];
    status?: Goal["status"];
    parentId?: string;
    ownerAgentId?: string;
  }): Promise<Goal>;
  update(
    goalId: string,
    patch: Partial<Pick<
      Goal,
      "title" | "description" | "level" | "status" | "parentId" | "ownerAgentId"
    >>,
    companyId: string,
  ): Promise<Goal>;
}

// ---------------------------------------------------------------------------
// Streaming (canal push de worker a interfaz)
// ---------------------------------------------------------------------------

/**
 * `ctx.streams`: envía eventos en tiempo real del worker a la interfaz del plugin.
 *
 * El worker abre un canal con nombre, emite eventos en él y lo cierra al
 * terminar. En el lado de la interfaz, `usePluginStream(channel)` recibe
 * estos eventos en tiempo real vía SSE.
 *
 * Los flujos están acotados a `(pluginId, channel, companyId)`. Múltiples clientes
 * de interfaz pueden suscribirse al mismo canal al mismo tiempo.
 *
 * @example
 * ```ts
 * // Worker: envía tokens de chat a la interfaz
 * ctx.streams.open("chat", companyId);
 * for await (const token of tokenStream) {
 *   ctx.streams.emit("chat", { type: "token", text: token });
 * }
 * ctx.streams.close("chat");
 * ```
 *
 * @see usePluginStream in `@paperclipai/plugin-sdk/ui`
 */
export interface PluginStreamsClient {
  /**
   * Abre un canal de flujo con nombre. Opcional: `emit()` lo abre implícitamente si es necesario.
   * Envía un evento `stream:open` a los clientes de interfaz conectados.
   */
  open(channel: string, companyId: string): void;

  /**
   * Envía un evento a todos los clientes de interfaz suscritos a este canal.
   *
   * @param channel - Nombre del canal de flujo (p. ej. `"chat"`, `"logs"`)
   * @param event - Carga útil del evento serializable a JSON
   */
  emit(channel: string, event: unknown): void;

  /**
   * Cierra un canal de flujo. Envía un evento `stream:close` a los clientes
   * de interfaz conectados para que sepan que no llegarán más eventos.
   */
  close(channel: string): void;
}

// ---------------------------------------------------------------------------
// Contexto completo del plugin
// ---------------------------------------------------------------------------

/**
 * El objeto de contexto completo del plugin pasado al worker del plugin en la inicialización.
 *
 * Esta es la interfaz central que los autores de plugins usan para interactuar
 * con el host. Cada cliente está protegido por capacidades: llamar a un método
 * de cliente sin la capacidad requerida declarada en el manifiesto produce un
 * error en tiempo de ejecución.
 *
 * @example
 * ```ts
 * import { definePlugin } from "@paperclipai/plugin-sdk";
 *
 * export default definePlugin({
 *   async setup(ctx) {
 *     ctx.events.on("issue.created", async (event) => {
 *       ctx.logger.info("Issue creado", { issueId: event.entityId });
 *     });
 *
 *     ctx.data.register("sync-health", async ({ companyId }) => {
 *       const state = await ctx.state.get({ scopeKind: "company", scopeId: String(companyId), stateKey: "last-sync" });
 *       return { lastSync: state };
 *     });
 *   },
 * });
 * ```
 *
 * @see PLUGIN_SPEC.md §14 — Superficie SDK
 */
export interface PluginContext {
  /** El manifiesto del plugin tal como se validó en el momento de la instalación. */
  manifest: PaperclipPluginManifestV1;

  /** Lee la configuración resuelta del operador. */
  config: PluginConfigClient;

  /** Suscribirse a eventos de dominio y emitirlos. Requiere `events.subscribe` / `events.emit`. */
  events: PluginEventsClient;

  /** Registra manejadores para tareas programadas. Requiere `jobs.schedule`. */
  jobs: PluginJobsClient;

  /** Registra metadatos de lanzador que el host puede mostrar en puntos de entrada de la interfaz del plugin. */
  launchers: PluginLaunchersClient;

  /** Realiza solicitudes HTTP salientes. Requiere `http.outbound`. */
  http: PluginHttpClient;

  /** Resuelve referencias a secretos. Requiere `secrets.read-ref`. */
  secrets: PluginSecretsClient;

  /** Escribe entradas de registro de actividad. Requiere `activity.log.write`. */
  activity: PluginActivityClient;

  /** Lee y escribe estado acotado al plugin. Requiere `plugin.state.read` / `plugin.state.write`. */
  state: PluginStateClient;

  /** Crea y consulta registros de entidades propiedad del plugin. */
  entities: PluginEntitiesClient;

  /** Lee metadatos de proyectos y espacios de trabajo. Requiere `projects.read` / `project.workspaces.read`. */
  projects: PluginProjectsClient;

  /** Lee metadatos de empresas. Requiere `companies.read`. */
  companies: PluginCompaniesClient;

  /** Lee y escribe issues, comentarios y documentos. Requiere capacidades de issues. */
  issues: PluginIssuesClient;

  /** Lee y gestiona agentes. Requiere `agents.read` para lecturas; `agents.pause` / `agents.resume` / `agents.invoke` para operaciones de escritura. */
  agents: PluginAgentsClient;

  /** Lee y modifica objetivos. Requiere `goals.read` para lecturas; `goals.create` / `goals.update` para operaciones de escritura. */
  goals: PluginGoalsClient;

  /** Registra manejadores getData para los componentes de interfaz del plugin. */
  data: PluginDataClient;

  /** Registra manejadores performAction para los componentes de interfaz del plugin. */
  actions: PluginActionsClient;

  /** Envía eventos en tiempo real del worker a la interfaz del plugin vía SSE. */
  streams: PluginStreamsClient;

  /** Registra manejadores de herramientas de agente. Requiere `agent.tools.register`. */
  tools: PluginToolsClient;

  /** Escribe métricas del plugin. Requiere `metrics.write`. */
  metrics: PluginMetricsClient;

  /** Registrador estructurado. La salida se captura y se muestra en el panel de salud del plugin. */
  logger: PluginLogger;
}
