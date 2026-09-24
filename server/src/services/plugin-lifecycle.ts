/**
 * PluginLifecycleManager — controlador de máquina de estados para las
 * transiciones de estado de plugins y la coordinación de procesos worker.
 *
 * Cada plugin se mueve por una máquina de estados bien definida:
 *
 * ```
 *   installed ──→ ready ──→ disabled
 *       │            │         │
 *       │            ├──→ error│
 *       │            ↓         │
 *       │     upgrade_pending  │
 *       │            │         │
 *       ↓            ↓         ↓
 *              uninstalled
 * ```
 *
 * El administrador de ciclo de vida:
 *
 * 1. **Valida transiciones** — Solo se permiten las transiciones definidas
 *    en `VALID_TRANSITIONS`; las transiciones inválidas lanzan error.
 *
 * 2. **Coordina workers** — Cuando un plugin pasa a `ready`, se inicia su
 *    proceso worker. Cuando sale de `ready`, el worker se detiene
 *    elegantemente.
 *
 * 3. **Emite eventos** — Los eventos `plugin.loaded`, `plugin.enabled`,
 *    `plugin.disabled`, `plugin.unloaded`, `plugin.status_changed` se emiten
 *    para que otros servicios (coordinador de trabajos, despachador de
 *    herramientas, bus de eventos) puedan reaccionar en consecuencia.
 *
 * 4. **Persiste el estado** — Los cambios de estado se escriben en la base
 *    de datos a través del servicio de registro de plugins.
 *
 * @see PLUGIN_SPEC.md §12 — Modelo de procesos
 * @see PLUGIN_SPEC.md §12.5 — Política de apagado elegante
 */
import { EventEmitter } from "node:events";
import type { Db } from "@paperclipai/db";
import type {
  PluginStatus,
  PluginRecord,
  PaperclipPluginManifestV1,
} from "@paperclipai/shared";
import { pluginRegistryService } from "./plugin-registry.js";
import { pluginLoader, type PluginLoader } from "./plugin-loader.js";
import type { PluginWorkerManager, WorkerStartOptions } from "./plugin-worker-manager.js";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Máquina de estados del ciclo de vida
// ---------------------------------------------------------------------------

/**
 * Transiciones de estado válidas para el ciclo de vida del plugin.
 *
 *   installed → ready       (la carga inicial tiene éxito)
 *   installed → error       (la carga inicial falla)
 *   installed → uninstalled (aborta la instalación)
 *
 *   ready → disabled        (el operador desactiva el plugin)
 *   ready → error           (fallo en tiempo de ejecución)
 *   ready → upgrade_pending (actualización con nuevas capacidades)
 *   ready → uninstalled     (desinstalación)
 *
 *   disabled → ready        (el operador reactiva el plugin)
 *   disabled → uninstalled  (desinstalación estando desactivado)
 *
 *   error → ready           (reintento / recuperación)
 *   error → uninstalled     (se rinde y desinstala)
 *
 *   upgrade_pending → ready       (el operador aprueba nuevas capacidades)
 *   upgrade_pending → error       (el worker de actualización falla)
 *   upgrade_pending → uninstalled (rechaza la actualización y desinstala)
 *
 *   uninstalled → installed (reinstalación)
 */
const VALID_TRANSITIONS: Record<string, readonly PluginStatus[]> = {
  installed: ["ready", "error", "uninstalled"],
  ready: ["ready", "disabled", "error", "upgrade_pending", "uninstalled"],
  disabled: ["ready", "uninstalled"],
  error: ["ready", "uninstalled"],
  upgrade_pending: ["ready", "error", "uninstalled"],
  uninstalled: ["installed"], // reinstall
};

/**
 * Comprueba si una transición de `from` → `to` es válida.
 */
