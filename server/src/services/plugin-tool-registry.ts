/**
 * PluginToolRegistry — registro host de herramientas de agentes aportadas
 * por plugins.
 *
 * Responsabilidades:
 * - Almacena declaraciones de herramientas (desde manifiestos de plugins)
 *   junto con metadata de enrutamiento para que el host pueda resolver
 *   nombres de herramientas namespaced al worker del plugin propietario.
 * - Hace namespace de herramientas automáticamente: una herramienta
 *   `"search-issues"` del plugin `"acme.linear"` se expone a los agentes
 *   como `"acme.linear:search-issues"`.
 * - Enruta llamadas `executeTool` al worker correcto del plugin vía el
 *   `PluginWorkerManager`.
 * - Provee consultas de descubrimiento de herramientas para que los agentes
 *   listen las herramientas disponibles.
 * - Limpia registros de herramientas cuando un plugin se descarga o su
 *   worker se detiene.
 *
 * El registro es una estructura en memoria — las declaraciones de
 * herramientas derivan del manifiesto del plugin en tiempo de carga y no
 * necesitan persistencia. Cuando el worker de un plugin se reinicia, el
 * host re-registra las herramientas de su manifiesto.
 *
 * @see PLUGIN_SPEC.md §11 — Herramientas de agente
 * @see PLUGIN_SPEC.md §13.10 — `executeTool`
 */

import type {
  PaperclipPluginManifestV1,
  PluginToolDeclaration,
} from "@paperclipai/shared";
import type { ToolRunContext, ToolResult, ExecuteToolParams } from "@paperclipai/plugin-sdk";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Separador entre ID de plugin y nombre de herramienta en el identificador
 * de herramienta namespaced.
 *
 * Ejemplo: `"acme.linear:search-issues"`
 */
export const TOOL_NAMESPACE_SEPARATOR = ":";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Una entrada de herramienta registrada almacenada en el registro.
 *
 * Combina la declaración a nivel de manifiesto con metadata de enrutamiento
 * para que el host pueda resolver un nombre de herramienta namespaced →
 * worker de plugin en O(1).
 */
export interface RegisteredTool {
  /** La clave del plugin usada para el namespacing (p. ej. `"acme.linear"`). */
  pluginId: string;
  /**
   * El UUID de base de datos del plugin, usado para enrutamiento de worker y
   * chequeos de disponibilidad. Vuelve a `pluginId` cuando no se provee
   * (p. ej. en pruebas donde `id === pluginKey`).
   */
  pluginDbId: string;
  /** El nombre desnudo de la herramienta (sin prefijo de namespace). */
  name: string;
  /** Identificador completamente namespaced: `"<pluginId>:<toolName>"`. */
  namespacedName: string;
  /** Nombre legible para mostrar. */
  displayName: string;
  /** Descripción provista al agente para que sepa cuándo usar esta herramienta. */
  description: string;
  /** JSON Schema que describe los parámetros de entrada de la herramienta. */
  parametersSchema: Record<string, unknown>;
}

/**
 * Criterios de filtro para listar herramientas disponibles.
 */
export interface ToolListFilter {
  /** Solo devuelve herramientas propiedad de este plugin. */
  pluginId?: string;
}

/**
 * Resultado de ejecutar una herramienta, extendiendo `ToolResult` con
 * metadata de enrutamiento.
 */
export interface ToolExecutionResult {
  /** El plugin que manejó la llamada de la herramienta. */
  pluginId: string;
  /** El nombre desnudo de la herramienta que se ejecutó. */
  toolName: string;
  /** El resultado devuelto por el manejador de herramientas del plugin. */
  result: ToolResult;
}

// ---------------------------------------------------------------------------
// PluginToolRegistry interface
// ---------------------------------------------------------------------------

/**
 * El registro de herramientas lado host — retenido por el proceso host.
 *
 * Creado una vez al arranque del servidor y compartido en la aplicación.
 * Los plugins registran sus herramientas cuando su worker arranca, y las
 * desregistran cuando el worker se detiene o el plugin se desinstala.
 */
