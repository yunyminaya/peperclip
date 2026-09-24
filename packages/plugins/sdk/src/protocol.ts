/**
 * Tipos de mensajes JSON-RPC 2.0 y helpers de protocolo para el canal IPC
 * de host a worker.
 *
 * El runtime de plugins de Paperclip usa JSON-RPC 2.0 sobre stdio para
 * comunicarse entre el proceso del host y cada proceso de worker de plugin.
 * Este módulo define:
 *
 * - Tipos de envoltorio centrales de JSON-RPC 2.0 (solicitud, respuesta, notificación, error)
 * - Códigos de error estándar y específicos de plugin
 * - Mapas tipados de métodos para llamadas de host a worker y de worker a host
 * - Funciones de ayuda para crear mensajes bien formados
 *
 * @see PLUGIN_SPEC.md §12.1 — Modelo de proceso
 * @see PLUGIN_SPEC.md §13 — Protocolo host-worker
 * @see https://www.jsonrpc.org/specification
 */

import type {
  PaperclipPluginManifestV1,
  PluginLauncherBounds,
  PluginLauncherRenderContextSnapshot,
  PluginLauncherRenderEnvironment,
  PluginStateScopeKind,
  Company,
  Project,
  Issue,
  IssueComment,
  IssueDocument,
  IssueDocumentSummary,
  Agent,
  Goal,
} from "@paperclipai/shared";
export type { PluginLauncherRenderContextSnapshot } from "@paperclipai/shared";

import type {
  PluginEvent,
  PluginJobContext,
  PluginWorkspace,
  ToolRunContext,
  ToolResult,
} from "./types.js";
import type {
  PluginHealthDiagnostics,
  PluginConfigValidationResult,
  PluginWebhookInput,
} from "./define-plugin.js";

// ---------------------------------------------------------------------------
// JSON-RPC 2.0: tipos centrales del protocolo
// ---------------------------------------------------------------------------

/** La versión del protocolo JSON-RPC. Siempre `"2.0"`. */
export const JSONRPC_VERSION = "2.0" as const;

/**
 * Un identificador único de solicitud. JSON-RPC 2.0 permite cadenas o números;
 * usamos cadenas (UUIDs o contadores monótonos) para todos los mensajes de Paperclip.
 */
export type JsonRpcId = string | number;

/**
 * Un mensaje de solicitud JSON-RPC 2.0.
 *
 * El host envía solicitudes al worker (o viceversa) y espera una respuesta
 * coincidente con el mismo `id`.
 */
export interface JsonRpcRequest<
  TMethod extends string = string,
  TParams = unknown,
> {
  readonly jsonrpc: typeof JSONRPC_VERSION;
  /** Identificador único de solicitud. Debe repetirse en la respuesta. */
  readonly id: JsonRpcId;
  /** El nombre del método RPC a invocar. */
  readonly method: TMethod;
  /** Parámetros estructurados para la llamada al método. */
  readonly params: TParams;
}

/**
 * Una respuesta exitosa JSON-RPC 2.0.
 */
export interface JsonRpcSuccessResponse<TResult = unknown> {
  readonly jsonrpc: typeof JSONRPC_VERSION;
  /** Identificador de solicitud repetido. */
  readonly id: JsonRpcId;
  /** El valor de retorno del método. */
  readonly result: TResult;
  readonly error?: never;
}

/**
 * Un objeto de error JSON-RPC 2.0 embebido en una respuesta de error.
 */
export interface JsonRpcError<TData = unknown> {
  /** Código de error legible por máquina. */
  readonly code: number;
  /** Mensaje de error legible. */
  readonly message: string;
  /** Datos de error estructurados opcionales. */
  readonly data?: TData;
}

/**
 * Una respuesta de error JSON-RPC 2.0.
 */
export interface JsonRpcErrorResponse<TData = unknown> {
  readonly jsonrpc: typeof JSONRPC_VERSION;
  /** Identificador de solicitud repetido. */
  readonly id: JsonRpcId | null;
  readonly result?: never;
  /** El objeto de error. */
  readonly error: JsonRpcError<TData>;
}

