/**
 * Plugin Job Store — capa de persistencia para trabajos programados de
 * plugins y su historial de ejecución.
 *
 * Este servicio maneja las tablas `plugin_jobs` y `plugin_job_runs`. Es el
 * almacén del lado del servidor para la superficie `ctx.jobs` del SDK
 * expuesta a los workers de plugins.
 *
 * ## Responsabilidades
 *
 * 1. **Sincronizar declaraciones de trabajos** — Cuando se instala o inicia
 *    un plugin, el host llama a `syncJobDeclarations()` para hacer upsert de
 *    los trabajos declarados del manifiesto en la tabla `plugin_jobs`. Los
 *    trabajos eliminados del manifiesto se marcan como `paused` (no se
 *    eliminan) para preservar el historial.
 *
 * 2. **CRUD de trabajos** — Listar, obtener, pausar y reanudar trabajos de
 *    un plugin dado.
 *
 * 3. **Ciclo de vida de ejecuciones** — Crear registros de ejecuciones de
 *    trabajos, actualizar su estado y registrar resultados (duración,
 *    errores, logs).
 *
 * 4. **Cálculo de próxima ejecución** — Tras completar una ejecución, el
 *    host debe llamar a `updateNextRunAt()` con el próximo tick cron para
 *    que el programador sepa cuándo disparar de nuevo.
 *
 * El chequeo de capacidad (`jobs.schedule`) se aplica aguas arriba por la
 * fábrica de clientes del host y el validador de manifiestos — este almacén
 * confía en que el llamador ya fue autorizado.
 *
 * @see PLUGIN_SPEC.md §17 — Trabajos programados
 * @see PLUGIN_SPEC.md §21.3 — tablas `plugin_jobs` / `plugin_job_runs`
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { plugins, pluginJobs, pluginJobRuns } from "@paperclipai/db";
import type {
  PluginJobDeclaration,
  PluginJobRunStatus,
  PluginJobRunTrigger,
  PluginJobRecord,
} from "@paperclipai/shared";
import { notFound } from "../errors.js";

/**
 * Los estados usados para *definiciones* de trabajos en la tabla
 * `plugin_jobs`. Alias de `PluginJobRecord` para mantener la API del almacén
 * alineada con el tipo de dominio (`"active" | "paused" | "failed"`).
 */
type JobDefinitionStatus = PluginJobRecord["status"];

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Entrada para crear un registro de ejecución de trabajo.
 */
export interface CreateJobRunInput {
  /** FK a la fila de plugin_jobs. */
  jobId: string;
  /** FK a la fila de plugins. */
  pluginId: string;
  /** Qué disparó esta ejecución. */
  trigger: PluginJobRunTrigger;
}

/**
 * Entrada para completar (o fallar) una ejecución de trabajo.
 */
