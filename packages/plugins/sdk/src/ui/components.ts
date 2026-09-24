/**
 * Declaraciones de componentes de interfaz compartidos para frontends de plugins.
 *
 * Estos componentes se exportan desde `@paperclipai/plugin-sdk/ui` y los
 * proporciona el host en tiempo de ejecución. Coinciden con los tokens de
 * diseño y el lenguaje visual del host, reduciendo el código repetitivo
 * necesario para construir interfaces de plugin consistentes.
 *
 * **Los plugins no están obligados a usar estos componentes.** Existen para
 * reducir el código repetitivo y mantener la consistencia visual. Un plugin puede
 * renderizar una interfaz totalmente personalizada con cualquier biblioteca de
 * componentes React.
 *
 * Las implementaciones de los componentes las proporciona el host: los paquetes
 * del plugin contienen solo las declaraciones de tipos; las implementaciones
 * en tiempo de ejecución se inyectan vía el registro de módulos del host.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components In `@paperclipai/plugin-sdk/ui`
 */

import type React from "react";
import { renderSdkUiComponent } from "./runtime.js";

// ---------------------------------------------------------------------------
// Interfaces de props de componentes
// ---------------------------------------------------------------------------

/**
 * Un valor de tendencia que puede acompañar a una métrica.
 * Los valores positivos indican tendencias al alza; los negativos, a la baja.
 */
export interface MetricTrend {
  /** Dirección de la tendencia. */
  direction: "up" | "down" | "flat";
  /** Valor del cambio porcentual (p. ej. `12.5` para 12.5%). */
  percentage?: number;
}

/** Props de `MetricCard`. */
export interface MetricCardProps {
  /** Etiqueta corta que describe la métrica (p. ej. `"Synced Issues"`). */
  label: string;
  /** El valor de la métrica a mostrar. */
  value: number | string;
  /** Indicador de tendencia opcional. */
  trend?: MetricTrend;
  /** Datos opcionales de minigráfico (arreglo de números, el último es el más reciente). */
  sparkline?: number[];
  /** Sufijo de unidad opcional (p. ej. `"%"`, `"ms"`). */
  unit?: string;
}

/** Variantes de estado para `StatusBadge`. */
export type StatusBadgeVariant = "ok" | "warning" | "error" | "info" | "pending";

/** Props de `StatusBadge`. */
export interface StatusBadgeProps {
  /** Etiqueta legible. */
  label: string;
  /** Variante visual que determina el color. */
  status: StatusBadgeVariant;
}

/** Definición de una sola columna para `DataTable`. */
export interface DataTableColumn<T = Record<string, unknown>> {
  /** Clave de la columna, que coincide con un campo del objeto de fila. */
  key: keyof T & string;
  /** Etiqueta del encabezado de la columna. */
  header: string;
  /** Renderizador de celda personalizado opcional. */
  render?: (value: unknown, row: T) => React.ReactNode;
  /** Indica si esta columna se puede ordenar. */
  sortable?: boolean;
  /** Ancho CSS (p. ej. `"120px"`, `"20%"`). */
  width?: string;
}

/** Props de `DataTable`. */
export interface DataTableProps<T = Record<string, unknown>> {
  /** Definiciones de columnas. */
  columns: DataTableColumn<T>[];
  /** Datos de filas. Cada fila debe tener un campo `id` estable. */
  rows: T[];
  /** Indica si la tabla se está cargando actualmente. */
  loading?: boolean;
  /** Mensaje mostrado cuando `rows` está vacío. */
  emptyMessage?: string;
  /** Número total de filas para paginación (si difiere de `rows.length`). */
  totalCount?: number;
  /** Página actual (base 0, para paginación). */
  page?: number;
  /** Filas por página (para paginación). */
  pageSize?: number;
  /** Callback cuando cambia la página. */
  onPageChange?: (page: number) => void;
  /** Callback cuando se hace clic en un encabezado de columna para ordenar. */
  onSort?: (key: string, direction: "asc" | "desc") => void;
}

/** Un solo punto de datos para `TimeseriesChart`. */
export interface TimeseriesDataPoint {
  /** Marca de tiempo ISO 8601. */
  timestamp: string;
  /** Valor numérico. */
  value: number;
  /** Etiqueta opcional para el punto. */
  label?: string;
}

/** Props de `TimeseriesChart`. */
export interface TimeseriesChartProps {
  /** Datos de la serie. */
  data: TimeseriesDataPoint[];
  /** Título del gráfico. */
  title?: string;
  /** Etiqueta del eje Y. */
  yLabel?: string;
  /** Tipo de gráfico. Por defecto `"line"`. */
  type?: "line" | "bar";
  /** Alto del gráfico en píxeles. Por defecto `200`. */
  height?: number;
  /** Indica si el gráfico se está cargando actualmente. */
  loading?: boolean;
}

/** Props de `MarkdownBlock`. */
export interface MarkdownBlockProps {
  /** Contenido Markdown a renderizar. */
  content: string;
}

/** Un solo par clave-valor para `KeyValueList`. */
export interface KeyValuePair {
  /** Etiqueta de la clave. */
  label: string;
  /** Valor a mostrar. Puede ser una cadena, un número o un nodo React. */
  value: React.ReactNode;
}

/** Props de `KeyValueList`. */
export interface KeyValueListProps {
  /** Pares a renderizar en la lista. */
  pairs: KeyValuePair[];
}