/**
 * Una respuesta JSON-RPC 2.0: éxito o error.
 */
export type JsonRpcResponse<TResult = unknown, TData = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse<TData>;

/**
 * Una notificación JSON-RPC 2.0 (una solicitud sin `id`).
 *
 * Las notificaciones son de disparo y olvido: no se espera respuesta.
 */
export interface JsonRpcNotification<
  TMethod extends string = string,
  TParams = unknown,
> {
  readonly jsonrpc: typeof JSONRPC_VERSION;
  readonly id?: never;
  /** El nombre del método de la notificación. */
  readonly method: TMethod;
  /** Parámetros estructurados para la notificación. */
  readonly params: TParams;
}

/**
 * Cualquier mensaje JSON-RPC 2.0 bien formado (solicitud, respuesta o notificación).
 */
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;

// ---------------------------------------------------------------------------
// Códigos de error
// ---------------------------------------------------------------------------

/**
 * Códigos de error estándar de JSON-RPC 2.0.
 *
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const JSONRPC_ERROR_CODES = {
  /** El servidor recibió JSON inválido. */
  PARSE_ERROR: -32700,
  /** El JSON enviado no es un objeto Request válido. */
  INVALID_REQUEST: -32600,
  /** El método no existe o no está disponible. */
  METHOD_NOT_FOUND: -32601,
  /** Parámetro(s) de método inválido(s). */
  INVALID_PARAMS: -32602,
  /** Error interno de JSON-RPC. */
  INTERNAL_ERROR: -32603,
} as const;

export type JsonRpcErrorCode =
  (typeof JSONRPC_ERROR_CODES)[keyof typeof JSONRPC_ERROR_CODES];

/**
 * Códigos de error específicos de plugins de Paperclip.
 *
 * Viven en el rango reservado "server error" de JSON-RPC (-32000 a -32099)
 * según lo especificado por JSON-RPC 2.0 para errores de servidor definidos
 * por la implementación.
 *
 * @see PLUGIN_SPEC.md §19.7 — Propagación de errores a través del puente
 */
export const PLUGIN_RPC_ERROR_CODES = {
  /** El proceso del worker no está en ejecución o no es alcanzable. */
  WORKER_UNAVAILABLE: -32000,
  /** El plugin no tiene la capacidad requerida para esta operación. */
  CAPABILITY_DENIED: -32001,
  /** El worker reportó un error no manejado durante la ejecución del método. */
  WORKER_ERROR: -32002,
  /** La llamada al método agotó el tiempo esperando la respuesta del worker. */
  TIMEOUT: -32003,
  /** El worker no implementa el método opcional solicitado. */
  METHOD_NOT_IMPLEMENTED: -32004,
  /** Comodín para errores que no encajan en otras categorías. */
  UNKNOWN: -32099,
} as const;

export type PluginRpcErrorCode =
  (typeof PLUGIN_RPC_ERROR_CODES)[keyof typeof PLUGIN_RPC_ERROR_CODES];

// ---------------------------------------------------------------------------
// Firmas de métodos de host a worker (§13 Protocolo host-worker)
// ---------------------------------------------------------------------------

/**
 * Entrada para el método RPC `initialize`.
 *
 * @see PLUGIN_SPEC.md §13.1 — `initialize`
 */
export interface InitializeParams {
  /** Instantánea completa del manifiesto del plugin. */
  manifest: PaperclipPluginManifestV1;
  /** Configuración resuelta del operador (validada contra `instanceConfigSchema`). */
  config: Record<string, unknown>;
  /** Metadatos a nivel de instancia. */
  instanceInfo: {
    /** UUID de esta instancia de Paperclip. */
    instanceId: string;
    /** Versión semver del host de Paperclip en ejecución. */
    hostVersion: string;
  };
  /** Versión de la API del host. */
  apiVersion: number;
}

/**
 * Resultado devuelto por el método RPC `initialize`.
 */
export interface InitializeResult {
  /** Indica si la inicialización tuvo éxito. */
  ok: boolean;
  /** Métodos opcionales que el worker ha implementado (p. ej. "validateConfig", "onEvent"). */
  supportedMethods?: string[];
}

