import { asc, eq, ne, sql, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  plugins,
  pluginConfig,
  pluginEntities,
  pluginJobs,
  pluginJobRuns,
  pluginWebhookDeliveries,
} from "@paperclipai/db";
import type {
  PaperclipPluginManifestV1,
  PluginStatus,
  InstallPlugin,
  UpdatePluginStatus,
  UpsertPluginConfig,
  PatchPluginConfig,
  PluginEntityRecord,
  PluginEntityQuery,
  PluginJobRecord,
  PluginJobRunRecord,
  PluginWebhookDeliveryRecord,
  PluginJobStatus,
  PluginJobRunStatus,
  PluginJobRunTrigger,
  PluginWebhookDeliveryStatus,
} from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detecta si un error de Postgres es una violación de restricción única en
 * el índice único `plugins_plugin_key_idx`.
 */
function isPluginKeyConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { code?: string; constraint?: string; constraint_name?: string };
  const constraint = err.constraint ?? err.constraint_name;
  return err.code === "23505" && constraint === "plugins_plugin_key_idx";
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * PluginRegistry – operaciones CRUD para las tablas `plugins` y
 * `plugin_config`. Sigue el mismo patrón de función fábrica usado por el
 * resto de la capa de servicios de Paperclip.
 *
 * Esta es la capa de persistencia de más bajo nivel para plugins. Las
 * preocupaciones de más alto nivel como el cumplimiento de la máquina de
 * estados del ciclo de vida y la restricción de capacidades las manejan
 * {@link pluginLifecycleManager} y {@link pluginCapabilityValidator}
 * respectivamente.
 *
 * @see PLUGIN_SPEC.md §21.3 — Tablas requeridas
 */
