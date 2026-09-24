/**
 * SDK de interfaz de plugin de Paperclip: tipos para componentes frontend de plugins.
 *
 * Los paquetes de interfaz de plugin importan desde `@paperclipai/plugin-sdk/ui`.
 * Este subpath proporciona los hooks del puente, las interfaces de props de
 * componentes y los tipos de error que los componentes React de plugins usan
 * para comunicarse con el host.
 *
 * Los paquetes de interfaz de plugin se cargan como módulos ES en ranuras de
 * extensión designadas. Toda la comunicación con el worker del plugin pasa por
 * el puente del host: los componentes de plugin NO deben acceder a internos
 * del host ni llamar a APIs del host directamente.
 *
 * @see PLUGIN_SPEC.md §19 — Modelo de extensión de interfaz
 * @see PLUGIN_SPEC.md §19.0.1 — Plugin UI SDK
 * @see PLUGIN_SPEC.md §29.2 — Versionado del SDK
 */

import type {
  PluginBridgeErrorCode,
  PluginLauncherBounds,
  PluginLauncherRenderEnvironment,
} from "@paperclipai/shared";
import type {
  PluginLauncherRenderContextSnapshot,
  PluginModalBoundsRequest,
  PluginRenderCloseEvent,
} from "../protocol.js";

// Reexporta PluginBridgeErrorCode para autores de interfaz de plugins
export type {
  PluginBridgeErrorCode,
  PluginLauncherBounds,
  PluginLauncherRenderEnvironment,
} from "@paperclipai/shared";
export type {
  PluginLauncherRenderContextSnapshot,
  PluginModalBoundsRequest,
  PluginRenderCloseEvent,
} from "../protocol.js";

// ---------------------------------------------------------------------------
// Error del puente
// ---------------------------------------------------------------------------

/**
 * Error estructurado devuelto por el puente cuando falla una llamada de interfaz a worker.
 *
 * Los componentes de plugin reciben esto en `usePluginData()` como el campo `error`
 * y pueden encontrarlo como valor lanzado desde `usePluginAction()`.
 *
 * Códigos de error:
 * - `WORKER_UNAVAILABLE` — el worker del plugin no está en ejecución
 * - `CAPABILITY_DENIED` — el plugin carece de la capacidad requerida
 * - `WORKER_ERROR` — el worker devolvió un error desde su manejador
 * - `TIMEOUT` — el worker no respondió dentro del tiempo configurado
 * - `UNKNOWN` — fallo inesperado a nivel de puente
 *
 * @see PLUGIN_SPEC.md §19.7 — Propagación de errores a través del puente
 */
