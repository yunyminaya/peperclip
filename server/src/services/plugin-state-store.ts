import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { plugins, pluginState } from "@paperclipai/db";
import type {
  PluginStateScopeKind,
  SetPluginState,
  ListPluginState,
} from "@paperclipai/shared";
import { notFound } from "../errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Namespace predeterminado usado cuando el plugin no especifica uno. */
const DEFAULT_NAMESPACE = "default";

/**
 * Construye las condiciones de la cláusula WHERE para una búsqueda de estado
 * con alcance.
 *
 * La clave compuesta de cinco partes es:
 *   `(pluginId, scopeKind, scopeId, namespace, stateKey)`
 *
 * `scopeId` puede ser null (para alcance `instance`) o un string no vacío.
 */
function scopeConditions(
  pluginId: string,
  scopeKind: PluginStateScopeKind,
  scopeId: string | undefined | null,
  namespace: string,
  stateKey: string,
) {
  const conditions = [
    eq(pluginState.pluginId, pluginId),
    eq(pluginState.scopeKind, scopeKind),
    eq(pluginState.namespace, namespace),
    eq(pluginState.stateKey, stateKey),
  ];

  if (scopeId != null && scopeId !== "") {
    conditions.push(eq(pluginState.scopeId, scopeId));
  } else {
    conditions.push(isNull(pluginState.scopeId));
  }

  return and(...conditions);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Plugin State Store — persistencia clave-valor con alcance para workers de
 * plugins.
 *
 * Provee operaciones `get`, `set`, `delete` y `list` sobre la tabla
 * `plugin_state`. Los datos de cada plugin están estrictamente
 * namespaced por `pluginId` para que los plugins no puedan leer ni escribir
 * el estado de otros.
 *
 * Este servicio implementa el respaldo del lado servidor para el cliente SDK
 * `ctx.state` expuesto a los workers de plugins. El host es responsable de:
 * - exigir la capacidad `plugin.state.read` antes de llamar `get` / `list`
 * - exigir la capacidad `plugin.state.write` antes de llamar `set` / `delete`
 *
 * @see PLUGIN_SPEC.md §14 — Superficie del SDK (`ctx.state`)
 * @see PLUGIN_SPEC.md §15.1 — Capacidades: estado de plugin
 * @see PLUGIN_SPEC.md §21.3 — tabla `plugin_state`
 */
export function pluginStateStore(db: Db) {
  // -----------------------------------------------------------------------
  // Utilidades internas
  // -----------------------------------------------------------------------

  async function assertPluginExists(pluginId: string): Promise<void> {
    const rows = await db
      .select({ id: plugins.id })
      .from(plugins)
      .where(eq(plugins.id, pluginId));
    if (rows.length === 0) {
      throw notFound(`Plugin no encontrado: ${pluginId}`);
    }
  }

  // -----------------------------------------------------------------------
  // API pública
  // -----------------------------------------------------------------------

  return {
    /**
     * Lee un valor de estado.
     *
     * Devuelve el valor JSON almacenado, o `null` si no existe entrada para
     * el alcance y clave dados.
     *
     * Requiere la capacidad `plugin.state.read` (la exige el llamador).
     *
     * @param pluginId - UUID del plugin propietario
     * @param scopeKind - Granularidad del alcance
     * @param scopeId - Identificador de la entidad con alcance (null para alcance `instance`)
     * @param stateKey - La clave a leer
     * @param namespace - Sub-namespace (por defecto `"default"`)
     */
    get: async (
      pluginId: string,
      scopeKind: PluginStateScopeKind,
      stateKey: string,
      {
        scopeId,
        namespace = DEFAULT_NAMESPACE,
      }: { scopeId?: string; namespace?: string } = {},
    ): Promise<unknown> => {
      const rows = await db
        .select()
        .from(pluginState)
        .where(scopeConditions(pluginId, scopeKind, scopeId, namespace, stateKey));

      return rows[0]?.valueJson ?? null;
    },

    /**
     * Escribe (crea o reemplaza) un valor de estado.
     *
     * Usa un upsert para que el llamador no necesite verificar la existencia
     * previa. En conflicto (misma clave compuesta) se sobrescriben el
     * `value_json` y `updated_at` de la fila existente.
     *
     * Requiere la capacidad `plugin.state.write` (la exige el llamador).
     *
     * @param pluginId - UUID del plugin propietario
     * @param input - Clave de alcance y valor a almacenar
     */
    set: async (pluginId: string, input: SetPluginState): Promise<void> => {
      await assertPluginExists(pluginId);

      const namespace = input.namespace ?? DEFAULT_NAMESPACE;
      const scopeId = input.scopeId ?? null;

      await db
        .insert(pluginState)
        .values({
          pluginId,
          scopeKind: input.scopeKind,
          scopeId,
          namespace,
          stateKey: input.stateKey,
          valueJson: input.value,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            pluginState.pluginId,
            pluginState.scopeKind,
            pluginState.scopeId,
            pluginState.namespace,
            pluginState.stateKey,
          ],
          set: {
            valueJson: input.value,
            updatedAt: new Date(),
          },
        });
    },

    /**
     * Elimina un valor de estado.
     *
     * No hace nada silenciosamente si la entrada no existe (idempotente por
     * diseño).
     *
     * Requiere la capacidad `plugin.state.write` (la exige el llamador).
     *
     * @param pluginId - UUID del plugin propietario
     * @param scopeKind - Granularidad del alcance
     * @param stateKey - La clave a eliminar
     * @param scopeId - Identificador de la entidad con alcance (null para alcance `instance`)
     * @param namespace - Sub-namespace (por defecto `"default"`)
     */
    delete: async (
      pluginId: string,
      scopeKind: PluginStateScopeKind,
      stateKey: string,
      {
        scopeId,
        namespace = DEFAULT_NAMESPACE,
      }: { scopeId?: string; namespace?: string } = {},
    ): Promise<void> => {
      await db
        .delete(pluginState)
        .where(scopeConditions(pluginId, scopeKind, scopeId, namespace, stateKey));
    },

    /**
     * Lista todas las entradas de estado de un plugin, opcionalmente
     * filtradas por alcance.
     *
     * Devuelve todas las filas coincidentes como objetos con forma de
     * `PluginStateRecord`. El campo `valueJson` contiene el valor almacenado.
     *
     * Requiere la capacidad `plugin.state.read` (la exige el llamador).
     *
     * @param pluginId - UUID del plugin propietario
     * @param filter - Filtros opcionales de alcance (scopeKind, scopeId, namespace)
     */
    list: async (pluginId: string, filter: ListPluginState = {}): Promise<typeof pluginState.$inferSelect[]> => {
      const conditions = [eq(pluginState.pluginId, pluginId)];

      if (filter.scopeKind !== undefined) {
        conditions.push(eq(pluginState.scopeKind, filter.scopeKind));
      }
      if (filter.scopeId !== undefined) {
        conditions.push(eq(pluginState.scopeId, filter.scopeId));
      }
      if (filter.namespace !== undefined) {
        conditions.push(eq(pluginState.namespace, filter.namespace));
      }

      return db
        .select()
        .from(pluginState)
        .where(and(...conditions));
    },

    /**
     * Elimina todas las entradas de estado propiedad de un plugin.
     *
     * Se llama durante la desinstalación del plugin cuando `removeData =
     * true`. También útil para restablecer el estado de un plugin durante
     * pruebas.
     *
     * @param pluginId - UUID del plugin propietario
     */
    deleteAll: async (pluginId: string): Promise<void> => {
      await db
        .delete(pluginState)
        .where(eq(pluginState.pluginId, pluginId));
    },
  };
}

export type PluginStateStore = ReturnType<typeof pluginStateStore>;