export interface PluginToolRegistry {
  /**
   * Registra todas las herramientas declaradas en el manifiesto de un
   * plugin.
   *
   * Se llama cuando el worker de un plugin arranca y su manifiesto se carga.
   * Cualquier herramienta previamente registrada para el mismo plugin se
   * reemplaza (idempotente).
   *
   * @param pluginId - El identificador único del plugin (p. ej. `"acme.linear"`)
   * @param manifest - El manifiesto del plugin que contiene el array `tools`
   * @param pluginDbId - El UUID de base de datos del plugin, usado para
   *   enrutamiento de worker y chequeos de disponibilidad. Si se omite, se
   *   usa `pluginId` (retrocompatibilidad).
   */
  registerPlugin(pluginId: string, manifest: PaperclipPluginManifestV1, pluginDbId?: string): void;

  /**
   * Elimina todos los registros de herramientas de un plugin.
   *
   * Se llama cuando el worker de un plugin se detiene, falla, o se
   * desinstala.
   *
   * @param pluginId - El plugin a limpiar
   */
  unregisterPlugin(pluginId: string): void;

  /**
   * Busca una herramienta registrada por su nombre namespaced.
   *
   * @param namespacedName - Nombre totalmente calificado, p. ej. `"acme.linear:search-issues"`
   * @returns La entrada de herramienta registrada, o `null` si no se encuentra
   */
  getTool(namespacedName: string): RegisteredTool | null;

  /**
   * Busca una herramienta registrada por ID de plugin y nombre desnudo.
   *
   * @param pluginId - El plugin propietario
   * @param toolName - El nombre desnudo de la herramienta (sin prefijo de namespace)
   * @returns La entrada de herramienta registrada, o `null` si no se encuentra
   */
  getToolByPlugin(pluginId: string, toolName: string): RegisteredTool | null;

  /**
   * Lista todas las herramientas registradas, opcionalmente filtradas.
   *
   * @param filter - Criterios opcionales de filtro
   * @returns Array de entradas de herramientas registradas
   */
  listTools(filter?: ToolListFilter): RegisteredTool[];

  /**
   * Parsea un nombre de herramienta namespaced en ID de plugin y nombre
   * desnudo.
   *
   * @param namespacedName - p. ej. `"acme.linear:search-issues"`
   * @returns `{ pluginId, toolName }` o `null` si el formato es inválido
   */
  parseNamespacedName(namespacedName: string): { pluginId: string; toolName: string } | null;

  /**
   * Construye un nombre de herramienta namespaced desde un ID de plugin y
   * nombre desnudo.
   *
   * @param pluginId - p. ej. `"acme.linear"`
   * @param toolName - p. ej. `"search-issues"`
   * @returns El nombre namespaced, p. ej. `"acme.linear:search-issues"`
   */
  buildNamespacedName(pluginId: string, toolName: string): string;

  /**
   * Ejecuta una herramienta por su nombre namespaced, enrutando al worker
   * correcto del plugin.
   *
   * Resuelve el nombre namespaced al plugin propietario, valida que la
   * herramienta exista, y despacha la llamada RPC `executeTool` al worker.
   *
   * @param namespacedName - Nombre totalmente calificado de la herramienta (p. ej. `"acme.linear:search-issues"`)
   * @param parameters - Los parámetros parseados que coinciden con el schema de la herramienta
   * @param runContext - Contexto de ejecución del agente
   * @returns El resultado de la ejecución con metadata de enrutamiento
   * @throws {Error} si la herramienta no se encuentra o el worker no está corriendo
   */
  executeTool(
    namespacedName: string,
    parameters: unknown,
    runContext: ToolRunContext,
  ): Promise<ToolExecutionResult>;

  /**
   * Obtiene el número de herramientas registradas, opcionalmente limitado a
   * un plugin.
   *
   * @param pluginId - Si se provee, cuenta solo las herramientas de este plugin
   */
  toolCount(pluginId?: string): number;
}

