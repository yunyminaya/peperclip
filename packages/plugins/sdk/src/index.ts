/**
 * `@paperclipai/plugin-sdk`: SDK del lado del worker de plugins de Paperclip.
 *
 * Este es el punto de entrada principal para el código de worker de plugin. Para
 * paquetes de interfaz de plugin, importar desde `@paperclipai/plugin-sdk/ui`.
 *
 * @example
 * ```ts
 * // Punto de entrada del worker del plugin (dist/worker.ts)
 * import { definePlugin, runWorker, z } from "@paperclipai/plugin-sdk";
 *
 * const plugin = definePlugin({
 *   async setup(ctx) {
 *     ctx.logger.info("Plugin iniciándose");
 *
 *     ctx.events.on("issue.created", async (event) => {
 *       ctx.logger.info("Issue creado", { issueId: event.entityId });
 *     });
 *
 *     ctx.jobs.register("full-sync", async (job) => {
 *       ctx.logger.info("Iniciando sincronización completa", { runId: job.runId });
 *       // ... implementación de sincronización
 *     });
 *
 *     ctx.data.register("sync-health", async ({ companyId }) => {
 *       const state = await ctx.state.get({
 *         scopeKind: "company",
 *         scopeId: String(companyId),
 *         stateKey: "last-sync-at",
 *       });
 *       return { lastSync: state };
 *     });
 *   },
 *
 *   async onHealth() {
 *     return { status: "ok" };
 *   },
 * });
 *
 * export default plugin;
 * runWorker(plugin, import.meta.url);
 * ```
 *
 * @see PLUGIN_SPEC.md §14 — Superficie SDK
 * @see PLUGIN_SPEC.md §29.2 — Versionado del SDK
 */

// ---------------------------------------------------------------------------
// Fábrica principal
// ---------------------------------------------------------------------------

export { definePlugin } from "./define-plugin.js";
export { createTestHarness } from "./testing.js";
export { createPluginBundlerPresets } from "./bundlers.js";
export { startPluginDevServer, getUiBuildSnapshot } from "./dev-server.js";
export { startWorkerRpcHost, runWorker } from "./worker-rpc-host.js";
export {
  createHostClientHandlers,
  getRequiredCapability,
  CapabilityDeniedError,
} from "./host-client-factory.js";

// Helpers y constantes del protocolo JSON-RPC
export {
  JSONRPC_VERSION,
  JSONRPC_ERROR_CODES,
  PLUGIN_RPC_ERROR_CODES,
  HOST_TO_WORKER_REQUIRED_METHODS,
  HOST_TO_WORKER_OPTIONAL_METHODS,
  MESSAGE_DELIMITER,
  createRequest,
  createSuccessResponse,
  createErrorResponse,
  createNotification,
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcSuccessResponse,
  isJsonRpcErrorResponse,
  serializeMessage,
  parseMessage,
  JsonRpcParseError,
  JsonRpcCallError,
  _resetIdCounter,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Exports de tipos
// ---------------------------------------------------------------------------

// Tipos de definición y ciclo de vida del plugin
export type {
  PluginDefinition,
  PaperclipPlugin,
  PluginHealthDiagnostics,
  PluginConfigValidationResult,
  PluginWebhookInput,
} from "./define-plugin.js";
export type {
  TestHarness,
  TestHarnessOptions,
  TestHarnessLogEntry,
} from "./testing.js";
export type {
  PluginBundlerPresetInput,
  PluginBundlerPresets,
  EsbuildLikeOptions,
  RollupLikeConfig,
} from "./bundlers.js";
export type { PluginDevServer, PluginDevServerOptions } from "./dev-server.js";
export type {
  WorkerRpcHostOptions,
  WorkerRpcHost,
  RunWorkerOptions,
} from "./worker-rpc-host.js";
export type {
  HostServices,
  HostClientFactoryOptions,
  HostClientHandlers,
} from "./host-client-factory.js";

// Tipos del protocolo JSON-RPC
export type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  JsonRpcError,
  JsonRpcErrorResponse,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcMessage,
  JsonRpcErrorCode,
  PluginRpcErrorCode,
  InitializeParams,
  InitializeResult,
  ConfigChangedParams,
  ValidateConfigParams,
  OnEventParams,
  RunJobParams,
  GetDataParams,
  PerformActionParams,
  ExecuteToolParams,
  PluginModalBoundsRequest,
  PluginRenderCloseEvent,
  PluginLauncherRenderContextSnapshot,
  HostToWorkerMethods,
  HostToWorkerMethodName,
  WorkerToHostMethods,
  WorkerToHostMethodName,
  HostToWorkerRequest,
  HostToWorkerResponse,
  WorkerToHostRequest,
  WorkerToHostResponse,
  WorkerToHostNotifications,
  WorkerToHostNotificationName,
} from "./protocol.js";

