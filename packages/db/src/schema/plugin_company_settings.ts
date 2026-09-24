import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { plugins } from "./plugins.js";

/**
 * Tabla `plugin_company_settings`: almacena los ajustes de plugins gestionados por el operador
 * con alcance a una empresa específica.
 *
 * Se diferencia de `plugin_config`, que almacena la configuración de plugins
 * a nivel de la instancia. Cada empresa puede tener como máximo una fila de ajustes por plugin.
 *
 * Las filas representan anulaciones explícitas del comportamiento predeterminado de la empresa:
 * - sin fila => el plugin está habilitado para la empresa de forma predeterminada
 * - fila con `enabled = false` => el plugin está deshabilitado para esa empresa
 * - fila con `enabled = true` => el plugin sigue habilitado y almacena ajustes de la empresa
 */
export const pluginCompanySettings = pgTable(
  "plugin_company_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    settingsJson: jsonb("settings_json").$type<Record<string, unknown>>().notNull().default({}),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("plugin_company_settings_company_idx").on(table.companyId),
    pluginIdx: index("plugin_company_settings_plugin_idx").on(table.pluginId),
    companyPluginUq: uniqueIndex("plugin_company_settings_company_plugin_uq").on(
      table.companyId,
      table.pluginId,
    ),
  }),
);