export function pluginRegistryService(db: Db) {
  // -----------------------------------------------------------------------
  // Utilidades internas
  // -----------------------------------------------------------------------

  async function getById(id: string) {
    return db
      .select()
      .from(plugins)
      .where(eq(plugins.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function getByKey(pluginKey: string) {
    return db
      .select()
      .from(plugins)
      .where(eq(plugins.pluginKey, pluginKey))
      .then((rows) => rows[0] ?? null);
  }

  async function nextInstallOrder(): Promise<number> {
    const result = await db
      .select({ maxOrder: sql<number>`coalesce(max(${plugins.installOrder}), 0)` })
      .from(plugins);
    return (result[0]?.maxOrder ?? 0) + 1;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    // ----- Lectura ------------------------------------------------------

    /** Lista todos los plugins registrados ordenados por orden de instalación. */
    list: () =>
      db
        .select()
        .from(plugins)
        .orderBy(asc(plugins.installOrder)),

    /**
     * Lista los plugins instalados (excluye los eliminados/desinstalados).
     * Use para el Administrador de plugins y la lista API predeterminada
     * para que los plugins desinstalados no aparezcan.
     */
    listInstalled: () =>
      db
        .select()
        .from(plugins)
        .where(ne(plugins.status, "uninstalled"))
        .orderBy(asc(plugins.installOrder)),

    /** Lista los plugins filtrados por estado. */
    listByStatus: (status: PluginStatus) =>
      db
        .select()
        .from(plugins)
        .where(eq(plugins.status, status))
        .orderBy(asc(plugins.installOrder)),

    /** Obtiene un solo plugin por clave primaria. */
    getById,

    /** Obtiene un solo plugin por su `pluginKey` único. */
    getByKey,

    // ----- Instalación / Registro -----------------------------------------

    /**
     * Registra (instala) un nuevo plugin.
     *
     * Se espera que el llamador ya haya resuelto y validado el manifiesto
     * desde el paquete. Este método persiste la fila del plugin y asigna el
     * siguiente orden de instalación.
     */
    install: async (input: InstallPlugin, manifest: PaperclipPluginManifestV1) => {
      const existing = await getByKey(manifest.id);
      if (existing) {
        if (existing.status !== "uninstalled") {
          throw conflict(`El plugin ya está instalado: ${manifest.id}`);
        }

        // Reinstalación tras borrado lógico: reactiva la fila existente para
        // que los datos con alcance de plugin y las referencias permanezcan
        // estables a través de ciclos de desinstalación/reinstalación.
        return db
          .update(plugins)
          .set({
            packageName: input.packageName,
            packagePath: input.packagePath ?? null,
            version: manifest.version,
            apiVersion: manifest.apiVersion,
            categories: manifest.categories,
            manifestJson: manifest,
            status: "installed" as PluginStatus,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(plugins.id, existing.id))
          .returning()
          .then((rows) => rows[0] ?? null);
      }

      const installOrder = await nextInstallOrder();

      try {
        const rows = await db
          .insert(plugins)
          .values({
            pluginKey: manifest.id,
            packageName: input.packageName,
            version: manifest.version,
            apiVersion: manifest.apiVersion,
            categories: manifest.categories,
            manifestJson: manifest,
            status: "installed" as PluginStatus,
            installOrder,
            packagePath: input.packagePath ?? null,
          })
          .returning();
        return rows[0];
      } catch (error) {
        if (isPluginKeyConflict(error)) {
          throw conflict(`El plugin ya está instalado: ${manifest.id}`);
        }
        throw error;
      }
    },

    // ----- Actualización ------------------------------------------------

    /**
     * Actualiza el manifiesto y la versión de un plugin (p. ej. en
     * actualización). El plugin debe existir ya.
     */
    update: async (
      id: string,
      data: {
        packageName?: string;
        version?: string;
        manifest?: PaperclipPluginManifestV1;
      },
    ) => {
      const plugin = await getById(id);
      if (!plugin) throw notFound("Plugin no encontrado");

      const setClause: Partial<typeof plugins.$inferInsert> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (data.packageName !== undefined) setClause.packageName = data.packageName;
      if (data.version !== undefined) setClause.version = data.version;
      if (data.manifest !== undefined) {
        setClause.manifestJson = data.manifest;
        setClause.apiVersion = data.manifest.apiVersion;
        setClause.categories = data.manifest.categories;
      }

      return db
        .update(plugins)
        .set(setClause)
        .where(eq(plugins.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
    },

    // ----- Estado -----------------------------------------------------

    /** Actualiza el estado del ciclo de vida de un plugin y el mensaje de error opcional. */
    updateStatus: async (id: string, input: UpdatePluginStatus) => {
      const plugin = await getById(id);
      if (!plugin) throw notFound("Plugin no encontrado");

      return db
        .update(plugins)
        .set({
          status: input.status,
          lastError: input.lastError ?? null,
          updatedAt: new Date(),
        })
        .where(eq(plugins.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
    },

    // ----- Desinstalación / Eliminación -----------------------------------

    /**
     * Desinstala un plugin.
     *
     * Cuando `removeData` es true, la fila del plugin (y la configuración en
     * cascada) se elimina permanentemente. De lo contrario, el estado se
     * fija a `"uninstalled"` para un borrado lógico que preserva el
     * registro.
     */
    uninstall: async (id: string, removeData = false) => {
      const plugin = await getById(id);
      if (!plugin) throw notFound("Plugin no encontrado");

      if (removeData) {
        // Eliminación permanente – plugin_config cae en cascada vía FK onDelete
        return db
          .delete(plugins)
          .where(eq(plugins.id, id))
          .returning()
          .then((rows) => rows[0] ?? null);
      }

      // Borrado lógico – marca como desinstalado
      return db
        .update(plugins)
        .set({
          status: "uninstalled" as PluginStatus,
          updatedAt: new Date(),
        })
        .where(eq(plugins.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
    },

    // ----- Config -----------------------------------------------------

    /** Recupera la configuración de instancia de un plugin. */
    getConfig: (pluginId: string) =>
      db
        .select()
        .from(pluginConfig)
        .where(eq(pluginConfig.pluginId, pluginId))
        .then((rows) => rows[0] ?? null),

    /**
     * Crea o reemplaza completamente la configuración de instancia de un
     * plugin. Si ya existe una fila de configuración para el plugin se
     * reemplaza; de lo contrario se inserta una nueva fila.
     */
    upsertConfig: async (pluginId: string, input: UpsertPluginConfig) => {
      const plugin = await getById(pluginId);
      if (!plugin) throw notFound("Plugin no encontrado");

      const existing = await db
        .select()
        .from(pluginConfig)
        .where(eq(pluginConfig.pluginId, pluginId))
        .then((rows) => rows[0] ?? null);

      if (existing) {
        return db
          .update(pluginConfig)
          .set({
            configJson: input.configJson,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(pluginConfig.pluginId, pluginId))
          .returning()
          .then((rows) => rows[0]);
      }

      return db
        .insert(pluginConfig)
        .values({
          pluginId,
          configJson: input.configJson,
        })
        .returning()
        .then((rows) => rows[0]);
    },

    /**
     * Actualiza parcialmente la configuración de instancia de un plugin vía
     * fusión superficial. Si aún no existe una fila de configuración, se
     * crea con los valores suministrados.
     */
    patchConfig: async (pluginId: string, input: PatchPluginConfig) => {
      const plugin = await getById(pluginId);
      if (!plugin) throw notFound("Plugin no encontrado");

      const existing = await db
        .select()
        .from(pluginConfig)
        .where(eq(pluginConfig.pluginId, pluginId))
        .then((rows) => rows[0] ?? null);

      if (existing) {
        const merged = { ...existing.configJson, ...input.configJson };
        return db
          .update(pluginConfig)
          .set({
            configJson: merged,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(pluginConfig.pluginId, pluginId))
          .returning()
          .then((rows) => rows[0]);
      }

      return db
        .insert(pluginConfig)
        .values({
          pluginId,
          configJson: input.configJson,
        })
        .returning()
        .then((rows) => rows[0]);
    },

    /**
     * Registra un error contra la configuración de un plugin (p. ej. fallo
     * de validación contra el instanceConfigSchema del plugin).
     */
    setConfigError: async (pluginId: string, lastError: string | null) => {
      const rows = await db
        .update(pluginConfig)
        .set({ lastError, updatedAt: new Date() })
        .where(eq(pluginConfig.pluginId, pluginId))
        .returning();

      if (rows.length === 0) throw notFound("Config del plugin no encontrada");
      return rows[0];
    },

    /** Elimina la fila de configuración de un plugin. */
    deleteConfig: async (pluginId: string) => {
      const rows = await db
        .delete(pluginConfig)
        .where(eq(pluginConfig.pluginId, pluginId))
        .returning();

      return rows[0] ?? null;
    },

    // ----- Entidades --------------------------------------------------

    /**
     * Lista los mapeos de entidades persistentes propiedad de un plugin
     * específico, con filtrado y paginación.
     *
     * @param pluginId - El UUID del plugin.
     * @param query - Filtros opcionales (type, externalId) y paginación (limit, offset).
     * @returns Una lista de objetos `PluginEntityRecord` coincidentes.
     */
    listEntities: (pluginId: string, query?: PluginEntityQuery) => {
      const conditions = [eq(pluginEntities.pluginId, pluginId)];
      if (query?.entityType) conditions.push(eq(pluginEntities.entityType, query.entityType));
      if (query?.externalId) conditions.push(eq(pluginEntities.externalId, query.externalId));

      return db
        .select()
        .from(pluginEntities)
        .where(and(...conditions))
        .orderBy(asc(pluginEntities.createdAt))
        .limit(query?.limit ?? 100)
        .offset(query?.offset ?? 0);
    },

    /**
     * Busca un mapeo de entidad propiedad de un plugin por su identificador
     * externo.
     *
     * @param pluginId - El UUID del plugin.
     * @param entityType - El tipo de entidad (p. ej. 'project', 'issue').
     * @param externalId - El identificador en el sistema externo.
     * @returns El `PluginEntityRecord` coincidente o null.
     */
    getEntityByExternalId: (
      pluginId: string,
      entityType: string,
      externalId: string,
    ) =>
      db
        .select()
        .from(pluginEntities)
        .where(
          and(
            eq(pluginEntities.pluginId, pluginId),
            eq(pluginEntities.entityType, entityType),
            eq(pluginEntities.externalId, externalId),
          ),
        )
        .then((rows) => rows[0] ?? null),

    /**
     * Crea o actualiza un mapeo persistente entre un objeto Paperclip y una
     * entidad externa.
     *
     * @param pluginId - El UUID del plugin.
     * @param input - Los datos de la entidad a persistir.
     * @returns El `PluginEntityRecord` recién creado o actualizado.
     */
    upsertEntity: async (
      pluginId: string,
      input: Omit<typeof pluginEntities.$inferInsert, "id" | "pluginId" | "createdAt" | "updatedAt">,
    ) => {
      // Drizzle no soporta onConflictDoUpdate específico de pg fácilmente
      // en la llamada insert() con cláusulas where complejas, así que lo
      // hacemos manualmente.
      const existing = await db
        .select()
        .from(pluginEntities)
        .where(
          and(
            eq(pluginEntities.pluginId, pluginId),
            eq(pluginEntities.entityType, input.entityType),
            eq(pluginEntities.externalId, input.externalId ?? ""),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (existing) {
        return db
          .update(pluginEntities)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(pluginEntities.id, existing.id))
          .returning()
          .then((rows) => rows[0]);
      }

      return db
        .insert(pluginEntities)
        .values({
          ...input,
          pluginId,
        } as any)
        .returning()
        .then((rows) => rows[0]);
    },

    /**
     * Elimina un mapeo de entidad específico propiedad de un plugin por su
     * UUID interno.
     *
     * @param id - El UUID del registro de la entidad.
     * @returns El registro eliminado, o null si no se encontró.
     */
    deleteEntity: async (id: string) => {
      const rows = await db
        .delete(pluginEntities)
        .where(eq(pluginEntities.id, id))
        .returning();
      return rows[0] ?? null;
    },

    // ----- Trabajos ---------------------------------------------------

    /**
     * Lista todos los trabajos programados registrados para un plugin
     * específico.
     *
     * @param pluginId - El UUID del plugin.
     * @returns Una lista de objetos `PluginJobRecord`.
     */
    listJobs: (pluginId: string) =>
      db
        .select()
        .from(pluginJobs)
        .where(eq(pluginJobs.pluginId, pluginId))
        .orderBy(asc(pluginJobs.jobKey)),

    /**
     * Busca un trabajo de plugin por su clave única de trabajo.
     *
     * @param pluginId - El UUID del plugin.
     * @param jobKey - La clave definida en el manifiesto del plugin.
     * @returns El `PluginJobRecord` coincidente o null.
     */
    getJobByKey: (pluginId: string, jobKey: string) =>
      db
        .select()
        .from(pluginJobs)
        .where(and(eq(pluginJobs.pluginId, pluginId), eq(pluginJobs.jobKey, jobKey)))
        .then((rows) => rows[0] ?? null),

    /**
     * Registra o actualiza un trabajo programado para un plugin.
     *
     * @param pluginId - El UUID del plugin.
     * @param jobKey - La clave única del trabajo.
     * @param input - El programa (cron) y estado opcional.
     * @returns El `PluginJobRecord` actualizado o creado.
     */
    upsertJob: async (
      pluginId: string,
      jobKey: string,
      input: { schedule: string; status?: PluginJobStatus },
    ) => {
      const existing = await db
        .select()
        .from(pluginJobs)
        .where(and(eq(pluginJobs.pluginId, pluginId), eq(pluginJobs.jobKey, jobKey)))
        .then((rows) => rows[0] ?? null);

      if (existing) {
        return db
          .update(pluginJobs)
          .set({
            schedule: input.schedule,
            status: input.status ?? existing.status,
            updatedAt: new Date(),
          })
          .where(eq(pluginJobs.id, existing.id))
          .returning()
          .then((rows) => rows[0]);
      }

      return db
        .insert(pluginJobs)
        .values({
          pluginId,
          jobKey,
          schedule: input.schedule,
          status: input.status ?? "active",
        })
        .returning()
        .then((rows) => rows[0]);
    },

    /**
     * Registra el inicio de una ejecución específica de trabajo.
     *
     * @param pluginId - El UUID del plugin.
     * @param jobId - El UUID del registro del trabajo padre.
     * @param trigger - Qué disparó esta ejecución (p. ej. 'schedule', 'manual').
     * @returns El `PluginJobRunRecord` recién creado en estado 'pending'.
     */
    createJobRun: async (
      pluginId: string,
      jobId: string,
      trigger: PluginJobRunTrigger,
    ) => {
      return db
        .insert(pluginJobRuns)
        .values({
          pluginId,
          jobId,
          trigger,
          status: "pending",
        })
        .returning()
        .then((rows) => rows[0]);
    },

    /**
     * Actualiza el estado, duración y logs de un registro de ejecución de
     * trabajo.
     *
     * @param runId - El UUID de la ejecución del trabajo.
     * @param input - Los campos de actualización (status, error, duration, etc.).
     * @returns El `PluginJobRunRecord` actualizado.
     */
    updateJobRun: async (
      runId: string,
      input: {
        status: PluginJobRunStatus;
        durationMs?: number;
        error?: string;
        logs?: string[];
        startedAt?: Date;
        finishedAt?: Date;
      },
    ) => {
      return db
        .update(pluginJobRuns)
        .set(input)
        .where(eq(pluginJobRuns.id, runId))
        .returning()
        .then((rows) => rows[0] ?? null);
    },

    // ----- Webhooks ---------------------------------------------------

    /**
     * Crea un registro para una entrega entrante de webhook.
     *
     * @param pluginId - El UUID del plugin receptor.
     * @param webhookKey - La clave del endpoint definida en el manifiesto.
     * @param input - El payload, headers y ID externo opcional.
     * @returns El `PluginWebhookDeliveryRecord` recién creado en estado 'pending'.
     */
    createWebhookDelivery: async (
      pluginId: string,
      webhookKey: string,
      input: {
        externalId?: string;
        payload: Record<string, unknown>;
        headers?: Record<string, string>;
      },
    ) => {
      return db
        .insert(pluginWebhookDeliveries)
        .values({
          pluginId,
          webhookKey,
          externalId: input.externalId,
          payload: input.payload,
          headers: input.headers ?? {},
          status: "pending",
        })
        .returning()
        .then((rows) => rows[0]);
    },

    /**
     * Actualiza el estado y métricas de procesamiento de una entrega de
     * webhook.
     *
     * @param deliveryId - El UUID del registro de la entrega.
     * @param input - Los campos de actualización (status, error, duration, etc.).
     * @returns El `PluginWebhookDeliveryRecord` actualizado.
     */
    updateWebhookDelivery: async (
      deliveryId: string,
      input: {
        status: PluginWebhookDeliveryStatus;
        durationMs?: number;
        error?: string;
        startedAt?: Date;
        finishedAt?: Date;
      },
    ) => {
      return db
        .update(pluginWebhookDeliveries)
        .set(input)
        .where(eq(pluginWebhookDeliveries.id, deliveryId))
        .returning()
        .then((rows) => rows[0] ?? null);
    },
  };
}