export interface PluginBridgeError {
  /** Código de error legible por máquina. */
  code: PluginBridgeErrorCode;
  /** Mensaje de error legible. */
  message: string;
  /**
   * Detalles originales del error desde el worker, si están disponibles.
   * Solo presente cuando `code === "WORKER_ERROR"`.
   */
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Contexto del host disponible para todos los componentes de plugin
// ---------------------------------------------------------------------------

/**
 * Contexto de host de solo lectura pasado a cada componente de plugin vía `useHostContext()`.
 *
 * Los componentes de plugin lo usan para saber qué empresa, proyecto o entidad
 * está activa actualmente y así acotar sus solicitudes de datos en consecuencia.
 *
 * @see PLUGIN_SPEC.md §19 — Modelo de extensión de interfaz
 */
export interface PluginHostContext {
  /** UUID de la empresa actualmente activa, si la hay. */
  companyId: string | null;
  /** Prefijo de URL para la empresa actual (p. ej. `"my-company"`). */
  companyPrefix: string | null;
  /** UUID del proyecto actualmente activo, si lo hay. */
  projectId: string | null;
  /** UUID de la entidad actual (para contextos de pestaña de detalle), si la hay. */
  entityId: string | null;
  /** Tipo de la entidad actual (p. ej. `"issue"`, `"agent"`). */
  entityType: string | null;
  /**
   * UUID de la entidad padre al renderizar ranuras anidadas.
   * Para ranuras `commentAnnotation` este es el ID del issue que contiene el comentario.
   */
  parentEntityId?: string | null;
  /** UUID del usuario autenticado actual. */
  userId: string | null;
  /** Metadatos de runtime para el contenedor del host que renderiza actualmente esta interfaz de plugin. */
  renderEnvironment?: PluginRenderEnvironmentContext | null;
}

/**
 * Callback compatible con async invocado durante un ciclo de vida de cierre gestionado por el host.
 */
export type PluginRenderCloseHandler = (
  event: PluginRenderCloseEvent,
) => void | Promise<void>;

/**
 * Hooks de ciclo de vida de cierre disponibles cuando la interfaz del plugin se
 * renderiza dentro de un entorno de lanzador gestionado por el host.
 */
export interface PluginRenderCloseLifecycle {
  /** Registra un callback antes de que el host cierre el entorno actual. */
  onBeforeClose?(handler: PluginRenderCloseHandler): () => void;
  /** Registra un callback después de que el host cierre el entorno actual. */
  onClose?(handler: PluginRenderCloseHandler): () => void;
}

/**
 * Información de runtime sobre el contenedor del host que renderiza actualmente una interfaz de plugin.
 */
export interface PluginRenderEnvironmentContext
  extends PluginLauncherRenderContextSnapshot {
  /** Callback opcional del host para solicitar nuevos límites mientras un modal está abierto. */
  requestModalBounds?(request: PluginModalBoundsRequest): Promise<void>;
  /** Callbacks opcionales de ciclo de vida de cierre para superposiciones gestionadas por el host. */
  closeLifecycle?: PluginRenderCloseLifecycle | null;
}

// ---------------------------------------------------------------------------
// Interfaces de props de componentes de ranura
// ---------------------------------------------------------------------------

/**
 * Props pasadas a un componente de página de plugin.
 *
 * Una página es una extensión de página completa en `/plugins/:pluginId` o `/:company/plugins/:pluginId`.
 *
 * @see PLUGIN_SPEC.md §19.1 — Global Operator Routes
 * @see PLUGIN_SPEC.md §19.2 — Company-Context Routes
 */
export interface PluginPageProps {
  /** El contexto actual del host. */
  context: PluginHostContext;
}

/**
 * Props pasadas a un componente de widget de panel de plugin.
 *
 * Un widget de panel se renderiza como tarjeta o sección en el panel principal.
 *
 * @see PLUGIN_SPEC.md §19.4 — Dashboard Widgets
 */
export interface PluginWidgetProps {
  /** El contexto actual del host. */
  context: PluginHostContext;
}

/**
 * Props pasadas a un componente de pestaña de detalle de plugin.
 *
 * Una pestaña de detalle se renderiza como pestaña adicional en la página de
 * detalle de un proyecto, issue, agente, objetivo o ejecución.
 *
 * @see PLUGIN_SPEC.md §19.3 — Detail Tabs
 */
export interface PluginDetailTabProps {
  /** El contexto actual del host, incluyendo siempre `entityId` y `entityType`. */
  context: PluginHostContext & {
    entityId: string;
    entityType: string;
  };
}

/**
 * Props pasadas a un componente de barra lateral de plugin.
 *
 * Una entrada de barra lateral agrega un enlace o sección a la barra lateral de la aplicación.
 *
 * @see PLUGIN_SPEC.md §19.5 — Sidebar Entries
 */
export interface PluginSidebarProps {
  /** El contexto actual del host. */
  context: PluginHostContext;
}

/**
 * Props pasadas a un componente de elemento de barra lateral de proyecto de plugin.
 *
 * Un elemento de barra lateral de proyecto se renderiza **una vez por proyecto**
 * bajo la fila de ese proyecto en la lista de Proyectos de la barra lateral. El
 * host pasa el id del proyecto actual en `context.entityId` y `context.entityType`
 * es `"project"`.
 *
 * Usar esta ranura para agregar un enlace (p. ej. "Archivos", "Linear Sync") que navega
 * al detalle del proyecto con una pestaña de plugin seleccionada: `/projects/:projectRef?tab=plugin:key:slotId`.
 *
 * @see PLUGIN_SPEC.md §19.5.1 — Elementos de barra lateral del proyecto
 */
export interface PluginProjectSidebarItemProps {
  /** Contexto del host más entityId (id de proyecto) y entityType "project". */
  context: PluginHostContext & {
    entityId: string;
    entityType: "project";
  };
}

/**
 * Props pasadas a un componente de anotación de comentario de plugin.
 *
 * Una anotación de comentario se renderiza debajo de cada comentario individual
 * en la línea de tiempo del detalle del issue. El host pasa el ID del comentario
 * como `entityId` y `"comment"` como `entityType`, más el ID del issue padre como
 * `parentEntityId` para que el plugin pueda acotar las búsquedas de datos a ambos.
 *
 * Usar esta ranura para enriquecer comentarios con enlaces de archivo analizados,
 * insignias de sentimiento, acciones en línea o cualquier metadato por comentario.
 *
 * @see PLUGIN_SPEC.md §19.6 — Comment Annotations
 */
export interface PluginCommentAnnotationProps {
  /** Contexto del host con identificadores de comentario e issue padre. */
  context: PluginHostContext & {
    /** UUID del comentario que se está anotando. */
    entityId: string;
    /** Siempre `"comment"` para ranuras de anotación de comentario. */
    entityType: "comment";
    /** UUID del issue padre que contiene este comentario. */
    parentEntityId: string;
  };
}

/**
 * Props pasadas a un componente de elemento de menú contextual de comentario de plugin.
 *
 * Un elemento de menú contextual de comentario se renderiza en un menú desplegable
 * "más" en cada comentario de la línea de tiempo del detalle del issue. El host
 * pasa el ID del comentario como `entityId` y `"comment"` como `entityType`, más
 * el ID del issue padre como `parentEntityId`.
 *
 * Usar esta ranura para agregar acciones por comentario como "Crear sub-issue desde el
 * comentario", "Traducir", "Marcar para revisión" o cualquier acción personalizada del plugin.
 *
 * @see PLUGIN_SPEC.md §19.7 — Elementos de menú contextual de comentario
 */
export interface PluginCommentContextMenuItemProps {
  /** Contexto del host con identificadores de comentario e issue padre. */
  context: PluginHostContext & {
    /** UUID del comentario sobre el que actúa este elemento de menú. */
    entityId: string;
    /** Siempre `"comment"` para ranuras de elemento de menú contextual de comentario. */
    entityType: "comment";
    /** UUID del issue padre que contiene este comentario. */
    parentEntityId: string;
  };
}

/**
 * Props pasadas a un componente de página de ajustes de plugin.
 *
 * Sobrescribe el formulario JSON Schema autogenerado cuando el plugin declara
 * una ranura de interfaz `settingsPage`. El componente es responsable de leer y
 * escribir la configuración a través del puente.
 *
 * @see PLUGIN_SPEC.md §19.8 — Plugin Settings UI
 */
export interface PluginSettingsPageProps {
  /** El contexto actual del host. */
  context: PluginHostContext;
}

// ---------------------------------------------------------------------------
// Tipo de retorno del hook usePluginData
// ---------------------------------------------------------------------------

/**
 * Valor de retorno de `usePluginData(key, params)`.
 *
 * Refleja un patrón estándar de hook de obtención de datos asíncrona:
 * exactamente uno de `data` o `error` es no nulo en cualquier momento (a menos que `loading`).
 *
 * @template T El tipo de los datos devueltos por el manejador del worker
 *
 * @see PLUGIN_SPEC.md §19.7 — Propagación de errores a través del puente
 */
export interface PluginDataResult<T = unknown> {
  /** Los datos devueltos por el manejador `getData` del worker. `null` mientras se carga o en caso de error. */
  data: T | null;
  /** `true` mientras la solicitud inicial o una actualización está en curso. */
  loading: boolean;
  /** Error del puente si la solicitud falló. `null` en caso de éxito o mientras se carga. */
  error: PluginBridgeError | null;
  /**
   * Dispara manualmente una actualización de datos.
   * Útil para actualizaciones por sondeo o después de acciones.
   */
  refresh(): void;
}

// ---------------------------------------------------------------------------
// Tipos del hook usePluginToast
// ---------------------------------------------------------------------------

export type PluginToastTone = "info" | "success" | "warn" | "error";

export interface PluginToastAction {
  label: string;
  href: string;
}

export interface PluginToastInput {
  id?: string;
  dedupeKey?: string;
  title: string;
  body?: string;
  tone?: PluginToastTone;
  ttlMs?: number;
  action?: PluginToastAction;
}

export type PluginToastFn = (input: PluginToastInput) => string | null;

// ---------------------------------------------------------------------------
// Tipo de retorno del hook usePluginAction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tipo de retorno del hook usePluginStream
// ---------------------------------------------------------------------------

/**
 * Valor de retorno de `usePluginStream<T>(channel)`.
 *
 * Proporciona un arreglo creciente de eventos enviados desde el worker del plugin vía SSE,
 * más metadatos de estado de conexión.
 *
 * @template T El tipo de cada evento emitido por el worker
 *
 * @see PLUGIN_SPEC.md §19.8 — Real-Time Streaming
 */
export interface PluginStreamResult<T = unknown> {
  /** Todos los eventos recibidos hasta ahora, en orden de llegada. */
  events: T[];
  /** El evento recibido más recientemente, o `null` si aún no hay ninguno. */
  lastEvent: T | null;
  /** `true` mientras se establece la conexión SSE. */
  connecting: boolean;
  /** `true` una vez que la conexión SSE está abierta y recibiendo eventos. */
  connected: boolean;
  /** Error si la conexión SSE falló o se interrumpió. `null` en caso contrario. */
  error: Error | null;
  /** Cierra la conexión SSE y deja de recibir eventos. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Tipo de retorno del hook usePluginAction
// ---------------------------------------------------------------------------

/**
 * Valor de retorno de `usePluginAction(key)`.
 *
 * Devuelve una función asíncrona que, al llamarse, envía una solicitud de acción
 * al manejador `performAction` del worker y devuelve el resultado.
 *
 * Si falla, la función asíncrona lanza un `PluginBridgeError`.
 *
 * @see PLUGIN_SPEC.md §19.7 — Propagación de errores a través del puente
 *
 * @example
 * ```tsx
 * const resync = usePluginAction("resync");
 * <button onClick={() => resync({ companyId }).catch(err => console.error(err))}>
 *   Resincronizar ahora
 * </button>
 * ```
 */
export type PluginActionFn = (params?: Record<string, unknown>) => Promise<unknown>;
