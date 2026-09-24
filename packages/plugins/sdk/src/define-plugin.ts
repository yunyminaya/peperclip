/**
 * `definePlugin`: el helper de nivel superior para crear un plugin de Paperclip.
 *
 * Los autores de plugins llaman a `definePlugin()` y exportan el resultado como
 * el export por defecto desde su punto de entrada del worker. El host importa el
 * módulo del worker, llama a `setup()` con un `PluginContext`, y desde ese punto
 * el plugin responde a eventos, tareas, webhooks y solicitudes de interfaz a
 * través del contexto.
 *
 * @see PLUGIN_SPEC.md §14.1 — Example SDK Shape
 *
 * @example
 * ```ts
 * // dist/worker.ts
 * import { definePlugin } from "@paperclipai/plugin-sdk";
 *
 * export default definePlugin({
 *   async setup(ctx) {
 *     ctx.logger.info("Plugin de sincronización Linear iniciándose");
 *
 *     // Suscribirse a eventos
 *     ctx.events.on("issue.created", async (event) => {
 *       const config = await ctx.config.get();
 *       await ctx.http.fetch(`https://api.linear.app/...`, {
 *         method: "POST",
 *         headers: { Authorization: `Bearer ${await ctx.secrets.resolve(config.apiKeyRef as string)}` },
 *         body: JSON.stringify({ title: event.payload.title }),
 *       });
 *     });
 *
 *     // Registrar un manejador de tarea
 *     ctx.jobs.register("full-sync", async (job) => {
 *       ctx.logger.info("Ejecutando tarea full-sync", { runId: job.runId });
 *       // ... lógica de sincronización
 *     });
 *
 *     // Registrar datos para la interfaz
 *     ctx.data.register("sync-health", async ({ companyId }) => {
 *       const state = await ctx.state.get({
 *         scopeKind: "company",
 *         scopeId: String(companyId),
 *         stateKey: "last-sync",
 *       });
 *       return { lastSync: state };
 *     });
 *   },
 * });
 * ```
 */

import type { PluginContext } from "./types.js";

// ---------------------------------------------------------------------------
// Resultado de la verificación de salud
// ---------------------------------------------------------------------------

/**
 * Diagnósticos opcionales reportados por el plugin devueltos desde el método RPC `health()`.
 *
 * @see PLUGIN_SPEC.md §13.2 — `health`
 */
export interface PluginHealthDiagnostics {
  /** Estado legible por máquina: `"ok"` | `"degraded"` | `"error"`. */
  status: "ok" | "degraded" | "error";
  /** Descripción legible del estado de salud actual. */
  message?: string;
  /** Diagnósticos clave-valor reportados por el plugin (p. ej. estado de conexión, profundidad de cola). */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Resultado de validación de configuración
// ---------------------------------------------------------------------------

/**
 * Resultado devuelto desde el método RPC `validateConfig()`.
 *
 * @see PLUGIN_SPEC.md §13.3 — `validateConfig`
 */
export interface PluginConfigValidationResult {
  /** Indica si la configuración es válida. */
  ok: boolean;
  /** Advertencias no fatales sobre la configuración. */
  warnings?: string[];
  /** Errores de validación (poblados cuando `ok` es `false`). */
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Entrada del manejador de webhook
// ---------------------------------------------------------------------------

/**
 * Entrada recibida por el manejador `handleWebhook` del worker del plugin.
 *
 * @see PLUGIN_SPEC.md §13.7 — `handleWebhook`
 */
export interface PluginWebhookInput {
  /** Clave de endpoint que coincide con la declaración del manifiesto. */
  endpointKey: string;
  /** Encabezados de la solicitud entrante. */
  headers: Record<string, string | string[]>;
  /** Cuerpo sin procesar de la solicitud como cadena UTF-8. */
  rawBody: string;
  /** Cuerpo JSON analizado (si aplica y es analizable). */
  parsedBody?: unknown;
  /** Identificador único de solicitud para verificaciones de idempotencia. */
  requestId: string;
}

// ---------------------------------------------------------------------------
// Definición del plugin
// ---------------------------------------------------------------------------

/**
 * La forma de definición del plugin pasada a `definePlugin()`.
 *
 * El único campo requerido es `setup`, que recibe el `PluginContext` y es
 * donde el plugin registra sus manejadores (eventos, tareas, datos, acciones,
 * herramientas, etc.).
 *
 * Todos los demás hooks de ciclo de vida son opcionales. Si un hook no está
 * implementado, el host aplica el comportamiento por defecto (p. ej. reiniciar
 * el worker al cambiar la configuración en lugar de llamar a `onConfigChanged`).
 *
 * @see PLUGIN_SPEC.md §13 — Protocolo host-worker
 */
export interface PluginDefinition {
  /**
   * Llamado una vez cuando el worker del plugin se inicia, después de que `initialize` completa.
   *
   * Aquí es donde el plugin registra todos sus manejadores: suscripciones de
   * eventos, manejadores de tareas, manejadores de datos/acciones y registros
   * de herramientas. El registro debe ser síncrono después de que `setup` se
   * resuelva; no registrar manejadores dentro de callbacks asíncronos que
   * puedan resolverse después de que `setup` retorne.
   *
   * @param ctx - El contexto completo del plugin proporcionado por el host
   */
  setup(ctx: PluginContext): Promise<void>;

