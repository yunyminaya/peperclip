/** una ventana de límite de frecuencia o uso devuelta por la API de cuota de un proveedor */
export interface QuotaWindow {
  /** etiqueta legible, p. ej. "5h", "7d", "Sonnet 7d", "Credits" */
  label: string;
  /** porcentaje de la ventana ya consumido (0-100), null cuando no se reporta */
  usedPercent: number | null;
  /** marca de tiempo iso cuando esta ventana se reinicia, null cuando no se reporta */
  resetsAt: string | null;
  /** etiqueta de valor de formato libre para ventanas tipo crédito, p. ej. "$4.20 remaining" */
  valueLabel: string | null;
  /** texto de apoyo opcional, p. ej. detalles de reinicio o notas específicas del proveedor */
  detail?: string | null;
}

/** resultado de un proveedor del endpoint quota-windows */
export interface ProviderQuotaResult {
  /** slug del proveedor, p. ej. "anthropic", "openai" */
  provider: string;
  /** etiqueta de fuente cuando el proveedor reporta de dónde provienen los datos de cuota */
  source?: string | null;
  /** true cuando la consulta tuvo éxito y windows tiene datos */
  ok: boolean;
  /** mensaje de error cuando ok es false */
  error?: string;
  windows: QuotaWindow[];
}
