import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { plugins } from "./plugins.js";

/**
 * Tabla `plugin_logs`: almacenamiento estructurado de registros para los workers de plugins.
 *
 * Cada fila almacena una entrada de registro emitida por un worker de plugin mediante
 * `ctx.logger.info(...)`, etc. Los registros se pueden consultar por plugin, nivel y
 * rango de tiempo para apoyar el panel de registros del operador y los flujos de depuración.
 *
 * El host inserta las filas al manejar las notificaciones `log` del
 * proceso worker. Se puede aplicar una política de retención limitada mediante
 * limpieza periódica (p. ej. eliminar filas con más de 7 días).
 *
 * @see PLUGIN_SPEC.md §26 — Observability
 */
export const pluginLogs = pgTable(
  "plugin_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pluginTimeIdx: index("plugin_logs_plugin_time_idx").on(
      table.pluginId,
      table.createdAt,
    ),
    levelIdx: index("plugin_logs_level_idx").on(table.level),
  }),
);
