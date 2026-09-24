/**
 * Runtime del puente de UI de plugins — implementaciones concretas de los hooks del puente.
 *
 * Los bundles de UI de plugins importan `usePluginData`, `usePluginAction` y
 * `useHostContext` desde `@paperclipai/plugin-sdk/ui`. Esas son declaraciones
 * solo de tipos en el paquete del SDK. El host proporciona las implementaciones reales
 * inyectando este runtime del puente en el alcance del módulo del plugin.
 *
 * El runtime del puente se comunica con los workers de plugins vía endpoints REST HTTP:
 * - `POST /api/plugins/:pluginId/data/:key`     — proxifica la RPC `getData`
 * - `POST /api/plugins/:pluginId/actions/:key`   — proxifica la RPC `performAction`
 *
 * ## Cómo funciona
 *
 * 1. Antes de cargar el módulo de UI de un plugin, el host crea un puente con alcance vía
 *    `createPluginBridge(pluginId)`.
 * 2. Las implementaciones de hooks del puente se registran en un registro global
 *    del puente claveado por `pluginId`.
 * 3. Los hooks "ambientales" (`usePluginData`, `usePluginAction`, `useHostContext`)
 *    consultan el contexto del plugin actual desde un proveedor de contexto de React y
 *    delegan a la instancia del puente apropiada.
 *
 * @see PLUGIN_SPEC.md §13.8 — `getData`
 * @see PLUGIN_SPEC.md §13.9 — `performAction`
 * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
 */

import { createContext, useCallback, useContext, useRef, useState, useEffect } from "react";
import type {
  PluginBridgeErrorCode,
  PluginLauncherBounds,
  PluginLauncherRenderContextSnapshot,
  PluginLauncherRenderEnvironment,
} from "@paperclipai/shared";
import { pluginsApi } from "@/api/plugins";
import { ApiError } from "@/api/client";
import { useToast, type ToastInput } from "@/context/ToastContext";

// ---------------------------------------------------------------------------
// Tipo de error del puente (refleja el PluginBridgeError del SDK)
// ---------------------------------------------------------------------------

/**
 * Error estructurado del puente, que coincide con el `PluginBridgeError` del SDK.
 */
