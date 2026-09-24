import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { plugins } from "./plugins.js";
import type { PluginStateScopeKind } from "@paperclipai/shared";

/**
 * Tabla `plugin_entities`: mapeo persistente de alto nivel entre objetos de
 * Paperclip y entidades externas definidas por plugins.
 *
 * Esta tabla la usan los plugins (p. ej. `linear`, `github`) para almacenar punteros
 * a sus respectivos IDs externos de proyectos, issues, etc., y para almacenar
 * sus datos personalizados.
 *
 * A diferencia de `plugin_state`, que es para persistencia cruda de clave-valor,
 * `plugin_entities` está pensada para mapeos estructurados de objetos que el host puede
 * entender y consultar para la integración de la interfaz entre plugins.
 *
 * @see PLUGIN_SPEC.md §21.3
 */
export const pluginEntities = pgTable(
  "plugin_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    scopeKind: text("scope_kind").$type<PluginStateScopeKind>().notNull(),
    scopeId: text("scope_id"), // NULL para el alcance global (texto para coincidir con plugin_state.scope_id)
    externalId: text("external_id"), // ID en el sistema externo
    title: text("title"),
    status: text("status"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pluginIdx: index("plugin_entities_plugin_idx").on(table.pluginId),
    typeIdx: index("plugin_entities_type_idx").on(table.entityType),
    scopeIdx: index("plugin_entities_scope_idx").on(table.scopeKind, table.scopeId),
    externalIdx: uniqueIndex("plugin_entities_external_idx").on(
      table.pluginId,
      table.entityType,
      table.externalId,
    ),
  }),
);
