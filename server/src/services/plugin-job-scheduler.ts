/**
 * PluginJobScheduler — programador basado en ticks para trabajos
 * programados de plugins.
 *
 * El programador es el coordinador central de todos los trabajos cron de
 * plugins. Hace tick periódicamente (por defecto cada 30 segundos),
 * consulta la tabla `plugin_jobs` buscando trabajos cuyo `nextRunAt` ya
 * pasó, despacha llamadas RPC `runJob` a los procesos worker
 * correspondientes, registra cada ejecución en la tabla `plugin_job_runs` y
 * avanza el puntero de programación.
 *
 * ## Responsabilidades
 *
 * 1. **Bucle de ticks** — Un bucle basado en `setInterval` se dispara cada
 *    `tickIntervalMs` (por defecto 30s). Cada tick busca trabajos vencidos
 *    y los despacha.
 *
 * 2. **Parseo de cron y cálculo de próxima ejecución** — Usa el parser de
 *    cron liviano incluido ({@link parseCron}, {@link nextCronTick}) para
 *    calcular el timestamp `nextRunAt` tras cada ejecución o cuando se
 *    registra un trabajo nuevo.
 *
 * 3. **Prevención de solapamiento** — Antes de despachar un trabajo, el
 *    programador verifica si existe una ejecución `running` para el mismo
 *    trabajo. Si existe, el trabajo se omite en ese tick.
 *
 * 4. **Registro de ejecuciones** — Cada ejecución crea una fila en
 *    `plugin_job_runs`: `queued` → `running` → `succeeded` | `failed`. Se
 *    capturan la duración y el error.
 *
 * 5. **Integración con el ciclo de vida** — El programador expone
 *    `registerPlugin()` y `unregisterPlugin()` para que el manejador de
 *    ciclo de vida del host conecte la programación de trabajos cuando los
 *    plugins inician/detienen. Al registrar, el programador calcula
 *    `nextRunAt` para todos los trabajos activos que aún no lo tengan.
 *
 * @see PLUGIN_SPEC.md §17 — Trabajos programados
 * @see ./plugin-job-store.ts — Capa de persistencia
 * @see ./cron.ts — Utilidades de parseo de cron
 */

