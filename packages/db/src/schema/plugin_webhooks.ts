import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { plugins } from "./plugins.js";
import type { PluginWebhookDeliveryStatus } from "@paperclipai/shared";

/**
 * Tabla `plugin_webhook_deliveries`: historial de entregas de webhooks entrantes para plugins.
 *
 * Cuando un sistema externo envía un POST HTTP al endpoint de webhook registrado de un plugin
 * (p. ej. `/api/plugins/:pluginKey/webhooks/:webhookKey`), el servidor
 * crea una fila en esta tabla antes de enviar la carga útil al worker
 * del plugin. Esto proporciona un registro auditable de cada intento de entrega.
 *
 * La `webhook_key` coincide con la clave declarada en el arreglo
 * `webhooks` del manifiesto del plugin. `external_id` es un identificador opcional proporcionado por el
 * sistema remoto (p. ej. un GUID de entrega de GitHub) que se puede usar para detectar
 * y rechazar entregas duplicadas.
 *
 * Valores de estado:
 * - `pending`: recibido pero aún no enviado al worker
 * - `processing`: siendo manejado por el worker del plugin
 * - `succeeded`: el worker procesó la carga útil correctamente
 * - `failed`: el worker devolvió un error o agotó el tiempo de espera
 *
 * @see PLUGIN_SPEC.md §21.3 — `plugin_webhook_deliveries`
 */
export const pluginWebhookDeliveries = pgTable(
  "plugin_webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK al plugin propietario. Se propaga al eliminar. */
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    /** Identificador que coincide con la clave en el arreglo `webhooks` del manifiesto del plugin. */
    webhookKey: text("webhook_key").notNull(),
    /** ID opcional de deduplicación proporcionado por el sistema externo. */
    externalId: text("external_id"),
    /** Estado actual de la entrega. */
    status: text("status").$type<PluginWebhookDeliveryStatus>().notNull().default("pending"),
    /** Duración del procesamiento en milisegundos según el reloj del sistema. Nula hasta que la entrega termine. */
    durationMs: integer("duration_ms"),
    /** Mensaje de error si `status === "failed"`. */
    error: text("error"),
    /** Cuerpo JSON crudo de la solicitud HTTP entrante. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Encabezados HTTP relevantes de la solicitud entrante (p. ej. encabezados de firma). */
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pluginIdx: index("plugin_webhook_deliveries_plugin_idx").on(table.pluginId),
    statusIdx: index("plugin_webhook_deliveries_status_idx").on(table.status),
    keyIdx: index("plugin_webhook_deliveries_key_idx").on(table.webhookKey),
  }),
);
