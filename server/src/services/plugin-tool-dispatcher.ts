/**
 * PluginToolDispatcher — orquesta el descubrimiento de herramientas de
 * plugins, la integración del ciclo de vida y el enrutamiento de ejecución
 * para el servicio de agentes.
 *
 * Este servicio se sitúa entre el servicio de agentes y el
 * `PluginToolRegistry` + `PluginWorkerManager` de más bajo nivel,
 * proveyendo una API limpia que:
 *
 * - Descubre herramientas desde los manifiestos de plugins cargados y las
 *   registra en el registro de herramientas.
 * - Se engancha a los eventos de `PluginLifecycleManager` para registrar y
 *   desregistrar automáticamente herramientas cuando los plugins se activan
 *   o desactivan.
 * - Expone la lista de herramientas en un formato amigable para agentes
 *   (con nombres namespaced, descripciones, schemas de parámetros).
 * - Enruta llamadas `executeTool` al worker correcto del plugin y devuelve
 *   resultados estructurados.
 * - Valida los parámetros de herramientas contra los schemas declarados
 *   antes del despacho.
 *
 * El dispatcher se crea una vez al arranque del servidor y se comparte en
 * toda la aplicación.
 *
 * @see PLUGIN_SPEC.md §11 — Herramientas de agente
 * @see PLUGIN_SPEC.md §13.10 — `executeTool`
 */