/**
 * Entrada para el método RPC `configChanged`.
 *
 * @see PLUGIN_SPEC.md §13.4 — `configChanged`
 */
export interface ConfigChangedParams {
  /** La configuración recién resuelta. */
  config: Record<string, unknown>;
}

/**
 * Entrada para el método RPC `validateConfig`.
 *
 * @see PLUGIN_SPEC.md §13.3 — `validateConfig`
 */
export interface ValidateConfigParams {
  /** La configuración a validar. */
  config: Record<string, unknown>;
}

/**
 * Entrada para el método RPC `onEvent`.
 *
 * @see PLUGIN_SPEC.md §13.5 — `onEvent`
 */
export interface OnEventParams {
  /** El evento de dominio a entregar. */
  event: PluginEvent;
}

/**
 * Entrada para el método RPC `runJob`.
 *
 * @see PLUGIN_SPEC.md §13.6 — `runJob`
 */
export interface RunJobParams {
  /** Contexto de ejecución de la tarea. */
  job: PluginJobContext;
}

/**
 * Entrada para el método RPC `getData`.
 *
 * @see PLUGIN_SPEC.md §13.8 — `getData`
 */
export interface GetDataParams {
  /** Clave de datos definida por el plugin (p. ej. `"sync-health"`). */
  key: string;
  /** Parámetros de contexto y consulta desde la interfaz. */
  params: Record<string, unknown>;
  /** Metadatos opcionales de lanzador/contenedor desde el entorno de renderizado del host. */
  renderEnvironment?: PluginLauncherRenderContextSnapshot | null;
}

/**
 * Entrada para el método RPC `performAction`.
 *
 * @see PLUGIN_SPEC.md §13.9 — `performAction`
 */
export interface PerformActionParams {
  /** Clave de acción definida por el plugin (p. ej. `"resync"`). */
  key: string;
  /** Parámetros de acción desde la interfaz. */
  params: Record<string, unknown>;
  /** Metadatos opcionales de lanzador/contenedor desde el entorno de renderizado del host. */
  renderEnvironment?: PluginLauncherRenderContextSnapshot | null;
}

/**
 * Entrada para el método RPC `executeTool`.
 *
 * @see PLUGIN_SPEC.md §13.10 — `executeTool`
 */
export interface ExecuteToolParams {
  /** Nombre de la herramienta (sin prefijo de espacio de nombres del plugin). */
  toolName: string;
  /** Parámetros analizados que coinciden con el esquema declarado de la herramienta. */
  parameters: unknown;
  /** Contexto de ejecución del agente. */
  runContext: ToolRunContext;
}

// ---------------------------------------------------------------------------
// Cargas útiles de interacción de lanzador/modal de interfaz con el host
// ---------------------------------------------------------------------------

/**
 * Solicitud de límites emitida por una interfaz de plugin que se ejecuta dentro
 * de un contenedor de lanzador gestionado por el host, como un modal, drawer o popover.
 */
