/**
 * Host RPC del lado del worker: se ejecuta dentro del proceso hijo generado por el host.
 *
 * Este módulo es la contraparte del lado del worker del `PluginWorkerManager`
 * del servidor. Este:
 *
 * 1. Lee solicitudes JSON-RPC 2.0 delimitadas por nuevas líneas desde **stdin**
 * 2. Las despacha al manejador de plugin apropiado (eventos, tareas, herramientas, …)
 * 3. Escribe respuestas JSON-RPC 2.0 de vuelta en **stdout**
 * 4. Proporciona un `PluginContext` concreto cuyos métodos de cliente SDK (p. ej.
 *    `ctx.state.get()`, `ctx.events.emit()`) envían solicitudes JSON-RPC al
 *    host en stdout y esperan respuestas en stdin.
 *
 * ## Flujo de mensajes
 *
 * ```
 * Host (proceso padre)                   Worker (este módulo)
 *   |                                        |
 *   |--- request(initialize) ------------->  |  → llama a plugin.setup(ctx)
 *   |<-- response(ok:true) ----------------  |
 *   |                                        |
 *   |--- notification(onEvent) ----------->  |  → despacha al manejador registrado
 *   |                                        |
 *   |<-- request(state.get) ---------------  |  ← llamada de cliente SDK desde código del plugin
 *   |--- response(result) ---------------->  |
 *   |                                        |
 *   |--- request(shutdown) --------------->  |  → llama a plugin.onShutdown()
 *   |<-- response(void) ------------------  |
 *   |                                        (el proceso termina)
 * ```
 *
 * @see PLUGIN_SPEC.md §12 — Modelo de proceso
 * @see PLUGIN_SPEC.md §13 — Protocolo host-worker
 * @see PLUGIN_SPEC.md §14 — Superficie SDK
 */

import path from "node:path";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";

