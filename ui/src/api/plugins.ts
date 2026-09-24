/**
 * @fileoverview Cliente API de frontend para el sistema de plugins de Paperclip.
 *
 * Todas las funciones de `pluginsApi` corresponden 1:1 a endpoints REST en
 * `server/src/routes/plugins.ts`. Los sitios de llamada deben consumir estas funciones
 * a través de hooks de React Query (`useQuery` / `useMutation`) y referenciar las claves
 * de caché desde `queryKeys.plugins.*`.
 *
 * @see ui/src/lib/queryKeys.ts para las definiciones de claves de caché.
 * @see server/src/routes/plugins.ts para detalles de implementación de endpoints.
 */

import type {
  PluginLauncherDeclaration,
  PluginLauncherRenderContextSnapshot,
  PluginUiSlotDeclaration,
  PluginRecord,
  PluginConfig,
  PluginStatus,
} from "@paperclipai/shared";
import { api } from "./client";

/**
 * Registro normalizado de contribución de UI devuelto por `GET /api/plugins/ui-contributions`.
 *
 * Solo se puebla para plugins en estado `ready` que declaran al menos un slot de UI
 * o launcher. El arreglo `slots` proviene de `manifest.ui.slots`. El
 * arreglo `launchers` agrega tanto los `manifest.launchers` heredados como
 * `manifest.ui.launchers`.
 */
export type PluginUiContribution = {
  pluginId: string;
  pluginKey: string;
  displayName: string;
  version: string;
  updatedAt?: string;
  /**
   * Nombre de archivo relativo del módulo de entrada de UI dentro del directorio de UI del plugin.
   * El host construye la URL completa de importación como
   * `/_plugins/${pluginId}/ui/${uiEntryFile}`.
   */
  uiEntryFile: string;
  slots: PluginUiSlotDeclaration[];
  launchers: PluginLauncherDeclaration[];
};

/**
 * Resultado del chequeo de salud devuelto por `GET /api/plugins/:pluginId/health`.
 *
 * La bandera `healthy` resume si todos los chequeos pasaron. Los resultados
 * individuales de chequeo están disponibles en `checks` para mostrar diagnósticos
 * detallados.
 */
export interface PluginHealthCheckResult {
  pluginId: string;
  /** El estado actual del ciclo de vida del plugin al momento del chequeo. */
  status: string;
  /** True si todos los chequeos de salud pasaron. */
  healthy: boolean;
  /** Resultados individuales de chequeos de diagnóstico. */
  checks: Array<{
    name: string;
    passed: boolean;
    /** Descripción legible del fallo, si lo hay. */
    message?: string;
  }>;
  /** El mensaje de error más reciente si el plugin está en estado `error`. */
  lastError?: string;
}

/**
 * Diagnósticos del worker devueltos como parte de la respuesta del panel.
 */
export interface PluginWorkerDiagnostics {
  status: string;
  pid: number | null;
  uptime: number | null;
  consecutiveCrashes: number;
  totalCrashes: number;
  pendingRequests: number;
  lastCrashAt: number | null;
  nextRestartAt: number | null;
}

/**
 * Una entrada reciente de ejecución de trabajo devuelta en la respuesta del panel.
 */