// ---------------------------------------------------------------------------
// Factory: createPluginToolRegistry
// ---------------------------------------------------------------------------

/**
 * Crea un nuevo `PluginToolRegistry`.
 *
 * El registro está respaldado por dos mapas en memoria:
 * - `byNamespace`: nombre namespaced → `RegisteredTool` para búsquedas O(1).
 * - `byPlugin`: pluginId → Set de nombres namespaced para operaciones
 *   eficientes por plugin.
 *
 * @param workerManager - El worker manager usado para despachar llamadas RPC
 *   `executeTool` a los workers de plugins. Si no se provee, `executeTool`
 *   lanzará un error.
 *
 * @example
 * ```ts
 * const toolRegistry = createPluginToolRegistry(workerManager);
 *
 * // Registra herramientas desde un manifiesto de plugin
 * toolRegistry.registerPlugin("acme.linear", linearManifest);
 *
 * // Lista todas las herramientas disponibles para agentes
 * const tools = toolRegistry.listTools();
 * // → [{ namespacedName: "acme.linear:search-issues", ... }]
 *
 * // Ejecuta una herramienta
 * const result = await toolRegistry.executeTool(
 *   "acme.linear:search-issues",
 *   { query: "auth bug" },
 *   { agentId: "agent-1", runId: "run-1", companyId: "co-1", projectId: "proj-1" },
 * );
 * ```
 */