export interface PluginModalBoundsRequest {
  /** Preajuste de tamaño de alto nivel solicitado al host. */
  bounds: PluginLauncherBounds;
  /** Sobrescritura explícita opcional del ancho en píxeles CSS. */
  width?: number;
  /** Sobrescritura explícita opcional del alto en píxeles CSS. */
  height?: number;
  /** Límites inferiores opcionales para decisiones de redimensionado del host. */
  minWidth?: number;
  minHeight?: number;
  /** Límites superiores opcionales para decisiones de redimensionado del host. */
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * Metadatos de motivo suministrados por callbacks de ciclo de vida de cierre gestionados por el host.
 */
export interface PluginRenderCloseEvent {
  reason:
    | "escapeKey"
    | "backdrop"
    | "hostNavigation"
    | "programmatic"
    | "submit"
    | "unknown";
  nativeEvent?: unknown;
}

/**
 * Mapa de nombres de métodos RPC de host a worker a sus tipos `[params, result]`.
 *
 * Este tipo es la única fuente de verdad para todos los métodos que el host
 * puede llamar en un worker. Lo usan tanto el despachador del host como el
 * manejador del worker para garantizar la seguridad de tipos a través del
 * límite IPC.
 */
export interface HostToWorkerMethods {
  /** @see PLUGIN_SPEC.md §13.1 */
  initialize: [params: InitializeParams, result: InitializeResult];
  /** @see PLUGIN_SPEC.md §13.2 */
  health: [params: Record<string, never>, result: PluginHealthDiagnostics];
  /** @see PLUGIN_SPEC.md §12.5 */
  shutdown: [params: Record<string, never>, result: void];
  /** @see PLUGIN_SPEC.md §13.3 */
  validateConfig: [params: ValidateConfigParams, result: PluginConfigValidationResult];
  /** @see PLUGIN_SPEC.md §13.4 */
  configChanged: [params: ConfigChangedParams, result: void];
  /** @see PLUGIN_SPEC.md §13.5 */
  onEvent: [params: OnEventParams, result: void];
  /** @see PLUGIN_SPEC.md §13.6 */
  runJob: [params: RunJobParams, result: void];
  /** @see PLUGIN_SPEC.md §13.7 */
  handleWebhook: [params: PluginWebhookInput, result: void];
  /** @see PLUGIN_SPEC.md §13.8 */
  getData: [params: GetDataParams, result: unknown];
  /** @see PLUGIN_SPEC.md §13.9 */
  performAction: [params: PerformActionParams, result: unknown];
  /** @see PLUGIN_SPEC.md §13.10 */
  executeTool: [params: ExecuteToolParams, result: ToolResult];
}

/** Unión de todos los nombres de métodos de host a worker. */
export type HostToWorkerMethodName = keyof HostToWorkerMethods;

/** Métodos requeridos que el worker DEBE implementar. */
export const HOST_TO_WORKER_REQUIRED_METHODS: readonly HostToWorkerMethodName[] = [
  "initialize",
  "health",
  "shutdown",
] as const;

/** Métodos opcionales que el worker PUEDE implementar. */
export const HOST_TO_WORKER_OPTIONAL_METHODS: readonly HostToWorkerMethodName[] = [
  "validateConfig",
  "configChanged",
  "onEvent",
  "runJob",
  "handleWebhook",
  "getData",
  "performAction",
  "executeTool",
] as const;

// ---------------------------------------------------------------------------
// Firmas de métodos de worker a host (llamadas de cliente SDK)
// ---------------------------------------------------------------------------

/**
 * Mapa de nombres de métodos RPC de worker a host a sus tipos `[params, result]`.
 *
 * Representan las llamadas de cliente SDK que el worker hace de vuelta al host
 * para acceder a servicios de la plataforma (estado, entidades, configuración, etc.).
 */
export interface WorkerToHostMethods {
  // Config
  "config.get": [params: Record<string, never>, result: Record<string, unknown>];

  // Estado
  "state.get": [
    params: { scopeKind: string; scopeId?: string; namespace?: string; stateKey: string },
    result: unknown,
  ];
  "state.set": [
    params: { scopeKind: string; scopeId?: string; namespace?: string; stateKey: string; value: unknown },
    result: void,
  ];
  "state.delete": [
    params: { scopeKind: string; scopeId?: string; namespace?: string; stateKey: string },
    result: void,
  ];

  // Entidades
  "entities.upsert": [
    params: {
      entityType: string;
      scopeKind: PluginStateScopeKind;
      scopeId?: string;
      externalId?: string;
      title?: string;
      status?: string;
      data: Record<string, unknown>;
    },
    result: {
      id: string;
      entityType: string;
      scopeKind: PluginStateScopeKind;
      scopeId: string | null;
      externalId: string | null;
      title: string | null;
      status: string | null;
      data: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    },
  ];
  "entities.list": [
    params: {
      entityType?: string;
      scopeKind?: PluginStateScopeKind;
      scopeId?: string;
      externalId?: string;
      limit?: number;
      offset?: number;
    },
    result: Array<{
      id: string;
      entityType: string;
      scopeKind: PluginStateScopeKind;
      scopeId: string | null;
      externalId: string | null;
      title: string | null;
      status: string | null;
      data: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    }>,
  ];

