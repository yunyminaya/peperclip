import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { plugins } from "./plugins.js";

/**
 * Tabla `plugin_config`: almacena la configuración de instancia proporcionada por el operador
 * para cada plugin (una fila por plugin, garantizado por un índice único en
 * `plugin_id`).
 *
 * La columna `config_json` contiene los valores que el operador ingresa en la
 * interfaz de ajustes del plugin. Estos valores se validan en tiempo de ejecución contra el
 * `instanceConfigSchema` del plugin en el manifiesto.
 *
 * @see PLUGIN_SPEC.md §21.3
 */
export const pluginConfig = pgTable(
  "plugin_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pluginIdIdx: uniqueIndex("plugin_config_plugin_id_idx").on(table.pluginId),
  }),
);