function isValidTransition(from: PluginStatus, to: PluginStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Eventos de ciclo de vida
// ---------------------------------------------------------------------------

/**
 * Eventos emitidos por el PluginLifecycleManager.
 * Los consumidores pueden suscribirse a estos para actualizaciones de
 * tablas de ruteo, notificaciones de refresco de UI y observabilidad.
 */
export interface PluginLifecycleEvents {
  /** Se emite tras cargar un plugin (installed → ready). */
  "plugin.loaded": { pluginId: string; pluginKey: string };
  /** Se emite tras pasar un plugin a ready (activado). */
  "plugin.enabled": { pluginId: string; pluginKey: string };
  /** Se emite tras desactivar un plugin (ready → disabled). */
  "plugin.disabled": { pluginId: string; pluginKey: string; reason?: string };
  /** Se emite tras descargar un plugin (cualquiera → uninstalled). */
  "plugin.unloaded": { pluginId: string; pluginKey: string; removeData: boolean };
  /** Se emite en cualquier cambio de estado. */
  "plugin.status_changed": {
    pluginId: string;
    pluginKey: string;
    previousStatus: PluginStatus;
    newStatus: PluginStatus;
  };
  /** Se emite cuando un plugin entra en estado de error. */
  "plugin.error": { pluginId: string; pluginKey: string; error: string };
  /** Se emite cuando un plugin entra en upgrade_pending. */
  "plugin.upgrade_pending": { pluginId: string; pluginKey: string };
  /** Se emite cuando se ha iniciado el proceso worker de un plugin. */
  "plugin.worker_started": { pluginId: string; pluginKey: string };
  /** Se emite cuando se ha detenido el proceso worker de un plugin. */
  "plugin.worker_stopped": { pluginId: string; pluginKey: string };
}

type LifecycleEventName = keyof PluginLifecycleEvents;
type LifecycleEventPayload<K extends LifecycleEventName> = PluginLifecycleEvents[K];

// ---------------------------------------------------------------------------
// PluginLifecycleManager
// ---------------------------------------------------------------------------

export interface PluginLifecycleManager {
  /**
   * Carga un plugin recién instalado — transiciona `installed` → `ready`.
   *
   * Se llama después de que el registro ha persistido el registro inicial
   * de instalación. El llamador debería haber generado ya el worker y
   * realizado los chequeos de salud antes de llamar a esto. Si el worker
   * falla, llame a `markError` en su lugar.
   */
  load(pluginId: string): Promise<PluginRecord>;

  /**
   * Activa un plugin que esté en estado `disabled`, `error` o
   * `upgrade_pending`. Transiciona → `ready`.
   */
  enable(pluginId: string): Promise<PluginRecord>;

  /**
   * Desactiva un plugin en ejecución.
   * Transiciona `ready` → `disabled`.
   */
  disable(pluginId: string, reason?: string): Promise<PluginRecord>;

  /**
   * Descarga (desinstala) un plugin desde cualquier estado activo.
   * Transiciona → `uninstalled`.
   *
   * Cuando `removeData` es true, la fila del plugin y la configuración en
   * cascada se eliminan permanentemente. De lo contrario, un borrado lógico
   * fija el estado en `uninstalled`.
   */
  unload(pluginId: string, removeData?: boolean): Promise<PluginRecord | null>;

  /**
   * Marca un plugin como con error (p. ej. fallo del worker, fallo del
   * chequeo de salud). Transiciona → `error`.
   */
  markError(pluginId: string, error: string): Promise<PluginRecord>;

  /**
   * Marca un plugin como que requiere aprobación de actualización.
   * Transiciona `ready` → `upgrade_pending`.
   */
  markUpgradePending(pluginId: string): Promise<PluginRecord>;

  /**
   * Actualiza un plugin a una versión más nueva.
   * Esto es un marcador que maneja la transición de estado del ciclo de
   * vida. La instalación real del paquete la maneja plugin-loader.
   *
   * Si la actualización agrega nuevas capacidades, transiciona a
   * `upgrade_pending`. De lo contrario, transiciona directamente a `ready`.
   */
  upgrade(pluginId: string, version?: string): Promise<PluginRecord>;

  /**
   * Inicia el proceso worker de un plugin que ya está en estado `ready`.
   *
   * Lo usa la orquestación de arranque del servidor para iniciar workers de
   * plugins que se persistieron como `ready`. Requiere que se haya provisto
   * un `PluginWorkerManager` al momento de la construcción.
   *
   * @param pluginId - El UUID del plugin a iniciar
   * @param options  - Opciones de inicio del worker (ruta del entrypoint, config, etc.)
   * @throws si no hay un administrador de workers configurado o el plugin no está en ready
   */
  startWorker(pluginId: string, options: WorkerStartOptions): Promise<void>;

  /**
   * Detiene el proceso worker de un plugin sin cambiar el estado del ciclo
   * de vida.
   *
   * Se usa durante el apagado del servidor para detener elegantemente todos
   * los workers. No transiciona el estado del plugin — los plugins
   * permanecen en su estado actual para poder reiniciarse en el próximo
   * arranque del servidor.
   *
   * @param pluginId - El UUID del plugin a detener
   */
  stopWorker(pluginId: string): Promise<void>;

  /**
   * Reinicia el proceso worker de un plugin en ejecución.
   *
   * Detiene y vuelve a iniciar el proceso worker. El plugin permanece en
   * estado `ready` durante todo el proceso. Típicamente se llama tras un
   * cambio de configuración.
   *
   * @param pluginId - El UUID del plugin a reiniciar
   * @throws si no hay un administrador de workers configurado o el plugin no está en ready
   */
  restartWorker(pluginId: string): Promise<void>;

  /**
   * Obtiene el estado actual del ciclo de vida de un plugin.
   */
  getStatus(pluginId: string): Promise<PluginStatus | null>;

  /**
   * Comprueba si una transición está permitida desde el estado actual del
   * plugin.
   */
  canTransition(pluginId: string, to: PluginStatus): Promise<boolean>;

  /**
   * Se suscribe a eventos de ciclo de vida.
   */
  on<K extends LifecycleEventName>(
    event: K,
    listener: (payload: LifecycleEventPayload<K>) => void,
  ): void;

  /**
   * Se da de baja de eventos de ciclo de vida.
   */
  off<K extends LifecycleEventName>(
    event: K,
    listener: (payload: LifecycleEventPayload<K>) => void,
  ): void;

  /**
   * Se suscribe una sola vez a un evento de ciclo de vida.
   */
  once<K extends LifecycleEventName>(
    event: K,
    listener: (payload: LifecycleEventPayload<K>) => void,
  ): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Opciones para construir un PluginLifecycleManager.
 */
export interface PluginLifecycleManagerOptions {
  /** Instancia del cargador de plugins. Si se omite usa la predeterminada. */
  loader?: PluginLoader;

  /**
   * Administrador de procesos worker. Cuando se provee, las transiciones de
   * ciclo de vida que ponen un plugin en línea (load, enable,
   * upgrade-to-ready) iniciarán el proceso worker, y las transiciones que
   * sacan un plugin de línea (disable, unload, markError) lo detendrán.
   *
   * Cuando se omite, el administrador de ciclo de vida opera en modo solo
   * de estado — el llamador es responsable de manejar los procesos worker
   * externamente.
   */
  workerManager?: PluginWorkerManager;
}

/**
 * Crea un PluginLifecycleManager.
 *
 * Este servicio orquesta las transiciones de estado de plugins sobre el
 * `pluginRegistryService` (que maneja la persistencia cruda en BD). Hace
 * cumplir la máquina de estados del ciclo de vida, emite eventos para
 * consumidores aguas abajo (tablas de ruteo, UI, observabilidad) y maneja
 * los procesos worker vía el `PluginWorkerManager` cuando se provee uno.
 *
 * Uso:
 * ```ts
 * const lifecycle = pluginLifecycleManager(db, {
 *   workerManager: createPluginWorkerManager(),
 * });
 * lifecycle.on("plugin.enabled", ({ pluginId }) => { ... });
 * await lifecycle.load(pluginId);
 * ```
 *
 * @see PLUGIN_SPEC.md §21.3 — columna `plugins.status`
 * @see PLUGIN_SPEC.md §12 — Modelo de procesos
 */
export function pluginLifecycleManager(
  db: Db,
  options?: PluginLoader | PluginLifecycleManagerOptions,
): PluginLifecycleManager {
  // Soporta la firma heredada: pluginLifecycleManager(db, loader)
  // además de la nueva forma de objeto de opciones.
  let loaderArg: PluginLoader | undefined;
  let workerManager: PluginWorkerManager | undefined;

  if (options && typeof options === "object" && "discoverAll" in options) {
    // Heredado: el segundo arg es un PluginLoader directamente
    loaderArg = options as PluginLoader;
  } else if (options && typeof options === "object") {
    const opts = options as PluginLifecycleManagerOptions;
    loaderArg = opts.loader;
    workerManager = opts.workerManager;
  }

  const registry = pluginRegistryService(db);
  const pluginLoaderInstance = loaderArg ?? pluginLoader(db);
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100); // los plugins pueden tener muchos listeners; 100 es un límite superior seguro

  const log = logger.child({ service: "plugin-lifecycle" });

  // -----------------------------------------------------------------------
  // Utilidades internas
  // -----------------------------------------------------------------------

  async function requirePlugin(pluginId: string): Promise<PluginRecord> {
    const plugin = await registry.getById(pluginId);
    if (!plugin) throw notFound(`Plugin no encontrado: ${pluginId}`);
    return plugin as PluginRecord;
  }

  function assertTransition(plugin: PluginRecord, to: PluginStatus): void {
    if (!isValidTransition(plugin.status, to)) {
      throw badRequest(
        `Transición de ciclo de vida inválida: ${plugin.status} → ${to} para el plugin ${plugin.pluginKey}`,
      );
    }
  }

  async function transition(
    pluginId: string,
    to: PluginStatus,
    lastError: string | null = null,
    existingPlugin?: PluginRecord,
  ): Promise<PluginRecord> {
    const plugin = existingPlugin ?? await requirePlugin(pluginId);
    assertTransition(plugin, to);

    const previousStatus = plugin.status;

    const updated = await registry.updateStatus(pluginId, {
      status: to,
      lastError,
    });

    if (!updated) throw notFound(`Plugin no encontrado tras la actualización de estado: ${pluginId}`);
    const result = updated as PluginRecord;

    log.info(
      { pluginId, pluginKey: result.pluginKey, from: previousStatus, to },
      `ciclo de vida del plugin: ${previousStatus} → ${to}`,
    );

    // Emite el evento genérico status_changed
    emitter.emit("plugin.status_changed", {
      pluginId,
      pluginKey: result.pluginKey,
      previousStatus,
      newStatus: to,
    });

    return result;
  }

  function emitDomain(
    event: LifecycleEventName,
    payload: PluginLifecycleEvents[LifecycleEventName],
  ): void {
    emitter.emit(event, payload);
  }

  // -----------------------------------------------------------------------
  // Utilidades de gestión de workers
  // -----------------------------------------------------------------------

  /**
   * Detiene el worker de un plugin si hay uno en ejecución.
   * Esta es una operación de mejor esfuerzo — si no hay un administrador de
   * workers configurado o ningún worker en ejecución, termina en silencio.
   */
  async function stopWorkerIfRunning(
    pluginId: string,
    pluginKey: string,
  ): Promise<void> {
    if (!workerManager) return;
    if (!workerManager.isRunning(pluginId) && !workerManager.getWorker(pluginId)) return;

    try {
      await workerManager.stopWorker(pluginId);
      log.info({ pluginId, pluginKey }, "ciclo de vida del plugin: worker detenido");
      emitDomain("plugin.worker_stopped", { pluginId, pluginKey });
    } catch (err) {
      log.warn(
        { pluginId, pluginKey, err: err instanceof Error ? err.message : String(err) },
        "ciclo de vida del plugin: no se pudo detener el worker (mejor esfuerzo)",
      );
    }
  }

  async function activateReadyPlugin(pluginId: string): Promise<void> {
    const supportsRuntimeActivation =
      typeof pluginLoaderInstance.hasRuntimeServices === "function"
      && typeof pluginLoaderInstance.loadSingle === "function";
    if (!supportsRuntimeActivation || !pluginLoaderInstance.hasRuntimeServices()) {
      return;
    }

    const loadResult = await pluginLoaderInstance.loadSingle(pluginId);
    if (!loadResult.success) {
      throw new Error(
        loadResult.error
        ?? `No se pudo activar el plugin ${loadResult.plugin.pluginKey}`,
      );
    }
  }

  async function deactivatePluginRuntime(
    pluginId: string,
    pluginKey: string,
  ): Promise<void> {
    const supportsRuntimeDeactivation =
      typeof pluginLoaderInstance.hasRuntimeServices === "function"
      && typeof pluginLoaderInstance.unloadSingle === "function";

    if (supportsRuntimeDeactivation && pluginLoaderInstance.hasRuntimeServices()) {
      await pluginLoaderInstance.unloadSingle(pluginId, pluginKey);
      return;
    }

    await stopWorkerIfRunning(pluginId, pluginKey);
  }

  // -----------------------------------------------------------------------
  // API pública
  // -----------------------------------------------------------------------

  return {
    // -- load -------------------------------------------------------------
    /**
     * load — Transiciona un plugin al estado 'ready' e inicia su worker.
     *
     * Este método se llama después de que un plugin se instaló y validó
     * exitosamente. Marca el plugin como ready en la base de datos e
     * inmediatamente dispara el cargador de plugins para iniciar el proceso
     * worker.
     *
     * @param pluginId - El UUID del plugin a cargar.
     * @returns El registro actualizado del plugin.
     */
    async load(pluginId: string): Promise<PluginRecord> {
      const result = await transition(pluginId, "ready");
      await activateReadyPlugin(pluginId);

      emitDomain("plugin.loaded", {
        pluginId,
        pluginKey: result.pluginKey,
      });
      emitDomain("plugin.enabled", {
        pluginId,
        pluginKey: result.pluginKey,
      });
      return result;
    },

    // -- enable -----------------------------------------------------------
    /**
     * enable — Reactiva un plugin que estaba previamente en estado de error
     * o de actualización.
     *
     * Similar a load(), este método transiciona el plugin a 'ready' e inicia
     * su worker, pero se dirige específicamente a plugins que actualmente
     * están desactivados.
     *
     * @param pluginId - El UUID del plugin a activar.
     * @returns El registro actualizado del plugin.
     */
    async enable(pluginId: string): Promise<PluginRecord> {
      const plugin = await requirePlugin(pluginId);

      // Solo permite activar desde los estados disabled, error o upgrade_pending
      if (plugin.status !== "disabled" && plugin.status !== "error" && plugin.status !== "upgrade_pending") {
        throw badRequest(
          `No se puede activar el plugin en estado '${plugin.status}'. ` +
            `El plugin debe estar en estado 'disabled', 'error' o 'upgrade_pending' para activarse.`,
        );
      }

      const result = await transition(pluginId, "ready", null, plugin);
      await activateReadyPlugin(pluginId);
      emitDomain("plugin.enabled", {
        pluginId,
        pluginKey: result.pluginKey,
      });
      return result;
    },

    // -- disable ----------------------------------------------------------
    async disable(pluginId: string, reason?: string): Promise<PluginRecord> {
      const plugin = await requirePlugin(pluginId);

      // Solo permite desactivar desde el estado ready
      if (plugin.status !== "ready") {
        throw badRequest(
          `No se puede desactivar el plugin en estado '${plugin.status}'. ` +
            `El plugin debe estar en estado 'ready' para desactivarse.`,
        );
      }

      await deactivatePluginRuntime(pluginId, plugin.pluginKey);

      const result = await transition(pluginId, "disabled", reason ?? null, plugin);
      emitDomain("plugin.disabled", {
        pluginId,
        pluginKey: result.pluginKey,
        reason,
      });
      return result;
    },

    // -- unload -----------------------------------------------------------
    async unload(
      pluginId: string,
      removeData = false,
    ): Promise<PluginRecord | null> {
      const plugin = await requirePlugin(pluginId);

      // Si ya está desinstalado y removeData, elimina permanentemente
      if (plugin.status === "uninstalled") {
        if (removeData) {
          await pluginLoaderInstance.cleanupInstallArtifacts(plugin);
          const deleted = await registry.uninstall(pluginId, true);
          log.info(
            { pluginId, pluginKey: plugin.pluginKey },
            "ciclo de vida del plugin: plugin ya desinstalado eliminado permanentemente",
          );
          emitDomain("plugin.unloaded", {
            pluginId,
            pluginKey: plugin.pluginKey,
            removeData: true,
          });
          return deleted as PluginRecord | null;
        }
        throw badRequest(
          `El plugin ${plugin.pluginKey} ya está desinstalado. ` +
            `Use removeData=true para eliminarlo permanentemente.`,
        );
      }

      await deactivatePluginRuntime(pluginId, plugin.pluginKey);
      await pluginLoaderInstance.cleanupInstallArtifacts(plugin);

      // Realiza la desinstalación vía el registro (maneja borrado lógico/permanente)
      const result = await registry.uninstall(pluginId, removeData);

      log.info(
        { pluginId, pluginKey: plugin.pluginKey, removeData },
        `ciclo de vida del plugin: ${plugin.status} → uninstalled${removeData ? " (eliminado permanentemente)" : ""}`,
      );

      emitter.emit("plugin.status_changed", {
        pluginId,
        pluginKey: plugin.pluginKey,
        previousStatus: plugin.status,
        newStatus: "uninstalled" as PluginStatus,
      });

      emitDomain("plugin.unloaded", {
        pluginId,
        pluginKey: plugin.pluginKey,
        removeData,
      });

      return result as PluginRecord | null;
    },

    // -- markError --------------------------------------------------------
    async markError(pluginId: string, error: string): Promise<PluginRecord> {
      // Detiene el worker — el plugin está en estado de error y no debería
      // seguir en ejecución. El auto-reinicio del administrador de workers
      // está desactivado porque intencionalmente sacamos el plugin de línea.
      const plugin = await requirePlugin(pluginId);
      await deactivatePluginRuntime(pluginId, plugin.pluginKey);

      const result = await transition(pluginId, "error", error, plugin);
      emitDomain("plugin.error", {
        pluginId,
        pluginKey: result.pluginKey,
        error,
      });
      return result;
    },

    // -- markUpgradePending -----------------------------------------------
    async markUpgradePending(pluginId: string): Promise<PluginRecord> {
      const plugin = await requirePlugin(pluginId);
      await deactivatePluginRuntime(pluginId, plugin.pluginKey);

      const result = await transition(pluginId, "upgrade_pending", null, plugin);
      emitDomain("plugin.upgrade_pending", {
        pluginId,
        pluginKey: result.pluginKey,
      });
      return result;
    },

    // -- upgrade ----------------------------------------------------------
    /**
     * Actualiza un plugin a una versión más nueva realizando una
     * actualización de paquete y manejando la transición de estado del ciclo
     * de vida.
     *
     * Siguiendo PLUGIN_SPEC.md §25.3, el proceso de actualización:
     * 1. Detiene el proceso worker actual (si está en ejecución).
     * 2. Obtiene y valida el nuevo paquete del plugin vía el `PluginLoader`.
     * 3. Compara las capacidades declaradas en el nuevo manifiesto contra el
     *    antiguo.
     * 4. Si se agregan nuevas capacidades, transiciona el plugin a
     *    `upgrade_pending` para esperar la aprobación del operador (el worker
     *    permanece detenido).
     * 5. Si no se agregan nuevas capacidades, transiciona el plugin de
     *    vuelta a `ready` con la versión actualizada y los metadatos del
     *    manifiesto.
     *
     * @param pluginId - El UUID del plugin a actualizar.
     * @param version - Especificador opcional de la versión objetivo.
     * @returns El `PluginRecord` actualizado.
     * @throws {BadRequest} Si el plugin no está en estado ready o upgrade_pending.
     */
    async upgrade(pluginId: string, version?: string): Promise<PluginRecord> {
      const plugin = await requirePlugin(pluginId);

      // Solo se pueden actualizar plugins que estén en ready o ya en upgrade_pending
      if (plugin.status !== "ready" && plugin.status !== "upgrade_pending") {
        throw badRequest(
          `No se puede actualizar el plugin en estado '${plugin.status}'. ` +
            `El plugin debe estar en estado 'ready' o 'upgrade_pending' para actualizarse.`,
        );
      }

      log.info(
        { pluginId, pluginKey: plugin.pluginKey, targetVersion: version },
        "ciclo de vida del plugin: actualización solicitada",
      );

      await deactivatePluginRuntime(pluginId, plugin.pluginKey);

      // 1. Descarga y valida el nuevo paquete vía el cargador
      const { oldManifest, newManifest, discovered } =
        await pluginLoaderInstance.upgradePlugin(pluginId, { version });

      log.info(
        {
          pluginId,
          pluginKey: plugin.pluginKey,
          oldVersion: oldManifest.version,
          newVersion: newManifest.version,
        },
        "ciclo de vida del plugin: paquete actualizado en disco",
      );

      // 2. Compara las capacidades
      const addedCaps = newManifest.capabilities.filter(
        (cap) => !oldManifest.capabilities.includes(cap),
      );

      // 3. Transiciona el estado
      if (addedCaps.length > 0) {
        // Las nuevas capacidades requieren aprobación del operador — el worker permanece detenido
        log.info(
          { pluginId, pluginKey: plugin.pluginKey, addedCaps },
          "ciclo de vida del plugin: nuevas capacidades detectadas, transicionando a upgrade_pending",
        );
        // Omite el stopWorkerIfRunning interno ya que ya detuvimos arriba
        const result = await transition(pluginId, "upgrade_pending", null, plugin);
        emitDomain("plugin.upgrade_pending", {
          pluginId,
          pluginKey: result.pluginKey,
        });
        return result;
      } else {
        const result = await transition(pluginId, "ready", null, {
          ...plugin,
          version: discovered.version,
          manifestJson: newManifest,
        } as PluginRecord);
        await activateReadyPlugin(pluginId);

        emitDomain("plugin.loaded", {
          pluginId,
          pluginKey: result.pluginKey,
        });
        emitDomain("plugin.enabled", {
          pluginId,
          pluginKey: result.pluginKey,
        });

        return result;
      }
    },

    // -- startWorker ------------------------------------------------------
    async startWorker(
      pluginId: string,
      options: WorkerStartOptions,
    ): Promise<void> {
      if (!workerManager) {
        throw badRequest(
          "No se puede iniciar el worker: no hay un PluginWorkerManager configurado. " +
            "Provea una opción workerManager al construir el administrador de ciclo de vida.",
        );
      }

      const plugin = await requirePlugin(pluginId);
      if (plugin.status !== "ready") {
        throw badRequest(
          `No se puede iniciar el worker para el plugin en estado '${plugin.status}'. ` +
            `El plugin debe estar en estado 'ready'.`,
        );
      }

      log.info(
        { pluginId, pluginKey: plugin.pluginKey },
        "ciclo de vida del plugin: iniciando worker",
      );

      await workerManager.startWorker(pluginId, options);
      emitDomain("plugin.worker_started", {
        pluginId,
        pluginKey: plugin.pluginKey,
      });

      log.info(
        { pluginId, pluginKey: plugin.pluginKey },
        "ciclo de vida del plugin: worker iniciado",
      );
    },

    // -- stopWorker -------------------------------------------------------
    async stopWorker(pluginId: string): Promise<void> {
      if (!workerManager) return; // Sin administrador de workers — nada que detener

      const plugin = await requirePlugin(pluginId);
      await stopWorkerIfRunning(pluginId, plugin.pluginKey);
    },

    // -- restartWorker ----------------------------------------------------
    async restartWorker(pluginId: string): Promise<void> {
      if (!workerManager) {
        throw badRequest(
          "No se puede reiniciar el worker: no hay un PluginWorkerManager configurado.",
        );
      }

      const plugin = await requirePlugin(pluginId);
      if (plugin.status !== "ready") {
        throw badRequest(
          `No se puede reiniciar el worker para el plugin en estado '${plugin.status}'. ` +
            `El plugin debe estar en estado 'ready'.`,
        );
      }

      const handle = workerManager.getWorker(pluginId);
      if (!handle) {
        throw badRequest(
          `No se puede reiniciar el worker para el plugin "${plugin.pluginKey}": no hay ningún worker en ejecución.`,
        );
      }

      log.info(
        { pluginId, pluginKey: plugin.pluginKey },
        "ciclo de vida del plugin: reiniciando worker",
      );

      await handle.restart();

      emitDomain("plugin.worker_stopped", { pluginId, pluginKey: plugin.pluginKey });
      emitDomain("plugin.worker_started", { pluginId, pluginKey: plugin.pluginKey });

      log.info(
        { pluginId, pluginKey: plugin.pluginKey },
        "ciclo de vida del plugin: worker reiniciado",
      );
    },

    // -- getStatus --------------------------------------------------------
    async getStatus(pluginId: string): Promise<PluginStatus | null> {
      const plugin = await registry.getById(pluginId);
      return plugin?.status ?? null;
    },

    // -- canTransition ----------------------------------------------------
    async canTransition(pluginId: string, to: PluginStatus): Promise<boolean> {
      const plugin = await registry.getById(pluginId);
      if (!plugin) return false;
      return isValidTransition(plugin.status, to);
    },

    // -- Suscripciones de eventos ----------------------------------------------
    on(event, listener) {
      emitter.on(event, listener);
    },

    off(event, listener) {
      emitter.off(event, listener);
    },

    once(event, listener) {
      emitter.once(event, listener);
    },
  };
}