  // Eventos
  "events.emit": [
    params: { name: string; companyId: string; payload: unknown },
    result: void,
  ];
  "events.subscribe": [
    params: { eventPattern: string; filter?: Record<string, unknown> | null },
    result: void,
  ];

  // HTTP
  "http.fetch": [
    params: { url: string; init?: Record<string, unknown> },
    result: { status: number; statusText: string; headers: Record<string, string>; body: string },
  ];

  // Secretos
  "secrets.resolve": [
    params: { secretRef: string },
    result: string,
  ];

  // Actividad
  "activity.log": [
    params: {
      companyId: string;
      message: string;
      entityType?: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
    result: void,
  ];

  // Métricas
  "metrics.write": [
    params: { name: string; value: number; tags?: Record<string, string> },
    result: void,
  ];

  // Logger
  "log": [
    params: { level: "info" | "warn" | "error" | "debug"; message: string; meta?: Record<string, unknown> },
    result: void,
  ];

  // Empresas (lectura)
  "companies.list": [
    params: { limit?: number; offset?: number },
    result: Company[],
  ];
  "companies.get": [
    params: { companyId: string },
    result: Company | null,
  ];

  // Proyectos (lectura)
  "projects.list": [
    params: { companyId: string; limit?: number; offset?: number },
    result: Project[],
  ];
  "projects.get": [
    params: { projectId: string; companyId: string },
    result: Project | null,
  ];
  "projects.listWorkspaces": [
    params: { projectId: string; companyId: string },
    result: PluginWorkspace[],
  ];
  "projects.getPrimaryWorkspace": [
    params: { projectId: string; companyId: string },
    result: PluginWorkspace | null,
  ];
  "projects.getWorkspaceForIssue": [
    params: { issueId: string; companyId: string },
    result: PluginWorkspace | null,
  ];

  // Issues
  "issues.list": [
    params: {
      companyId: string;
      projectId?: string;
      assigneeAgentId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    },
    result: Issue[],
  ];
  "issues.get": [
    params: { issueId: string; companyId: string },
    result: Issue | null,
  ];
  "issues.create": [
    params: {
      companyId: string;
      projectId?: string;
      goalId?: string;
      parentId?: string;
      title: string;
      description?: string;
      priority?: string;
      assigneeAgentId?: string;
    },
    result: Issue,
  ];
  "issues.update": [
    params: {
      issueId: string;
      patch: Record<string, unknown>;
      companyId: string;
    },
    result: Issue,
  ];
  "issues.listComments": [
    params: { issueId: string; companyId: string },
    result: IssueComment[],
  ];
  "issues.createComment": [
    params: { issueId: string; body: string; companyId: string },
    result: IssueComment,
  ];

  // Documentos de issue
  "issues.documents.list": [
    params: { issueId: string; companyId: string },
    result: IssueDocumentSummary[],
  ];
  "issues.documents.get": [
    params: { issueId: string; key: string; companyId: string },
    result: IssueDocument | null,
  ];
  "issues.documents.upsert": [
    params: {
      issueId: string;
      key: string;
      body: string;
      companyId: string;
      title?: string;
      format?: string;
      changeSummary?: string;
    },
    result: IssueDocument,
  ];
  "issues.documents.delete": [
    params: { issueId: string; key: string; companyId: string },
    result: void,
  ];

  // Agentes (lectura)
  "agents.list": [
    params: { companyId: string; status?: string; limit?: number; offset?: number },
    result: Agent[],
  ];
  "agents.get": [
    params: { agentId: string; companyId: string },
    result: Agent | null,
  ];

  // Agentes (escritura)
  "agents.pause": [
    params: { agentId: string; companyId: string },
    result: Agent,
  ];
  "agents.resume": [
    params: { agentId: string; companyId: string },
    result: Agent,
  ];
  "agents.invoke": [
    params: { agentId: string; companyId: string; prompt: string; reason?: string },
    result: { runId: string },
  ];

  // Sesiones de agente
  "agents.sessions.create": [
    params: { agentId: string; companyId: string; taskKey?: string; reason?: string },
    result: { sessionId: string; agentId: string; companyId: string; status: "active" | "closed"; createdAt: string },
  ];
  "agents.sessions.list": [
    params: { agentId: string; companyId: string },
    result: Array<{ sessionId: string; agentId: string; companyId: string; status: "active" | "closed"; createdAt: string }>,
  ];
  "agents.sessions.sendMessage": [
    params: { sessionId: string; companyId: string; prompt: string; reason?: string },
    result: { runId: string },
  ];
  "agents.sessions.close": [
    params: { sessionId: string; companyId: string },
    result: void,
  ];

  // Objetivos
  "goals.list": [
    params: { companyId: string; level?: string; status?: string; limit?: number; offset?: number },
    result: Goal[],
  ];
  "goals.get": [
    params: { goalId: string; companyId: string },
    result: Goal | null,
  ];
  "goals.create": [
    params: {
      companyId: string;
      title: string;
      description?: string;
      level?: string;
      status?: string;
      parentId?: string;
      ownerAgentId?: string;
    },
    result: Goal,
  ];
  "goals.update": [
    params: {
      goalId: string;
      patch: Record<string, unknown>;
      companyId: string;
    },
    result: Goal,
  ];
}

/** Union of all worker→host method names. */
export type WorkerToHostMethodName = keyof WorkerToHostMethods;

// ---------------------------------------------------------------------------
// Tipos de notificación de worker a host (disparo y olvido, sin respuesta)
// ---------------------------------------------------------------------------

/**
 * Formas de parámetros tipadas para notificaciones JSON-RPC de worker a host.
 *
 * Las notificaciones son de disparo y olvido: el worker no espera una respuesta.
 * Se usan para eventos de flujo y registro, no para RPCs de solicitud-respuesta.
 */
export interface WorkerToHostNotifications {
  /**
   * Reenvía un evento de flujo a clientes SSE conectados.
   *
   * Emitido por el worker para cada evento en un canal de flujo. El host
   * publica en el PluginStreamBus, que distribuye a todos los clientes SSE
   * suscritos a la tupla (pluginId, channel, companyId).
   *
   * La carga útil `event` es serializable a JSON y se envía como SSE `data:`.
   * El tipo de evento SSE por defecto es `"message"`.
   */
  "streams.emit": {
    channel: string;
    companyId: string;
    event: unknown;
  };

