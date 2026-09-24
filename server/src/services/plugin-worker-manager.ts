/**
 * PluginWorkerManager — genera y gestiona procesos hijos de workers de
 * plugins fuera del proceso, enruta llamadas JSON-RPC 2.0 sobre stdio, y
 * maneja la gestión del ciclo de vida incluyendo recuperación de fallos con
 * backoff exponencial.
 *
 * Cada plugin instalado obtiene un proceso worker dedicado. El host envía
 * solicitudes JSON-RPC sobre el stdin del hijo y lee respuestas desde
 * stdout. El stderr del worker se captura y reenvía al logger del host.
 *
 * Modelo de proceso (de PLUGIN_SPEC.md §12):
 * - Un proceso worker por plugin instalado
 * - Aislamiento de fallos: los fallos de plugins no afectan al host
 * - Apagado gracioso: drenaje de 10 segundos, luego SIGTERM, luego SIGKILL
 * - Reinicio automático con backoff exponencial en salidas inesperadas
 *
 * @see PLUGIN_SPEC.md §12 — Modelo de proceso
 * @see PLUGIN_SPEC.md §12.5 — Política de apagado gracioso
 * @see PLUGIN_SPEC.md §13 — Protocolo host-worker
 */

import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import {
  JSONRPC_VERSION,
  JSONRPC_ERROR_CODES,
  PLUGIN_RPC_ERROR_CODES,
  createRequest,
  createErrorResponse,
  parseMessage,
  serializeMessage,
  isJsonRpcResponse,
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcSuccessResponse,
  JsonRpcParseError,
  JsonRpcCallError,
} from "@paperclipai/plugin-sdk";
import type {
  JsonRpcId,
  JsonRpcResponse,
  JsonRpcRequest,
  JsonRpcNotification,
  HostToWorkerMethodName,
  HostToWorkerMethods,
  WorkerToHostMethodName,
  WorkerToHostMethods,
  InitializeParams,
} from "@paperclipai/plugin-sdk";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout predeterminado para llamadas RPC en milisegundos. */
const DEFAULT_RPC_TIMEOUT_MS = 30_000;

/** Límite superior duro para cualquier timeout RPC (5 minutos). Evita esperas ilimitadas. */
const MAX_RPC_TIMEOUT_MS = 5 * 60 * 1_000;

/** Timeout para la llamada RPC initialize. */
const INITIALIZE_TIMEOUT_MS = 15_000;

/** Timeout para la llamada RPC shutdown antes de escalar a SIGTERM. */
const SHUTDOWN_DRAIN_MS = 10_000;

/** Tiempo a esperar tras SIGTERM antes de enviar SIGKILL. */
const SIGTERM_GRACE_MS = 5_000;

/** Retardo mínimo de backoff para recuperación de fallos (1 segundo). */
const MIN_BACKOFF_MS = 1_000;

/** Retardo máximo de backoff para recuperación de fallos (5 minutos). */
const MAX_BACKOFF_MS = 5 * 60 * 1_000;

/** Multiplicador de backoff en cada fallo consecutivo. */
const BACKOFF_MULTIPLIER = 2;

/** Número máximo de fallos consecutivos antes de rendirse con el auto-reinicio. */
const MAX_CONSECUTIVE_CRASHES = 10;

/** Ventana de tiempo en la que los fallos se consideran consecutivos (10 minutos). */
const CRASH_WINDOW_MS = 10 * 60 * 1_000;

/** Número máximo de caracteres de stderr retenidos para contexto de fallo del worker. */
const MAX_STDERR_EXCERPT_CHARS = 8_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Estado de un proceso worker gestionado.
 */
export type WorkerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "crashed"
  | "backoff";

/**
 * Manejador de método worker-a-host. El host registra estos para atender
 * llamadas que el worker del plugin hace de vuelta al host (p. ej.
 * state.get, events.emit).
 */
export type WorkerToHostHandler<M extends WorkerToHostMethodName> = (
  params: WorkerToHostMethods[M][0],
) => Promise<WorkerToHostMethods[M][1]>;

/**
 * Un mapa de todos los manejadores de métodos worker-a-host provistos por el
 * host.
 */
export type WorkerToHostHandlers = {
  [M in WorkerToHostMethodName]?: WorkerToHostHandler<M>;
};

/**
 * Eventos emitidos por un PluginWorkerHandle.
 */
export interface WorkerHandleEvents {
  /** El proceso worker arrancó y está listo (initialize tuvo éxito). */
  "ready": { pluginId: string };
  /** El proceso worker salió. */
  "exit": { pluginId: string; code: number | null; signal: NodeJS.Signals | null };
  /** El proceso worker falló inesperadamente. */
  "crash": { pluginId: string; code: number | null; signal: NodeJS.Signals | null; willRestart: boolean };
  /** El proceso worker tuvo un error (p. ej. fallo de spawn). */
  "error": { pluginId: string; error: Error };
  /** El estado del worker cambió. */
  "status": { pluginId: string; status: WorkerStatus; previousStatus: WorkerStatus };
}