import type { PaperclipPlugin } from "./define-plugin.js";
import type {
  PluginHealthDiagnostics,
  PluginConfigValidationResult,
  PluginWebhookInput,
} from "./define-plugin.js";
import type {
  PluginContext,
  PluginEvent,
  PluginJobContext,
  PluginLauncherRegistration,
  ScopeKey,
  ToolRunContext,
  ToolResult,
  EventFilter,
  AgentSessionEvent,
} from "./types.js";
import type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  InitializeParams,
  InitializeResult,
  ConfigChangedParams,
  ValidateConfigParams,
  OnEventParams,
  RunJobParams,
  GetDataParams,
  PerformActionParams,
  ExecuteToolParams,
  WorkerToHostMethodName,
  WorkerToHostMethods,
} from "./protocol.js";
import {
  JSONRPC_VERSION,
  JSONRPC_ERROR_CODES,
  PLUGIN_RPC_ERROR_CODES,
  createRequest,
  createSuccessResponse,
  createErrorResponse,
  createNotification,
  parseMessage,
  serializeMessage,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcNotification,
  isJsonRpcSuccessResponse,
  isJsonRpcErrorResponse,
  JsonRpcParseError,
  JsonRpcCallError,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Opciones para iniciar el host RPC del lado del worker.
 */
export interface WorkerRpcHostOptions {
  /**
   * La definición del plugin devuelta por `definePlugin()`.
   *
   * El punto de entrada del worker debería importar su plugin y pasarlo aquí.
   */
  plugin: PaperclipPlugin;

  /**
   * Flujo de entrada desde el que leer mensajes JSON-RPC.
   * Por defecto `process.stdin`.
   */
  stdin?: NodeJS.ReadableStream;

  /**
   * Flujo de salida en el que escribir mensajes JSON-RPC.
   * Por defecto `process.stdout`.
   */
  stdout?: NodeJS.WritableStream;

  /**
   * Timeout por defecto (ms) para llamadas RPC de worker a host.
   * Por defecto 30 000 ms.
   */
  rpcTimeoutMs?: number;
}

/**
 * Una instancia de host RPC del worker en ejecución.
 *
 * Devuelta por `startWorkerRpcHost()`. Los llamadores (normalmente solo el
 * bootstrap del worker) conservan una referencia para poder inspeccionar el
 * estado o forzar la detención.
 */
export interface WorkerRpcHost {
  /** Indica si el host está actualmente en ejecución y escuchando mensajes. */
  readonly running: boolean;

  /**
   * Detiene el host RPC de inmediato. Cierra readline, rechaza llamadas
   * salientes pendientes, y NO llama al hook de apagado del plugin (que
   * ya debería haberse llamado mediante el método RPC `shutdown`).
   */
  stop(): void;
}

// ---------------------------------------------------------------------------
// Interno: registro de eventos
// ---------------------------------------------------------------------------

interface EventRegistration {
  name: string;
  filter?: EventFilter;
  fn: (event: PluginEvent) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Timeout por defecto para llamadas RPC de worker a host. */
const DEFAULT_RPC_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// startWorkerRpcHost
// ---------------------------------------------------------------------------

/**
 * Opciones para runWorker al probar (stdio opcional para evitar usar flujos de proceso).
 * Cuando se proporcionan tanto stdin como stdout, se omite la verificación de "módulo principal"
 * y el host se inicia con estos flujos. Usado por pruebas.
 */
export interface RunWorkerOptions {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
}

/**
 * Inicia el worker cuando este módulo es el punto de entrada del proceso.
 *
 * Llama esto al final de tu archivo de worker para que cuando el host ejecute
 * `node dist/worker.js`, el host RPC arranque y el proceso permanezca vivo.
 * Cuando el módulo se importa (p. ej. para re-exportaciones o pruebas), nada se ejecuta.
 *
 * Cuando se proporcionan `options.stdin` y `options.stdout` (p. ej. en pruebas),
 * se omite la verificación de módulo principal y el host se inicia con esos flujos.
 *
 * @example
 * ```ts
 * const plugin = definePlugin({ ... });
 * export default plugin;
 * runWorker(plugin, import.meta.url);
 * ```
 */
export function runWorker(
  plugin: PaperclipPlugin,
  moduleUrl: string,
  options?: RunWorkerOptions,
): WorkerRpcHost | void {
  if (
    options?.stdin != null &&
    options?.stdout != null
  ) {
    return startWorkerRpcHost({
      plugin,
      stdin: options.stdin,
      stdout: options.stdout,
    });
  }
  const entry = process.argv[1];
  if (typeof entry !== "string") return;
  const thisFile = path.resolve(fileURLToPath(moduleUrl));
  const entryPath = path.resolve(entry);
  if (thisFile === entryPath) {
    startWorkerRpcHost({ plugin });
  }
}

/**
 * Inicia el host RPC del lado del worker.
 *
 * Esta función normalmente se llama desde un script bootstrap delgado que es el
 * punto de entrada real del proceso hijo:
 *
 * ```ts
 * // worker-bootstrap.ts
 * import plugin from "./worker.js";
 * import { startWorkerRpcHost } from "@paperclipai/plugin-sdk";
 *
 * startWorkerRpcHost({ plugin });
 * ```
 *
 * El host comienza a escuchar en stdin de inmediato. Aún NO llama a
 * `plugin.definition.setup()`: eso ocurre cuando el host envía el RPC
 * `initialize`.
 *
 * @returns Un manejador para inspeccionar o detener el host RPC
 */
export function startWorkerRpcHost(options: WorkerRpcHostOptions): WorkerRpcHost {
  const { plugin } = options;
  const stdinStream = options.stdin ?? process.stdin;
  const stdoutStream = options.stdout ?? process.stdout;
  const rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;

  // -----------------------------------------------------------------------
  // Estado
  // -----------------------------------------------------------------------

  let running = true;
  let initialized = false;
  let manifest: PaperclipPluginManifestV1 | null = null;
  let currentConfig: Record<string, unknown> = {};

  // Registros de manejadores del plugin (poblados durante setup())
  const eventHandlers: EventRegistration[] = [];
  const jobHandlers = new Map<string, (job: PluginJobContext) => Promise<void>>();
  const launcherRegistrations = new Map<string, PluginLauncherRegistration>();
  const dataHandlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  const actionHandlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  const toolHandlers = new Map<string, {
    declaration: Pick<import("@paperclipai/shared").PluginToolDeclaration, "displayName" | "description" | "parametersSchema">;
    fn: (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;
  }>();

  // Callbacks de eventos de sesión de agente (poblados por sendMessage, limpiados por close)
  const sessionEventCallbacks = new Map<string, (event: AgentSessionEvent) => void>();

  // Solicitudes salientes pendientes (worker→host)
  const pendingRequests = new Map<string | number, {
    resolve: (response: JsonRpcResponse) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  let nextOutboundId = 1;
  const MAX_OUTBOUND_ID = Number.MAX_SAFE_INTEGER - 1;

  // -----------------------------------------------------------------------
  // Mensajería saliente (worker → host)
  // -----------------------------------------------------------------------

  function sendMessage(message: unknown): void {
    if (!running) return;
    const serialized = serializeMessage(message as any);
    stdoutStream.write(serialized);
  }

  /**
   * Envía una solicitud JSON-RPC tipada al host y espera la respuesta.
   */
  function callHost<M extends WorkerToHostMethodName>(
    method: M,
    params: WorkerToHostMethods[M][0],
    timeoutMs?: number,
  ): Promise<WorkerToHostMethods[M][1]> {
    return new Promise<WorkerToHostMethods[M][1]>((resolve, reject) => {
      if (!running) {
        reject(new Error(`No se puede llamar a "${method}": el host RPC del worker no está en ejecución`));
        return;
      }

      if (nextOutboundId >= MAX_OUTBOUND_ID) {
        nextOutboundId = 1;
      }
      const id = nextOutboundId++;
      const timeout = timeoutMs ?? rpcTimeoutMs;
      let settled = false;

      const settle = <T>(fn: (value: T) => void, value: T): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pendingRequests.delete(id);
        fn(value);
      };

      const timer = setTimeout(() => {
        settle(
          reject,
          new JsonRpcCallError({
            code: PLUGIN_RPC_ERROR_CODES.TIMEOUT,
            message: `La llamada de worker a host "${method}" agotó el tiempo después de ${timeout}ms`,
          }),
        );
      }, timeout);

      pendingRequests.set(id, {
        resolve: (response: JsonRpcResponse) => {
          if (isJsonRpcSuccessResponse(response)) {
            settle(resolve, response.result as WorkerToHostMethods[M][1]);
          } else if (isJsonRpcErrorResponse(response)) {
            settle(reject, new JsonRpcCallError(response.error));
          } else {
            settle(reject, new Error(`Formato de respuesta inesperado para "${method}"`));
          }
        },
        timer,
      });

      try {
        const request = createRequest(method, params, id);
        sendMessage(request);
      } catch (err) {
        settle(reject, err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Envía una notificación JSON-RPC al host (disparo y olvido).
   */
  function notifyHost(method: string, params: unknown): void {
    try {
      sendMessage(createNotification(method, params));
    } catch {
      // Ignorar: el host puede haber cerrado stdin
    }
  }

  // -----------------------------------------------------------------------
  // Construir el PluginContext (superficie SDK para código de plugin)
  // -----------------------------------------------------------------------

  function buildContext(): PluginContext {
    return {
      get manifest() {
        if (!manifest) throw new Error("Contexto de plugin accedido antes de la inicialización");
        return manifest;
      },

      config: {
        async get() {
          return callHost("config.get", {} as Record<string, never>);
        },
      },

      events: {
        on(
          name: string,
          filterOrFn: EventFilter | ((event: PluginEvent) => Promise<void>),
          maybeFn?: (event: PluginEvent) => Promise<void>,
        ): () => void {
          let registration: EventRegistration;
          if (typeof filterOrFn === "function") {
            registration = { name, fn: filterOrFn };
          } else {
            if (!maybeFn) throw new Error("Se requiere una función manejadora de eventos");
            registration = { name, filter: filterOrFn, fn: maybeFn };
          }
          eventHandlers.push(registration);
          // Registrar la suscripción en el host para que los eventos se reenvíen a este worker
          void callHost("events.subscribe", { eventPattern: name, filter: registration.filter ?? null }).catch((err) => {
            notifyHost("log", {
              level: "warn",
              message: `No se pudo suscribir al evento "${name}" en el host: ${err instanceof Error ? err.message : String(err)}`,
            });
          });
          return () => {
            const idx = eventHandlers.indexOf(registration);
            if (idx !== -1) eventHandlers.splice(idx, 1);
          };
        },

        async emit(name: string, companyId: string, payload: unknown): Promise<void> {
          await callHost("events.emit", { name, companyId, payload });
        },
      },

      jobs: {
        register(key: string, fn: (job: PluginJobContext) => Promise<void>): void {
          jobHandlers.set(key, fn);
        },
      },

      launchers: {
        register(launcher: PluginLauncherRegistration): void {
          launcherRegistrations.set(launcher.id, launcher);
        },
      },

      http: {
        async fetch(url: string, init?: RequestInit): Promise<Response> {
          const serializedInit: Record<string, unknown> = {};
          if (init) {
            if (init.method) serializedInit.method = init.method;
            if (init.headers) {
              // Normalizar encabezados a un objeto plano
              if (init.headers instanceof Headers) {
                const obj: Record<string, string> = {};
                init.headers.forEach((v, k) => { obj[k] = v; });
                serializedInit.headers = obj;
              } else if (Array.isArray(init.headers)) {
                const obj: Record<string, string> = {};
                for (const [k, v] of init.headers) obj[k] = v;
                serializedInit.headers = obj;
              } else {
                serializedInit.headers = init.headers;
              }
            }
            if (init.body !== undefined && init.body !== null) {
              serializedInit.body = typeof init.body === "string"
                ? init.body
                : String(init.body);
            }
          }

          const result = await callHost("http.fetch", {
            url,
            init: Object.keys(serializedInit).length > 0 ? serializedInit : undefined,
          });

          // Reconstruir un objeto tipo Response desde el resultado serializado
          return new Response(result.body, {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
          });
        },
      },

      secrets: {
        async resolve(secretRef: string): Promise<string> {
          return callHost("secrets.resolve", { secretRef });
        },
      },

      activity: {
        async log(entry): Promise<void> {
          await callHost("activity.log", {
            companyId: entry.companyId,
            message: entry.message,
            entityType: entry.entityType,
            entityId: entry.entityId,
            metadata: entry.metadata,
          });
        },
      },

      state: {
        async get(input: ScopeKey): Promise<unknown> {
          return callHost("state.get", {
            scopeKind: input.scopeKind,
            scopeId: input.scopeId,
            namespace: input.namespace,
            stateKey: input.stateKey,
          });
        },

        async set(input: ScopeKey, value: unknown): Promise<void> {
          await callHost("state.set", {
            scopeKind: input.scopeKind,
            scopeId: input.scopeId,
            namespace: input.namespace,
            stateKey: input.stateKey,
            value,
          });
        },

        async delete(input: ScopeKey): Promise<void> {
          await callHost("state.delete", {
            scopeKind: input.scopeKind,
            scopeId: input.scopeId,
            namespace: input.namespace,
            stateKey: input.stateKey,
          });
        },
      },

      entities: {
        async upsert(input) {
          return callHost("entities.upsert", {
            entityType: input.entityType,
            scopeKind: input.scopeKind,
            scopeId: input.scopeId,
            externalId: input.externalId,
            title: input.title,
            status: input.status,
            data: input.data,
          });
        },

        async list(query) {
          return callHost("entities.list", {
            entityType: query.entityType,
            scopeKind: query.scopeKind,
            scopeId: query.scopeId,
            externalId: query.externalId,
            limit: query.limit,
            offset: query.offset,
          });
        },
      },

      projects: {
        async list(input) {
          return callHost("projects.list", {
            companyId: input.companyId,
            limit: input.limit,
            offset: input.offset,
          });
        },

        async get(projectId: string, companyId: string) {
          return callHost("projects.get", { projectId, companyId });
        },

        async listWorkspaces(projectId: string, companyId: string) {
          return callHost("projects.listWorkspaces", { projectId, companyId });
        },

        async getPrimaryWorkspace(projectId: string, companyId: string) {
          return callHost("projects.getPrimaryWorkspace", { projectId, companyId });
        },

        async getWorkspaceForIssue(issueId: string, companyId: string) {
          return callHost("projects.getWorkspaceForIssue", { issueId, companyId });
        },
      },

      companies: {
        async list(input) {
          return callHost("companies.list", {
            limit: input?.limit,
            offset: input?.offset,
          });
        },

        async get(companyId: string) {
          return callHost("companies.get", { companyId });
        },
      },

      issues: {
        async list(input) {
          return callHost("issues.list", {
            companyId: input.companyId,
            projectId: input.projectId,
            assigneeAgentId: input.assigneeAgentId,
            status: input.status,
            limit: input.limit,
            offset: input.offset,
          });
        },

        async get(issueId: string, companyId: string) {
          return callHost("issues.get", { issueId, companyId });
        },

        async create(input) {
          return callHost("issues.create", {
            companyId: input.companyId,
            projectId: input.projectId,
            goalId: input.goalId,
            parentId: input.parentId,
            title: input.title,
            description: input.description,
            priority: input.priority,
            assigneeAgentId: input.assigneeAgentId,
          });
        },

        async update(issueId: string, patch, companyId: string) {
          return callHost("issues.update", {
            issueId,
            patch: patch as Record<string, unknown>,
            companyId,
          });
        },

        async listComments(issueId: string, companyId: string) {
          return callHost("issues.listComments", { issueId, companyId });
        },

        async createComment(issueId: string, body: string, companyId: string) {
          return callHost("issues.createComment", { issueId, body, companyId });
        },

        documents: {
          async list(issueId: string, companyId: string) {
            return callHost("issues.documents.list", { issueId, companyId });
          },

          async get(issueId: string, key: string, companyId: string) {
            return callHost("issues.documents.get", { issueId, key, companyId });
          },

          async upsert(input) {
            return callHost("issues.documents.upsert", {
              issueId: input.issueId,
              key: input.key,
              body: input.body,
              companyId: input.companyId,
              title: input.title,
              format: input.format,
              changeSummary: input.changeSummary,
            });
          },

          async delete(issueId: string, key: string, companyId: string) {
            return callHost("issues.documents.delete", { issueId, key, companyId });
          },
        },
      },

      agents: {
        async list(input) {
          return callHost("agents.list", {
            companyId: input.companyId,
            status: input.status,
            limit: input.limit,
            offset: input.offset,
          });
        },

        async get(agentId: string, companyId: string) {
          return callHost("agents.get", { agentId, companyId });
        },

        async pause(agentId: string, companyId: string) {
          return callHost("agents.pause", { agentId, companyId });
        },

        async resume(agentId: string, companyId: string) {
          return callHost("agents.resume", { agentId, companyId });
        },

        async invoke(agentId: string, companyId: string, opts: { prompt: string; reason?: string }) {
          return callHost("agents.invoke", { agentId, companyId, prompt: opts.prompt, reason: opts.reason });
        },

        sessions: {
          async create(agentId: string, companyId: string, opts?: { taskKey?: string; reason?: string }) {
            return callHost("agents.sessions.create", {
              agentId,
              companyId,
              taskKey: opts?.taskKey,
              reason: opts?.reason,
            });
          },

          async list(agentId: string, companyId: string) {
            return callHost("agents.sessions.list", { agentId, companyId });
          },

          async sendMessage(sessionId: string, companyId: string, opts: {
            prompt: string;
            reason?: string;
            onEvent?: (event: AgentSessionEvent) => void;
          }) {
            if (opts.onEvent) {
              sessionEventCallbacks.set(sessionId, opts.onEvent);
            }
            try {
              return await callHost("agents.sessions.sendMessage", {
                sessionId,
                companyId,
                prompt: opts.prompt,
                reason: opts.reason,
              });
            } catch (err) {
              sessionEventCallbacks.delete(sessionId);
              throw err;
            }
          },

          async close(sessionId: string, companyId: string) {
            sessionEventCallbacks.delete(sessionId);
            await callHost("agents.sessions.close", { sessionId, companyId });
          },
        },
      },

      goals: {
        async list(input) {
          return callHost("goals.list", {
            companyId: input.companyId,
            level: input.level,
            status: input.status,
            limit: input.limit,
            offset: input.offset,
          });
        },

        async get(goalId: string, companyId: string) {
          return callHost("goals.get", { goalId, companyId });
        },

        async create(input) {
          return callHost("goals.create", {
            companyId: input.companyId,
            title: input.title,
            description: input.description,
            level: input.level,
            status: input.status,
            parentId: input.parentId,
            ownerAgentId: input.ownerAgentId,
          });
        },

        async update(goalId: string, patch, companyId: string) {
          return callHost("goals.update", {
            goalId,
            patch: patch as Record<string, unknown>,
            companyId,
          });
        },
      },

      data: {
        register(key: string, handler: (params: Record<string, unknown>) => Promise<unknown>): void {
          dataHandlers.set(key, handler);
        },
      },

      actions: {
        register(key: string, handler: (params: Record<string, unknown>) => Promise<unknown>): void {
          actionHandlers.set(key, handler);
        },
      },

      streams: (() => {
        // Rastrear canal → companyId para que emit/close no requieran companyId
        const channelCompanyMap = new Map<string, string>();
        return {
          open(channel: string, companyId: string): void {
            channelCompanyMap.set(channel, companyId);
            notifyHost("streams.open", { channel, companyId });
          },
          emit(channel: string, event: unknown): void {
            const companyId = channelCompanyMap.get(channel) ?? "";
            notifyHost("streams.emit", { channel, companyId, event });
          },
          close(channel: string): void {
            const companyId = channelCompanyMap.get(channel) ?? "";
            channelCompanyMap.delete(channel);
            notifyHost("streams.close", { channel, companyId });
          },
        };
      })(),

      tools: {
        register(
          name: string,
          declaration: Pick<import("@paperclipai/shared").PluginToolDeclaration, "displayName" | "description" | "parametersSchema">,
          fn: (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>,
        ): void {
          toolHandlers.set(name, { declaration, fn });
        },
      },

      metrics: {
        async write(name: string, value: number, tags?: Record<string, string>): Promise<void> {
          await callHost("metrics.write", { name, value, tags });
        },
      },

      logger: {
        info(message: string, meta?: Record<string, unknown>): void {
          notifyHost("log", { level: "info", message, meta });
        },
        warn(message: string, meta?: Record<string, unknown>): void {
          notifyHost("log", { level: "warn", message, meta });
        },
        error(message: string, meta?: Record<string, unknown>): void {
          notifyHost("log", { level: "error", message, meta });
        },
        debug(message: string, meta?: Record<string, unknown>): void {
          notifyHost("log", { level: "debug", message, meta });
        },
      },
    };
  }

  const ctx = buildContext();

  // -----------------------------------------------------------------------
  // Manejo de mensajes entrantes (host → worker)
  // -----------------------------------------------------------------------

  /**
   * Maneja una solicitud JSON-RPC entrante desde el host.
   *
   * Despacha al manejador correcto según el nombre del método.
   */
  async function handleHostRequest(request: JsonRpcRequest): Promise<void> {
    const { id, method, params } = request;

    try {
      const result = await dispatchMethod(method, params);
      sendMessage(createSuccessResponse(id, result ?? null));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Propagar códigos de error específicos desde errores de manejador (p. ej.
      // METHOD_NOT_FOUND, METHOD_NOT_IMPLEMENTED): usar WORKER_ERROR
      // como respaldo para excepciones sin tipo.
      const errorCode =
        typeof (err as any)?.code === "number"
          ? (err as any).code
          : PLUGIN_RPC_ERROR_CODES.WORKER_ERROR;

      sendMessage(createErrorResponse(id, errorCode, errorMessage));
    }
  }

  /**
   * Despacha una llamada de método de host a worker al manejador apropiado.
   */
  async function dispatchMethod(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return handleInitialize(params as InitializeParams);

      case "health":
        return handleHealth();

      case "shutdown":
        return handleShutdown();

      case "validateConfig":
        return handleValidateConfig(params as ValidateConfigParams);

      case "configChanged":
        return handleConfigChanged(params as ConfigChangedParams);

      case "onEvent":
        return handleOnEvent(params as OnEventParams);

      case "runJob":
        return handleRunJob(params as RunJobParams);

      case "handleWebhook":
        return handleWebhook(params as PluginWebhookInput);

      case "getData":
        return handleGetData(params as GetDataParams);

      case "performAction":
        return handlePerformAction(params as PerformActionParams);

      case "executeTool":
        return handleExecuteTool(params as ExecuteToolParams);

      default:
        throw Object.assign(
          new Error(`Método desconocido: ${method}`),
          { code: JSONRPC_ERROR_CODES.METHOD_NOT_FOUND },
        );
    }
  }

  // -----------------------------------------------------------------------
  // Manejadores de métodos de host a worker
  // -----------------------------------------------------------------------

  async function handleInitialize(params: InitializeParams): Promise<InitializeResult> {
    if (initialized) {
      throw new Error("El worker ya está inicializado");
    }

    manifest = params.manifest;
    currentConfig = params.config;

    // Llamar a la función de setup del plugin
    await plugin.definition.setup(ctx);

    initialized = true;

    // Reportar qué métodos opcionales implementa este plugin
    const supportedMethods: string[] = [];
    if (plugin.definition.onValidateConfig) supportedMethods.push("validateConfig");
    if (plugin.definition.onConfigChanged) supportedMethods.push("configChanged");
    if (plugin.definition.onHealth) supportedMethods.push("health");
    if (plugin.definition.onShutdown) supportedMethods.push("shutdown");

    return { ok: true, supportedMethods };
  }

  async function handleHealth(): Promise<PluginHealthDiagnostics> {
    if (plugin.definition.onHealth) {
      return plugin.definition.onHealth();
    }
    // Por defecto: reportar OK si el worker está vivo
    return { status: "ok" };
  }

  async function handleShutdown(): Promise<void> {
    if (plugin.definition.onShutdown) {
      await plugin.definition.onShutdown();
    }

    // Programar la limpieza después de enviar la respuesta.
    // Usar setImmediate para dejar que la respuesta se vacíe antes de salir.
    // Solo llamar process.exit() cuando se usen flujos de proceso reales.
    // Cuando se proporcionan flujos personalizados (pruebas), solo limpiar.
    setImmediate(() => {
      cleanup();
      if (!options.stdin && !options.stdout) {
        process.exit(0);
      }
    });
  }

  async function handleValidateConfig(
    params: ValidateConfigParams,
  ): Promise<PluginConfigValidationResult> {
    if (!plugin.definition.onValidateConfig) {
      throw Object.assign(
        new Error("validateConfig no está implementado por este plugin"),
        { code: PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED },
      );
    }
    return plugin.definition.onValidateConfig(params.config);
  }

  async function handleConfigChanged(params: ConfigChangedParams): Promise<void> {
    currentConfig = params.config;

    if (plugin.definition.onConfigChanged) {
      await plugin.definition.onConfigChanged(params.config);
    }
  }

  async function handleOnEvent(params: OnEventParams): Promise<void> {
    const event = params.event;

    for (const registration of eventHandlers) {
      // Verificar coincidencia de tipo de evento
      const exactMatch = registration.name === event.eventType;
      const wildcardPluginAll =
        registration.name === "plugin.*" &&
        event.eventType.startsWith("plugin.");
      const wildcardPluginOne =
        registration.name.endsWith(".*") &&
        event.eventType.startsWith(registration.name.slice(0, -1));

      if (!exactMatch && !wildcardPluginAll && !wildcardPluginOne) continue;

      // Verificar filtro
      if (registration.filter && !allowsEvent(registration.filter, event)) continue;

      try {
        await registration.fn(event);
      } catch (err) {
        // Registrar el error pero continuar procesando otros manejadores para que un
        // manejador fallido no impida que el resto se ejecute.
        notifyHost("log", {
          level: "error",
          message: `El manejador de eventos para "${registration.name}" falló: ${
            err instanceof Error ? err.message : String(err)
          }`,
          meta: { eventType: event.eventType, stack: err instanceof Error ? err.stack : undefined },
        });
      }
    }
  }

  async function handleRunJob(params: RunJobParams): Promise<void> {
    const handler = jobHandlers.get(params.job.jobKey);
    if (!handler) {
      throw new Error(`No hay manejador registrado para la tarea "${params.job.jobKey}"`);
    }
    await handler(params.job);
  }

  async function handleWebhook(params: PluginWebhookInput): Promise<void> {
    if (!plugin.definition.onWebhook) {
      throw Object.assign(
        new Error("handleWebhook no está implementado por este plugin"),
        { code: PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED },
      );
    }
    await plugin.definition.onWebhook(params);
  }

  async function handleGetData(params: GetDataParams): Promise<unknown> {
    const handler = dataHandlers.get(params.key);
    if (!handler) {
      throw new Error(`No hay manejador de datos registrado para la clave "${params.key}"`);
    }
    return handler(
      params.renderEnvironment === undefined
        ? params.params
        : { ...params.params, renderEnvironment: params.renderEnvironment },
    );
  }

  async function handlePerformAction(params: PerformActionParams): Promise<unknown> {
    const handler = actionHandlers.get(params.key);
    if (!handler) {
      throw new Error(`No hay manejador de acción registrado para la clave "${params.key}"`);
    }
    return handler(
      params.renderEnvironment === undefined
        ? params.params
        : { ...params.params, renderEnvironment: params.renderEnvironment },
    );
  }

  async function handleExecuteTool(params: ExecuteToolParams): Promise<ToolResult> {
    const entry = toolHandlers.get(params.toolName);
    if (!entry) {
      throw new Error(`No hay manejador de herramienta registrado para "${params.toolName}"`);
    }
    return entry.fn(params.parameters, params.runContext);
  }

  // -----------------------------------------------------------------------
  // Helper de filtro de eventos
  // -----------------------------------------------------------------------

  function allowsEvent(filter: EventFilter, event: PluginEvent): boolean {
    const payload = event.payload as Record<string, unknown> | undefined;

    if (filter.companyId !== undefined) {
      const companyId = event.companyId ?? String(payload?.companyId ?? "");
      if (companyId !== filter.companyId) return false;
    }

    if (filter.projectId !== undefined) {
      const projectId = event.entityType === "project"
        ? event.entityId
        : String(payload?.projectId ?? "");
      if (projectId !== filter.projectId) return false;
    }

    if (filter.agentId !== undefined) {
      const agentId = event.entityType === "agent"
        ? event.entityId
        : String(payload?.agentId ?? "");
      if (agentId !== filter.agentId) return false;
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Manejo de respuestas entrantes (host → worker, respuesta a nuestra llamada saliente)
  // -----------------------------------------------------------------------

  function handleHostResponse(response: JsonRpcResponse): void {
    const id = response.id;
    if (id === null || id === undefined) return;

    const pending = pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingRequests.delete(id);
    pending.resolve(response);
  }

  // -----------------------------------------------------------------------
  // Manejador de líneas entrantes
  // -----------------------------------------------------------------------

  function handleLine(line: string): void {
    if (!line.trim()) return;

    let message: unknown;
    try {
      message = parseMessage(line);
    } catch (err) {
      if (err instanceof JsonRpcParseError) {
        // Enviar respuesta de error de análisis
        sendMessage(
          createErrorResponse(
            null,
            JSONRPC_ERROR_CODES.PARSE_ERROR,
            `Error de análisis: ${err.message}`,
          ),
        );
      }
      return;
    }

    if (isJsonRpcResponse(message)) {
      // Esta es una respuesta a una de nuestras llamadas salientes de worker a host
      handleHostResponse(message);
    } else if (isJsonRpcRequest(message)) {
      // Esta es una llamada RPC de host a worker: despacharla
      handleHostRequest(message as JsonRpcRequest).catch((err) => {
        // Error no manejado en el manejador asíncrono: enviar respuesta de error
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorCode = (err as any)?.code ?? PLUGIN_RPC_ERROR_CODES.WORKER_ERROR;
        try {
          sendMessage(
            createErrorResponse(
              (message as JsonRpcRequest).id,
              typeof errorCode === "number" ? errorCode : PLUGIN_RPC_ERROR_CODES.WORKER_ERROR,
              errorMessage,
            ),
          );
        } catch {
          // No se puede enviar respuesta, stdout puede estar cerrado
        }
      });
    } else if (isJsonRpcNotification(message)) {
      // Despachar notificaciones push de host a worker
      const notif = message as { method: string; params?: unknown };
      if (notif.method === "agents.sessions.event" && notif.params) {
        const event = notif.params as AgentSessionEvent;
        const cb = sessionEventCallbacks.get(event.sessionId);
        if (cb) cb(event);
      } else if (notif.method === "onEvent" && notif.params) {
        // Notificaciones del bus de eventos del plugin: despachar a los manejadores de eventos registrados
        handleOnEvent(notif.params as OnEventParams).catch((err) => {
          notifyHost("log", {
            level: "error",
            message: `No se pudo manejar la notificación de evento: ${err instanceof Error ? err.message : String(err)}`,
          });
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Limpieza
  // -----------------------------------------------------------------------

  function cleanup(): void {
    running = false;

    // Cerrar readline
    if (readline) {
      readline.close();
      readline = null;
    }

    // Rechazar todas las llamadas salientes pendientes
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve(
        createErrorResponse(
          id,
          PLUGIN_RPC_ERROR_CODES.WORKER_UNAVAILABLE,
          "El host RPC del worker se está apagando",
        ) as JsonRpcResponse,
      );
    }
    pendingRequests.clear();
    sessionEventCallbacks.clear();
  }

  // -----------------------------------------------------------------------
  // Bootstrap: conectar stdin readline
  // -----------------------------------------------------------------------

  let readline: ReadlineInterface | null = createInterface({
    input: stdinStream as NodeJS.ReadableStream,
    crlfDelay: Infinity,
  });

  readline.on("line", handleLine);

  // Si stdin se cierra, debemos salir con gracia
  readline.on("close", () => {
    if (running) {
      cleanup();
      if (!options.stdin && !options.stdout) {
        process.exit(0);
      }
    }
  });

  // Manejar errores no capturados en el proceso del worker.
  // Solo instalar estos cuando se usen los flujos de proceso reales (no en pruebas
  // donde el llamador proporciona flujos personalizados).
  if (!options.stdin && !options.stdout) {
    process.on("uncaughtException", (err) => {
      notifyHost("log", {
        level: "error",
        message: `Excepción no capturada: ${err.message}`,
        meta: { stack: err.stack },
      });
      // Dar a la notificación un momento para vaciarse, luego salir
      setTimeout(() => process.exit(1), 100);
    });

    process.on("unhandledRejection", (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      notifyHost("log", {
        level: "error",
        message: `Rechazo no manejado: ${message}`,
        meta: { stack },
      });
    });
  }

  // -----------------------------------------------------------------------
  // Devolver el manejador
  // -----------------------------------------------------------------------

  return {
    get running() {
      return running;
    },

    stop() {
      cleanup();
    },
  };
}