  /**
   * Señala que un canal de flujo se ha abierto.
   *
   * Emitido cuando el worker llama a `ctx.streams.open(channel, companyId)`.
   * Los clientes de interfaz pueden usarlo para mostrar un indicador "connected"
   * o comenzar a almacenar entrada en búfer. El host rastrea los canales abiertos
   * para poder emitir eventos de cierre sintéticos si el worker falla.
   */
  "streams.open": {
    channel: string;
    companyId: string;
  };

  /**
   * Señala que un canal de flujo se ha cerrado.
   *
   * Emitido cuando el worker llama a `ctx.streams.close(channel)`, o
   * sintéticamente por el host cuando un proceso de worker termina con canales
   * aún abiertos. Los clientes de interfaz deben tratarlo como terminal y
   * desconectar la conexión SSE.
   */
  "streams.close": {
    channel: string;
    companyId: string;
  };
}

/** Unión de todos los nombres de métodos de notificación de worker a host. */
export type WorkerToHostNotificationName = keyof WorkerToHostNotifications;

// ---------------------------------------------------------------------------
// Helpers tipados de solicitud/respuesta
// ---------------------------------------------------------------------------

/**
 * Una solicitud JSON-RPC tipada para un método específico de host a worker.
 */
export type HostToWorkerRequest<M extends HostToWorkerMethodName> =
  JsonRpcRequest<M, HostToWorkerMethods[M][0]>;

/**
 * Una respuesta exitosa JSON-RPC tipada para un método específico de host a worker.
 */
export type HostToWorkerResponse<M extends HostToWorkerMethodName> =
  JsonRpcSuccessResponse<HostToWorkerMethods[M][1]>;

/**
 * Una solicitud JSON-RPC tipada para un método específico de worker a host.
 */
export type WorkerToHostRequest<M extends WorkerToHostMethodName> =
  JsonRpcRequest<M, WorkerToHostMethods[M][0]>;

/**
 * Una respuesta exitosa JSON-RPC tipada para un método específico de worker a host.
 */
export type WorkerToHostResponse<M extends WorkerToHostMethodName> =
  JsonRpcSuccessResponse<WorkerToHostMethods[M][1]>;

// ---------------------------------------------------------------------------
// Funciones de fábrica de mensajes
// ---------------------------------------------------------------------------

/** Contador para generar IDs de solicitud únicos cuando no se proporciona un ID explícito. */
let _nextId = 1;

/** Volver al inicio antes de alcanzar Number.MAX_SAFE_INTEGER para evitar pérdida de precisión. */
const MAX_SAFE_RPC_ID = Number.MAX_SAFE_INTEGER - 1;

/**
 * Crea un mensaje de solicitud JSON-RPC 2.0.
 *
 * @param method - El nombre del método RPC
 * @param params - Parámetros estructurados
 * @param id - ID de solicitud explícito opcional (autogenerado si se omite)
 */
export function createRequest<TMethod extends string>(
  method: TMethod,
  params: unknown,
  id?: JsonRpcId,
): JsonRpcRequest<TMethod> {
  if (_nextId >= MAX_SAFE_RPC_ID) {
    _nextId = 1;
  }
  return {
    jsonrpc: JSONRPC_VERSION,
    id: id ?? _nextId++,
    method,
    params,
  };
}

/**
 * Crea una respuesta exitosa JSON-RPC 2.0.
 *
 * @param id - El ID de la solicitud a la que se responde
 * @param result - El valor del resultado
 */
export function createSuccessResponse<TResult>(
  id: JsonRpcId,
  result: TResult,
): JsonRpcSuccessResponse<TResult> {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

/**
 * Crea una respuesta de error JSON-RPC 2.0.
 *
 * @param id - El ID de la solicitud a la que se responde (null si no se pudo determinar el ID)
 * @param code - Código de error legible por máquina
 * @param message - Mensaje de error legible
 * @param data - Datos de error estructurados opcionales
 */
export function createErrorResponse<TData = unknown>(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: TData,
): JsonRpcErrorResponse<TData> {
  const response: JsonRpcErrorResponse<TData> = {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: data !== undefined
      ? { code, message, data }
      : { code, message } as JsonRpcError<TData>,
  };
  return response;
}

/**
 * Crea una notificación JSON-RPC 2.0 (disparo y olvido, no se espera respuesta).
 *
 * @param method - El nombre del método de la notificación
 * @param params - Parámetros estructurados
 */
export function createNotification<TMethod extends string>(
  method: TMethod,
  params: unknown,
): JsonRpcNotification<TMethod> {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    params,
  };
}

// ---------------------------------------------------------------------------
// Guardas de tipo
// ---------------------------------------------------------------------------

/**
 * Verifica si un valor es una solicitud JSON-RPC 2.0 bien formada.
 *
 * Una solicitud tiene `jsonrpc: "2.0"`, un `method` de cadena y un `id`.
 */
export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.jsonrpc === JSONRPC_VERSION &&
    typeof obj.method === "string" &&
    "id" in obj &&
    obj.id !== undefined &&
    obj.id !== null
  );
}

