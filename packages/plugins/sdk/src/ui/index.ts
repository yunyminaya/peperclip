/**
 * `@paperclipai/plugin-sdk/ui`: SDK de interfaz de plugin de Paperclip.
 *
 * Importar este subpath desde paquetes de interfaz de plugin (componentes React
 * que se ejecutan en el frontend del host). **No** importar esto desde código
 * de worker de plugin.
 *
 * El SDK del lado del worker está disponible desde `@paperclipai/plugin-sdk` (raíz).
 *
 * @see PLUGIN_SPEC.md §19.0.1 — Plugin UI SDK
 * @see PLUGIN_SPEC.md §29.2 — Versionado del SDK
 *
 * @example
 * ```tsx
 * // Entrada del paquete de interfaz del plugin (dist/ui/index.tsx)
 * import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
 * import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
 *
 * export function DashboardWidget({ context }: PluginWidgetProps) {
 *   const { data, loading, error } = usePluginData("sync-health", {
 *     companyId: context.companyId,
 *   });
 *   const resync = usePluginAction("resync");
 *
 *   if (loading) return <div>Cargando…</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return (
 *     <div style={{ display: "grid", gap: 8 }}>
 *       <strong>Issues sincronizados</strong>
 *       <div>{data!.syncedCount}</div>
 *       <button onClick={() => resync({ companyId: context.companyId })}>
 *         Resincronizar ahora
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */

/**
 * Hooks del puente para que los componentes de interfaz de plugin se comuniquen
 * con el worker del plugin.
 *
 * - `usePluginData(key, params)`: obtiene datos del manejador `getData` del worker
 * - `usePluginAction(key)`: obtiene un invocable que llama al manejador `performAction` del worker
 * - `useHostContext()`: lee los IDs actuales de empresa, proyecto, entidad y usuario activos
 * - `usePluginStream(channel)`: se suscribe a eventos SSE en tiempo real del worker
 */
export {
  usePluginData,
  usePluginAction,
  useHostContext,
  usePluginStream,
  usePluginToast,
} from "./hooks.js";

// Tipos de error del puente y contexto del host
export type {
  PluginBridgeError,
  PluginBridgeErrorCode,
  PluginHostContext,
  PluginModalBoundsRequest,
  PluginRenderCloseEvent,
  PluginRenderCloseHandler,
  PluginRenderCloseLifecycle,
  PluginRenderEnvironmentContext,
  PluginLauncherBounds,
  PluginLauncherRenderEnvironment,
  PluginDataResult,
  PluginActionFn,
  PluginStreamResult,
  PluginToastTone,
  PluginToastAction,
  PluginToastInput,
  PluginToastFn,
} from "./types.js";

// Interfaces de props de componentes de ranura
export type {
  PluginPageProps,
  PluginWidgetProps,
  PluginDetailTabProps,
  PluginSidebarProps,
  PluginProjectSidebarItemProps,
  PluginCommentAnnotationProps,
  PluginCommentContextMenuItemProps,
  PluginSettingsPageProps,
} from "./types.js";
