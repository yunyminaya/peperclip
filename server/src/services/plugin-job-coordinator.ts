/**
 * PluginJobCoordinator — conecta el manejador de ciclo de vida de plugins
 * con el programador de trabajos y el almacén de trabajos.
 *
 * Este servicio escucha eventos del ciclo de vida y realiza las
 * operaciones correspondientes del programador y del almacén de trabajos:
 *
 * - **plugin.loaded** → sincroniza las declaraciones de trabajos del
 *   manifiesto, luego registra el plugin en el programador (calcula
 *   `nextRunAt` para los trabajos activos).
 *
 * - **plugin.disabled / plugin.unloaded** → da de baja el plugin del
 *   programador (cancela ejecuciones en curso, limpia el estado de
 *   seguimiento).
 *
 * ## ¿Por qué un coordinador separado?
 *
 * El manejador de ciclo de vida, el programador y el almacén de trabajos son
 * servicios independientes con límites limpios de responsabilidad única. El
 * coordinador provee el "pegamento" entre ellos sin agregar acoplamiento.
 * Este patrón se usa en todo Paperclip (p. ej. el servicio de heartbeat
 * coordina temporizadores + runs).
 *
 * @see PLUGIN_SPEC.md §17 — Trabajos programados
 * @see ./plugin-job-scheduler.ts — Servicio de programador
 * @see ./plugin-job-store.ts — Capa de persistencia
 * @see ./plugin-lifecycle.ts — Máquina de estados de plugins
 */

import type { PluginLifecycleManager } from "./plugin-lifecycle.js";
import type { PluginJobScheduler } from "./plugin-job-scheduler.js";
import type { PluginJobStore } from "./plugin-job-store.js";
import { pluginRegistryService } from "./plugin-registry.js";
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Opciones para crear un PluginJobCoordinator.
 */
export interface PluginJobCoordinatorOptions {
  /** Instancia de base de datos Drizzle. */
  db: Db;
  /** El manejador de ciclo de vida de plugins a escuchar. */
  lifecycle: PluginLifecycleManager;
  /** El programador de trabajos para registrar/dar de baja plugins. */
  scheduler: PluginJobScheduler;
  /** El almacén de trabajos para sincronizar declaraciones. */
  jobStore: PluginJobStore;
}

/**
 * La interfaz pública del coordinador de trabajos.
 */
export interface PluginJobCoordinator {
  /**
   * Empieza a escuchar eventos del ciclo de vida.
   *
   * Esto conecta los manejadores de eventos `plugin.loaded`,
   * `plugin.disabled` y `plugin.unloaded`.
   */
  start(): void;

  /**
   * Deja de escuchar eventos del ciclo de vida.
   *
   * Elimina todas las suscripciones de eventos agregadas por `start()`.
   */
  stop(): void;
}

// ---------------------------------------------------------------------------
// Implementación
// ---------------------------------------------------------------------------

/**
 * Crea un PluginJobCoordinator.
 *
 * @example
 * ```ts
 * const coordinator = createPluginJobCoordinator({
 *   db,
 *   lifecycle,
 *   scheduler,
 *   jobStore,
 * });
 *
 * // Empieza a escuchar eventos del ciclo de vida
 * coordinator.start();
 *
 * // Al apagar el servidor
 * coordinator.stop();
 * ```
 */