/**
 * Verifica si un valor es una notificación JSON-RPC 2.0 bien formada.
 *
 * Una notificación tiene `jsonrpc: "2.0"`, un `method` de cadena, pero sin `id`.
 */
export function isJsonRpcNotification(
  value: unknown,
): value is JsonRpcNotification {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.jsonrpc === JSONRPC_VERSION &&
    typeof obj.method === "string" &&
    !("id" in obj)
  );
}

/**
 * Verifica si un valor es una respuesta JSON-RPC 2.0 bien formada (éxito o error).
 */
export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.jsonrpc === JSONRPC_VERSION &&
    "id" in obj &&
    ("result" in obj || "error" in obj)
  );
}

/**
 * Verifica si una respuesta JSON-RPC es una respuesta exitosa.
 */
export function isJsonRpcSuccessResponse(
  response: JsonRpcResponse,
): response is JsonRpcSuccessResponse {
  return "result" in response && !("error" in response && response.error !== undefined);
}

/**
 * Verifica si una respuesta JSON-RPC es una respuesta de error.
 */
export function isJsonRpcErrorResponse(
  response: JsonRpcResponse,
): response is JsonRpcErrorResponse {
  return "error" in response && response.error !== undefined;
}

// ---------------------------------------------------------------------------
// Helpers de serialización
// ---------------------------------------------------------------------------

