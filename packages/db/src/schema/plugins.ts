import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { PluginCategory, PluginStatus, PaperclipPluginManifestV1 } from "@paperclipai/shared";

/**
 * Tabla `plugins`: almacena una fila por cada plugin instalado.
 *
 * Cada plugin se identifica de forma única por `plugin_key` (derivado del
 * `id` del manifiesto). El manifiesto completo se persiste como JSONB en
 * `manifest_json` para que el host pueda reconstruir la información de capacidades e
 * interfaz sin cargar el paquete del plugin.
 *
 * @see PLUGIN_SPEC.md §21.3
 */
export const plugins = pgTable(
  "plugins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pluginKey: text("plugin_key").notNull(),
    packageName: text("package_name").notNull(),
    version: text("version").notNull(),
    apiVersion: integer("api_version").notNull().default(1),
    categories: jsonb("categories").$type<PluginCategory[]>().notNull().default([]),
    manifestJson: jsonb("manifest_json").$type<PaperclipPluginManifestV1>().notNull(),
    status: text("status").$type<PluginStatus>().notNull().default("installed"),
    installOrder: integer("install_order"),
    /** Ruta resuelta del paquete para instalaciones de ruta local; se usa para encontrar el punto de entrada del worker. */
    packagePath: text("package_path"),
    lastError: text("last_error"),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pluginKeyIdx: uniqueIndex("plugins_plugin_key_idx").on(table.pluginKey),
    statusIdx: index("plugins_status_idx").on(table.status),
  }),
);