  /**
   * Llamado cuando el host quiere saber si el plugin está saludable.
   *
   * El host lo sondea a intervalos regulares y muestra el resultado en el
   * panel de salud del plugin. Si no está implementado, el host infiere la
   * salud a partir de la vida del proceso del worker.
   *
   * @see PLUGIN_SPEC.md §13.2 — `health`
   */
  onHealth?(): Promise<PluginHealthDiagnostics>;

  /**
   * Llamado cuando el operador actualiza la configuración de instancia del
   * plugin en tiempo de ejecución, sin reiniciar el worker.
   *
   * Si no está implementado, el host reinicia el worker para aplicar la nueva
   * configuración.
   *
   * @param newConfig - La configuración recién resuelta
   * @see PLUGIN_SPEC.md §13.4 — `configChanged`
   */
  onConfigChanged?(newConfig: Record<string, unknown>): Promise<void>;

  /**
   * Llamado cuando el host está por apagar el worker del plugin.
   *
   * El worker tiene como máximo 10 segundos (configurable vía la configuración
   * del plugin) para terminar el trabajo en curso y resolver esta promesa.
   * Después del plazo, el host envía SIGTERM y luego SIGKILL.
   *
   * @see PLUGIN_SPEC.md §12.5 — Graceful Shutdown Policy
   */
  onShutdown?(): Promise<void>;

  /**
   * Llamado para validar la configuración actual del plugin.
   *
   * El host lo llama:
   * - después de que el plugin inicia (para mostrar errores de configuración de inmediato)
   * - después de que el operador guarda una nueva configuración (para validar antes de persistir)
   * - vía el botón "Test Connection" en la interfaz de ajustes
   *
   * @param config - La configuración a validar
   * @see PLUGIN_SPEC.md §13.3 — `validateConfig`
   */
  onValidateConfig?(config: Record<string, unknown>): Promise<PluginConfigValidationResult>;

  /**
   * Llamado para manejar una entrega de webhook entrante.
   *
   * El host enruta `POST /api/plugins/:pluginId/webhooks/:endpointKey` a
   * este manejador. El plugin es responsable de la verificación de firma usando
   * una referencia a secreto resuelta.
   *
   * Si no está implementado pero se declaran webhooks en el manifiesto, el host
   * devuelve HTTP 501 para las entregas de webhook.
   *
   * @param input - Metadatos y carga útil de la entrega del webhook
   * @see PLUGIN_SPEC.md §13.7 — `handleWebhook`
   */
  onWebhook?(input: PluginWebhookInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// PaperclipPlugin: el objeto sellado devuelto por definePlugin()
// ---------------------------------------------------------------------------

/**
 * El objeto de plugin sellado devuelto por `definePlugin()`.
 *
 * Los autores de plugins exportan esto como el export por defecto desde su
 * punto de entrada del worker. El host lo importa y llama a los métodos
 * de ciclo de vida.
 *
 * @see PLUGIN_SPEC.md §14 — Superficie SDK
 */
export interface PaperclipPlugin {
  /** La definición original del plugin pasada a `definePlugin()`. */
  readonly definition: PluginDefinition;
}

// ---------------------------------------------------------------------------
// definePlugin: fábrica de nivel superior
// ---------------------------------------------------------------------------

/**
 * Define un plugin de Paperclip.
 *
 * Llama a esta función en tu punto de entrada del worker y exporta el resultado
 * como el export por defecto. El host importará el módulo y llamará a los
 * métodos de ciclo de vida en el objeto devuelto.
 *
 * @param definition - Manejadores de ciclo de vida del plugin
 * @returns Un objeto `PaperclipPlugin` sellado para que el host lo consuma
 *
 * @example
 * ```ts
 * import { definePlugin } from "@paperclipai/plugin-sdk";
 *
 * export default definePlugin({
 *   async setup(ctx) {
 *     ctx.logger.info("Plugin iniciado");
 *     ctx.events.on("issue.created", async (event) => {
 *       // manejar evento
 *     });
 *   },
 *
 *   async onHealth() {
 *     return { status: "ok" };
 *   },
 * });
 * ```
 *
 * @see PLUGIN_SPEC.md §14.1 — Example SDK Shape
 */
export function definePlugin(definition: PluginDefinition): PaperclipPlugin {
  return Object.freeze({ definition });
}
