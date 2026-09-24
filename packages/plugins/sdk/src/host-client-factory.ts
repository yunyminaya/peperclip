/**
 * Fábrica de clientes del lado del host: crea mapas de manejadores protegidos
 * por capacidades para atender llamadas JSON-RPC de worker a host.
 *
 * Cuando un worker de plugin llama a `ctx.state.get(...)` dentro de su proceso,
 * el SDK serializa la llamada como una solicitud JSON-RPC sobre stdio. En el lado
 * del host, el `PluginWorkerManager` recibe la solicitud y la despacha al
 * manejador registrado para ese método. Este módulo proporciona una fábrica que
 * crea esos manejadores para todos los `WorkerToHostMethods`, con aplicación
 * automática de capacidades.
 *
 * ## Diseño
 *
 * 1. **Protección por capacidades**: cada manejador verifica las capacidades
 *    declaradas del plugin antes de ejecutarse. Si el plugin carece de una
 *    capacidad requerida, el manejador lanza un `CapabilityDeniedError` (que el
 *    worker manager traduce en una respuesta de error JSON-RPC con código
 *    `CAPABILITY_DENIED`).
 *
 * 2. **Adaptadores de servicio**: el llamador proporciona un objeto `HostServices`
 *    con implementaciones concretas de cada servicio de la plataforma. La fábrica
 *    conecta cada manejador con el método de servicio apropiado.
 *
 * 3. **Seguridad de tipos**: el mapa de manejadores devuelto está tipado como
 *    `WorkerToHostHandlers` (de `plugin-worker-manager.ts`) para que encaje
 *    directamente en `WorkerStartOptions.hostHandlers`.
 *
 * @example
 * ```ts
 * const handlers = createHostClientHandlers({
 *   pluginId: "acme.linear",
 *   capabilities: manifest.capabilities,
 *   services: {
 *     config:    { get: () => registry.getConfig(pluginId) },
 *     state:     { get: ..., set: ..., delete: ... },
 *     entities:  { upsert: ..., list: ... },
 *     // ... todos los servicios
 *   },
 * });
 *
 * await workerManager.startWorker("acme.linear", {
 *   // ...
 *   hostHandlers: handlers,
 * });
 * ```
 *
 * @see PLUGIN_SPEC.md §13 — Protocolo host-worker
 * @see PLUGIN_SPEC.md §15 — Capability Model
 */

import type { PluginCapability } from "@paperclipai/shared";
import type { WorkerToHostMethods, WorkerToHostMethodName } from "./protocol.js";
import { PLUGIN_RPC_ERROR_CODES } from "./protocol.js";

// ---------------------------------------------------------------------------
// Tipos de error
// ---------------------------------------------------------------------------

/**
 * Lanzado cuando un plugin llama a un método del host para el que no tiene la capacidad.
 *
 * El campo `code` se establece en `PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED`
 * para que el worker manager pueda propagarlo como el código de error JSON-RPC
 * correcto.
 */
export class CapabilityDeniedError extends Error {
  override readonly name = "CapabilityDeniedError";
  readonly code = PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED;