/** Un solo botón de acción para `ActionBar`. */
export interface ActionBarItem {
  /** Etiqueta del botón. */
  label: string;
  /** Clave de acción a llamar vía el puente del plugin. */
  actionKey: string;
  /** Parámetros opcionales para pasar al manejador de la acción. */
  params?: Record<string, unknown>;
  /** Variante del botón. Por defecto `"default"`. */
  variant?: "default" | "primary" | "destructive";
  /** Indica si mostrar un diálogo de confirmación antes de ejecutar. */
  confirm?: boolean;
  /** Texto del diálogo de confirmación (usado cuando `confirm` es verdadero). */
  confirmMessage?: string;
}

/** Props de `ActionBar`. */
export interface ActionBarProps {
  /** Definiciones de acciones. */
  actions: ActionBarItem[];
  /** Llamado después de que una acción tiene éxito. Úsese para disparar la actualización de datos. */
  onSuccess?: (actionKey: string, result: unknown) => void;
  /** Llamado cuando una acción falla. */
  onError?: (actionKey: string, error: unknown) => void;
}

/** Una sola línea de registro para `LogView`. */
export interface LogViewEntry {
  /** Marca de tiempo ISO 8601. */
  timestamp: string;
  /** Nivel de registro. */
  level: "info" | "warn" | "error" | "debug";
  /** Mensaje de registro. */
  message: string;
  /** Metadatos estructurados opcionales. */
  meta?: Record<string, unknown>;
}

/** Props de `LogView`. */
export interface LogViewProps {
  /** Entradas de registro a mostrar. */
  entries: LogViewEntry[];
  /** Alto máximo del contenedor desplazable (valor CSS). Por defecto `"400px"`. */
  maxHeight?: string;
  /** Indica si desplazarse automáticamente a la última entrada. */
  autoScroll?: boolean;
  /** Indica si el registro se está cargando actualmente. */
  loading?: boolean;
}

/** Props de `JsonTree`. */
export interface JsonTreeProps {
  /** Los datos a renderizar como árbol JSON plegable. */
  data: unknown;
  /** Profundidad inicial a expandir. Por defecto `2`. */
  defaultExpandDepth?: number;
}

/** Props de `Spinner`. */
export interface SpinnerProps {
  /** Tamaño del indicador. Por defecto `"md"`. */
  size?: "sm" | "md" | "lg";
  /** Etiqueta accesible para el indicador (usada como `aria-label`). */
  label?: string;
}

/** Props de `ErrorBoundary`. */
export interface ErrorBoundaryProps {
  /** Contenido a renderizar dentro del límite de error. */
  children: React.ReactNode;
  /** Reemplazo personalizado opcional a renderizar cuando se captura un error. */
  fallback?: React.ReactNode;
  /** Llamado cuando se captura un error, para registro o reporte. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

// ---------------------------------------------------------------------------
// Declaraciones de componentes (proporcionados por el host en tiempo de ejecución)
// ---------------------------------------------------------------------------

// Se declaran como valores ambientales para que el código TypeScript del plugin
// pueda importarlos y usarlos con verificación completa de tipos. El registro
// de módulos del host proporciona las implementaciones concretas de los
// componentes React al cargar el paquete.

/**
 * Muestra una sola métrica con un indicador de tendencia y un minigráfico opcionales.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
function createSdkUiComponent<TProps>(name: string): React.ComponentType<TProps> {
  return function PaperclipSdkUiComponent(props: TProps) {
    return renderSdkUiComponent(name, props) as React.ReactNode;
  };
}

export const MetricCard = createSdkUiComponent<MetricCardProps>("MetricCard");

/**
 * Muestra una insignia de estado en línea (ok / warning / error / info / pending).
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const StatusBadge = createSdkUiComponent<StatusBadgeProps>("StatusBadge");

/**
 * Tabla de datos ordenable y paginada.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const DataTable = createSdkUiComponent<DataTableProps>("DataTable");

/**
 * Gráfico de líneas o barras para datos de series temporales.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const TimeseriesChart = createSdkUiComponent<TimeseriesChartProps>("TimeseriesChart");

/**
 * Renderiza texto Markdown como HTML.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const MarkdownBlock = createSdkUiComponent<MarkdownBlockProps>("MarkdownBlock");

/**
 * Renderiza una lista de definiciones de pares etiqueta/valor.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const KeyValueList = createSdkUiComponent<KeyValueListProps>("KeyValueList");

/**
 * Fila de botones de acción conectados a los manejadores `performAction` del puente del plugin.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const ActionBar = createSdkUiComponent<ActionBarProps>("ActionBar");

/**
 * Visor desplazable de salida de registro con marcas de tiempo.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const LogView = createSdkUiComponent<LogViewProps>("LogView");

/**
 * Árbol JSON plegable para depuración o inspección de datos sin procesar.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const JsonTree = createSdkUiComponent<JsonTreeProps>("JsonTree");

/**
 * Indicador de carga.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const Spinner = createSdkUiComponent<SpinnerProps>("Spinner");

/**
 * Límite de error de React que evita que los errores de renderizado del plugin
 * bloqueen la página del host.
 *
 * @see PLUGIN_SPEC.md §19.7 — Propagación de errores a través del puente
 */
export const ErrorBoundary = createSdkUiComponent<ErrorBoundaryProps>("ErrorBoundary");