type WorkerHandleEventName = keyof WorkerHandleEvents;

export function appendStderrExcerpt(current: string, chunk: string): string {
  const next = current ? `${current}\n${chunk}` : chunk;
  return next.length <= MAX_STDERR_EXCERPT_CHARS
    ? next
    : next.slice(-MAX_STDERR_EXCERPT_CHARS);
}

export function formatWorkerFailureMessage(message: string, stderrExcerpt: string): string {
  const excerpt = stderrExcerpt.trim();
  if (!excerpt) return message;
  if (message.includes(excerpt)) return message;
  return `${message}\n\nstderr del worker:\n${excerpt}`;
}

/**
 * Opciones para arrancar un proceso worker.
 */
export interface WorkerStartOptions {
  /** Ruta absoluta al entrypoint del worker del plugin (bundle CJS). */
  entrypointPath: string;
  /** Manifiesto del plugin. */
  manifest: PaperclipPluginManifestV1;
  /** Configuración resuelta del plugin. */
  config: Record<string, unknown>;
  /** Información de la instancia host para la llamada initialize. */
  instanceInfo: {
    instanceId: string;
    hostVersion: string;
  };
  /** Versión de la API host. */
  apiVersion: number;
  /** Manejadores para llamadas RPC worker→host. */
  hostHandlers: WorkerToHostHandlers;
  /** Timeout predeterminado para llamadas RPC (ms). Por defecto 30s. */
  rpcTimeoutMs?: number;
  /** Si reintentar automáticamente en fallo. Por defecto true. */
  autoRestart?: boolean;
  /** Node.js execArgv pasado al proceso hijo. */
  execArgv?: string[];
  /** Variables de entorno pasadas al proceso hijo. */
  env?: Record<string, string>;
  /**
   * Callback para notificaciones de stream del worker (streams.open/emit/close).
   * El host lo conecta al PluginStreamBus para distribuir eventos a clientes SSE.
   */
  onStreamNotification?: (method: string, params: Record<string, unknown>) => void;
}

/**
 * Una llamada RPC pendiente esperando respuesta del worker.
 */
interface PendingRequest {
  /** El ID de la solicitud. */
  id: JsonRpcId;
  /** Nombre del método (para logging). */
  method: string;
  /** Resuelve la promesa con la respuesta. */
  resolve: (response: JsonRpcResponse) => void;
  /** Manejador del timer de timeout. */
  timer: ReturnType<typeof setTimeout>;
  /** Timestamp de cuándo se envió la solicitud. */
  sentAt: number;
}

// ---------------------------------------------------------------------------
// PluginWorkerHandle — manages a single worker process
// ---------------------------------------------------------------------------

/**
 * Manejador para un solo proceso worker de plugin.
 *
 * Los llamadores usan `start()` para generar el worker, `call()` para enviar
 * solicitudes RPC, y `stop()` para apagar graciosamente. El manejador gestiona
 * la recuperación de fallos con backoff exponencial automáticamente cuando
 * `autoRestart` está activado.
 */
export interface PluginWorkerHandle {
  /** El ID del plugin que este worker sirve. */
  readonly pluginId: string;

  /** Estado actual del worker. */
  readonly status: WorkerStatus;

  /** Arranca el proceso worker. Resuelve cuando initialize completa. */
  start(): Promise<void>;

  /**
   * Detiene el proceso worker graciosamente.
   *
   * Envía una llamada RPC `shutdown`, espera hasta 10 segundos a que el
   * worker salga, luego escala a SIGTERM, y finalmente SIGKILL si se
   * necesita.
   */
  stop(): Promise<void>;

  /**
   * Reinicia el proceso worker (stop + start).
   */
  restart(): Promise<void>;

  /**
   * Envía una llamada RPC tipada host→worker.
   *
   * @param method - El nombre del método RPC
   * @param params - Parámetros del método
   * @param timeoutMs - Override opcional de timeout por llamada
   * @returns El resultado del método
   * @throws {JsonRpcCallError} si el worker devuelve una respuesta de error
   * @throws {Error} si el worker no está corriendo o la llamada expira
   */
  call<M extends HostToWorkerMethodName>(
    method: M,
    params: HostToWorkerMethods[M][0],
    timeoutMs?: number,
  ): Promise<HostToWorkerMethods[M][1]>;

  /**
   * Envía una notificación fire-and-forget al worker (no se espera respuesta).
   */
  notify(method: string, params: unknown): void;

  /** Se suscribe a eventos del worker. */
  on<K extends WorkerHandleEventName>(
    event: K,
    listener: (payload: WorkerHandleEvents[K]) => void,
  ): void;

  /** Se desuscribe de eventos del worker. */
  off<K extends WorkerHandleEventName>(
    event: K,
    listener: (payload: WorkerHandleEvents[K]) => void,
  ): void;