export interface PluginDashboardJobRun {
  id: string;
  jobId: string;
  jobKey?: string;
  trigger: string;
  status: string;
  durationMs: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/**
 * Una entrada reciente de entrega de webhook devuelta en la respuesta del panel.
 */
export interface PluginDashboardWebhookDelivery {
  id: string;
  webhookKey: string;
  status: string;
  durationMs: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/**
 * Datos agregados del panel de salud devueltos por `GET /api/plugins/:pluginId/dashboard`.
 *
 * Contiene diagnósticos del worker, ejecuciones recientes de trabajos, entregas
 * recientes de webhooks y el resultado actual del chequeo de salud — todo en
 * una sola respuesta.
 */
export interface PluginDashboardData {
  pluginId: string;
  /** Diagnósticos del proceso worker, o null si no hay worker registrado. */
  worker: PluginWorkerDiagnostics | null;
  /** Historial reciente de ejecuciones de trabajos (más recientes primero, máx 10). */
  recentJobRuns: PluginDashboardJobRun[];
  /** Entregas recientes de webhooks entrantes (más recientes primero, máx 10). */
  recentWebhookDeliveries: PluginDashboardWebhookDelivery[];
  /** Resultados actuales del chequeo de salud. */
  health: PluginHealthCheckResult;
  /** Timestamp ISO 8601 de cuando se generaron los datos del panel. */
  checkedAt: string;
}

export interface AvailablePluginExample {
  packageName: string;
  pluginKey: string;
  displayName: string;
  description: string;
  localPath: string;
  tag: "example";
}

/**
 * Cliente API de gestión de plugins.
 *
 * Todos los métodos son envolturas delgadas del cliente base `api`. Devuelven
 * promesas que se resuelven a respuestas JSON tipadas o lanzan en errores HTTP.
 *
 * @example
 * ```tsx
 * // In a component:
 * const { data: plugins } = useQuery({
 *   queryKey: queryKeys.plugins.all,
 *   queryFn: () => pluginsApi.list(),
 * });
 * ```
 */
export const pluginsApi = {
  /**
   * Lista todos los plugins instalados, opcionalmente filtrados por estado de ciclo de vida.
   *
   * @param status - Filtro opcional; debe ser un valor válido de `PluginStatus`.
   *   Los valores inválidos son rechazados por el servidor con HTTP 400.
   */
  list: (status?: PluginStatus) =>
    api.get<PluginRecord[]>(`/plugins${status ? `?status=${status}` : ""}`),

  /**
   * Lista los plugins de ejemplo incluidos disponibles desde el checkout actual del repo.
   */
  listExamples: () =>
    api.get<AvailablePluginExample[]>("/plugins/examples"),

  /**
   * Obtiene un registro de plugin por su UUID o clave de plugin.
   *
   * @param pluginId - El UUID del plugin (de `PluginRecord.id`) o su clave.
   */
  get: (pluginId: string) =>
    api.get<PluginRecord>(`/plugins/${pluginId}`),

  /**
   * Instala un plugin desde npm o una ruta local.
   *
   * En éxito, el plugin se registra en la base de datos y transiciona a
   * estado `ready`. La respuesta es el `PluginRecord` recién creado.
   *
   * @param params.packageName - nombre de paquete npm (p. ej. `@paperclip/plugin-linear`)
   *   o una ruta del sistema de archivos cuando `isLocalPath` es `true`.
   * @param params.version - Etiqueta/rango de versión npm objetivo (opcional; por defecto latest).
   * @param params.isLocalPath - Poner en `true` cuando `packageName` es una ruta local.
   */
  install: (params: { packageName: string; version?: string; isLocalPath?: boolean }) =>
    api.post<PluginRecord>("/plugins/install", params),

  /**
   * Desinstala un plugin.
   *
   * @param pluginId - UUID del plugin a eliminar.
   * @param purge - Si es `true`, elimina permanentemente todos los datos del plugin (borrado duro).
   *   Si no, el plugin se borra suavemente con una ventana de retención de datos de 30 días.
   */
  uninstall: (pluginId: string, purge?: boolean) =>
    api.delete<{ ok: boolean }>(`/plugins/${pluginId}${purge ? "?purge=true" : ""}`),

  /**
   * Transiciona un plugin del estado `error` de vuelta a `ready`.
   * No hace nada si el plugin ya está habilitado.
   *
   * @param pluginId - UUID del plugin a habilitar.
   */
  enable: (pluginId: string) =>
    api.post<{ ok: boolean }>(`/plugins/${pluginId}/enable`, {}),

  /**
   * Deshabilita un plugin (transiciona a estado `error` con un centinela de operador).
   * El worker del plugin se detiene; no procesará eventos hasta que se re-habilite.
   *
   * @param pluginId - UUID del plugin a deshabilitar.
   * @param reason - Motivo legible opcional guardado en `lastError`.
   */
  disable: (pluginId: string, reason?: string) =>
    api.post<{ ok: boolean }>(`/plugins/${pluginId}/disable`, reason ? { reason } : {}),

  /**
   * Ejecuta diagnósticos de salud para un plugin.
   *
   * Solo tiene sentido para plugins en estado `ready`. Devuelve el resultado de todos
   * los chequeos de salud registrados. Se llama en un intervalo de polling de 30 segundos
   * por {@link PluginSettings}.
   *
   * @param pluginId - UUID del plugin a chequear.
   */
  health: (pluginId: string) =>
    api.get<PluginHealthCheckResult>(`/plugins/${pluginId}/health`),

  /**
   * Obtiene los datos agregados del panel de salud para un plugin.
   *
   * Devuelve diagnósticos del worker, ejecuciones recientes de trabajos, entregas
   * recientes de webhooks y el resultado actual del chequeo de salud en una sola petición.
   * Usado por la página {@link PluginSettings} para renderizar la sección del panel de runtime.
   *
   * @param pluginId - UUID del plugin.
   */
  dashboard: (pluginId: string) =>
    api.get<PluginDashboardData>(`/plugins/${pluginId}/dashboard`),

  /**
   * Obtiene las entradas recientes de logs para un plugin.
   *
   * @param pluginId - UUID del plugin.
   * @param options - Filtros opcionales: limit, level, since.
   */
  logs: (pluginId: string, options?: { limit?: number; level?: string; since?: string }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.level) params.set("level", options.level);
    if (options?.since) params.set("since", options.since);
    const qs = params.toString();
    return api.get<Array<{ id: string; pluginId: string; level: string; message: string; meta: Record<string, unknown> | null; createdAt: string }>>(
      `/plugins/${pluginId}/logs${qs ? `?${qs}` : ""}`,
    );
  },