export function createPluginJobCoordinator(
  options: PluginJobCoordinatorOptions,
): PluginJobCoordinator {
  const { db, lifecycle, scheduler, jobStore } = options;
  const log = logger.child({ service: "plugin-job-coordinator" });
  const registry = pluginRegistryService(db);

  // -----------------------------------------------------------------------
  // Manejadores de eventos
  // -----------------------------------------------------------------------

  /**
   * Cuando se carga un plugin (transiciona a `ready`):
   * 1. Busca el manifiesto en el registro
   * 2. Sincroniza las declaraciones de trabajos del manifiesto a la BD
   * 3. Registra el plugin en el programador (calcula nextRunAt)
   */
  async function onPluginLoaded(payload: { pluginId: string; pluginKey: string }): Promise<void> {
    const { pluginId, pluginKey } = payload;
    log.info({ pluginId, pluginKey }, "plugin cargado — sincronizando trabajos y registrando en el programador");

    try {
      // Obtiene el manifiesto del registro
      const plugin = await registry.getById(pluginId);
      if (!plugin?.manifestJson) {
        log.warn({ pluginId, pluginKey }, "plugin cargado pero no se encontró manifiesto — omitiendo sincronización de trabajos");
        return;
      }

      // Sincroniza las declaraciones de trabajos del manifiesto
      const manifest = plugin.manifestJson;
      const jobDeclarations = manifest.jobs ?? [];

      if (jobDeclarations.length > 0) {
        log.info(
          { pluginId, pluginKey, jobCount: jobDeclarations.length },
          "sincronizando declaraciones de trabajos desde el manifiesto",
        );
        await jobStore.syncJobDeclarations(pluginId, jobDeclarations);
      }

      // Registra en el programador (calcula nextRunAt para trabajos activos)
      await scheduler.registerPlugin(pluginId);
    } catch (err) {
      log.error(
        {
          pluginId,
          pluginKey,
          err: err instanceof Error ? err.message : String(err),
        },
        "no se pudieron sincronizar los trabajos ni registrar el plugin en el programador",
      );
    }
  }

  /**
   * Cuando se deshabilita un plugin (transiciona a `error` con "deshabilitado
   * por el operador" o error genuino): da de baja del programador.
   */
  async function onPluginDisabled(payload: {
    pluginId: string;
    pluginKey: string;
    reason?: string;
  }): Promise<void> {
    const { pluginId, pluginKey, reason } = payload;
    log.info(
      { pluginId, pluginKey, reason },
      "plugin deshabilitado — dando de baja del programador",
    );

    try {
      await scheduler.unregisterPlugin(pluginId);
    } catch (err) {
      log.error(
        {
          pluginId,
          pluginKey,
          err: err instanceof Error ? err.message : String(err),
        },
        "no se pudo dar de baja el plugin del programador",
      );
    }
  }

  /**
   * Cuando se descarga un plugin (desinstalado): da de baja del programador.
   */
  async function onPluginUnloaded(payload: {
    pluginId: string;
    pluginKey: string;
    removeData: boolean;
  }): Promise<void> {
    const { pluginId, pluginKey, removeData } = payload;
    log.info(
      { pluginId, pluginKey, removeData },
      "plugin descargado — dando de baja del programador",
    );

    try {
      await scheduler.unregisterPlugin(pluginId);

      // Si se están purgando los datos, también elimina todas las
      // definiciones de trabajos y ejecuciones
      if (removeData) {
        log.info({ pluginId, pluginKey }, "purgando datos de trabajos del plugin desinstalado");
        await jobStore.deleteAllJobs(pluginId);
      }
    } catch (err) {
      log.error(
        {
          pluginId,
          pluginKey,
          err: err instanceof Error ? err.message : String(err),
        },
        "no se pudo dar de baja el plugin del programador durante la descarga",
      );
    }
  }

  // -----------------------------------------------------------------------
  // Estado
  // -----------------------------------------------------------------------

  let attached = false;

  // Necesitamos referencias estables para on/off ya que el manejador de ciclo
  // de vida las usa para coincidir. Envolvemos los manejadores async en
  // envoltorios sync que son fire-and-forget (absorbiendo rechazos no
  // manejados vía el try/catch dentro de cada manejador).
  const boundOnLoaded = (payload: { pluginId: string; pluginKey: string }) => {
    void onPluginLoaded(payload);
  };
  const boundOnDisabled = (payload: { pluginId: string; pluginKey: string; reason?: string }) => {
    void onPluginDisabled(payload);
  };
  const boundOnUnloaded = (payload: { pluginId: string; pluginKey: string; removeData: boolean }) => {
    void onPluginUnloaded(payload);
  };

  // -----------------------------------------------------------------------
  // API pública
  // -----------------------------------------------------------------------

  return {
    start(): void {
      if (attached) return;
      attached = true;

      lifecycle.on("plugin.loaded", boundOnLoaded);
      lifecycle.on("plugin.disabled", boundOnDisabled);
      lifecycle.on("plugin.unloaded", boundOnUnloaded);

      log.info("coordinador de trabajos de plugins iniciado — escuchando eventos del ciclo de vida");
    },

    stop(): void {
      if (!attached) return;
      attached = false;

      lifecycle.off("plugin.loaded", boundOnLoaded);
      lifecycle.off("plugin.disabled", boundOnDisabled);
      lifecycle.off("plugin.unloaded", boundOnUnloaded);

      log.info("coordinador de trabajos de plugins detenido");
    },
  };
}