  /** Métodos opcionales que el worker reportó durante la inicialización. */
  readonly supportedMethods: string[];

  /** Obtiene info de diagnóstico sobre el worker. */
  diagnostics(): WorkerDiagnostics;
}

/**
 * Información de diagnóstico sobre un proceso worker.
 */
export interface WorkerDiagnostics {
  pluginId: string;
  status: WorkerStatus;
  pid: number | null;
  uptime: number | null;
  consecutiveCrashes: number;
  totalCrashes: number;
  pendingRequests: number;
  lastCrashAt: number | null;
  nextRestartAt: number | null;
}

// ---------------------------------------------------------------------------
// PluginWorkerManager — manages all plugin workers
// ---------------------------------------------------------------------------

/**
 * El manager de nivel superior que retiene todos los manejadores de workers
 * de plugins.
 *
 * Provee un registro de workers indexado por ID de plugin, con métodos de
 * conveniencia para arrancar/detener todos los workers y enrutar llamadas
 * RPC.
 */
export interface PluginWorkerManager {
  /**
   * Registra y arranca un worker para un plugin.
   *
   * @returns El manejador del worker
   * @throws si ya hay un worker registrado para este plugin
   */
  startWorker(pluginId: string, options: WorkerStartOptions): Promise<PluginWorkerHandle>;

  /**
   * Detiene y desregistra un worker de plugin específico.
   */
  stopWorker(pluginId: string): Promise<void>;

  /**
   * Obtiene el manejador del worker para un plugin.
   */
  getWorker(pluginId: string): PluginWorkerHandle | undefined;

  /**
   * Comprueba si un worker está registrado y corriendo para un plugin.
   */
  isRunning(pluginId: string): boolean;

  /**
   * Detiene todos los workers gestionados. Se llama durante el apagado del
   * servidor.
   */
  stopAll(): Promise<void>;

  /**
   * Obtiene info de diagnóstico para todos los workers.
   */
  diagnostics(): WorkerDiagnostics[];

  /**
   * Envía una llamada RPC a un worker de plugin específico.
   *
   * @throws si el worker no está corriendo
   */
  call<M extends HostToWorkerMethodName>(
    pluginId: string,
    method: M,
    params: HostToWorkerMethods[M][0],
    timeoutMs?: number,
  ): Promise<HostToWorkerMethods[M][1]>;
}

// ---------------------------------------------------------------------------
// Implementation: createPluginWorkerHandle
// ---------------------------------------------------------------------------

/**
 * Crea un manejador para un solo proceso worker de plugin.
 *
 * @internal Exportado para pruebas; los consumidores deben usar
 * `createPluginWorkerManager`.
 */