import type { Db } from "@paperclipai/db";
import type {
  PaperclipPluginManifestV1,
  PluginRecord,
} from "@paperclipai/shared";
import type { ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
import type { PluginLifecycleManager } from "./plugin-lifecycle.js";
import {
  createPluginToolRegistry,
  type PluginToolRegistry,
  type RegisteredTool,
  type ToolListFilter,
  type ToolExecutionResult,
} from "./plugin-tool-registry.js";
import { pluginRegistryService } from "./plugin-registry.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Un descriptor de herramienta orientado a agentes — la forma devuelta
 * cuando los agentes consultan herramientas disponibles.
 *
 * Es intencionalmente más simple que `RegisteredTool`, exponiendo solo lo
 * que los agentes necesitan para decidir si llamar una herramienta y cómo.
 */
export interface AgentToolDescriptor {
  /** Nombre de herramienta completamente namespaced (p. ej. `"acme.linear:search-issues"`). */
  name: string;
  /** Nombre legible para mostrar. */
  displayName: string;
  /** Descripción para el agente — explica cuándo y cómo usar esta herramienta. */
  description: string;
  /** JSON Schema que describe los parámetros de entrada de la herramienta. */
  parametersSchema: Record<string, unknown>;
  /** El plugin que provee esta herramienta. */
  pluginId: string;
}

/**
 * Opciones para crear el plugin tool dispatcher.
 */
export interface PluginToolDispatcherOptions {
  /** El worker manager usado para despachar llamadas RPC a los workers de plugins. */
  workerManager?: PluginWorkerManager;
  /** El lifecycle manager al que escuchar cambios de estado de plugins. */
  lifecycleManager?: PluginLifecycleManager;
  /** Conexión de base de datos para buscar registros de plugins. */
  db?: Db;
}

// ---------------------------------------------------------------------------
// PluginToolDispatcher interface
// ---------------------------------------------------------------------------

/**
 * El plugin tool dispatcher — el punto primario de integración entre el
 * servicio de agentes y el sistema de herramientas de plugins.
 *
 * Los agentes usan este servicio para:
 * 1. Listar todas las herramientas disponibles (para construcción de prompt
 *    / elección de herramienta)
 * 2. Ejecutar una herramienta específica por su nombre namespaced
 *
 * El dispatcher maneja el lifecycle management internamente — cuando un
 * plugin se carga o descarga, sus herramientas se registran o eliminan
 * automáticamente.
 */
export interface PluginToolDispatcher {
  /**
   * Inicializa el dispatcher — carga herramientas desde todos los plugins
   * actualmente listos y empieza a escuchar eventos del ciclo de vida.
   *
   * Debe llamarse una vez al arranque del servidor después de que el
   * lifecycle manager y el worker manager estén listos.
   */
  initialize(): Promise<void>;

  /**
   * Desmantela el dispatcher — desregistra los listeners de eventos del
   * ciclo de vida y limpia todos los registros de herramientas.
   *
   * Se llama durante el apagado del servidor.
   */
  teardown(): void;

  /**
   * Lista todas las herramientas disponibles para agentes, opcionalmente
   * filtradas.
   *
   * Devuelve descriptores de herramientas en un formato amigable para
   * agentes.
   *
   * @param filter - Criterios opcionales de filtro
   * @returns Array de descriptores de herramientas de agente
   */
  listToolsForAgent(filter?: ToolListFilter): AgentToolDescriptor[];

  /**
   * Busca una herramienta por su nombre namespaced.
   *
   * @param namespacedName - p. ej. `"acme.linear:search-issues"`
   * @returns La herramienta registrada, o `null` si no se encuentra
   */
  getTool(namespacedName: string): RegisteredTool | null;

  /**
   * Ejecuta una herramienta por su nombre namespaced, enrutando al worker
   * correcto del plugin.
   *
   * @param namespacedName - Nombre totalmente calificado de la herramienta
   * @param parameters - Parámetros de entrada que coinciden con el schema de la herramienta
   * @param runContext - Contexto de ejecución del agente
   * @returns El resultado de la ejecución con metadata de enrutamiento
   * @throws {Error} si la herramienta no se encuentra, el worker no está
   *   corriendo, o la ejecución de la herramienta falla
   */
  executeTool(
    namespacedName: string,
    parameters: unknown,
    runContext: ToolRunContext,
  ): Promise<ToolExecutionResult>;

  /**
   * Registra todas las herramientas desde un manifiesto de plugin.
   *
   * Se llama automáticamente cuando un plugin transiciona a `ready`.
   * También puede llamarse manualmente para pruebas o escenarios de
   * recuperación.
   *
   * @param pluginId - El identificador único del plugin
   * @param manifest - El manifiesto del plugin que contiene declaraciones de herramientas
   */
  registerPluginTools(
    pluginId: string,
    manifest: PaperclipPluginManifestV1,
  ): void;

  /**
   * Desregistra todas las herramientas de un plugin.
   *
   * Se llama automáticamente cuando un plugin se desactiva o descarga.
   *
   * @param pluginId - El plugin a desregistrar
   */
  unregisterPluginTools(pluginId: string): void;

  /**
   * Obtiene el número total de herramientas registradas, opcionalmente
   * limitado a un plugin.
   *
   * @param pluginId - Si se provee, cuenta solo las herramientas de este plugin
   */
  toolCount(pluginId?: string): number;

  /**
   * Accede al registro de herramientas subyacente para operaciones avanzadas.
   *
   * Esta vía de escape existe para uso interno (p. ej. diagnósticos).
   * Prefiere los propios métodos del dispatcher para operaciones normales.
   */
  getRegistry(): PluginToolRegistry;
}

// ---------------------------------------------------------------------------
// Factory: createPluginToolDispatcher
// ---------------------------------------------------------------------------

/**
 * Crea un nuevo `PluginToolDispatcher`.
 *
 * El dispatcher:
 * 1. Crea y posee un `PluginToolRegistry` respaldado por el worker manager dado.
 * 2. Escucha eventos del ciclo de vida (plugin.enabled, plugin.disabled,
 *    plugin.unloaded) para registrar y desregistrar automáticamente
 *    herramientas.
 * 3. En `initialize()`, carga herramientas desde todos los plugins
 *    actualmente listos vía la DB.
 *
 * @param options - Opciones de configuración
 *
 * @example
 * ```ts
 * // Al arranque del servidor
 * const dispatcher = createPluginToolDispatcher({
 *   workerManager,
 *   lifecycleManager,
 *   db,
 * });
 * await dispatcher.initialize();
 *
 * // En el servicio de agentes — lista herramientas para construcción de prompt
 * const tools = dispatcher.listToolsForAgent();
 *
 * // En el servicio de agentes — ejecuta una herramienta
 * const result = await dispatcher.executeTool(
 *   "acme.linear:search-issues",
 *   { query: "auth bug" },
 *   { agentId: "a-1", runId: "r-1", companyId: "c-1", projectId: "p-1" },
 * );
 * ```
 */
export function createPluginToolDispatcher(
  options: PluginToolDispatcherOptions = {},
): PluginToolDispatcher {
  const { workerManager, lifecycleManager, db } = options;
  const log = logger.child({ service: "plugin-tool-dispatcher" });

  // Crea el registro de herramientas subyacente, respaldado por el worker manager
  const registry = createPluginToolRegistry(workerManager);

  // Rastrea los listeners de eventos del ciclo de vida para poder
  // eliminarlos en teardown
  let enabledListener: ((payload: { pluginId: string; pluginKey: string }) => void) | null = null;
  let disabledListener: ((payload: { pluginId: string; pluginKey: string; reason?: string }) => void) | null = null;
  let unloadedListener: ((payload: { pluginId: string; pluginKey: string; removeData: boolean }) => void) | null = null;

  let initialized = false;

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Intenta registrar herramientas para un plugin buscando su manifiesto
   * desde la DB. No hace nada con gracia si el plugin o manifiesto faltan.
   */
  async function registerFromDb(pluginId: string): Promise<void> {
    if (!db) {
      log.warn(
        { pluginId },
        "no se pueden registrar herramientas desde la DB — no hay conexión de base de datos configurada",
      );
      return;
    }

    const pluginRegistry = pluginRegistryService(db);
    const plugin = await pluginRegistry.getById(pluginId) as PluginRecord | null;

    if (!plugin) {
      log.warn({ pluginId }, "plugin no encontrado en el registro, no se pueden registrar herramientas");
      return;
    }

    const manifest = plugin.manifestJson;
    if (!manifest) {
      log.warn({ pluginId }, "el plugin no tiene manifiesto, no se pueden registrar herramientas");
      return;
    }

    registry.registerPlugin(plugin.pluginKey, manifest, plugin.id);
  }

  /**
   * Convierte un `RegisteredTool` a un `AgentToolDescriptor`.
   */
  function toAgentDescriptor(tool: RegisteredTool): AgentToolDescriptor {
    return {
      name: tool.namespacedName,
      displayName: tool.displayName,
      description: tool.description,
      parametersSchema: tool.parametersSchema,
      pluginId: tool.pluginDbId,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle event handlers
  // -----------------------------------------------------------------------

  function handlePluginEnabled(payload: { pluginId: string; pluginKey: string }): void {
    log.debug({ pluginId: payload.pluginId, pluginKey: payload.pluginKey }, "plugin activado — registrando herramientas");
    // Registro asíncrono desde la DB — disparamos y olvidamos ya que el
    // manejador de eventos del ciclo de vida debe ser síncrono. Cualquier
    // error se registra en logs.
    void registerFromDb(payload.pluginId).catch((err) => {
      log.error(
        { pluginId: payload.pluginId, err: err instanceof Error ? err.message : String(err) },
        "falló el registro de herramientas tras activar el plugin",
      );
    });
  }

  function handlePluginDisabled(payload: { pluginId: string; pluginKey: string; reason?: string }): void {
    log.debug({ pluginId: payload.pluginId, pluginKey: payload.pluginKey }, "plugin desactivado — desregistrando herramientas");
    registry.unregisterPlugin(payload.pluginKey);
  }

  function handlePluginUnloaded(payload: { pluginId: string; pluginKey: string; removeData: boolean }): void {
    log.debug({ pluginId: payload.pluginId, pluginKey: payload.pluginKey }, "plugin descargado — desregistrando herramientas");
    registry.unregisterPlugin(payload.pluginKey);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    async initialize(): Promise<void> {
      if (initialized) {
        log.warn("el dispatcher ya está inicializado, omitiendo");
        return;
      }

      log.info("inicializando el plugin tool dispatcher");

      // Paso 1: Carga herramientas desde todos los plugins actualmente listos
      if (db) {
        const pluginRegistry = pluginRegistryService(db);
        const readyPlugins = await pluginRegistry.listByStatus("ready") as PluginRecord[];

        let totalTools = 0;
        for (const plugin of readyPlugins) {
          const manifest = plugin.manifestJson;
          if (manifest?.tools && manifest.tools.length > 0) {
            registry.registerPlugin(plugin.pluginKey, manifest, plugin.id);
            totalTools += manifest.tools.length;
          }
        }

        log.info(
          { readyPlugins: readyPlugins.length, registeredTools: totalTools },
          "herramientas cargadas desde plugins listos",
        );
      }

      // Paso 2: Suscribe a eventos del ciclo de vida para actualizaciones dinámicas
      if (lifecycleManager) {
        enabledListener = handlePluginEnabled;
        disabledListener = handlePluginDisabled;
        unloadedListener = handlePluginUnloaded;

        lifecycleManager.on("plugin.enabled", enabledListener);
        lifecycleManager.on("plugin.disabled", disabledListener);
        lifecycleManager.on("plugin.unloaded", unloadedListener);

        log.debug("suscrito a eventos del ciclo de vida");
      } else {
        log.warn("no se proveyó lifecycle manager — las herramientas no se auto-actualizarán en cambios de estado de plugins");
      }

      initialized = true;
      log.info(
        { totalTools: registry.toolCount() },
        "plugin tool dispatcher inicializado",
      );
    },

    teardown(): void {
      if (!initialized) return;

      // Desuscribe de eventos del ciclo de vida
      if (lifecycleManager) {
        if (enabledListener) lifecycleManager.off("plugin.enabled", enabledListener);
        if (disabledListener) lifecycleManager.off("plugin.disabled", disabledListener);
        if (unloadedListener) lifecycleManager.off("plugin.unloaded", unloadedListener);

        enabledListener = null;
        disabledListener = null;
        unloadedListener = null;
      }

      // Nota: NO limpiamos el registro aquí porque teardown puede llamarse
      // durante un apagado gracioso donde las llamadas de herramientas en
      // vuelo aún deberían poder resolver sus entradas de herramientas.

      initialized = false;
      log.info("plugin tool dispatcher desmantelado");
    },

    listToolsForAgent(filter?: ToolListFilter): AgentToolDescriptor[] {
      return registry.listTools(filter).map(toAgentDescriptor);
    },

    getTool(namespacedName: string): RegisteredTool | null {
      return registry.getTool(namespacedName);
    },

    async executeTool(
      namespacedName: string,
      parameters: unknown,
      runContext: ToolRunContext,
    ): Promise<ToolExecutionResult> {
      log.debug(
        {
          tool: namespacedName,
          agentId: runContext.agentId,
          runId: runContext.runId,
        },
        "despachando ejecución de herramienta",
      );

      const result = await registry.executeTool(
        namespacedName,
        parameters,
        runContext,
      );

      log.debug(
        {
          tool: namespacedName,
          pluginId: result.pluginId,
          hasContent: !!result.result.content,
          hasError: !!result.result.error,
        },
        "ejecución de herramienta completada",
      );

      return result;
    },

    registerPluginTools(
      pluginId: string,
      manifest: PaperclipPluginManifestV1,
    ): void {
      registry.registerPlugin(pluginId, manifest);
    },

    unregisterPluginTools(pluginId: string): void {
      registry.unregisterPlugin(pluginId);
    },

    toolCount(pluginId?: string): number {
      return registry.toolCount(pluginId);
    },

    getRegistry(): PluginToolRegistry {
      return registry;
    },
  };
}