  /**
   * Actualiza un plugin a una versión más nueva.
   *
   * Si la nueva versión declara capacidades adicionales, el plugin
   * transiciona al estado `upgrade_pending` esperando aprobación del operador.
   *
   * @param pluginId - UUID del plugin a actualizar.
   * @param version - Versión objetivo (opcional; por defecto la última publicada).
   */
  upgrade: (pluginId: string, version?: string) =>
    api.post<{ ok: boolean }>(`/plugins/${pluginId}/upgrade`, version ? { version } : {}),

  /**
   * Devuelve declaraciones normalizadas de contribuciones de UI para plugins listos.
   * Usado por el runtime del host de slots y las superficies de descubrimiento de launchers.
   *
   * Forma de la respuesta:
   * - `slots`: declaraciones concretas de montaje de React desde `manifest.ui.slots`
   * - `launchers`: puntos de entrada propios del host desde `manifest.ui.launchers` más
   *   los `manifest.launchers` heredados de nivel superior
   *
   * @example
   * ```ts
   * const rows = await pluginsApi.listUiContributions();
   * const toolbarLaunchers = rows.flatMap((row) =>
   *   row.launchers.filter((launcher) => launcher.placementZone === "toolbarButton"),
   * );
   * ```
   */
  listUiContributions: () =>
    api.get<PluginUiContribution[]>("/plugins/ui-contributions"),

  // ===========================================================================
  // Endpoints de configuración de plugins
  // ===========================================================================

  /**
   * Obtiene la configuración actual de un plugin.
   *
   * Devuelve el registro `PluginConfig` si existe, o `null` si el plugin
   * aún no se ha configurado.
   *
   * @param pluginId - UUID del plugin.
   */
  getConfig: (pluginId: string) =>
    api.get<PluginConfig | null>(`/plugins/${pluginId}/config`),

  /**
   * Guarda (crea o actualiza) la configuración de un plugin.
   *
   * El servidor valida `configJson` contra el `instanceConfigSchema` del plugin
   * y devuelve el registro `PluginConfig` persistido en éxito.
   *
   * @param pluginId - UUID del plugin.
   * @param configJson - Valores de configuración que coinciden con el `instanceConfigSchema` del plugin.
   */
  saveConfig: (pluginId: string, configJson: Record<string, unknown>) =>
    api.post<PluginConfig>(`/plugins/${pluginId}/config`, { configJson }),

  /**
   * Llama al método RPC `validateConfig` del plugin para probar la configuración
   * sin persistirla.
   *
   * Devuelve `{ valid: true }` en éxito, o `{ valid: false, message: string }`
   * cuando el plugin reporta un fallo de validación.
   *
   * Solo disponible cuando el plugin declara un manejador RPC `validateConfig`.
   *
   * @param pluginId - UUID del plugin.
   * @param configJson - Valores de configuración a validar.
   */
  testConfig: (pluginId: string, configJson: Record<string, unknown>) =>
    api.post<{ valid: boolean; message?: string }>(`/plugins/${pluginId}/config/test`, { configJson }),