export function createPluginWorkerHandle(
  pluginId: string,
  options: WorkerStartOptions,
): PluginWorkerHandle {
  const log = logger.child({ service: "plugin-worker", pluginId });
  const emitter = new EventEmitter();
  /**
   * Más alto que el predeterminado (10) para acomodar múltiples suscriptores
   * a eventos crash/ready/exit durante pruebas de integración y monitoreo
   * en runtime.
   */
  emitter.setMaxListeners(50);

  // Estado del proceso worker
  let childProcess: ChildProcess | null = null;
  let readline: ReadlineInterface | null = null;
  let stderrReadline: ReadlineInterface | null = null;
  let status: WorkerStatus = "stopped";
  let startedAt: number | null = null;
  let stderrExcerpt = "";

  // Solicitudes RPC pendientes esperando respuesta
  const pendingRequests = new Map<string | number, PendingRequest>();
  let nextRequestId = 1;

  // Métodos opcionales reportados por el worker durante la inicialización
  let supportedMethods: string[] = [];

  // Rastreo de fallos para backoff exponencial
  let consecutiveCrashes = 0;
  let totalCrashes = 0;
  let lastCrashAt: number | null = null;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let nextRestartAt: number | null = null;

  // Rastrea canales de stream abiertos para poder emitir close sintético en fallo.
  // Mapea channel → companyId.
  const openStreamChannels = new Map<string, string>();

  // Coordinación de apagado
  let intentionalStop = false;

  const rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
  const autoRestart = options.autoRestart ?? true;

  // -----------------------------------------------------------------------
  // Gestión de estado
  // -----------------------------------------------------------------------

  function setStatus(newStatus: WorkerStatus): void {
    const prev = status;
    if (prev === newStatus) return;
    status = newStatus;
    log.debug({ from: prev, to: newStatus }, "cambio de estado del worker");
    emitter.emit("status", { pluginId, status: newStatus, previousStatus: prev });
  }

  // -----------------------------------------------------------------------
  // Envío de mensajes JSON-RPC
  // -----------------------------------------------------------------------

  function sendMessage(message: unknown): void {
    if (!childProcess?.stdin?.writable) {
      throw new Error(`El proceso worker para el plugin "${pluginId}" no es escribible`);
    }
    const serialized = serializeMessage(message as any);
    childProcess.stdin.write(serialized);
  }

  // -----------------------------------------------------------------------
  // Manejo de mensajes entrantes
  // -----------------------------------------------------------------------

  function handleLine(line: string): void {
    if (!line.trim()) return;

    let message: unknown;
    try {
      message = parseMessage(line);
    } catch (err) {
      if (err instanceof JsonRpcParseError) {
        log.warn({ rawLine: line.slice(0, 200) }, "mensaje no parseable del worker");
      } else {
        log.warn({ err }, "error parseando mensaje del worker");
      }
      return;
    }

    if (isJsonRpcResponse(message)) {
      handleResponse(message);
    } else if (isJsonRpcRequest(message)) {
      handleWorkerRequest(message as JsonRpcRequest);
    } else if (isJsonRpcNotification(message)) {
      handleWorkerNotification(message as JsonRpcNotification);
    } else {
      log.warn("tipo de mensaje desconocido del worker");
    }
  }

  /**
   * Maneja una respuesta JSON-RPC del worker (coincidiendo con una solicitud
   * pendiente).
   */
  function handleResponse(response: JsonRpcResponse): void {
    const id = response.id;
    if (id === null || id === undefined) {
      log.warn("respuesta recibida con id null/undefined");
      return;
    }

    const pending = pendingRequests.get(id);
    if (!pending) {
      log.warn({ id }, "respuesta recibida para id de solicitud desconocido");
      return;
    }

    clearTimeout(pending.timer);
    pendingRequests.delete(id);
    pending.resolve(response);
  }

  /**
   * Maneja una solicitud JSON-RPC del worker (llamada worker→host).
   */
  async function handleWorkerRequest(request: JsonRpcRequest): Promise<void> {
    const method = request.method as WorkerToHostMethodName;
    const handler = options.hostHandlers[method] as
      | ((params: unknown) => Promise<unknown>)
      | undefined;

    if (!handler) {
      log.warn({ method }, "el worker llamó un método host no registrado");
      try {
        sendMessage(
          createErrorResponse(
            request.id,
            JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
            `El host no maneja el método "${method}"`,
          ),
        );
      } catch {
        // El worker puede haber salido, ignorar error de envío
      }
      return;
    }

    try {
      const result = await handler(request.params);
      sendMessage({
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result: result ?? null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error({ method, err: errorMessage }, "error del manejador host");
      try {
        sendMessage(
          createErrorResponse(
            request.id,
            JSONRPC_ERROR_CODES.INTERNAL_ERROR,
            errorMessage,
          ),
        );
      } catch {
        // El worker puede haber salido, ignorar error de envío
      }
    }
  }

  /**
   * Maneja una notificación JSON-RPC del worker (fire-and-forget).
   *
   * La notificación `log` es el caso primario — las llamadas `ctx.logger`
   * del worker llegan aquí. Agregamos contexto estructurado del plugin
   * (pluginId, timestamp, level) para que cada entrada de log sea
   * consultable según la spec (§26.1).
   */
  function handleWorkerNotification(notification: JsonRpcNotification): void {
    if (notification.method === "log") {
      const params = notification.params as {
        level?: string;
        message?: string;
        meta?: Record<string, unknown>;
      } | null;
      const level = params?.level ?? "info";
      const msg = params?.message ?? "";
      const meta = params?.meta;

      // Construye un objeto de log estructurado que incluye los campos de
      // contexto del plugin requeridos por §26.1: pluginId, timestamp, level,
      // message y metadata. El child logger ya porta `pluginId` en sus
      // bindings, pero agregamos `pluginLogLevel` y `pluginTimestamp`
      // explícitos para que consumidores downstream (almacenamiento de logs,
      // consultas UI) puedan filtrar sin parsear.
      const logFields: Record<string, unknown> = {
        ...meta,
        pluginLogLevel: level,
        pluginTimestamp: new Date().toISOString(),
      };

      if (level === "error") {
        log.error(logFields, `[plugin] ${msg}`);
      } else if (level === "warn") {
        log.warn(logFields, `[plugin] ${msg}`);
      } else if (level === "debug") {
        log.debug(logFields, `[plugin] ${msg}`);
      } else {
        log.info(logFields, `[plugin] ${msg}`);
      }
      return;
    }

    // Notificaciones de stream: reenvía al stream bus vía callback
    if (
      notification.method === "streams.open" ||
      notification.method === "streams.emit" ||
      notification.method === "streams.close"
    ) {
      const params = (notification.params ?? {}) as Record<string, unknown>;

      // Rastrea canales abiertos para poder emitir close sintético en fallo
      if (notification.method === "streams.open") {
        const ch = String(params.channel ?? "");
        const co = String(params.companyId ?? "");
        if (ch) openStreamChannels.set(ch, co);
      } else if (notification.method === "streams.close") {
        openStreamChannels.delete(String(params.channel ?? ""));
      }

      if (options.onStreamNotification) {
        try {
          options.onStreamNotification(notification.method, params);
        } catch (err) {
          log.error(
            {
              method: notification.method,
              err: err instanceof Error ? err.message : String(err),
            },
            "falló el manejador de notificación de stream",
          );
        }
      }
      return;
    }

    log.debug({ method: notification.method }, "notificación recibida del worker");
  }

  // -----------------------------------------------------------------------
  // Ciclo de vida del proceso
  // -----------------------------------------------------------------------

  function spawnProcess(): ChildProcess {
    // Seguridad: NO esparzas process.env en el worker. Los plugins solo
    // deben recibir un entorno mínimo y controlado para evitar filtrar
    // secretos del host (como DATABASE_URL, claves API internas, etc.).
    const workerEnv: Record<string, string> = {
      ...options.env,
      PATH: process.env.PATH ?? "",
      NODE_PATH: process.env.NODE_PATH ?? "",
      PAPERCLIP_PLUGIN_ID: pluginId,
      NODE_ENV: process.env.NODE_ENV ?? "production",
      TZ: process.env.TZ ?? "UTC",
    };

    const child = fork(options.entrypointPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      execArgv: options.execArgv ?? [],
      env: workerEnv,
      // No dejes que el hijo mantenga vivo al padre
      detached: false,
    });

    return child;
  }

  function attachStdioHandlers(child: ChildProcess): void {
    // Lee NDJSON desde stdout
    if (child.stdout) {
      readline = createInterface({ input: child.stdout });
      readline.on("line", handleLine);
    }

    // Captura stderr para logging
    if (child.stderr) {
      stderrReadline = createInterface({ input: child.stderr });
      stderrReadline.on("line", (line: string) => {
        stderrExcerpt = appendStderrExcerpt(stderrExcerpt, line);
        log.warn({ stream: "stderr" }, `[plugin stderr] ${line}`);
      });
    }

    // Maneja la salida del proceso
    child.on("exit", (code, signal) => {
      handleProcessExit(code, signal);
    });

    // Maneja errores del proceso (p. ej. fallo de spawn)
    child.on("error", (err) => {
      log.error({ err: err.message }, "error del proceso worker");
      emitter.emit("error", { pluginId, error: err });
      if (status === "starting") {
        setStatus("crashed");
        rejectAllPending(
          new Error(formatWorkerFailureMessage(
            `El proceso worker falló al arrancar: ${err.message}`,
            stderrExcerpt,
          )),
        );
      }
    });
  }

  function handleProcessExit(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    const wasIntentional = intentionalStop;

    // Limpia las interfaces readline
    if (readline) {
      readline.close();
      readline = null;
    }
    if (stderrReadline) {
      stderrReadline.close();
      stderrReadline = null;
    }
    childProcess = null;
    startedAt = null;

    // Rechaza todas las solicitudes pendientes
    rejectAllPending(
      new Error(formatWorkerFailureMessage(
        `El proceso worker salió (code=${code}, signal=${signal})`,
        stderrExcerpt,
      )),
    );

    // Emite close sintético para cualquier canal de stream huérfano para que
    // los clientes SSE sean notificados en vez de colgar indefinidamente.
    if (openStreamChannels.size > 0 && options.onStreamNotification) {
      for (const [channel, companyId] of openStreamChannels) {
        try {
          options.onStreamNotification("streams.close", { channel, companyId });
        } catch {
          // Limpieza best-effort — no debe interferir con el manejo de salida
        }
      }
      openStreamChannels.clear();
    }

    emitter.emit("exit", { pluginId, code, signal });

    if (wasIntentional) {
      // Detención graciosa — el estado ya es "stopping" o se fijará a "stopped"
      setStatus("stopped");
      log.info({ code, signal }, "proceso worker detenido");
      return;
    }

    // Salida inesperada — recuperación de fallo
    totalCrashes++;
    const now = Date.now();

    // Resetea el contador de fallos consecutivos si pasó suficiente tiempo
    if (lastCrashAt !== null && now - lastCrashAt > CRASH_WINDOW_MS) {
      consecutiveCrashes = 0;
    }
    consecutiveCrashes++;
    lastCrashAt = now;

    log.error(
      { code, signal, consecutiveCrashes, totalCrashes },
      "el proceso worker falló",
    );

    const willRestart =
      autoRestart && consecutiveCrashes <= MAX_CONSECUTIVE_CRASHES;

    setStatus("crashed");
    emitter.emit("crash", { pluginId, code, signal, willRestart });

    if (willRestart) {
      scheduleRestart();
    } else {
      log.error(
        { consecutiveCrashes, maxCrashes: MAX_CONSECUTIVE_CRASHES },
        "máximo de fallos consecutivos alcanzado, no se reiniciará",
      );
    }
  }

  function rejectAllPending(error: Error): void {
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve(
        createErrorResponse(
          pending.id,
          PLUGIN_RPC_ERROR_CODES.WORKER_UNAVAILABLE,
          error.message,
        ) as JsonRpcResponse,
      );
    }
    pendingRequests.clear();
  }

  // -----------------------------------------------------------------------
  // Recuperación de fallos con backoff exponencial
  // -----------------------------------------------------------------------

  function computeBackoffMs(): number {
    // Backoff exponencial: MIN_BACKOFF * MULTIPLIER^(consecutiveCrashes - 1)
    const delay =
      MIN_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, consecutiveCrashes - 1);
    // Agrega jitter: ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.min(Math.round(delay + jitter), MAX_BACKOFF_MS);
  }

  function scheduleRestart(): void {
    const delay = computeBackoffMs();
    nextRestartAt = Date.now() + delay;

    setStatus("backoff");

    log.info(
      { delayMs: delay, consecutiveCrashes },
      "programando reinicio con backoff",
    );

    backoffTimer = setTimeout(async () => {
      backoffTimer = null;
      nextRestartAt = null;
      try {
        await startInternal();
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "el reinicio tras backoff falló",
        );
      }
    }, delay);
  }

  function cancelPendingRestart(): void {
    if (backoffTimer !== null) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
      nextRestartAt = null;
    }
  }

  // -----------------------------------------------------------------------
  // Arranque / Detención
  // -----------------------------------------------------------------------

  async function startInternal(): Promise<void> {
    if (status === "running" || status === "starting") {
      throw new Error(`El worker para el plugin "${pluginId}" ya está ${status}`);
    }

    intentionalStop = false;
    setStatus("starting");
    stderrExcerpt = "";

    const child = spawnProcess();
    childProcess = child;
    attachStdioHandlers(child);
    startedAt = Date.now();

    // Envía la llamada RPC initialize
    const initParams: InitializeParams = {
      manifest: options.manifest,
      config: options.config,
      instanceInfo: options.instanceInfo,
      apiVersion: options.apiVersion,
    };

    try {
      const result = await callInternal(
        "initialize",
        initParams,
        INITIALIZE_TIMEOUT_MS,
      ) as { ok?: boolean; supportedMethods?: string[] } | undefined;
      if (!result || !result.ok) {
        throw new Error("Worker initialize devolvió ok=false");
      }
      supportedMethods = result.supportedMethods ?? [];
    } catch (err) {
      // Initialize falló — mata el proceso y propaga
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg }, "falló el initialize del worker");
      await killProcess();
      setStatus("crashed");
      throw new Error(`El initialize del worker falló para "${pluginId}": ${msg}`);
    }

    // Resetea el contador de fallos en arranque exitoso
    consecutiveCrashes = 0;
    setStatus("running");
    emitter.emit("ready", { pluginId });
    log.info({ pid: child.pid }, "proceso worker arrancado e inicializado");
  }

  async function stopInternal(): Promise<void> {
    cancelPendingRestart();

    if (status === "stopped" || status === "stopping") {
      return;
    }

    intentionalStop = true;
    setStatus("stopping");

    if (!childProcess) {
      setStatus("stopped");
      return;
    }

    // Paso 1: Envía el RPC shutdown y espera a que el worker salga
    // graciosamente. Corremos la llamada shutdown contra un timeout. El
    // worker debería procesar el shutdown y salir por sí solo dentro del
    // período de drenaje.
    try {
      await Promise.race([
        callInternal("shutdown", {} as Record<string, never>, SHUTDOWN_DRAIN_MS),
        waitForExit(SHUTDOWN_DRAIN_MS),
      ]);
    } catch {
      // La llamada shutdown falló o expiró — procede a matar
      log.warn("el RPC shutdown falló o expiró, escalando a SIGTERM");
    }

    // Da al proceso un breve momento para salir tras la respuesta de shutdown
    if (childProcess) {
      await waitForExit(500);
    }

    // Comprueba si el proceso ya salió
    if (!childProcess) {
      setStatus("stopped");
      return;
    }

    // Paso 2: Envía SIGTERM y espera
    log.info("el worker no salió tras el RPC shutdown, enviando SIGTERM");
    await killWithSignal("SIGTERM", SIGTERM_GRACE_MS);

    if (!childProcess) {
      setStatus("stopped");
      return;
    }

    // Paso 3: Mata forzosamente con SIGKILL
    log.warn("el worker no salió tras SIGTERM, enviando SIGKILL");
    await killWithSignal("SIGKILL", 2_000);

    if (childProcess) {
      log.error("el proceso worker sigue vivo tras SIGKILL — esto no debería pasar");
    }

    setStatus("stopped");
  }

  /**
   * Espera a que el proceso hijo salga, hasta `timeoutMs`.
   * Resuelve inmediatamente si el proceso ya desapareció.
   */
  function waitForExit(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!childProcess) {
        resolve();
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, timeoutMs);

      childProcess.once("exit", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
    });
  }

  function killWithSignal(
    signal: NodeJS.Signals,
    waitMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!childProcess) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        resolve();
      }, waitMs);

      childProcess.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });

      try {
        childProcess.kill(signal);
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  async function killProcess(): Promise<void> {
    if (!childProcess) return;
    intentionalStop = true;
    try {
      childProcess.kill("SIGKILL");
    } catch {
      // Process may already be dead
    }
    // Espera brevemente el evento de salida
    await new Promise<void>((resolve) => {
      if (!childProcess) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        resolve();
      }, 1_000);
      childProcess.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // -----------------------------------------------------------------------
  // Implementación de llamada RPC
  // -----------------------------------------------------------------------

  function callInternal<M extends HostToWorkerMethodName>(
    method: M,
    params: HostToWorkerMethods[M][0],
    timeoutMs?: number,
  ): Promise<HostToWorkerMethods[M][1]> {
    return new Promise<HostToWorkerMethods[M][1]>((resolve, reject) => {
      if (!childProcess?.stdin?.writable) {
        reject(
          new Error(
            `No se puede llamar "${method}" — el worker para "${pluginId}" no está corriendo`,
          ),
        );
        return;
      }

      const id = nextRequestId++;
      const timeout = Math.min(timeoutMs ?? rpcTimeoutMs, MAX_RPC_TIMEOUT_MS);

      // Protege contra doble resolución. Cuando un proceso sale, todas las
      // solicitudes pendientes se rechazan vía rejectAllPending(), pero el
      // timer de timeout puede seguir corriendo. Sin esta protección el
      // reject del timer dispara sobre una promesa ya resuelta, produciendo
      // un rechazo no manejado.
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
            message: `La llamada RPC "${method}" expiró tras ${timeout}ms`,
          }),
        );
      }, timeout);

      const pending: PendingRequest = {
        id,
        method,
        resolve: (response: JsonRpcResponse) => {
          if (isJsonRpcSuccessResponse(response)) {
            settle(resolve, response.result as HostToWorkerMethods[M][1]);
          } else if ("error" in response && response.error) {
            settle(reject, new JsonRpcCallError(response.error));
          } else {
            settle(reject, new Error(`Formato de respuesta inesperado para "${method}"`));
          }
        },
        timer,
        sentAt: Date.now(),
      };

      pendingRequests.set(id, pending);

      try {
        const request = createRequest(method, params, id);
        sendMessage(request);
      } catch (err) {
        clearTimeout(timer);
        pendingRequests.delete(id);
        reject(
          new Error(
            `Falló el envío de "${method}" al worker: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      }
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const handle: PluginWorkerHandle = {
    get pluginId() {
      return pluginId;
    },

    get status() {
      return status;
    },

    get supportedMethods() {
      return supportedMethods;
    },

    async start() {
      await startInternal();
    },

    async stop() {
      await stopInternal();
    },

    async restart() {
      await stopInternal();
      await startInternal();
    },

    call<M extends HostToWorkerMethodName>(
      method: M,
      params: HostToWorkerMethods[M][0],
      timeoutMs?: number,
    ): Promise<HostToWorkerMethods[M][1]> {
      if (status !== "running" && status !== "starting") {
        return Promise.reject(
          new Error(
            `No se puede llamar "${method}" — el worker para "${pluginId}" está ${status}`,
          ),
        );
      }
      return callInternal(method, params, timeoutMs);
    },

    notify(method: string, params: unknown) {
      if (status !== "running") return;
      try {
        sendMessage({
          jsonrpc: JSONRPC_VERSION,
          method,
          params,
        });
      } catch {
        log.warn({ method }, "falló el envío de notificación al worker");
      }
    },

    on<K extends WorkerHandleEventName>(
      event: K,
      listener: (payload: WorkerHandleEvents[K]) => void,
    ) {
      emitter.on(event, listener);
    },

    off<K extends WorkerHandleEventName>(
      event: K,
      listener: (payload: WorkerHandleEvents[K]) => void,
    ) {
      emitter.off(event, listener);
    },

    diagnostics(): WorkerDiagnostics {
      return {
        pluginId,
        status,
        pid: childProcess?.pid ?? null,
        uptime:
          startedAt !== null && status === "running"
            ? Date.now() - startedAt
            : null,
        consecutiveCrashes,
        totalCrashes,
        pendingRequests: pendingRequests.size,
        lastCrashAt,
        nextRestartAt,
      };
    },
  };

  return handle;
}

// ---------------------------------------------------------------------------
// Implementation: createPluginWorkerManager
// ---------------------------------------------------------------------------

/**
 * Opciones para crear un PluginWorkerManager.
 */
export interface PluginWorkerManagerOptions {
  /**
   * Callback opcional invocado cuando un worker emite un evento de ciclo de
   * vida (fallo, reinicio). Usado por el servidor para publicar eventos en
   * vivo globales.
   */
  onWorkerEvent?: (event: {
    type: "plugin.worker.crashed" | "plugin.worker.restarted";
    pluginId: string;
    code?: number | null;
    signal?: string | null;
    willRestart?: boolean;
  }) => void;
}

/**
 * Crea un nuevo PluginWorkerManager.
 *
 * El manager retiene todos los manejadores de workers de plugins y provee
 * una API unificada para arrancar, detener y comunicarse con workers de
 * plugins.
 *
 * @example
 * ```ts
 * const manager = createPluginWorkerManager();
 *
 * const handle = await manager.startWorker("acme.linear", {
 *   entrypointPath: "/path/to/worker.cjs",
 *   manifest,
 *   config: resolvedConfig,
 *   instanceInfo: { instanceId: "inst-1", hostVersion: "1.0.0" },
 *   apiVersion: 1,
 *   hostHandlers: { "config.get": async () => resolvedConfig, ... },
 * });
 *
 * // Envía una llamada RPC al worker
 * const health = await manager.call("acme.linear", "health", {});
 *
 * // Apaga todos los workers al salir del servidor
 * await manager.stopAll();
 * ```
 */
export function createPluginWorkerManager(
  managerOptions?: PluginWorkerManagerOptions,
): PluginWorkerManager {
  const log = logger.child({ service: "plugin-worker-manager" });
  const workers = new Map<string, PluginWorkerHandle>();
  /** Locks de arranque por plugin para evitar carreras de spawn concurrentes. */
  const startupLocks = new Map<string, Promise<PluginWorkerHandle>>();

  return {
    async startWorker(
      pluginId: string,
      options: WorkerStartOptions,
    ): Promise<PluginWorkerHandle> {
      // Mutex: si ya hay un arranque en vuelo para este plugin, espéralo
      const inFlight = startupLocks.get(pluginId);
      if (inFlight) {
        log.warn({ pluginId }, "llamada startWorker concurrente — esperando el arranque en vuelo");
        return inFlight;
      }

      const existing = workers.get(pluginId);
      if (existing && existing.status !== "stopped") {
        throw new Error(
          `El worker ya está registrado para el plugin "${pluginId}" (estado: ${existing.status})`,
        );
      }

      const handle = createPluginWorkerHandle(pluginId, options);
      workers.set(pluginId, handle);

      // Suscribe a eventos crash/ready para reenvío de eventos en vivo
      if (managerOptions?.onWorkerEvent) {
        const notify = managerOptions.onWorkerEvent;
        handle.on("crash", (payload) => {
          notify({
            type: "plugin.worker.crashed",
            pluginId: payload.pluginId,
            code: payload.code,
            signal: payload.signal,
            willRestart: payload.willRestart,
          });
        });
        handle.on("ready", (payload) => {
          // Solo emite restarted si esto fue una recuperación de fallo (totalCrashes > 0)
          const diag = handle.diagnostics();
          if (diag.totalCrashes > 0) {
            notify({
              type: "plugin.worker.restarted",
              pluginId: payload.pluginId,
            });
          }
        });
      }

      log.info({ pluginId }, "arrancando worker de plugin");

      // Fija el lock antes de esperar start() para evitar spawns concurrentes
      const startPromise = handle.start().then(() => handle).finally(() => {
        startupLocks.delete(pluginId);
      });
      startupLocks.set(pluginId, startPromise);

      return startPromise;
    },

    async stopWorker(pluginId: string): Promise<void> {
      const handle = workers.get(pluginId);
      if (!handle) {
        log.warn({ pluginId }, "no hay worker registrado para el plugin, nada que detener");
        return;
      }

      log.info({ pluginId }, "deteniendo worker de plugin");
      await handle.stop();
      workers.delete(pluginId);
    },

    getWorker(pluginId: string): PluginWorkerHandle | undefined {
      return workers.get(pluginId);
    },

    isRunning(pluginId: string): boolean {
      const handle = workers.get(pluginId);
      return handle?.status === "running";
    },

    async stopAll(): Promise<void> {
      log.info({ count: workers.size }, "deteniendo todos los workers de plugins");
      const promises = Array.from(workers.values()).map(async (handle) => {
        try {
          await handle.stop();
        } catch (err) {
          log.error(
            {
              pluginId: handle.pluginId,
              err: err instanceof Error ? err.message : String(err),
            },
            "error deteniendo el worker durante el apagado",
          );
        }
      });
      await Promise.all(promises);
      workers.clear();
    },

    diagnostics(): WorkerDiagnostics[] {
      return Array.from(workers.values()).map((h) => h.diagnostics());
    },

    call<M extends HostToWorkerMethodName>(
      pluginId: string,
      method: M,
      params: HostToWorkerMethods[M][0],
      timeoutMs?: number,
    ): Promise<HostToWorkerMethods[M][1]> {
      const handle = workers.get(pluginId);
      if (!handle) {
        return Promise.reject(
          new Error(`No hay worker registrado para el plugin "${pluginId}"`),
        );
      }
      return handle.call(method, params, timeoutMs);
    },
  };
}
