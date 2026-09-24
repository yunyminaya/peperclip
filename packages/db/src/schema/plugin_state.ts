import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import type { PluginStateScopeKind } from "@paperclipai/shared";
import { plugins } from "./plugins.js";

/**
 * Tabla `plugin_state`: almacenamiento de clave-valor con alcance para workers de plugins.
 *
 * Cada fila almacena un único valor JSON identificado por
 * `(plugin_id, scope_kind, scope_id, namespace, state_key)`. Los plugins usan
 * esta tabla mediante `ctx.state.get()`, `ctx.state.set()` y
 * `ctx.state.delete()` en el SDK.
 *
 * Los tipos de alcance determinan la granularidad del aislamiento:
 * - `instance`: un valor compartido en toda la instancia de Paperclip
 * - `company`: un valor por empresa
 * - `project`: un valor por proyecto
 * - `project_workspace`: un valor por espacio de trabajo del proyecto
 * - `agent`: un valor por agente
 * - `issue`: un valor por issue
 * - `goal`: un valor por objetivo
 * - `run`: un valor por ejecución de agente
 *
 * La columna `namespace` tiene el valor predeterminado `"default"` y se puede usar para
 * agrupar claves lógicamente sin contaminar el espacio de nombres raíz.
 *
 * @see PLUGIN_SPEC.md §21.3 — `plugin_state`
 */
export const pluginState = pgTable(
  "plugin_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK al plugin propietario. Se propaga al eliminar. */
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    /** Granularidad del alcance (p. ej. `"instance"`, `"project"`, `"issue"`). */
    scopeKind: text("scope_kind").$type<PluginStateScopeKind>().notNull(),
    /**
     * Identificador UUID o de texto para el objeto con alcance.
     * Nulo para el alcance `instance` (que no tiene entidad asociada).
     */
    scopeId: text("scope_id"),
    /**
     * Sub-espacio de nombres para evitar colisiones de claves dentro de un alcance.
     * Tiene el valor predeterminado `"default"` si el plugin no especifica uno.
     */
    namespace: text("namespace").notNull().default("default"),
    /** La clave que identifica esta entrada de estado dentro del espacio de nombres. */
    stateKey: text("state_key").notNull(),
    /** Valor serializable como JSON almacenado por el plugin. */
    valueJson: jsonb("value_json").notNull(),
    /** Marca de tiempo de la escritura más reciente. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /**
     * La restricción única garantiza que haya como máximo un valor por
     * tupla (plugin, tipo de alcance, id de alcance, espacio de nombres, clave).
     *
     * `nullsNotDistinct()` es necesario para que las entradas con `scope_id IS NULL`
     * (usadas por el alcance `instance`) PostgreSQL las trate como iguales y no
     * como nulos distintos; de lo contrario, el objetivo del upsert en `set()`
     * no coincidiría con las filas existentes y crearía duplicados.
     *
     * Requiere PostgreSQL 15+.
     */
    uniqueEntry: unique("plugin_state_unique_entry_idx")
      .on(
        table.pluginId,
        table.scopeKind,
        table.scopeId,
        table.namespace,
        table.stateKey,
      )
      .nullsNotDistinct(),
    /** Acelera las búsquedas por plugin + tipo de alcance (patrón de acceso más común). */
    pluginScopeIdx: index("plugin_state_plugin_scope_idx").on(
      table.pluginId,
      table.scopeKind,
    ),
  }),
);