  // ===========================================================================
  // Endpoints proxy del bridge — usados por el runtime del bridge de UI de plugins
  // ===========================================================================

  /**
   * Proxea una llamada `getData` desde un componente de UI de plugin hacia su worker backend.
   *
   * Este es el transporte HTTP para `usePluginData(key, params)`. El runtime del
   * bridge llama este método y mapea la respuesta a `PluginDataResult<T>`.
   *
   * En éxito, la respuesta es `{ data: T }`.
   * En fallo, el cuerpo de la respuesta es un objeto con forma `PluginBridgeError`
   * con `code`, `message` y `details` opcional.
   *
   * @param pluginId - UUID del plugin cuyo worker debe atender la petición
   * @param key - Clave de datos definida por el plugin (p. ej. `"sync-health"`)
   * @param params - Parámetros de consulta opcionales reenviados al manejador del worker
   * @param companyId - Alcance de empresa opcional usado para chequeos de acceso de tablero/empresa.
   * @param renderEnvironment - Snapshot opcional de launcher/página reenviado para
   *   UI respaldada por launcher, para que los workers puedan distinguir la ejecución
   *   en modal, drawer, popover y página.
   *
   * Respuestas de error:
   * - `401`/`403` cuando fallan los chequeos de auth o acceso de empresa
   * - `404` cuando el plugin o la clave del manejador no existen
   * - `409` cuando el plugin no está en un estado de runtime invocable
   * - `5xx` con un cuerpo con forma `PluginBridgeError` cuando el worker lanza
   *
   * @see PLUGIN_SPEC.md §13.8 — `getData`
   * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
   */
  bridgeGetData: (
    pluginId: string,
    key: string,
    params?: Record<string, unknown>,
    companyId?: string | null,
    renderEnvironment?: PluginLauncherRenderContextSnapshot | null,
  ) =>
    api.post<{ data: unknown }>(`/plugins/${pluginId}/data/${encodeURIComponent(key)}`, {
      companyId: companyId ?? undefined,
      params,
      renderEnvironment: renderEnvironment ?? undefined,
    }),

  /**
   * Proxea una llamada `performAction` desde un componente de UI de plugin hacia su worker backend.
   *
   * Este es el transporte HTTP para `usePluginAction(key)`. El runtime del bridge
   * llama este método cuando se invoca la función de acción.
   *
   * En éxito, la respuesta es `{ data: T }`.
   * En fallo, el cuerpo de la respuesta es un objeto con forma `PluginBridgeError`
   * con `code`, `message` y `details` opcional.
   *
   * @param pluginId - UUID del plugin cuyo worker debe atender la petición
   * @param key - Clave de acción definida por el plugin (p. ej. `"resync"`)
   * @param params - Parámetros opcionales reenviados al manejador del worker
   * @param companyId - Alcance de empresa opcional usado para chequeos de acceso de tablero/empresa.
   * @param renderEnvironment - Snapshot opcional de launcher/página reenviado para
   *   UI respaldada por launcher, para que los workers puedan distinguir la ejecución
   *   en modal, drawer, popover y página.
   *
   * Respuestas de error:
   * - `401`/`403` cuando fallan los chequeos de auth o acceso de empresa
   * - `404` cuando el plugin o la clave del manejador no existen
   * - `409` cuando el plugin no está en un estado de runtime invocable
   * - `5xx` con un cuerpo con forma `PluginBridgeError` cuando el worker lanza
   *
   * @see PLUGIN_SPEC.md §13.9 — `performAction`
   * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
   */
  bridgePerformAction: (
    pluginId: string,
    key: string,
    params?: Record<string, unknown>,
    companyId?: string | null,
    renderEnvironment?: PluginLauncherRenderContextSnapshot | null,
  ) =>
    api.post<{ data: unknown }>(`/plugins/${pluginId}/actions/${encodeURIComponent(key)}`, {
      companyId: companyId ?? undefined,
      params,
      renderEnvironment: renderEnvironment ?? undefined,
    }),
};