export function createPluginToolRegistry(
  workerManager?: PluginWorkerManager,
): PluginToolRegistry {
  const log = logger.child({ service: "plugin-tool-registry" });

  // Índice primario: nombre namespaced → entrada de herramienta
  const byNamespace = new Map<string, RegisteredTool>();

  // Índice secundario: pluginId → set de nombres namespaced (para operaciones por lote)
  const byPlugin = new Map<string, Set<string>>();

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  function buildName(pluginId: string, toolName: string): string {
    return `${pluginId}${TOOL_NAMESPACE_SEPARATOR}${toolName}`;
  }

  function parseName(namespacedName: string): { pluginId: string; toolName: string } | null {
    const sepIndex = namespacedName.lastIndexOf(TOOL_NAMESPACE_SEPARATOR);
    if (sepIndex <= 0 || sepIndex >= namespacedName.length - 1) {
      return null;
    }
    return {
      pluginId: namespacedName.slice(0, sepIndex),
      toolName: namespacedName.slice(sepIndex + 1),
    };
  }

  function addTool(pluginId: string, decl: PluginToolDeclaration, pluginDbId: string): void {
    const namespacedName = buildName(pluginId, decl.name);

    const entry: RegisteredTool = {
      pluginId,
      pluginDbId,
      name: decl.name,
      namespacedName,
      displayName: decl.displayName,
      description: decl.description,
      parametersSchema: decl.parametersSchema,
    };

    byNamespace.set(namespacedName, entry);

    let pluginTools = byPlugin.get(pluginId);
    if (!pluginTools) {
      pluginTools = new Set();
      byPlugin.set(pluginId, pluginTools);
    }
    pluginTools.add(namespacedName);
  }

  function removePluginTools(pluginId: string): number {
    const pluginTools = byPlugin.get(pluginId);
    if (!pluginTools) return 0;

    const count = pluginTools.size;
    for (const name of pluginTools) {
      byNamespace.delete(name);
    }
    byPlugin.delete(pluginId);

    return count;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    registerPlugin(pluginId: string, manifest: PaperclipPluginManifestV1, pluginDbId?: string): void {
      const dbId = pluginDbId ?? pluginId;

      // Elimina cualquier herramienta previamente registrada para este plugin (idempotente)
      const previousCount = removePluginTools(pluginId);
      if (previousCount > 0) {
        log.debug(
          { pluginId, previousCount },
          "registros previos de herramientas limpiados antes de re-registrar",
        );
      }

      const tools = manifest.tools ?? [];
      if (tools.length === 0) {
        log.debug({ pluginId }, "el plugin no declara herramientas");
        return;
      }

      for (const decl of tools) {
        addTool(pluginId, decl, dbId);
      }

      log.info(
        {
          pluginId,
          toolCount: tools.length,
          tools: tools.map((t) => buildName(pluginId, t.name)),
        },
        `se registraron ${tools.length} herramienta(s) para el plugin`,
      );
    },

    unregisterPlugin(pluginId: string): void {
      const removed = removePluginTools(pluginId);
      if (removed > 0) {
        log.info(
          { pluginId, removedCount: removed },
          `se desregistraron ${removed} herramienta(s) para el plugin`,
        );
      }
    },

    getTool(namespacedName: string): RegisteredTool | null {
      return byNamespace.get(namespacedName) ?? null;
    },

    getToolByPlugin(pluginId: string, toolName: string): RegisteredTool | null {
      const namespacedName = buildName(pluginId, toolName);
      return byNamespace.get(namespacedName) ?? null;
    },

    listTools(filter?: ToolListFilter): RegisteredTool[] {
      if (filter?.pluginId) {
        const pluginTools = byPlugin.get(filter.pluginId);
        if (!pluginTools) return [];
        const result: RegisteredTool[] = [];
        for (const name of pluginTools) {
          const tool = byNamespace.get(name);
          if (tool) result.push(tool);
        }
        return result;
      }

      return Array.from(byNamespace.values());
    },

    parseNamespacedName(namespacedName: string): { pluginId: string; toolName: string } | null {
      return parseName(namespacedName);
    },

    buildNamespacedName(pluginId: string, toolName: string): string {
      return buildName(pluginId, toolName);
    },

    async executeTool(
      namespacedName: string,
      parameters: unknown,
      runContext: ToolRunContext,
    ): Promise<ToolExecutionResult> {
      // 1. Resuelve el nombre namespaced
      const parsed = parseName(namespacedName);
      if (!parsed) {
        throw new Error(
          `Nombre de herramienta inválido "${namespacedName}". Formato esperado: "<pluginId>${TOOL_NAMESPACE_SEPARATOR}<toolName>"`,
        );
      }

      const { pluginId, toolName } = parsed;

      // 2. Verifica que la herramienta esté registrada
      const tool = byNamespace.get(namespacedName);
      if (!tool) {
        throw new Error(
          `La herramienta "${namespacedName}" no está registrada. ` +
          `El plugin puede no estar instalado o su worker puede no estar corriendo.`,
        );
      }

      // 3. Verifica que el worker manager esté disponible
      if (!workerManager) {
        throw new Error(
          `No se puede ejecutar la herramienta "${namespacedName}" — no hay worker manager configurado. ` +
          `La ejecución de herramientas requiere un PluginWorkerManager.`,
        );
      }

      // 4. Verifica que el worker del plugin esté corriendo (usa el UUID de DB para la búsqueda del worker)
      const dbId = tool.pluginDbId;
      if (!workerManager.isRunning(dbId)) {
        throw new Error(
          `No se puede ejecutar la herramienta "${namespacedName}" — ` +
          `el worker del plugin "${pluginId}" no está corriendo.`,
        );
      }

      // 5. Despacha la llamada RPC executeTool al worker
      log.debug(
        { pluginId, pluginDbId: dbId, toolName, namespacedName, agentId: runContext.agentId, runId: runContext.runId },
        "ejecutando herramienta vía worker del plugin",
      );

      const rpcParams: ExecuteToolParams = {
        toolName,
        parameters,
        runContext,
      };

      const result = await workerManager.call(dbId, "executeTool", rpcParams);

      log.debug(
        {
          pluginId,
          toolName,
          namespacedName,
          hasContent: !!result.content,
          hasData: result.data !== undefined,
          hasError: !!result.error,
        },
        "ejecución de herramienta completada",
      );

      return { pluginId, toolName, result };
    },

    toolCount(pluginId?: string): number {
      if (pluginId !== undefined) {
        return byPlugin.get(pluginId)?.size ?? 0;
      }
      return byNamespace.size;
    },
  };
}