/**
 * Delimitador de línea para mensajes JSON-RPC sobre stdio.
 *
 * Cada mensaje es una sola línea de JSON terminada por un carácter de nueva línea.
 * Esto sigue la convención de JSON delimitado por nuevas líneas (NDJSON).
 */
export const MESSAGE_DELIMITER = "\n" as const;

/**
 * Serializa un mensaje JSON-RPC a una cadena delimitada por nuevas líneas para
 * su transmisión sobre stdio.
 *
 * @param message - Cualquier mensaje JSON-RPC (solicitud, respuesta o notificación)
 * @returns La cadena JSON terminada con una nueva línea
 */
export function serializeMessage(message: JsonRpcMessage): string {
  return JSON.stringify(message) + MESSAGE_DELIMITER;
}

/**
 * Analiza una cadena JSON en un mensaje JSON-RPC.
 *
 * Devuelve el mensaje analizado o lanza un `JsonRpcParseError` si la entrada
 * no es JSON válido o no se ajusta a la estructura JSON-RPC 2.0.
 *
 * @param line - Una sola línea de texto JSON (con o sin nueva línea final)
 * @returns El mensaje JSON-RPC analizado
 * @throws {JsonRpcParseError} Si el análisis falla
 */
export function parseMessage(line: string): JsonRpcMessage {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    throw new JsonRpcParseError("Mensaje vacío");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new JsonRpcParseError(`JSON inválido: ${trimmed.slice(0, 200)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new JsonRpcParseError("El mensaje debe ser un objeto JSON");
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.jsonrpc !== JSONRPC_VERSION) {
    throw new JsonRpcParseError(
      `Versión jsonrpc inválida o faltante (se esperaba "${JSONRPC_VERSION}", se obtuvo ${JSON.stringify(obj.jsonrpc)})`,
    );
  }

  // Es un envoltorio JSON-RPC 2.0 válido: devolver tal cual y dejar que el llamador
  // usa las guardas de tipo para una clasificación más específica.
  return parsed as JsonRpcMessage;
}

// ---------------------------------------------------------------------------
// Clases de error
// ---------------------------------------------------------------------------

/**
 * Error lanzado cuando un mensaje JSON-RPC no puede analizarse.
 */
export class JsonRpcParseError extends Error {
  override readonly name = "JsonRpcParseError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Error lanzado cuando una llamada JSON-RPC falla con una respuesta de error estructurada.
 *
 * Captura el `JsonRpcError` completo para que los llamadores puedan inspeccionar el código y los datos.
 */
export class JsonRpcCallError extends Error {
  override readonly name = "JsonRpcCallError";
  /** El código de error JSON-RPC. */
  readonly code: number;
  /** Datos de error estructurados opcionales de la respuesta. */
  readonly data: unknown;

  constructor(error: JsonRpcError) {
    super(error.message);
    this.code = error.code;
    this.data = error.data;
  }
}

// ---------------------------------------------------------------------------
// Helper de reinicio (solo para pruebas)
// ---------------------------------------------------------------------------

/**
 * Reinicia el contador interno de IDs de solicitud. **Solo para pruebas.**
 *
 * @internal
 */
export function _resetIdCounter(): void {
  _nextId = 1;
}