import { and, eq, lte, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { pluginJobs, pluginJobRuns } from "@paperclipai/db";
import type { PluginJobStore } from "./plugin-job-store.js";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
import { parseCron, nextCronTick, validateCron } from "./cron.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Intervalo por defecto entre ticks del programador (30 segundos). */
const DEFAULT_TICK_INTERVAL_MS = 30_000;

/** Timeout por defecto para una llamada RPC runJob (5 minutos). */
const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1_000;

/** Número máximo de ejecuciones de trabajos concurrentes entre todos los plugins. */
const DEFAULT_MAX_CONCURRENT_JOBS = 10;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Opciones para crear un PluginJobScheduler.
 */
export interface PluginJobSchedulerOptions {
  /** Instancia de base de datos Drizzle. */
  db: Db;
  /** Capa de persistencia para trabajos y ejecuciones. */
  jobStore: PluginJobStore;
  /** Manejador de procesos worker para llamadas RPC. */
  workerManager: PluginWorkerManager;
  /** Intervalo entre ticks del programador en ms (por defecto: 30s). */
  tickIntervalMs?: number;
  /** Timeout para llamadas RPC de trabajos individuales en ms (por defecto: 5min). */
  jobTimeoutMs?: number;
  /** Número máximo de ejecuciones de trabajos concurrentes (por defecto: 10). */
  maxConcurrentJobs?: number;
}

/**
 * Resultado de un disparo manual de trabajo.
 */
export interface TriggerJobResult {
  /** El ID de la ejecución creada. */
  runId: string;
  /** El ID del trabajo que se disparó. */
  jobId: string;
}

/**
 * Información de diagnóstico sobre el programador.
 */
export interface SchedulerDiagnostics {
  /** Si el bucle de ticks está corriendo. */
  running: boolean;
  /** Número de trabajos ejecutándose actualmente. */
  activeJobCount: number;
  /** Conjunto de IDs de trabajos actualmente en curso. */
  activeJobIds: string[];
  /** Número total de ticks ejecutados desde el inicio. */
  tickCount: number;
  /** Timestamp del último tick (ISO 8601). */
  lastTickAt: string | null;
}

// ---------------------------------------------------------------------------
// Programador
// ---------------------------------------------------------------------------

/**
 * La interfaz pública del programador de trabajos.
 */
export interface PluginJobScheduler {
  /**
   * Inicia el bucle de ticks del programador.
   *
   * Es seguro llamarlo múltiples veces — las llamadas subsiguientes son
   * no-ops.
   */
  start(): void;

  /**
   * Detiene el bucle de ticks del programador.
   *
   * Las ejecuciones de trabajos en curso NO se cancelan — se les permite
   * terminar naturalmente. El bucle de ticks simplemente deja de dispararse.
   */
  stop(): void;

  /**
   * Registra un plugin en el programador.
   *
   * Calcula `nextRunAt` para todos los trabajos activos que no lo tengan.
   * Normalmente se llama después de que el proceso worker de un plugin
   * inicia y se ha llamado a `syncJobDeclarations()`.
   *
   * @param pluginId - UUID del plugin
   */
  registerPlugin(pluginId: string): Promise<void>;

  /**
   * Da de baja un plugin del programador.
   *
   * Cancela cualquier ejecución en curso del plugin y elimina el estado de
   * seguimiento.
   *
   * @param pluginId - UUID del plugin
   */
  unregisterPlugin(pluginId: string): Promise<void>;

  /**
   * Dispara manualmente un trabajo específico (fuera del cronograma cron).
   *
   * Crea una ejecución con `trigger: "manual"` y la despacha de inmediato,
   * respetando el chequeo de prevención de solapamiento.
   *
   * @param jobId - UUID del trabajo a disparar
   * @param trigger - Qué disparó esta ejecución (por defecto: "manual")
   * @returns La información de la ejecución creada
   * @throws {Error} si el trabajo no se encuentra, no está activo o ya está
   *   en ejecución
   */
  triggerJob(jobId: string, trigger?: "manual" | "retry"): Promise<TriggerJobResult>;

  /**
   * Ejecuta un solo tick del programador de inmediato (para pruebas).
   *
   * @internal
   */
  tick(): Promise<void>;

  /**
   * Obtiene información de diagnóstico sobre el estado del programador.
   */
  diagnostics(): SchedulerDiagnostics;
}

// ---------------------------------------------------------------------------
// Implementación
// ---------------------------------------------------------------------------

/**
 * Crea un nuevo PluginJobScheduler.
 *
 * @example
 * ```ts
 * const scheduler = createPluginJobScheduler({
 *   db,
 *   jobStore,
 *   workerManager,
 * });
 *
 * // Inicia el bucle de ticks
 * scheduler.start();
 *
 * // Cuando un plugin se conecta, regístralo
 * await scheduler.registerPlugin(pluginId);
 *
 * // Dispara manualmente un trabajo
 * const { runId } = await scheduler.triggerJob(jobId);
 *
 * // Al apagar el servidor
 * scheduler.stop();
 * ```
 */
export function createPluginJobScheduler(
  options: PluginJobSchedulerOptions,
): PluginJobScheduler {
  const {
    db,
    jobStore,
    workerManager,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    jobTimeoutMs = DEFAULT_JOB_TIMEOUT_MS,
    maxConcurrentJobs = DEFAULT_MAX_CONCURRENT_JOBS,
  } = options;

  const log = logger.child({ service: "plugin-job-scheduler" });

  // -----------------------------------------------------------------------
  // Estado
  // -----------------------------------------------------------------------

  /** Manejador del temporizador para el bucle de ticks. */
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  /** Si el programador está corriendo. */
  let running = false;

  /** Conjunto de IDs de trabajos ejecutándose actualmente (para prevención de solapamiento). */
  const activeJobs = new Set<string>();

  /** Número total de ticks desde el inicio. */
  let tickCount = 0;

  /** Timestamp del último tick. */
  let lastTickAt: Date | null = null;

  /** Protección contra ejecución concurrente de ticks. */
  let tickInProgress = false;

  // -----------------------------------------------------------------------
  // Núcleo: tick
  // -----------------------------------------------------------------------

  /**
   * Un solo tick del programador. Busca trabajos vencidos y los despacha.
   */
  async function tick(): Promise<void> {
    // Evita ticks solapados (en caso de que un tick tarde más que el intervalo)
    if (tickInProgress) {
      log.debug("omitido el tick — el tick anterior sigue en curso");
      return;
    }

    tickInProgress = true;
    tickCount++;
    lastTickAt = new Date();

    try {
      const now = new Date();

      // Busca trabajos cuyo nextRunAt ya pasó y estén activos.
      // Incluimos trabajos con nextRunAt nulo ya que pueden haberse
      // registrado recién y necesitar el cálculo de su primera ejecución.
      const dueJobs = await db
        .select()
        .from(pluginJobs)
        .where(
          and(
            eq(pluginJobs.status, "active"),
            lte(pluginJobs.nextRunAt, now),
          ),
        );

      if (dueJobs.length === 0) {
        return;
      }

      log.debug({ count: dueJobs.length }, "trabajos vencidos encontrados");

      // Despacha cada trabajo vencido (respetando límites de concurrencia)
      const dispatches: Promise<void>[] = [];

      for (const job of dueJobs) {
        // Límite de concurrencia
        if (activeJobs.size >= maxConcurrentJobs) {
          log.warn(
            { maxConcurrentJobs, activeJobCount: activeJobs.size },
            "máximo de trabajos concurrentes alcanzado, difiriendo los trabajos restantes",
          );
          break;
        }

        // Prevención de solapamiento: omite si este trabajo ya está en ejecución
        if (activeJobs.has(job.id)) {
          log.debug(
            { jobId: job.id, jobKey: job.jobKey, pluginId: job.pluginId },
            "omitido el trabajo — ya está en ejecución (prevención de solapamiento)",
          );
          continue;
        }

        // Verifica si el worker está disponible
        if (!workerManager.isRunning(job.pluginId)) {
          log.debug(
            { jobId: job.id, pluginId: job.pluginId },
            "omitido el trabajo — el worker no está en ejecución",
          );
          continue;
        }

        // Valida la expresión cron antes de despachar
        if (!job.schedule) {
          log.warn(
            { jobId: job.id, jobKey: job.jobKey },
            "omitido el trabajo — no hay cronograma definido",
          );
          continue;
        }

        dispatches.push(dispatchJob(job));
      }

      if (dispatches.length > 0) {
        await Promise.allSettled(dispatches);
      }
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "error en el tick del programador",
      );
    } finally {
      tickInProgress = false;
    }
  }

  // -----------------------------------------------------------------------
  // Núcleo: despachar un solo trabajo
  // -----------------------------------------------------------------------

  /**
   * Despacha una sola ejecución de trabajo — crea el registro de ejecución,
   * llama al worker, registra el resultado y avanza el puntero de
   * programación.
   */
  async function dispatchJob(
    job: typeof pluginJobs.$inferSelect,
  ): Promise<void> {
    const { id: jobId, pluginId, jobKey, schedule } = job;
    const jobLog = log.child({ jobId, pluginId, jobKey });

    // Marca como activo (prevención de solapamiento)
    activeJobs.add(jobId);

    let runId: string | undefined;
    const startedAt = Date.now();

    try {
      // 1. Crea el registro de ejecución
      const run = await jobStore.createRun({
        jobId,
        pluginId,
        trigger: "schedule",
      });
      runId = run.id;

      jobLog.info({ runId }, "despachando trabajo programado");

      // 2. Marca la ejecución como en curso
      await jobStore.markRunning(runId);

      // 3. Llama al worker vía RPC
      await workerManager.call(
        pluginId,
        "runJob",
        {
          job: {
            jobKey,
            runId,
            trigger: "schedule" as const,
            scheduledAt: (job.nextRunAt ?? new Date()).toISOString(),
          },
        },
        jobTimeoutMs,
      );

      // 4. Marca la ejecución como exitosa
      const durationMs = Date.now() - startedAt;
      await jobStore.completeRun(runId, {
        status: "succeeded",
        durationMs,
      });

      jobLog.info({ runId, durationMs }, "trabajo completado exitosamente");
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = err instanceof Error ? err.message : String(err);

      jobLog.error(
        { runId, durationMs, err: errorMessage },
        "falló la ejecución del trabajo",
      );

      // Registra el fallo
      if (runId) {
        try {
          await jobStore.completeRun(runId, {
            status: "failed",
            error: errorMessage,
            durationMs,
          });
        } catch (completeErr) {
          jobLog.error(
            {
              runId,
              err: completeErr instanceof Error ? completeErr.message : String(completeErr),
            },
            "no se pudo registrar el fallo del trabajo",
          );
        }
      }
    } finally {
      // Quita del conjunto de activos
      activeJobs.delete(jobId);

      // 5. Siempre avanza el puntero de programación (incluso en fallo)
      try {
        await advanceSchedulePointer(job);
      } catch (err) {
        jobLog.error(
          { err: err instanceof Error ? err.message : String(err) },
          "no se pudo avanzar el puntero de programación",
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Núcleo: disparo manual
  // -----------------------------------------------------------------------

  async function triggerJob(
    jobId: string,
    trigger: "manual" | "retry" = "manual",
  ): Promise<TriggerJobResult> {
    const job = await jobStore.getJobById(jobId);
    if (!job) {
      throw new Error(`Trabajo no encontrado: ${jobId}`);
    }

    if (job.status !== "active") {
      throw new Error(
        `El trabajo "${job.jobKey}" no está activo (estado: ${job.status})`,
      );
    }

    // Prevención de solapamiento
    if (activeJobs.has(jobId)) {
      throw new Error(
        `El trabajo "${job.jobKey}" ya está en ejecución — no se puede disparar mientras está en curso`,
      );
    }

    // También revisa la BD por ejecuciones en curso (defensivo — cubre
    // múltiples instancias)
    const existingRuns = await db
      .select()
      .from(pluginJobRuns)
      .where(
        and(
          eq(pluginJobRuns.jobId, jobId),
          eq(pluginJobRuns.status, "running"),
        ),
      );

    if (existingRuns.length > 0) {
      throw new Error(
        `El trabajo "${job.jobKey}" ya tiene una ejecución en curso — no se puede disparar mientras está en curso`,
      );
    }

    // Verifica la disponibilidad del worker
    if (!workerManager.isRunning(job.pluginId)) {
      throw new Error(
        `El worker del plugin "${job.pluginId}" no está en ejecución — no se puede disparar el trabajo`,
      );
    }

    // Crea la ejecución y despacha (no bloqueante)
    const run = await jobStore.createRun({
      jobId,
      pluginId: job.pluginId,
      trigger,
    });

    // Despacha en segundo plano — no bloquea al llamador
    void dispatchManualRun(job, run.id, trigger);

    return { runId: run.id, jobId };
  }

  /**
   * Despacha una ejecución de trabajo disparada manualmente.
   */
  async function dispatchManualRun(
    job: typeof pluginJobs.$inferSelect,
    runId: string,
    trigger: "manual" | "retry",
  ): Promise<void> {
    const { id: jobId, pluginId, jobKey } = job;
    const jobLog = log.child({ jobId, pluginId, jobKey, runId, trigger });

    activeJobs.add(jobId);
    const startedAt = Date.now();

    try {
      await jobStore.markRunning(runId);

      await workerManager.call(
        pluginId,
        "runJob",
        {
          job: {
            jobKey,
            runId,
            trigger,
            scheduledAt: new Date().toISOString(),
          },
        },
        jobTimeoutMs,
      );

      const durationMs = Date.now() - startedAt;
      await jobStore.completeRun(runId, {
        status: "succeeded",
        durationMs,
      });

      jobLog.info({ durationMs }, "trabajo manual completado exitosamente");
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = err instanceof Error ? err.message : String(err);
      jobLog.error({ durationMs, err: errorMessage }, "falló el trabajo manual");

      try {
        await jobStore.completeRun(runId, {
          status: "failed",
          error: errorMessage,
          durationMs,
        });
      } catch (completeErr) {
        jobLog.error(
          {
            err: completeErr instanceof Error ? completeErr.message : String(completeErr),
          },
          "no se pudo registrar el fallo del trabajo manual",
        );
      }
    } finally {
      activeJobs.delete(jobId);
    }
  }

  // -----------------------------------------------------------------------
  // Gestión del puntero de programación
  // -----------------------------------------------------------------------

  /**
   * Avanza los timestamps `lastRunAt` y `nextRunAt` de un trabajo tras una
   * ejecución.
   */
  async function advanceSchedulePointer(
    job: typeof pluginJobs.$inferSelect,
  ): Promise<void> {
    const now = new Date();
    let nextRunAt: Date | null = null;

    if (job.schedule) {
      const validationError = validateCron(job.schedule);
      if (validationError) {
        log.warn(
          { jobId: job.id, schedule: job.schedule, error: validationError },
          "cronograma cron inválido — no se puede calcular la próxima ejecución",
        );
      } else {
        const cron = parseCron(job.schedule);
        nextRunAt = nextCronTick(cron, now);
      }
    }

    await jobStore.updateRunTimestamps(job.id, now, nextRunAt);
  }

  /**
   * Asegura que todos los trabajos activos de un plugin tengan un valor de
   * `nextRunAt`. Se llama cuando un plugin se registra en el programador.
   */
  async function ensureNextRunTimestamps(pluginId: string): Promise<void> {
    const jobs = await jobStore.listJobs(pluginId, "active");

    for (const job of jobs) {
      // Omite trabajos que ya tengan un nextRunAt válido en el futuro
      if (job.nextRunAt && job.nextRunAt.getTime() > Date.now()) {
        continue;
      }

      // Omite trabajos sin cronograma
      if (!job.schedule) {
        continue;
      }

      const validationError = validateCron(job.schedule);
      if (validationError) {
        log.warn(
          { jobId: job.id, jobKey: job.jobKey, schedule: job.schedule, error: validationError },
          "omitido el trabajo con cronograma cron inválido",
        );
        continue;
      }

      const cron = parseCron(job.schedule);
      const nextRunAt = nextCronTick(cron, new Date());

      if (nextRunAt) {
        await jobStore.updateRunTimestamps(
          job.id,
          job.lastRunAt ?? new Date(0),
          nextRunAt,
        );
        log.debug(
          { jobId: job.id, jobKey: job.jobKey, nextRunAt: nextRunAt.toISOString() },
          "nextRunAt calculado para el trabajo",
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Registro de plugins
  // -----------------------------------------------------------------------

  async function registerPlugin(pluginId: string): Promise<void> {
    log.info({ pluginId }, "registrando plugin en el programador de trabajos");
    await ensureNextRunTimestamps(pluginId);
  }

  async function unregisterPlugin(pluginId: string): Promise<void> {
    log.info({ pluginId }, "dando de baja plugin del programador de trabajos");

    // Cancela cualquier registro de ejecución en curso de este plugin que
    // siga encolado o en ejecución. Los trabajos activos en memoria
    // terminarán naturalmente.
    try {
      const runningRuns = await db
        .select()
        .from(pluginJobRuns)
        .where(
          and(
            eq(pluginJobRuns.pluginId, pluginId),
            or(
              eq(pluginJobRuns.status, "running"),
              eq(pluginJobRuns.status, "queued"),
            ),
          ),
        );

      for (const run of runningRuns) {
        await jobStore.completeRun(run.id, {
          status: "cancelled",
          error: "Plugin dado de baja",
          durationMs: run.startedAt
            ? Date.now() - run.startedAt.getTime()
            : null,
        });
      }
    } catch (err) {
      log.error(
        {
          pluginId,
          err: err instanceof Error ? err.message : String(err),
        },
        "error al cancelar ejecuciones en curso durante la baja",
      );
    }

    // Elimina cualquier seguimiento activo de trabajos de este plugin
    const jobs = await jobStore.listJobs(pluginId);
    for (const job of jobs) {
      activeJobs.delete(job.id);
    }
  }

  // -----------------------------------------------------------------------
  // Ciclo de vida: start / stop
  // -----------------------------------------------------------------------

  function start(): void {
    if (running) {
      log.debug("el programador ya está en ejecución");
      return;
    }

    running = true;
    tickTimer = setInterval(() => {
      void tick();
    }, tickIntervalMs);

    log.info(
      { tickIntervalMs, maxConcurrentJobs },
      "programador de trabajos de plugins iniciado",
    );
  }

  function stop(): void {
    // Siempre limpia el temporizador de forma defensiva, incluso si
    // `running` ya es false, para evitar temporizadores de intervalo
    // filtrados.
    if (tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }

    if (!running) return;
    running = false;

    log.info(
      { activeJobCount: activeJobs.size },
      "programador de trabajos de plugins detenido",
    );
  }

  // -----------------------------------------------------------------------
  // Diagnóstico
  // -----------------------------------------------------------------------

  function diagnostics(): SchedulerDiagnostics {
    return {
      running,
      activeJobCount: activeJobs.size,
      activeJobIds: [...activeJobs],
      tickCount,
      lastTickAt: lastTickAt?.toISOString() ?? null,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    start,
    stop,
    registerPlugin,
    unregisterPlugin,
    triggerJob,
    tick,
    diagnostics,
  };
}
