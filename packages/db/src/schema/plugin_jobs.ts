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
import { plugins } from "./plugins.js";
import type { PluginJobStatus, PluginJobRunStatus, PluginJobRunTrigger } from "@paperclipai/shared";

/**
 * Tabla `plugin_jobs`: registro y configuración en tiempo de ejecución de
 * los trabajos programados que declaran los plugins en sus manifiestos.
 *
 * Cada fila representa una entrada de trabajo programado de un plugin. La
 * `job_key` coincide con la clave declarada en el arreglo `jobs` del manifiesto.
 * La columna `schedule` almacena la expresión cron o cadena de intervalo
 * que usa el programador de trabajos para decidir cuándo ejecutar el trabajo.
 *
 * Valores de estado:
 * - `active`: el trabajo está habilitado y se ejecutará según lo programado
 * - `paused`: el trabajo está deshabilitado temporalmente por el operador
 * - `error`: el trabajo se deshabilitó por fallos repetidos
 *
 * @see PLUGIN_SPEC.md §21.3 — `plugin_jobs`
 */
export const pluginJobs = pgTable(
  "plugin_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK al plugin propietario. Se propaga al eliminar. */
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    /** Identificador que coincide con la clave en el arreglo `jobs` del manifiesto del plugin. */
    jobKey: text("job_key").notNull(),
    /** Expresión cron (p. ej. `"0 * * * *"`) o cadena de intervalo. */
    schedule: text("schedule").notNull(),
    /** Estado actual de la programación. */
    status: text("status").$type<PluginJobStatus>().notNull().default("active"),
    /** Marca de tiempo de la ejecución exitosa más reciente. */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** Marca de tiempo precalculada de la próxima ejecución programada. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pluginIdx: index("plugin_jobs_plugin_idx").on(table.pluginId),
    nextRunIdx: index("plugin_jobs_next_run_idx").on(table.nextRunAt),
    uniqueJobIdx: uniqueIndex("plugin_jobs_unique_idx").on(table.pluginId, table.jobKey),
  }),
);

/**
 * Tabla `plugin_job_runs`: historial inmutable de ejecuciones de los trabajos propiedad de plugins.
 *
 * Cada fila se crea cuando comienza una ejecución y se actualiza cuando termina.
 * Las filas nunca se modifican después de que `status` alcance un valor terminal
 * (`succeeded` | `failed` | `cancelled`).
 *
 * Valores de activación:
 * - `scheduled`: activado automáticamente por el programador de cron/intervalos
 * - `manual`: activado por un operador desde la interfaz de administración o la API
 *
 * @see PLUGIN_SPEC.md §21.3 — `plugin_job_runs`
 */
export const pluginJobRuns = pgTable(
  "plugin_job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK a la definición del trabajo padre. Se propaga al eliminar. */
    jobId: uuid("job_id")
      .notNull()
      .references(() => pluginJobs.id, { onDelete: "cascade" }),
    /** FK desnormalizada al plugin propietario para consultas eficientes. Se propaga al eliminar. */
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    /** Qué causó el inicio de esta ejecución (`"scheduled"` o `"manual"`). */
    trigger: text("trigger").$type<PluginJobRunTrigger>().notNull(),
    /** Estado actual del ciclo de vida de esta ejecución. */
    status: text("status").$type<PluginJobRunStatus>().notNull().default("pending"),
    /** Duración en milisegundos según el reloj del sistema. Nula hasta que la ejecución termine. */
    durationMs: integer("duration_ms"),
    /** Mensaje de error si `status === "failed"`. */
    error: text("error"),
    /** Lista ordenada de líneas de registro emitidas durante esta ejecución. */
    logs: jsonb("logs").$type<string[]>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    jobIdx: index("plugin_job_runs_job_idx").on(table.jobId),
    pluginIdx: index("plugin_job_runs_plugin_idx").on(table.pluginId),
    statusIdx: index("plugin_job_runs_status_idx").on(table.status),
  }),
);