  constructor(pluginId: string, method: string, capability: PluginCapability) {
    super(
      `El plugin "${pluginId}" no tiene la capacidad requerida "${capability}" para el método "${method}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Interfaces de servicios del host
// ---------------------------------------------------------------------------

/**
 * Adaptadores de servicio que el host debe proporcionar. Cada propiedad se
 * corresponde con un grupo de `WorkerToHostMethods`. La fábrica conecta los
 * params JSON-RPC a estas firmas de función.
 *
 * Todos los métodos devuelven promesas para soportar I/O asíncrona (base de
 * datos, HTTP, etc.).
 */
export interface HostServices {
  /** Proporciona `config.get`. */
  config: {
    get(): Promise<Record<string, unknown>>;
  };

  /** Proporciona `state.get`, `state.set`, `state.delete`. */
  state: {
    get(params: WorkerToHostMethods["state.get"][0]): Promise<WorkerToHostMethods["state.get"][1]>;
    set(params: WorkerToHostMethods["state.set"][0]): Promise<void>;
    delete(params: WorkerToHostMethods["state.delete"][0]): Promise<void>;
  };

  /** Proporciona `entities.upsert`, `entities.list`. */
  entities: {
    upsert(params: WorkerToHostMethods["entities.upsert"][0]): Promise<WorkerToHostMethods["entities.upsert"][1]>;
    list(params: WorkerToHostMethods["entities.list"][0]): Promise<WorkerToHostMethods["entities.list"][1]>;
  };

  /** Proporciona `events.emit` y `events.subscribe`. */
  events: {
    emit(params: WorkerToHostMethods["events.emit"][0]): Promise<void>;
    subscribe(params: WorkerToHostMethods["events.subscribe"][0]): Promise<void>;
  };

  /** Proporciona `http.fetch`. */
  http: {
    fetch(params: WorkerToHostMethods["http.fetch"][0]): Promise<WorkerToHostMethods["http.fetch"][1]>;
  };

  /** Proporciona `secrets.resolve`. */
  secrets: {
    resolve(params: WorkerToHostMethods["secrets.resolve"][0]): Promise<string>;
  };

  /** Proporciona `activity.log`. */
  activity: {
    log(params: {
      companyId: string;
      message: string;
      entityType?: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    }): Promise<void>;
  };

  /** Proporciona `metrics.write`. */
  metrics: {
    write(params: WorkerToHostMethods["metrics.write"][0]): Promise<void>;
  };

  /** Proporciona `log`. */
  logger: {
    log(params: WorkerToHostMethods["log"][0]): Promise<void>;
  };

  /** Proporciona `companies.list`, `companies.get`. */
  companies: {
    list(params: WorkerToHostMethods["companies.list"][0]): Promise<WorkerToHostMethods["companies.list"][1]>;
    get(params: WorkerToHostMethods["companies.get"][0]): Promise<WorkerToHostMethods["companies.get"][1]>;
  };

  /** Proporciona `projects.list`, `projects.get`, `projects.listWorkspaces`, `projects.getPrimaryWorkspace`, `projects.getWorkspaceForIssue`. */
  projects: {
    list(params: WorkerToHostMethods["projects.list"][0]): Promise<WorkerToHostMethods["projects.list"][1]>;
    get(params: WorkerToHostMethods["projects.get"][0]): Promise<WorkerToHostMethods["projects.get"][1]>;
    listWorkspaces(params: WorkerToHostMethods["projects.listWorkspaces"][0]): Promise<WorkerToHostMethods["projects.listWorkspaces"][1]>;
    getPrimaryWorkspace(params: WorkerToHostMethods["projects.getPrimaryWorkspace"][0]): Promise<WorkerToHostMethods["projects.getPrimaryWorkspace"][1]>;
    getWorkspaceForIssue(params: WorkerToHostMethods["projects.getWorkspaceForIssue"][0]): Promise<WorkerToHostMethods["projects.getWorkspaceForIssue"][1]>;
  };

  /** Proporciona `issues.list`, `issues.get`, `issues.create`, `issues.update`, `issues.listComments`, `issues.createComment`. */
  issues: {
    list(params: WorkerToHostMethods["issues.list"][0]): Promise<WorkerToHostMethods["issues.list"][1]>;
    get(params: WorkerToHostMethods["issues.get"][0]): Promise<WorkerToHostMethods["issues.get"][1]>;
    create(params: WorkerToHostMethods["issues.create"][0]): Promise<WorkerToHostMethods["issues.create"][1]>;
    update(params: WorkerToHostMethods["issues.update"][0]): Promise<WorkerToHostMethods["issues.update"][1]>;
    listComments(params: WorkerToHostMethods["issues.listComments"][0]): Promise<WorkerToHostMethods["issues.listComments"][1]>;
    createComment(params: WorkerToHostMethods["issues.createComment"][0]): Promise<WorkerToHostMethods["issues.createComment"][1]>;
  };

  /** Proporciona `issues.documents.list`, `issues.documents.get`, `issues.documents.upsert`, `issues.documents.delete`. */
  issueDocuments: {
    list(params: WorkerToHostMethods["issues.documents.list"][0]): Promise<WorkerToHostMethods["issues.documents.list"][1]>;
    get(params: WorkerToHostMethods["issues.documents.get"][0]): Promise<WorkerToHostMethods["issues.documents.get"][1]>;
    upsert(params: WorkerToHostMethods["issues.documents.upsert"][0]): Promise<WorkerToHostMethods["issues.documents.upsert"][1]>;
    delete(params: WorkerToHostMethods["issues.documents.delete"][0]): Promise<WorkerToHostMethods["issues.documents.delete"][1]>;
  };

  /** Proporciona `agents.list`, `agents.get`, `agents.pause`, `agents.resume`, `agents.invoke`. */
  agents: {
    list(params: WorkerToHostMethods["agents.list"][0]): Promise<WorkerToHostMethods["agents.list"][1]>;
    get(params: WorkerToHostMethods["agents.get"][0]): Promise<WorkerToHostMethods["agents.get"][1]>;
    pause(params: WorkerToHostMethods["agents.pause"][0]): Promise<WorkerToHostMethods["agents.pause"][1]>;
    resume(params: WorkerToHostMethods["agents.resume"][0]): Promise<WorkerToHostMethods["agents.resume"][1]>;
    invoke(params: WorkerToHostMethods["agents.invoke"][0]): Promise<WorkerToHostMethods["agents.invoke"][1]>;
  };

  /** Proporciona `agents.sessions.create`, `agents.sessions.list`, `agents.sessions.sendMessage`, `agents.sessions.close`. */
  agentSessions: {
    create(params: WorkerToHostMethods["agents.sessions.create"][0]): Promise<WorkerToHostMethods["agents.sessions.create"][1]>;
    list(params: WorkerToHostMethods["agents.sessions.list"][0]): Promise<WorkerToHostMethods["agents.sessions.list"][1]>;
    sendMessage(params: WorkerToHostMethods["agents.sessions.sendMessage"][0]): Promise<WorkerToHostMethods["agents.sessions.sendMessage"][1]>;
    close(params: WorkerToHostMethods["agents.sessions.close"][0]): Promise<void>;
  };

  /** Proporciona `goals.list`, `goals.get`, `goals.create`, `goals.update`. */
  goals: {
    list(params: WorkerToHostMethods["goals.list"][0]): Promise<WorkerToHostMethods["goals.list"][1]>;
    get(params: WorkerToHostMethods["goals.get"][0]): Promise<WorkerToHostMethods["goals.get"][1]>;
    create(params: WorkerToHostMethods["goals.create"][0]): Promise<WorkerToHostMethods["goals.create"][1]>;
    update(params: WorkerToHostMethods["goals.update"][0]): Promise<WorkerToHostMethods["goals.update"][1]>;
  };
}

// ---------------------------------------------------------------------------
// Entrada de la fábrica
// ---------------------------------------------------------------------------

/**
 * Opciones para `createHostClientHandlers`.
 */
export interface HostClientFactoryOptions {
  /** El ID del plugin. Usado para mensajes de error y registro. */
  pluginId: string;

  /**
   * Las capacidades declaradas por el plugin en su manifiesto. La fábrica
   * las exige en tiempo de ejecución antes de delegar al adaptador de servicio.
   */
  capabilities: readonly PluginCapability[];

  /**
   * Implementaciones concretas de servicios de la plataforma del host. Cada
   * manejador en el mapa devuelto delega al método de servicio correspondiente.
   */
  services: HostServices;
}

// ---------------------------------------------------------------------------
// Tipo de mapa de manejadores (compatible con WorkerToHostHandlers del worker manager)
// ---------------------------------------------------------------------------

/**
 * Una función manejadora para un método específico de worker a host.
 */
type HostHandler<M extends WorkerToHostMethodName> = (
  params: WorkerToHostMethods[M][0],
) => Promise<WorkerToHostMethods[M][1]>;

/**
 * Un mapa completo de todos los manejadores de métodos de worker a host.
 *
 * Este tipo coincide con `WorkerToHostHandlers` de `plugin-worker-manager.ts`
 * pero hace que cada manejador sea requerido (la fábrica siempre proporciona
 * todos los manejadores).
 */
export type HostClientHandlers = {
  [M in WorkerToHostMethodName]: HostHandler<M>;
};

// ---------------------------------------------------------------------------
// Mapeo de capacidad a método
// ---------------------------------------------------------------------------

/**
 * Asigna cada método RPC de worker a host a la capacidad requerida para invocarlo.
 * Los métodos sin requisito de capacidad (p. ej. `config.get`, `log`) se
 * asignan a `null`.
 *
 * @see PLUGIN_SPEC.md §15 — Capability Model
 */
const METHOD_CAPABILITY_MAP: Record<WorkerToHostMethodName, PluginCapability | null> = {
  // Config: siempre permitido
  "config.get": null,

  // Estado
  "state.get": "plugin.state.read",
  "state.set": "plugin.state.write",
  "state.delete": "plugin.state.write",

  // Entidades: sin capacidad específica requerida (acotadas al plugin por diseño)
  "entities.upsert": null,
  "entities.list": null,

  // Eventos
  "events.emit": "events.emit",
  "events.subscribe": "events.subscribe",

  // HTTP
  "http.fetch": "http.outbound",

  // Secretos
  "secrets.resolve": "secrets.read-ref",

  // Actividad
  "activity.log": "activity.log.write",

  // Métricas
  "metrics.write": "metrics.write",

  // Logger: siempre permitido
  "log": null,

  // Empresas
  "companies.list": "companies.read",
  "companies.get": "companies.read",

  // Proyectos
  "projects.list": "projects.read",
  "projects.get": "projects.read",
  "projects.listWorkspaces": "project.workspaces.read",
  "projects.getPrimaryWorkspace": "project.workspaces.read",
  "projects.getWorkspaceForIssue": "project.workspaces.read",

  // Issues
  "issues.list": "issues.read",
  "issues.get": "issues.read",
  "issues.create": "issues.create",
  "issues.update": "issues.update",
  "issues.listComments": "issue.comments.read",
  "issues.createComment": "issue.comments.create",

  // Documentos de issue
  "issues.documents.list": "issue.documents.read",
  "issues.documents.get": "issue.documents.read",
  "issues.documents.upsert": "issue.documents.write",
  "issues.documents.delete": "issue.documents.write",

  // Agentes
  "agents.list": "agents.read",
  "agents.get": "agents.read",
  "agents.pause": "agents.pause",
  "agents.resume": "agents.resume",
  "agents.invoke": "agents.invoke",

  // Sesiones de agente
  "agents.sessions.create": "agent.sessions.create",
  "agents.sessions.list": "agent.sessions.list",
  "agents.sessions.sendMessage": "agent.sessions.send",
  "agents.sessions.close": "agent.sessions.close",

  // Objetivos
  "goals.list": "goals.read",
  "goals.get": "goals.read",
  "goals.create": "goals.create",
  "goals.update": "goals.update",
};

// ---------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------

/**
 * Crea un mapa completo de manejadores para todos los métodos JSON-RPC de
 * worker a host.
 *
 * Cada manejador:
 * 1. Verifica las capacidades declaradas del plugin contra la capacidad requerida
 *    para el método (si la hay).
 * 2. Delega al método correspondiente del adaptador de servicio.
 * 3. Devuelve el resultado del servicio, que el worker manager serializa como
 *    la respuesta JSON-RPC.
 *
 * Si falla una verificación de capacidad, el manejador lanza un
 * `CapabilityDeniedError` con código `CAPABILITY_DENIED`. El worker manager lo
 * captura y envía una respuesta de error JSON-RPC al worker, que aparece como
 * un `JsonRpcCallError` en el cliente SDK del plugin.
 *
 * @param options - ID del plugin, capacidades y adaptadores de servicio
 * @returns Un mapa de manejadores apto para `WorkerStartOptions.hostHandlers`
 */
export function createHostClientHandlers(
  options: HostClientFactoryOptions,
): HostClientHandlers {
  const { pluginId, services } = options;
  const capabilitySet = new Set<PluginCapability>(options.capabilities);

  /**
   * Afirma que el plugin tiene la capacidad requerida para un método.
   * Lanza `CapabilityDeniedError` si falta la capacidad.
   */
  function requireCapability(
    method: WorkerToHostMethodName,
  ): void {
    const required = METHOD_CAPABILITY_MAP[method];
    if (required === null) return; // Sin capacidad requerida
    if (capabilitySet.has(required)) return;
    throw new CapabilityDeniedError(pluginId, method, required);
  }

  /**
   * Crea un manejador proxy protegido por capacidad para un método.
   *
   * @param method - El nombre del método RPC (usado para buscar la capacidad)
   * @param handler - La implementación real del manejador
   * @returns Un envoltorio que verifica capacidades antes de delegar
   */
  function gated<M extends WorkerToHostMethodName>(
    method: M,
    handler: HostHandler<M>,
  ): HostHandler<M> {
    return async (params: WorkerToHostMethods[M][0]) => {
      requireCapability(method);
      return handler(params);
    };
  }

  // -------------------------------------------------------------------------
  // Construye el mapa completo de manejadores
  // -------------------------------------------------------------------------

  return {
    // Config
    "config.get": gated("config.get", async () => {
      return services.config.get();
    }),

    // Estado
    "state.get": gated("state.get", async (params) => {
      return services.state.get(params);
    }),
    "state.set": gated("state.set", async (params) => {
      return services.state.set(params);
    }),
    "state.delete": gated("state.delete", async (params) => {
      return services.state.delete(params);
    }),

    // Entidades
    "entities.upsert": gated("entities.upsert", async (params) => {
      return services.entities.upsert(params);
    }),
    "entities.list": gated("entities.list", async (params) => {
      return services.entities.list(params);
    }),

    // Eventos
    "events.emit": gated("events.emit", async (params) => {
      return services.events.emit(params);
    }),
    "events.subscribe": gated("events.subscribe", async (params) => {
      return services.events.subscribe(params);
    }),

    // HTTP
    "http.fetch": gated("http.fetch", async (params) => {
      return services.http.fetch(params);
    }),

    // Secretos
    "secrets.resolve": gated("secrets.resolve", async (params) => {
      return services.secrets.resolve(params);
    }),

    // Actividad
    "activity.log": gated("activity.log", async (params) => {
      return services.activity.log(params);
    }),

    // Métricas
    "metrics.write": gated("metrics.write", async (params) => {
      return services.metrics.write(params);
    }),

    // Logger
    "log": gated("log", async (params) => {
      return services.logger.log(params);
    }),

    // Empresas
    "companies.list": gated("companies.list", async (params) => {
      return services.companies.list(params);
    }),
    "companies.get": gated("companies.get", async (params) => {
      return services.companies.get(params);
    }),

    // Proyectos
    "projects.list": gated("projects.list", async (params) => {
      return services.projects.list(params);
    }),
    "projects.get": gated("projects.get", async (params) => {
      return services.projects.get(params);
    }),
    "projects.listWorkspaces": gated("projects.listWorkspaces", async (params) => {
      return services.projects.listWorkspaces(params);
    }),
    "projects.getPrimaryWorkspace": gated("projects.getPrimaryWorkspace", async (params) => {
      return services.projects.getPrimaryWorkspace(params);
    }),
    "projects.getWorkspaceForIssue": gated("projects.getWorkspaceForIssue", async (params) => {
      return services.projects.getWorkspaceForIssue(params);
    }),

    // Issues
    "issues.list": gated("issues.list", async (params) => {
      return services.issues.list(params);
    }),
    "issues.get": gated("issues.get", async (params) => {
      return services.issues.get(params);
    }),
    "issues.create": gated("issues.create", async (params) => {
      return services.issues.create(params);
    }),
    "issues.update": gated("issues.update", async (params) => {
      return services.issues.update(params);
    }),
    "issues.listComments": gated("issues.listComments", async (params) => {
      return services.issues.listComments(params);
    }),
    "issues.createComment": gated("issues.createComment", async (params) => {
      return services.issues.createComment(params);
    }),

    // Documentos de issue
    "issues.documents.list": gated("issues.documents.list", async (params) => {
      return services.issueDocuments.list(params);
    }),
    "issues.documents.get": gated("issues.documents.get", async (params) => {
      return services.issueDocuments.get(params);
    }),
    "issues.documents.upsert": gated("issues.documents.upsert", async (params) => {
      return services.issueDocuments.upsert(params);
    }),
    "issues.documents.delete": gated("issues.documents.delete", async (params) => {
      return services.issueDocuments.delete(params);
    }),

    // Agentes
    "agents.list": gated("agents.list", async (params) => {
      return services.agents.list(params);
    }),
    "agents.get": gated("agents.get", async (params) => {
      return services.agents.get(params);
    }),
    "agents.pause": gated("agents.pause", async (params) => {
      return services.agents.pause(params);
    }),
    "agents.resume": gated("agents.resume", async (params) => {
      return services.agents.resume(params);
    }),
    "agents.invoke": gated("agents.invoke", async (params) => {
      return services.agents.invoke(params);
    }),

    // Sesiones de agente
    "agents.sessions.create": gated("agents.sessions.create", async (params) => {
      return services.agentSessions.create(params);
    }),
    "agents.sessions.list": gated("agents.sessions.list", async (params) => {
      return services.agentSessions.list(params);
    }),
    "agents.sessions.sendMessage": gated("agents.sessions.sendMessage", async (params) => {
      return services.agentSessions.sendMessage(params);
    }),
    "agents.sessions.close": gated("agents.sessions.close", async (params) => {
      return services.agentSessions.close(params);
    }),

    // Objetivos
    "goals.list": gated("goals.list", async (params) => {
      return services.goals.list(params);
    }),
    "goals.get": gated("goals.get", async (params) => {
      return services.goals.get(params);
    }),
    "goals.create": gated("goals.create", async (params) => {
      return services.goals.create(params);
    }),
    "goals.update": gated("goals.update", async (params) => {
      return services.goals.update(params);
    }),
  };
}

// ---------------------------------------------------------------------------
// Utilidad: getRequiredCapability
// ---------------------------------------------------------------------------

/**
 * Obtiene la capacidad requerida para un método dado de worker a host, o `null`
 * si no se requiere ninguna capacidad.
 *
 * Útil para inspeccionar requisitos de capacidad sin llamar a la fábrica.
 *
 * @param method - El nombre del método de worker a host
 * @returns La capacidad requerida, o `null`
 */
export function getRequiredCapability(
  method: WorkerToHostMethodName,
): PluginCapability | null {
  return METHOD_CAPABILITY_MAP[method];
}