export interface PluginBridgeError {
  code: PluginBridgeErrorCode;
  message: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Tipo de resultado de datos del puente (refleja el PluginDataResult del SDK)
// ---------------------------------------------------------------------------

export interface PluginDataResult<T = unknown> {
  data: T | null;
  loading: boolean;
  error: PluginBridgeError | null;
  refresh(): void;
}

export type PluginToastInput = ToastInput;
export type PluginToastFn = (input: PluginToastInput) => string | null;

// ---------------------------------------------------------------------------
// Tipo de contexto del host (refleja el PluginHostContext del SDK)
// ---------------------------------------------------------------------------

export interface PluginHostContext {
  companyId: string | null;
  companyPrefix: string | null;
  projectId: string | null;
  entityId: string | null;
  entityType: string | null;
  parentEntityId?: string | null;
  userId: string | null;
  renderEnvironment?: PluginRenderEnvironmentContext | null;
}

export interface PluginModalBoundsRequest {
  bounds: PluginLauncherBounds;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

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

export type PluginRenderCloseHandler = (
  event: PluginRenderCloseEvent,
) => void | Promise<void>;

export interface PluginRenderCloseLifecycle {
  onBeforeClose?(handler: PluginRenderCloseHandler): () => void;
  onClose?(handler: PluginRenderCloseHandler): () => void;
}

export interface PluginRenderEnvironmentContext {
  environment: PluginLauncherRenderEnvironment | null;
  launcherId: string | null;
  bounds: PluginLauncherBounds | null;
  requestModalBounds?(request: PluginModalBoundsRequest): Promise<void>;
  closeLifecycle?: PluginRenderCloseLifecycle | null;
}

// ---------------------------------------------------------------------------
// Contexto del puente — contexto de React para la identidad del plugin y el alcance del host
// ---------------------------------------------------------------------------

export type PluginBridgeContextValue = {
  pluginId: string;
  hostContext: PluginHostContext;
};

/**
 * Contexto de React que lleva la identidad del plugin activo y el alcance del host.
 *
 * El montaje de slot/lanzador envuelve los componentes del plugin en un Provider para que
 * los hooks del puente (`usePluginData`, `usePluginAction`, `useHostContext`) puedan
 * resolver el plugin actual sin globales mutables ambientales.
 *
 * Como los bundles de plugins comparten la instancia de React del host (vía el registro
 * del puente en `globalThis.__paperclipPluginBridge__`), la propagación del contexto
 * funciona correctamente a través del límite host/plugin.
 */
export const PluginBridgeContext =
  createContext<PluginBridgeContextValue | null>(null);

function usePluginBridgeContext(): PluginBridgeContextValue {
  const ctx = useContext(PluginBridgeContext);
  if (!ctx) {
    throw new Error(
      "Hook del puente de plugins llamado fuera de un <PluginBridgeContext.Provider>. " +
        "Asegúrate de que el componente del plugin se renderice dentro de un PluginBridgeScope.",
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Utilidades de extracción de errores
// ---------------------------------------------------------------------------

/**
 * Intenta extraer un PluginBridgeError estructurado de un error de API.
 *
 * Los endpoints proxy del puente devuelven cuerpos de error con la forma
 * `{ code: PluginBridgeErrorCode, message: string, details?: unknown }`.
 * Esta utilidad extrae esa estructura del ApiError lanzado por el cliente.
 */
function extractBridgeError(err: unknown): PluginBridgeError {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const body = err.body as Record<string, unknown>;
    if (typeof body.code === "string" && typeof body.message === "string") {
      return {
        code: body.code as PluginBridgeErrorCode,
        message: body.message,
        details: body.details,
      };
    }
    // Respaldo: el servidor devolvió un cuerpo simple { error: string }
    if (typeof body.error === "string") {
      return {
        code: "UNKNOWN",
        message: body.error,
      };
    }
  }

  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : String(err),
  };
}

// ---------------------------------------------------------------------------
// usePluginData — implementación concreta
// ---------------------------------------------------------------------------

/**
 * Serialización estable de los parámetros para usar como clave de dependencia.
 * Devuelve una cadena que solo cambia cuando cambia el contenido del objeto de parámetros.
 */
function serializeParams(params?: Record<string, unknown>): string {
  if (!params) return "";
  try {
    return JSON.stringify(params, Object.keys(params).sort());
  } catch {
    return "";
  }
}

function serializeRenderEnvironment(
  renderEnvironment?: PluginRenderEnvironmentContext | null,
): PluginLauncherRenderContextSnapshot | null {
  if (!renderEnvironment) return null;
  return {
    environment: renderEnvironment.environment,
    launcherId: renderEnvironment.launcherId,
    bounds: renderEnvironment.bounds,
  };
}

function serializeRenderEnvironmentSnapshot(
  snapshot: PluginLauncherRenderContextSnapshot | null,
): string {
  return snapshot ? JSON.stringify(snapshot) : "";
}

/**
 * Implementación concreta de `usePluginData<T>(key, params)`.
 *
 * Hace un HTTP POST a `/api/plugins/:pluginId/data/:key` y devuelve
 * un `PluginDataResult<T>` reactivo que coincide con el contrato de tipos del SDK.
 *
 * Vuelve a obtener automáticamente cuando cambian `key` o `params`. Proporciona una
 * función `refresh()` para volver a obtener manualmente.
 */
export function usePluginData<T = unknown>(
  key: string,
  params?: Record<string, unknown>,
): PluginDataResult<T> {
  const { pluginId, hostContext } = usePluginBridgeContext();
  const companyId = hostContext.companyId;
  const renderEnvironmentSnapshot = serializeRenderEnvironment(hostContext.renderEnvironment);
  const renderEnvironmentKey = serializeRenderEnvironmentSnapshot(renderEnvironmentSnapshot);

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PluginBridgeError | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Serialización estable para la detección de cambios de parámetros
  const paramsKey = serializeParams(params);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const maxRetryCount = 2;
    const retryableCodes: PluginBridgeErrorCode[] = ["WORKER_UNAVAILABLE", "TIMEOUT"];
    setLoading(true);
    const request = () => {
      pluginsApi
        .bridgeGetData(
          pluginId,
          key,
          params,
          companyId,
          renderEnvironmentSnapshot,
        )
        .then((response) => {
          if (!cancelled) {
            setData(response.data as T);
            setError(null);
            setLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;

          const bridgeError = extractBridgeError(err);
          if (retryableCodes.includes(bridgeError.code) && retryCount < maxRetryCount) {
            retryCount += 1;
            retryTimer = setTimeout(() => {
              retryTimer = null;
              if (!cancelled) request();
            }, 150 * retryCount);
            return;
          }

          setError(bridgeError);
          setData(null);
          setLoading(false);
        });
    };

    request();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId, key, paramsKey, refreshCounter, companyId, renderEnvironmentKey]);

  const refresh = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// usePluginAction — implementación concreta
// ---------------------------------------------------------------------------

/**
 * Tipo de función de acción que coincide con el `PluginActionFn` del SDK.
 */
export type PluginActionFn = (params?: Record<string, unknown>) => Promise<unknown>;

/**
 * Implementación concreta de `usePluginAction(key)`.
 *
 * Devuelve una función asíncrona estable que, al llamarse, envía un POST a
 * `/api/plugins/:pluginId/actions/:key` y devuelve el resultado del worker.
 *
 * En caso de fallo, la función lanza un `PluginBridgeError`.
 */
export function usePluginAction(key: string): PluginActionFn {
  const bridgeContext = usePluginBridgeContext();
  const contextRef = useRef(bridgeContext);
  contextRef.current = bridgeContext;

  return useCallback(
    async (params?: Record<string, unknown>): Promise<unknown> => {
      const { pluginId, hostContext } = contextRef.current;
      const companyId = hostContext.companyId;
      const renderEnvironment = serializeRenderEnvironment(hostContext.renderEnvironment);

      try {
        const response = await pluginsApi.bridgePerformAction(
          pluginId,
          key,
          params,
          companyId,
          renderEnvironment,
        );
        return response.data;
      } catch (err) {
        throw extractBridgeError(err);
      }
    },
    [key],
  );
}

// ---------------------------------------------------------------------------
// useHostContext — implementación concreta
// ---------------------------------------------------------------------------

/**
 * Implementación concreta de `useHostContext()`.
 *
 * Devuelve el contexto del host actual (empresa, proyecto, entidad, usuario)
 * del `PluginBridgeContext.Provider` que lo envuelve.
 */
export function useHostContext(): PluginHostContext {
  const { hostContext } = usePluginBridgeContext();
  return hostContext;
}

// ---------------------------------------------------------------------------
// usePluginToast — implementación concreta
// ---------------------------------------------------------------------------

export function usePluginToast(): PluginToastFn {
  const { pushToast } = useToast();
  return useCallback(
    (input: PluginToastInput) => pushToast(input),
    [pushToast],
  );
}

// ---------------------------------------------------------------------------
// usePluginStream — implementación concreta
// ---------------------------------------------------------------------------

export interface PluginStreamResult<T = unknown> {
  events: T[];
  lastEvent: T | null;
  connecting: boolean;
  connected: boolean;
  error: Error | null;
  close(): void;
}

export function usePluginStream<T = unknown>(
  channel: string,
  options?: { companyId?: string },
): PluginStreamResult<T> {
  const { pluginId, hostContext } = usePluginBridgeContext();
  const effectiveCompanyId = options?.companyId ?? hostContext.companyId ?? undefined;
  const [events, setEvents] = useState<T[]>([]);
  const [lastEvent, setLastEvent] = useState<T | null>(null);
  const [connecting, setConnecting] = useState<boolean>(Boolean(effectiveCompanyId));
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setConnecting(false);
    setConnected(false);
  }, []);

  useEffect(() => {
    setEvents([]);
    setLastEvent(null);
    setError(null);

    if (!effectiveCompanyId) {
      close();
      return;
    }

    const params = new URLSearchParams({ companyId: effectiveCompanyId });
    const source = new EventSource(
      `/api/plugins/${encodeURIComponent(pluginId)}/bridge/stream/${encodeURIComponent(channel)}?${params.toString()}`,
      { withCredentials: true },
    );
    sourceRef.current = source;
    setConnecting(true);
    setConnected(false);

    source.onopen = () => {
      setConnecting(false);
      setConnected(true);
      setError(null);
    };

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T;
        setEvents((current) => [...current, parsed]);
        setLastEvent(parsed);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
      }
    };

    source.addEventListener("close", () => {
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
      setConnecting(false);
      setConnected(false);
    });

    source.onerror = () => {
      setConnecting(false);
      setConnected(false);
      setError(new Error(`No se pudo conectar al stream del plugin "${channel}"`));
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
    };

    return () => {
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
    };
  }, [channel, close, effectiveCompanyId, pluginId]);

  return { events, lastEvent, connecting, connected, error, close };
}
