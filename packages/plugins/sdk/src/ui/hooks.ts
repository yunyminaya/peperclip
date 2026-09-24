import type {
  PluginDataResult,
  PluginActionFn,
  PluginHostContext,
  PluginStreamResult,
  PluginToastFn,
} from "./types.js";
import { getSdkUiRuntimeValue } from "./runtime.js";

// ---------------------------------------------------------------------------
// usePluginData
// ---------------------------------------------------------------------------

/**
 * Obtiene datos del manejador `getData` registrado del worker del plugin.
 *
 * Llama a `ctx.data.register(key, handler)` en el worker y devuelve el
 * resultado como estado reactivo. Vuelve a obtener cuando cambian los `params`.
 *
 * @template T La forma esperada de los datos devueltos
 * @param key - La clave de datos que coincide con el manejador registrado con `ctx.data.register()`
 * @param params - Parámetros opcionales reenviados al manejador
 * @returns `PluginDataResult<T>` con `data`, `loading`, `error` y `refresh`
 *
 * @example
 * ```tsx
 * function SyncWidget({ context }: PluginWidgetProps) {
 *   const { data, loading, error } = usePluginData<SyncHealth>("sync-health", {
 *     companyId: context.companyId,
 *   });
 *
 *   if (loading) return <div>Cargando…</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <div>Issues sincronizados: {data!.syncedCount}</div>;
 * }
 * ```
 *
 * @see PLUGIN_SPEC.md §13.8 — `getData`
 * @see PLUGIN_SPEC.md §19.7 — Propagación de errores a través del puente
 */
export function usePluginData<T = unknown>(
  key: string,
  params?: Record<string, unknown>,
): PluginDataResult<T> {
  const impl = getSdkUiRuntimeValue<
    (nextKey: string, nextParams?: Record<string, unknown>) => PluginDataResult<T>
  >("usePluginData");
  return impl(key, params);
}

// ---------------------------------------------------------------------------
// usePluginAction
// ---------------------------------------------------------------------------

/**
 * Obtiene una función invocable que llama al manejador `performAction`
 * registrado del worker del plugin.
 *
 * La función devuelta es asíncrona y lanza un `PluginBridgeError` si falla.
 *
 * @param key - La clave de acción que coincide con el manejador registrado con `ctx.actions.register()`
 * @returns Una función asíncrona que envía la acción al worker y se resuelve con el resultado
 *
 * @example
 * ```tsx
 * function ResyncButton({ context }: PluginWidgetProps) {
 *   const resync = usePluginAction("resync");
 *   const [error, setError] = useState<string | null>(null);
 *
 *   async function handleClick() {
 *     try {
 *       await resync({ companyId: context.companyId });
 *     } catch (err) {
 *       setError((err as PluginBridgeError).message);
 *     }
 *   }
 *
 *   return <button onClick={handleClick}>Resincronizar ahora</button>;
 * }
 * ```
 *
 * @see PLUGIN_SPEC.md §13.9 — `performAction`
 * @see PLUGIN_SPEC.md §19.7 — Propagación de errores a través del puente
 */
export function usePluginAction(key: string): PluginActionFn {
  const impl = getSdkUiRuntimeValue<(nextKey: string) => PluginActionFn>("usePluginAction");
  return impl(key);
}

// ---------------------------------------------------------------------------
// useHostContext
// ---------------------------------------------------------------------------

/**
 * Lee el contexto actual del host (empresa, proyecto, entidad y usuario activos).
 *
 * Úsese para saber en qué contexto se está renderizando el componente del plugin
 * y así acotar las solicitudes de datos y las acciones en consecuencia.
 *
 * @returns El `PluginHostContext` actual
 *
 * @example
 * ```tsx
 * function IssueTab() {
 *   const { companyId, entityId } = useHostContext();
 *   const { data } = usePluginData("linear-link", { issueId: entityId });
 *   return <div>{data?.linearIssueUrl}</div>;
 * }
 * ```
 *
 * @see PLUGIN_SPEC.md §19 — Modelo de extensión de interfaz
 */
export function useHostContext(): PluginHostContext {
  const impl = getSdkUiRuntimeValue<() => PluginHostContext>("useHostContext");
  return impl();
}

// ---------------------------------------------------------------------------
// usePluginStream
// ---------------------------------------------------------------------------

/**
 * Suscribirse a un flujo de eventos en tiempo real enviado desde el worker del plugin.
 *
 * Abre una conexión SSE a `GET /api/plugins/:pluginId/bridge/stream/:channel`
 * y acumula los eventos a medida que llegan. El worker envía eventos usando
 * `ctx.streams.emit(channel, event)`.
 *
 * @template T La forma esperada de cada evento del flujo
 * @param channel - El nombre del canal del flujo (debe coincidir con lo que usa el worker en `ctx.streams.emit`)
 * @param options - Configuración opcional para el flujo
 * @returns `PluginStreamResult<T>` con `events`, `lastEvent`, estado de conexión y `close()`
 *
 * @example
 * ```tsx
 * function ChatMessages() {
 *   const { events, connected, close } = usePluginStream<ChatToken>("chat-stream");
 *
 *   return (
 *     <div>
 *       {events.map((e, i) => <span key={i}>{e.text}</span>)}
 *       {connected && <span className="pulse" />}
 *       <button onClick={close}>Detener</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @see PLUGIN_SPEC.md §19.8 — Real-Time Streaming
 */
export function usePluginStream<T = unknown>(
  channel: string,
  options?: { companyId?: string },
): PluginStreamResult<T> {
  const impl = getSdkUiRuntimeValue<
    (nextChannel: string, nextOptions?: { companyId?: string }) => PluginStreamResult<T>
  >("usePluginStream");
  return impl(channel, options);
}

// ---------------------------------------------------------------------------
// usePluginToast
// ---------------------------------------------------------------------------

/**
 * Dispara una notificación toast del host desde la interfaz del plugin.
 *
 * Esto permite que las páginas y widgets del plugin muestren retroalimentación
 * orientada al usuario mediante el mismo sistema de toasts que la app del host
 * sin acceder a internos del host.
 */
export function usePluginToast(): PluginToastFn {
  const impl = getSdkUiRuntimeValue<() => PluginToastFn>("usePluginToast");
  return impl();
}