export interface CompleteJobRunInput {
  /** Estado final de la ejecución. */
  status: PluginJobRunStatus;
  /** Mensaje de error si la ejecución falló. */
  error?: string | null;
  /** Duración de la ejecución en milisegundos. */
  durationMs?: number | null;
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

/**
 * Crea un PluginJobStore respaldado por la instancia de base de datos
 * Drizzle dada.
 *
 * @example
 * ```ts
 * const jobStore = pluginJobStore(db);
 *
 * // Al instalar/iniciar el plugin — sincroniza los trabajos declarados a la BD
 * await jobStore.syncJobDeclarations(pluginId, manifest.jobs ?? []);
 *
 * // Antes de despachar el RPC runJob — crea un registro de ejecución
 * const run = await jobStore.createRun({ jobId, pluginId, trigger: "schedule" });
 *
 * // Tras completar el RPC — registra el resultado
 * await jobStore.completeRun(run.id, {
 *   status: "succeeded",
 *   durationMs: Date.now() - startedAt,
 * });
 * ```
 */
export function pluginJobStore(db: Db) {
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
    // =====================================================================
    // Declaraciones de trabajos (plugin_jobs)
    // =====================================================================

    /**
     * Sincroniza los trabajos declarados de un manifiesto de plugin en la
     * tabla `plugin_jobs`.
     *
     * Se llama al instalar el plugin y en cada inicio del worker para que la
     * BD siempre refleje los trabajos declarados del manifiesto:
     *
     * - Los trabajos **nuevos** se insertan con estado `active`.
     * - Los trabajos **existentes** actualizan su `schedule` si cambió.
     * - Los trabajos **eliminados** (presentes en la BD pero ausentes del
     *   manifiesto) pasan a `paused` para preservar su historial.
     *
     * La restricción única `(pluginId, jobKey)` se usa para la resolución
     * de conflictos.
     *
     * @param pluginId - UUID del plugin propietario
     * @param declarations - Declaraciones de trabajos del manifiesto del plugin
     */
    async syncJobDeclarations(
      pluginId: string,
      declarations: PluginJobDeclaration[],
    ): Promise<void> {
      await assertPluginExists(pluginId);

      // Obtiene los trabajos existentes de este plugin
      const existingJobs = await db
        .select()
        .from(pluginJobs)
        .where(eq(pluginJobs.pluginId, pluginId));

      const existingByKey = new Map(
        existingJobs.map((j) => [j.jobKey, j]),
      );

      const declaredKeys = new Set<string>();

      // Hace upsert de cada trabajo declarado
      for (const decl of declarations) {
        declaredKeys.add(decl.jobKey);

        const existing = existingByKey.get(decl.jobKey);
        const schedule = decl.schedule ?? "";

        if (existing) {
          // Actualiza el cronograma si cambió; reactiva si estaba pausado
          const updates: Record<string, unknown> = {
            updatedAt: new Date(),
          };
          if (existing.schedule !== schedule) {
            updates.schedule = schedule;
          }
          if (existing.status === "paused") {
            updates.status = "active";
          }

          await db
            .update(pluginJobs)
            .set(updates)
            .where(eq(pluginJobs.id, existing.id));
        } else {
          // Inserta el trabajo nuevo
          await db.insert(pluginJobs).values({
            pluginId,
            jobKey: decl.jobKey,
            schedule,
            status: "active",
          });
        }
      }

      // Pausa los trabajos que ya no están declarados en el manifiesto
      for (const existing of existingJobs) {
        if (!declaredKeys.has(existing.jobKey) && existing.status !== "paused") {
          await db
            .update(pluginJobs)
            .set({ status: "paused", updatedAt: new Date() })
            .where(eq(pluginJobs.id, existing.id));
        }
      }
    },

    /**
     * Lista todos los trabajos de un plugin, opcionalmente filtrados por
     * estado.
     *
     * @param pluginId - UUID del plugin propietario
     * @param status - Filtro de estado opcional
     */
    async listJobs(
      pluginId: string,
      status?: JobDefinitionStatus,
    ): Promise<(typeof pluginJobs.$inferSelect)[]> {
      const conditions = [eq(pluginJobs.pluginId, pluginId)];
      if (status) {
        conditions.push(eq(pluginJobs.status, status));
      }
      return db
        .select()
        .from(pluginJobs)
        .where(and(...conditions));
    },

    /**
     * Obtiene un solo trabajo por su clave compuesta `(pluginId, jobKey)`.
     *
     * @param pluginId - UUID del plugin propietario
     * @param jobKey - Identificador estable del trabajo del manifiesto
     * @returns La fila del trabajo, o `null` si no se encuentra
     */
    async getJobByKey(
      pluginId: string,
      jobKey: string,
    ): Promise<(typeof pluginJobs.$inferSelect) | null> {
      const rows = await db
        .select()
        .from(pluginJobs)
        .where(
          and(
            eq(pluginJobs.pluginId, pluginId),
            eq(pluginJobs.jobKey, jobKey),
          ),
        );
      return rows[0] ?? null;
    },

    /**
     * Obtiene un solo trabajo por su clave primaria (UUID).
     *
     * @param jobId - UUID de la fila del trabajo
     * @returns La fila del trabajo, o `null` si no se encuentra
     */
    async getJobById(
      jobId: string,
    ): Promise<(typeof pluginJobs.$inferSelect) | null> {
      const rows = await db
        .select()
        .from(pluginJobs)
        .where(eq(pluginJobs.id, jobId));
      return rows[0] ?? null;
    },

    /**
     * Obtiene un solo trabajo por ID, con alcance a un plugin específico.
     *
     * Devuelve `null` si el trabajo no existe o no pertenece al plugin
     * dado — los llamadores deben tratar ambos casos como "no encontrado".
     */
    async getJobByIdForPlugin(
      pluginId: string,
      jobId: string,
    ): Promise<(typeof pluginJobs.$inferSelect) | null> {
      const rows = await db
        .select()
        .from(pluginJobs)
        .where(and(eq(pluginJobs.id, jobId), eq(pluginJobs.pluginId, pluginId)));
      return rows[0] ?? null;
    },

    /**
     * Actualiza el estado de un trabajo.
     *
     * @param jobId - UUID de la fila del trabajo
     * @param status - Nuevo estado
     */
    async updateJobStatus(
      jobId: string,
      status: JobDefinitionStatus,
    ): Promise<void> {
      await db
        .update(pluginJobs)
        .set({ status, updatedAt: new Date() })
        .where(eq(pluginJobs.id, jobId));
    },

    /**
     * Actualiza los timestamps `lastRunAt` y `nextRunAt` de un trabajo.
     *
     * Lo llama el programador tras completar una ejecución para avanzar el
     * puntero de programación.
     *
     * @param jobId - UUID de la fila del trabajo
     * @param lastRunAt - Cuándo inició la última ejecución
     * @param nextRunAt - Cuándo debe dispararse la próxima ejecución
     */
    async updateRunTimestamps(
      jobId: string,
      lastRunAt: Date,
      nextRunAt: Date | null,
    ): Promise<void> {
      await db
        .update(pluginJobs)
        .set({
          lastRunAt,
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(pluginJobs.id, jobId));
    },

    /**
     * Elimina todos los trabajos (y las ejecuciones en cascada) de un plugin.
     *
     * Se llama durante la desinstalación del plugin cuando `removeData =
     * true`.
     *
     * @param pluginId - UUID del plugin propietario
     */
    async deleteAllJobs(pluginId: string): Promise<void> {
      await db
        .delete(pluginJobs)
        .where(eq(pluginJobs.pluginId, pluginId));
    },

    // =====================================================================
    // Ejecuciones de trabajos (plugin_job_runs)
    // =====================================================================

    /**
     * Crea un nuevo registro de ejecución de trabajo con estado `queued`.
     *
     * El llamador debe crear el registro de ejecución *antes* de despachar
     * el RPC `runJob` al worker, y luego actualizarlo a `running` una vez
     * que el worker empiece la ejecución.
     *
     * @param input - Entrada de la ejecución (jobId, pluginId, trigger)
     * @returns La fila de la ejecución recién creada
     */
    async createRun(
      input: CreateJobRunInput,
    ): Promise<typeof pluginJobRuns.$inferSelect> {
      const rows = await db
        .insert(pluginJobRuns)
        .values({
          jobId: input.jobId,
          pluginId: input.pluginId,
          trigger: input.trigger,
          status: "queued",
        })
        .returning();

      return rows[0]!;
    },

    /**
     * Marca una ejecución como `running` y fija su timestamp `startedAt`.
     *
     * @param runId - UUID de la fila de la ejecución
     */
    async markRunning(runId: string): Promise<void> {
      await db
        .update(pluginJobRuns)
        .set({
          status: "running" as PluginJobRunStatus,
          startedAt: new Date(),
        })
        .where(eq(pluginJobRuns.id, runId));
    },

    /**
     * Completa una ejecución — fija su estado final, error, duración y
     * timestamp `finishedAt`.
     *
     * @param runId - UUID de la fila de la ejecución
     * @param input - Detalles de la finalización
     */
    async completeRun(
      runId: string,
      input: CompleteJobRunInput,
    ): Promise<void> {
      await db
        .update(pluginJobRuns)
        .set({
          status: input.status,
          error: input.error ?? null,
          durationMs: input.durationMs ?? null,
          finishedAt: new Date(),
        })
        .where(eq(pluginJobRuns.id, runId));
    },

    /**
     * Obtiene una ejecución por su clave primaria.
     *
     * @param runId - UUID de la fila de la ejecución
     * @returns La fila de la ejecución, o `null` si no se encuentra
     */
    async getRunById(
      runId: string,
    ): Promise<(typeof pluginJobRuns.$inferSelect) | null> {
      const rows = await db
        .select()
        .from(pluginJobRuns)
        .where(eq(pluginJobRuns.id, runId));
      return rows[0] ?? null;
    },

    /**
     * Lista las ejecuciones de un trabajo específico, ordenadas por fecha
     * de creación descendente.
     *
     * @param jobId - UUID del trabajo
     * @param limit - Número máximo de filas a devolver (por defecto: 50)
     */
    async listRunsByJob(
      jobId: string,
      limit = 50,
    ): Promise<(typeof pluginJobRuns.$inferSelect)[]> {
      return db
        .select()
        .from(pluginJobRuns)
        .where(eq(pluginJobRuns.jobId, jobId))
        .orderBy(desc(pluginJobRuns.createdAt))
        .limit(limit);
    },

    /**
     * Lista las ejecuciones de un plugin, opcionalmente filtradas por
     * estado.
     *
     * @param pluginId - UUID del plugin propietario
     * @param status - Filtro de estado opcional
     * @param limit - Número máximo de filas a devolver (por defecto: 50)
     */
    async listRunsByPlugin(
      pluginId: string,
      status?: PluginJobRunStatus,
      limit = 50,
    ): Promise<(typeof pluginJobRuns.$inferSelect)[]> {
      const conditions = [eq(pluginJobRuns.pluginId, pluginId)];
      if (status) {
        conditions.push(eq(pluginJobRuns.status, status));
      }
      return db
        .select()
        .from(pluginJobRuns)
        .where(and(...conditions))
        .orderBy(desc(pluginJobRuns.createdAt))
        .limit(limit);
    },
  };
}

/** Alias de tipo para el valor de retorno de `pluginJobStore()`. */
export type PluginJobStore = ReturnType<typeof pluginJobStore>;