// Contexto del plugin y todas las interfaces de cliente
export type {
  PluginContext,
  PluginConfigClient,
  PluginEventsClient,
  PluginJobsClient,
  PluginLaunchersClient,
  PluginHttpClient,
  PluginSecretsClient,
  PluginActivityClient,
  PluginActivityLogEntry,
  PluginStateClient,
  PluginEntitiesClient,
  PluginProjectsClient,
  PluginCompaniesClient,
  PluginIssuesClient,
  PluginAgentsClient,
  PluginAgentSessionsClient,
  AgentSession,
  AgentSessionEvent,
  AgentSessionSendResult,
  PluginGoalsClient,
  PluginDataClient,
  PluginActionsClient,
  PluginStreamsClient,
  PluginToolsClient,
  PluginMetricsClient,
  PluginLogger,
} from "./types.js";

// Tipos de apoyo para clientes de contexto
export type {
  ScopeKey,
  EventFilter,
  PluginEvent,
  PluginJobContext,
  PluginLauncherRegistration,
  ToolRunContext,
  ToolResult,
  PluginEntityUpsert,
  PluginEntityRecord,
  PluginEntityQuery,
  PluginWorkspace,
  Company,
  Project,
  Issue,
  IssueComment,
  Agent,
  Goal,
} from "./types.js";

// Tipos de manifiesto y constantes reexportados desde @paperclipai/shared
// Los autores de plugins importan los tipos de manifiesto desde aquí para tener
// una sola dependencia (@paperclipai/plugin-sdk) para todas las necesidades
// de autoría de plugins.
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
} from "./types.js";

// ---------------------------------------------------------------------------
// Reexportación de Zod
// ---------------------------------------------------------------------------

/**
 * Zod se reexporta para que los autores de plugins lo usen al definir su
 * `instanceConfigSchema` y el `parametersSchema` de herramientas.
 *
 * Los autores de plugins no necesitan agregar una dependencia `zod` separada.
 *
 * @see PLUGIN_SPEC.md §14.1 — Example SDK Shape
 *
 * @example
 * ```ts
 * import { z } from "@paperclipai/plugin-sdk";
 *
 * const configSchema = z.object({
 *   apiKey: z.string().describe("Tu API key"),
 *   workspace: z.string().optional(),
 * });
 * ```
 */
export { z } from "zod";

// ---------------------------------------------------------------------------
// Reexportaciones de constantes (para código de plugin que necesita verificar valores en tiempo de ejecución)
// ---------------------------------------------------------------------------

export {
  PLUGIN_API_VERSION,
  PLUGIN_STATUSES,
  PLUGIN_CATEGORIES,
  PLUGIN_CAPABILITIES,
  PLUGIN_UI_SLOT_TYPES,
  PLUGIN_UI_SLOT_ENTITY_TYPES,
  PLUGIN_STATE_SCOPE_KINDS,
  PLUGIN_JOB_STATUSES,
  PLUGIN_JOB_RUN_STATUSES,
  PLUGIN_JOB_RUN_TRIGGERS,
  PLUGIN_WEBHOOK_DELIVERY_STATUSES,
  PLUGIN_EVENT_TYPES,
  PLUGIN_BRIDGE_ERROR_CODES,
} from "@paperclipai/shared";
