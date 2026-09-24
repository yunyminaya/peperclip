/**
 * @fileoverview Rutas REST de API para gestión de plugins
 *
 * Este módulo provee rutas de Express para gestionar el ciclo de vida completo de los plugins:
 * - Listar y filtrar plugins por estado
 * - Instalar plugins desde npm o rutas locales
 * - Desinstalar plugins (eliminación suave o purga total)
 * - Habilitar/deshabilitar plugins
 * - Ejecutar diagnósticos de salud
 * - Actualizar plugins
 * - Obtener contribuciones de slots de UI para renderizado del frontend
 * - Descubrir y ejecutar herramientas de agente aportadas por plugins
 *
 * Todas las rutas requieren autenticación a nivel de board (middleware assertBoard).
 *
 * @module server/routes/plugins
 * @see doc/plugins/PLUGIN_SPEC.md para la especificación completa de plugins
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import type { Request } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, pluginLogs, pluginWebhookDeliveries } from "@paperclipai/db";
import type {
  PluginStatus,
  PaperclipPluginManifestV1,
  PluginBridgeErrorCode,
  PluginLauncherRenderContextSnapshot,
} from "@paperclipai/shared";
import {
  PLUGIN_STATUSES,
} from "@paperclipai/shared";
import { pluginRegistryService } from "../services/plugin-registry.js";
import { pluginLifecycleManager } from "../services/plugin-lifecycle.js";
import { getPluginUiContributionMetadata, pluginLoader } from "../services/plugin-loader.js";
import { logActivity } from "../services/activity-log.js";
import { publishGlobalLiveEvent } from "../services/live-events.js";
import type { PluginJobScheduler } from "../services/plugin-job-scheduler.js";
import type { PluginJobStore } from "../services/plugin-job-store.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
import type { PluginStreamBus } from "../services/plugin-stream-bus.js";
import type { PluginToolDispatcher } from "../services/plugin-tool-dispatcher.js";
import type { ToolRunContext } from "@paperclipai/plugin-sdk";
import { JsonRpcCallError, PLUGIN_RPC_ERROR_CODES } from "@paperclipai/plugin-sdk";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { validateInstanceConfig } from "../services/plugin-config-validator.js";

/** Declaración de slot de UI extraída del manifiesto del plugin */
type PluginUiSlotDeclaration = NonNullable<NonNullable<PaperclipPluginManifestV1["ui"]>["slots"]>[number];
/** Declaración de launcher extraída del manifiesto del plugin */
type PluginLauncherDeclaration = NonNullable<PaperclipPluginManifestV1["launchers"]>[number];

/**
 * Contribución de UI normalizada para consumo del host de slots del frontend.
 * Solo incluye plugins en estado 'ready' con declaraciones de slots no vacías.
 */
type PluginUiContribution = {
  pluginId: string;
  pluginKey: string;
  displayName: string;
  version: string;
  updatedAt: string;
  /**
   * Ruta relativa dentro del directorio de UI del plugin al módulo de entrada
   * (p. ej. `"index.js"`). El frontend construye la URL completa de importación como
   * `/_plugins/${pluginId}/ui/${uiEntryFile}`.
   */
  uiEntryFile: string;
  slots: PluginUiSlotDeclaration[];
  launchers: PluginLauncherDeclaration[];
};

/** Cuerpo de solicitud para POST /api/plugins/install */
interface PluginInstallRequest {
  /** Nombre del paquete npm (p. ej. @paperclip/plugin-linear) o ruta local */
  packageName: string;
  /** Versión objetivo para paquetes npm (opcional, por defecto latest) */
  version?: string;
  /** True si packageName es una ruta del sistema de archivos local */
  isLocalPath?: boolean;
}

interface AvailablePluginExample {
  packageName: string;
  pluginKey: string;
  displayName: string;
  description: string;
  localPath: string;
  tag: "example";
}

/** Cuerpo de respuesta para GET /api/plugins/:pluginId/health */
interface PluginHealthCheckResult {
  pluginId: string;
  status: string;
  healthy: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
  }>;
  lastError?: string;
}

/** Regex UUID v4 usada para la resolución de rutas de ID de plugin. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const BUNDLED_PLUGIN_EXAMPLES: AvailablePluginExample[] = [
  {
    packageName: "@paperclipai/plugin-hello-world-example",
    pluginKey: "paperclip.hello-world-example",
    displayName: "Hello World Widget (Example)",
    description: "Reference UI plugin that adds a simple Hello World widget to the Paperclip dashboard.",
    localPath: "packages/plugins/examples/plugin-hello-world-example",
    tag: "example",
  },
  {
    packageName: "@paperclipai/plugin-file-browser-example",
    pluginKey: "paperclip-file-browser-example",
    displayName: "File Browser (Example)",
    description: "Example plugin that adds a Files link in project navigation plus a project detail file browser.",
    localPath: "packages/plugins/examples/plugin-file-browser-example",
    tag: "example",
  },
  {
    packageName: "@paperclipai/plugin-kitchen-sink-example",
    pluginKey: "paperclip-kitchen-sink-example",
    displayName: "Kitchen Sink (Example)",
    description: "Reference plugin that demonstrates the current Paperclip plugin API surface, bridge flows, UI extension surfaces, jobs, webhooks, tools, streams, and trusted local workspace/process demos.",
    localPath: "packages/plugins/examples/plugin-kitchen-sink-example",
    tag: "example",
  },
];

function listBundledPluginExamples(): AvailablePluginExample[] {
  return BUNDLED_PLUGIN_EXAMPLES.flatMap((plugin) => {
    const absoluteLocalPath = path.resolve(REPO_ROOT, plugin.localPath);
    if (!existsSync(absoluteLocalPath)) return [];
    return [{ ...plugin, localPath: absoluteLocalPath }];
  });
}

/**
 * Resuelve un plugin por ID de base de datos o por clave de plugin.
 *
 * Orden de búsqueda:
 * - IDs tipo UUID: getById primero, luego getByKey.
 * - Claves de paquete con scope (p. ej. "@scope/name"): solo getByKey, nunca getById.
 * - Otros IDs no UUID: intenta getById primero (los registros de test/memoria pueden permitirlo),
 *   luego recurre a getByKey. Cualquier error de parseo de UUID de getById se ignora.
 *
 * @param registry - La instancia del servicio de registro de plugins
 * @param pluginId - Un UUID de base de datos o la clave de plugin (id del manifiesto)
 * @returns Registro del plugin o null si no se encuentra
 */
async function resolvePlugin(
  registry: ReturnType<typeof pluginRegistryService>,
  pluginId: string,
) {
  const isUuid = UUID_REGEX.test(pluginId);
  const isScopedPackageKey = pluginId.startsWith("@") || pluginId.includes("/");

  // Los IDs de paquete con scope son claves de plugin válidas pero UUIDs inválidos.
  // Omite getById() por completo para evitar errores de parseo de uuid de Postgres.
  if (isScopedPackageKey && !isUuid) {
    return registry.getByKey(pluginId);
  }

  try {
    const byId = await registry.getById(pluginId);
    if (byId) return byId;
  } catch (error) {
    const maybeCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    // Ignora los errores de conversión de UUID inválido y continúa con la búsqueda por clave.
    if (maybeCode !== "22P02") {
      throw error;
    }
  }

  return registry.getByKey(pluginId);
}

/**
 * Dependencias opcionales para las rutas de programación de trabajos de plugins.
 *
 * Cuando se proveen, las rutas relacionadas con trabajos (listar trabajos, listar ejecuciones, disparar trabajo) son
 * montadas. Cuando se omiten, las rutas devuelven 501 Not Implemented.
 */
export interface PluginRouteJobDeps {
  /** La instancia del programador de trabajos. */
  scheduler: PluginJobScheduler;
  /** El almacén de persistencia de trabajos. */
  jobStore: PluginJobStore;
}

/**
 * Dependencias opcionales para las rutas de webhooks de plugins.
 *
 * Cuando se proveen, la ruta de ingestión de webhooks está habilitada. Cuando se omiten,
 * las solicitudes POST de webhook devuelven 501 Not Implemented.
 */
export interface PluginRouteWebhookDeps {
  /** El gestor de workers para despachar llamadas RPC handleWebhook. */
  workerManager: PluginWorkerManager;
}

/**
 * Dependencias opcionales para las rutas de herramientas de plugins.
 *
 * Cuando se proveen, las rutas de descubrimiento y ejecución de herramientas están habilitadas.
 * Cuando se omiten, las rutas de herramientas devuelven 501 Not Implemented.
 */
export interface PluginRouteToolDeps {
  /** El despachador de herramientas para listar y ejecutar herramientas de plugins. */
  toolDispatcher: PluginToolDispatcher;
}

/**
 * Dependencias opcionales para las rutas puente de UI de plugins.
 *
 * Cuando se proveen, las rutas proxy puente getData y performAction están habilitadas,
 * permitiendo que los componentes de UI de plugins se comuniquen con su backend de worker vía
 * los hooks `usePluginData()` y `usePluginAction()`.
 *
 * @see PLUGIN_SPEC.md §13.8 — `getData`
 * @see PLUGIN_SPEC.md §13.9 — `performAction`
 * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
 */
export interface PluginRouteBridgeDeps {
  /** El gestor de workers para despachar llamadas RPC getData/performAction. */
  workerManager: PluginWorkerManager;
  /** Bus de streams opcional para push SSE del worker a la UI. */
  streamBus?: PluginStreamBus;
}

/** Cuerpo de solicitud para POST /api/plugins/tools/execute */
interface PluginToolExecuteRequest {
  /** Nombre de herramienta totalmente calificado (p. ej. "acme.linear:search-issues"). */
  tool: string;
  /** Parámetros que coinciden con el JSON Schema declarado de la herramienta. */
  parameters?: unknown;
  /** Contexto de ejecución del agente. */
  runContext: ToolRunContext;
}

/**
 * Crea un router de Express para la API de gestión de plugins.
 *
 * Rutas provistas:
 *
 * | Método | Ruta | Descripción |
 * |--------|------|-------------|
 * | GET | /plugins | Lista todos los plugins (filtro opcional ?status=) |
 * | GET | /plugins/ui-contributions | Obtiene slots de UI de plugins listos |
 * | GET | /plugins/:pluginId | Obtiene un plugin por ID o clave |
 * | POST | /plugins/install | Instala desde npm o ruta local |
 * | DELETE | /plugins/:pluginId | Desinstala (opcional ?purge=true) |
 * | POST | /plugins/:pluginId/enable | Habilita un plugin |
 * | POST | /plugins/:pluginId/disable | Deshabilita un plugin |
 * | GET | /plugins/:pluginId/health | Ejecuta diagnósticos de salud |
 * | POST | /plugins/:pluginId/upgrade | Actualiza a una versión más nueva |
 * | GET | /plugins/:pluginId/jobs | Lista trabajos de un plugin |
 * | GET | /plugins/:pluginId/jobs/:jobId/runs | Lista ejecuciones de un trabajo |
 * | POST | /plugins/:pluginId/jobs/:jobId/trigger | Dispara manualmente un trabajo |
 * | POST | /plugins/:pluginId/webhooks/:endpointKey | Recibe webhook entrante |
 * | GET | /plugins/tools | Lista todas las herramientas de plugins disponibles |
 * | GET | /plugins/tools?pluginId=... | Lista herramientas de un plugin específico |
 * | POST | /plugins/tools/execute | Ejecuta una herramienta de plugin |
 * | GET | /plugins/:pluginId/config | Obtiene la configuración actual del plugin |
 * | POST | /plugins/:pluginId/config | Guarda (upsert) la configuración del plugin |
 * | POST | /plugins/:pluginId/config/test | Prueba la configuración vía RPC validateConfig |
 * | POST | /plugins/:pluginId/bridge/data | Proxy getData al worker del plugin |
 * | POST | /plugins/:pluginId/bridge/action | Proxy performAction al worker del plugin |
 * | POST | /plugins/:pluginId/data/:key | Proxy getData al worker del plugin (clave en URL) |
 * | POST | /plugins/:pluginId/actions/:key | Proxy performAction al worker del plugin (clave en URL) |
 * | GET | /plugins/:pluginId/bridge/stream/:channel | Stream SSE del worker a la UI |
 * | GET | /plugins/:pluginId/dashboard | Datos agregados del panel de salud de plugins |
 *
 * **Nota de orden de rutas:** Las rutas estáticas (como /ui-contributions, /tools) deben
 * registrarse antes que las rutas parametrizadas (como /:pluginId) para evitar que Express
 * las interprete como un ID de plugin.
 *
 * @param db - Instancia de conexión a la base de datos
 * @param jobDeps - Dependencias opcionales de programación de trabajos
 * @param webhookDeps - Dependencias opcionales de ingestión de webhooks
 * @param toolDeps - Dependencias opcionales del despachador de herramientas
 * @param bridgeDeps - Dependencias opcionales de proxy puente para getData/performAction
 * @returns Router de Express con las rutas de plugins montadas
 */
export function pluginRoutes(
  db: Db,
  loader: ReturnType<typeof pluginLoader>,
  jobDeps?: PluginRouteJobDeps,
  webhookDeps?: PluginRouteWebhookDeps,
  toolDeps?: PluginRouteToolDeps,
  bridgeDeps?: PluginRouteBridgeDeps,
) {
  const router = Router();
  const registry = pluginRegistryService(db);
  const lifecycle = pluginLifecycleManager(db, {
    loader,
    workerManager: bridgeDeps?.workerManager ?? webhookDeps?.workerManager,
  });

  async function resolvePluginAuditCompanyIds(req: Request): Promise<string[]> {
    if (typeof (db as { select?: unknown }).select === "function") {
      const rows = await db
        .select({ id: companies.id })
        .from(companies);
      return rows.map((row) => row.id);
    }

    if (req.actor.type === "agent" && req.actor.companyId) {
      return [req.actor.companyId];
    }

    if (req.actor.type === "board") {
      return req.actor.companyIds ?? [];
    }

    return [];
  }

  async function logPluginMutationActivity(
    req: Request,
    action: string,
    entityId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const companyIds = await resolvePluginAuditCompanyIds(req);
    if (companyIds.length === 0) return;

    const actor = getActorInfo(req);
    await Promise.all(companyIds.map((companyId) =>
      logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action,
        entityType: "plugin",
        entityId,
        details,
      })));
  }

  /**
   * GET /api/plugins
   *
   * Lista todos los plugins instalados, opcionalmente filtrados por estado de ciclo de vida.
   *
   * Parámetros de consulta:
   * - `status` (opcional): Filtra por estado de ciclo de vida. Debe ser uno de los
   *   valores en `PLUGIN_STATUSES` (`installed`, `ready`, `error`,
   *   `upgrade_pending`, `uninstalled`). Devuelve HTTP 400 si el valor no es
   *   una cadena de estado reconocida.
   *
   * Respuesta: `PluginRecord[]`
   */
  router.get("/plugins", async (req, res) => {
    assertBoard(req);
    const rawStatus = req.query.status;
    if (rawStatus !== undefined) {
      if (typeof rawStatus !== "string" || !(PLUGIN_STATUSES as readonly string[]).includes(rawStatus)) {
        res.status(400).json({
        error: `Estado no válido '${String(rawStatus)}'. Debe ser uno de: ${PLUGIN_STATUSES.join(", ")}`,
        });
        return;
      }
    }
    const status = rawStatus as PluginStatus | undefined;
    const plugins = status
      ? await registry.listByStatus(status)
      : await registry.listInstalled();
    res.json(plugins);
  });

  /**
   * GET /api/plugins/examples
   *
   * Devuelve plugins de ejemplo propios incluidos en este repo, si existen.
   * Estos se pueden instalar mediante el flujo normal de instalación de ruta local.
   */
  router.get("/plugins/examples", async (req, res) => {
    assertBoard(req);
    res.json(listBundledPluginExamples());
  });

  // IMPORTANTE: Las rutas estáticas deben ir antes que las rutas parametrizadas
  // para evitar que Express interprete "ui-contributions" como un :pluginId

  /**
   * GET /api/plugins/ui-contributions
   *
   * Devuelve contribuciones de UI de todos los plugins en estado 'ready'.
   * Usado por el frontend para descubrir slots de UI de plugins y metadatos de launchers.
   *
   * La respuesta está normalizada para el host de slots del frontend:
   * - Solo incluye plugins con al menos un slot de UI o launcher declarado
   * - Excluye plugins con manifestJson nulo/faltante (defensivo)
   * - Los slots se extraen de manifest.ui.slots
   * - Los launchers se agregan de manifest.launchers heredado y manifest.ui.launchers
   *
   * Example response:
   * ```json
   * [
   *   {
   *     "pluginId": "plg_123",
   *     "pluginKey": "paperclip.claude-usage",
   *     "displayName": "Claude Usage",
   *     "version": "1.0.0",
   *     "uiEntryFile": "index.js",
   *     "slots": [],
   *     "launchers": [
   *       {
   *         "id": "claude-usage-toolbar",
   *         "displayName": "Claude Usage",
   *         "placementZone": "toolbarButton",
   *         "action": { "type": "openModal", "target": "ClaudeUsageView" },
   *         "render": { "environment": "hostOverlay", "bounds": "wide" }
   *       }
   *     ]
   *   }
   * ]
   * ```
   *
   * Respuesta: PluginUiContribution[]
   */
  router.get("/plugins/ui-contributions", async (req, res) => {
    assertBoard(req);
    const plugins = await registry.listByStatus("ready");

    const contributions: PluginUiContribution[] = plugins
      .map((plugin) => {
        // Verificación de seguridad: manifestJson siempre debería existir para plugins listos, pero protege contra null
        const manifest = plugin.manifestJson;
        if (!manifest) return null;

        const uiMetadata = getPluginUiContributionMetadata(manifest);
        if (!uiMetadata) return null;

        return {
          pluginId: plugin.id,
          pluginKey: plugin.pluginKey,
          displayName: manifest.displayName,
          version: plugin.version,
          updatedAt: plugin.updatedAt.toISOString(),
          uiEntryFile: uiMetadata.uiEntryFile,
          slots: uiMetadata.slots,
          launchers: uiMetadata.launchers,
        };
      })
      .filter((item): item is PluginUiContribution => item !== null);
    res.json(contributions);
  });

  // ===========================================================================
  // Rutas de descubrimiento y ejecución de herramientas
  // ===========================================================================

  /**
   * GET /api/plugins/tools
   *
   * Lista todas las herramientas aportadas por plugins disponibles en un formato apto para agentes.
   *
   * Parámetros de consulta:
   * - `pluginId` (opcional): Filtra las herramientas de un plugin específico
   *
   * Respuesta: `AgentToolDescriptor[]`
   * Errores: 501 si el despachador de herramientas no está configurado
   */
  router.get("/plugins/tools", async (req, res) => {
    assertBoard(req);

    if (!toolDeps) {
      res.status(501).json({ error: "El despacho de herramientas de plugins no está habilitado" });
      return;
    }

    const pluginId = req.query.pluginId as string | undefined;
    const filter = pluginId ? { pluginId } : undefined;
    const tools = toolDeps.toolDispatcher.listToolsForAgent(filter);
    res.json(tools);
  });

  /**
   * POST /api/plugins/tools/execute
   *
   * Execute a plugin-contributed tool by its namespaced name.
   *
   * Este es el endpoint principal que usa el servicio de agentes para invocar
   * herramientas de plugins durante una ejecución de agente.
   *
   * Cuerpo de solicitud:
   * - `tool`: Nombre de herramienta totalmente calificado (p. ej. "acme.linear:search-issues")
   * - `parameters`: Parámetros que coinciden con el JSON Schema declarado de la herramienta
   * - `runContext`: Contexto de ejecución del agente con agentId, runId, companyId, projectId
   *
   * Respuesta: `ToolExecutionResult`
   * Errores:
   * - 400 si falla la validación de la solicitud
   * - 404 si la herramienta no se encuentra
   * - 501 si el despachador de herramientas no está configurado
   * - 502 si el worker del plugin no está disponible o la llamada RPC falla
   */
  router.post("/plugins/tools/execute", async (req, res) => {
    assertBoard(req);

    if (!toolDeps) {
      res.status(501).json({ error: "El despacho de herramientas de plugins no está habilitado" });
      return;
    }

    const body = (req.body as PluginToolExecuteRequest | undefined);
    if (!body) {
        res.status(400).json({ error: "Se requiere el cuerpo de la solicitud" });
      return;
    }

    const { tool, parameters, runContext } = body;

    // Valida los campos requeridos
    if (!tool || typeof tool !== "string") {
        res.status(400).json({ error: '"tool" es requerido y debe ser una cadena' });
      return;
    }

    if (!runContext || typeof runContext !== "object") {
        res.status(400).json({ error: '"runContext" es requerido y debe ser un objeto' });
      return;
    }

    if (!runContext.agentId || !runContext.runId || !runContext.companyId || !runContext.projectId) {
      res.status(400).json({
        error: '"runContext" debe incluir agentId, runId, companyId y projectId',
      });
      return;
    }

    assertCompanyAccess(req, runContext.companyId);

    // Verifica que la herramienta existe
    const registeredTool = toolDeps.toolDispatcher.getTool(tool);
    if (!registeredTool) {
        res.status(404).json({ error: `Herramienta "${tool}" no encontrada` });
      return;
    }

    try {
      const result = await toolDeps.toolDispatcher.executeTool(
        tool,
        parameters ?? {},
        runContext,
      );
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Distingue entre "worker no en ejecución" (502) y otros errores (500)
      if (message.includes("not running") || message.includes("worker")) {
        res.status(502).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  /**
   * POST /api/plugins/install
   *
   * Instala un plugin desde npm o una ruta del sistema de archivos local.
   *
   * Cuerpo de solicitud:
   * - packageName: nombre del paquete npm o ruta local (requerido)
   * - version: versión objetivo para paquetes npm (opcional)
   * - isLocalPath: establece true si packageName es una ruta local
   *
   * El instalador:
   * 1. Descarga desde npm o carga desde la ruta local
   * 2. Valida el manifiesto (esquema + consistencia de capacidades)
   * 3. Registra en la base de datos
   * 4. Transiciona al estado `ready` si no se necesita aprobación de nueva capacidad
   *
   * Respuesta: `PluginRecord`
   *
   * Errores:
   * - `400` — fallo de validación o error de instalación (paquete no encontrado, manifiesto inválido, etc.)
   * - `500` — la instalación tuvo éxito pero falta el manifiesto (indica un bug del cargador)
   */
  router.post("/plugins/install", async (req, res) => {
    assertBoard(req);
    const { packageName, version, isLocalPath } = req.body as PluginInstallRequest;

    // Validación de entrada
    if (!packageName || typeof packageName !== "string") {
      res.status(400).json({ error: "packageName es requerido y debe ser una cadena" });
      return;
    }

    if (version !== undefined && typeof version !== "string") {
        res.status(400).json({ error: "version debe ser una cadena si se provee" });
      return;
    }

    if (isLocalPath !== undefined && typeof isLocalPath !== "boolean") {
        res.status(400).json({ error: "isLocalPath debe ser un booleano si se provee" });
      return;
    }

    // Valida el formato del nombre del paquete
    const trimmedPackage = packageName.trim();
    if (trimmedPackage.length === 0) {
      res.status(400).json({ error: "packageName no puede estar vacío" });
      return;
    }

    // Verificación básica de seguridad para el nombre del paquete (previene inyección)
    if (!isLocalPath && /[<>:"|?*]/.test(trimmedPackage)) {
      res.status(400).json({ error: "packageName contiene caracteres no válidos" });
      return;
    }

    try {
      const installOptions = isLocalPath
        ? { localPath: trimmedPackage }
        : { packageName: trimmedPackage, version: version?.trim() };

      const discovered = await loader.installPlugin(installOptions);

      if (!discovered.manifest) {
        res.status(500).json({ error: "Plugin instalado pero falta el manifiesto" });
        return;
      }

      // Transiciona al estado ready
      const existingPlugin = await registry.getByKey(discovered.manifest.id);
      if (existingPlugin) {
        await lifecycle.load(existingPlugin.id);
        const updated = await registry.getById(existingPlugin.id);
        await logPluginMutationActivity(req, "plugin.installed", existingPlugin.id, {
          pluginId: existingPlugin.id,
          pluginKey: existingPlugin.pluginKey,
          packageName: updated?.packageName ?? existingPlugin.packageName,
          version: updated?.version ?? existingPlugin.version,
          source: isLocalPath ? "local_path" : "npm",
        });
        publishGlobalLiveEvent({ type: "plugin.ui.updated", payload: { pluginId: existingPlugin.id, action: "installed" } });
        res.json(updated);
      } else {
        // Esto no debería pasar ya que installPlugin ya registra en la BD
        res.status(500).json({ error: "Plugin instalado pero no se encuentra en el registro" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  // ===========================================================================
  // Rutas proxy puente de UI (getData / performAction)
  // ===========================================================================

  /** Cuerpo de solicitud para POST /api/plugins/:pluginId/bridge/data */
  interface PluginBridgeDataRequest {
    /** Clave de datos definida por el plugin (p. ej. `"sync-health"`). */
    key: string;
    /** Scope de empresa opcional para autorizar llamadas puente con contexto de empresa. */
    companyId?: string;
    /** Contexto y parámetros de consulta opcionales desde la UI. */
    params?: Record<string, unknown>;
    /** Metadatos opcionales de launcher/renderizado del host para la llamada puente del worker. */
    renderEnvironment?: PluginLauncherRenderContextSnapshot | null;
  }

  /** Cuerpo de solicitud para POST /api/plugins/:pluginId/bridge/action */
  interface PluginBridgeActionRequest {
    /** Clave de acción definida por el plugin (p. ej. `"resync"`). */
    key: string;
    /** Scope de empresa opcional para autorizar llamadas puente con contexto de empresa. */
    companyId?: string;
    /** Parámetros opcionales desde la UI. */
    params?: Record<string, unknown>;
    /** Metadatos opcionales de launcher/renderizado del host para la llamada puente del worker. */
    renderEnvironment?: PluginLauncherRenderContextSnapshot | null;
  }

  /** Envoltorio de respuesta para errores puente. */
  interface PluginBridgeErrorResponse {
    code: PluginBridgeErrorCode;
    message: string;
    details?: unknown;
  }

  /**
   * Mapea un error RPC del worker a un código de error a nivel puente.
   *
   * JsonRpcCallError lleva códigos numéricos del espacio de códigos de error RPC de plugins.
   * Este ayudante los mapea a los códigos de error de cadena definidos en PluginBridgeErrorCode.
   *
   * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
   */
  function mapRpcErrorToBridgeError(err: unknown): PluginBridgeErrorResponse {
    if (err instanceof JsonRpcCallError) {
      switch (err.code) {
        case PLUGIN_RPC_ERROR_CODES.WORKER_UNAVAILABLE:
          return {
            code: "WORKER_UNAVAILABLE",
            message: err.message,
            details: err.data,
          };
        case PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED:
          return {
            code: "CAPABILITY_DENIED",
            message: err.message,
            details: err.data,
          };
        case PLUGIN_RPC_ERROR_CODES.TIMEOUT:
          return {
            code: "TIMEOUT",
            message: err.message,
            details: err.data,
          };
        case PLUGIN_RPC_ERROR_CODES.WORKER_ERROR:
          return {
            code: "WORKER_ERROR",
            message: err.message,
            details: err.data,
          };
        default:
          return {
            code: "UNKNOWN",
            message: err.message,
            details: err.data,
          };
      }
    }

    const message = err instanceof Error ? err.message : String(err);

    // Worker no en ejecución — expone como WORKER_UNAVAILABLE
    if (message.includes("not running") || message.includes("not registered")) {
      return {
        code: "WORKER_UNAVAILABLE",
        message,
      };
    }

    return {
      code: "UNKNOWN",
      message,
    };
  }

  /**
   * POST /api/plugins/:pluginId/bridge/data
   *
   * Hace proxy de una llamada `getData` desde la UI del plugin al worker del plugin.
   *
   * Esta es la mitad del lado del servidor del hook puente `usePluginData(key, params)`.
   * El frontend envía un POST con la clave de datos y parámetros opcionales; el host
   * reenvía la llamada al worker vía el método RPC `getData` y devuelve
   * el resultado.
   *
   * Cuerpo de solicitud:
   * - `key`: Clave de datos definida por el plugin (p. ej. `"sync-health"`)
   * - `params`: Parámetros de consulta opcionales reenviados al manejador del worker
   *
   * Respuesta: El resultado crudo del manejador `getData` del worker
   *
   * El cuerpo de respuesta de error sigue la forma `PluginBridgeError`:
   * `{ code: PluginBridgeErrorCode, message: string, details?: unknown }`
   *
   * Errores:
   * - 400 si falla la validación de la solicitud
   * - 404 si el plugin no se encuentra
   * - 501 si las deps puente no están configuradas
   * - 502 si el worker no está disponible o devuelve un error
   *
   * @see PLUGIN_SPEC.md §13.8 — `getData`
   * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
   */
  router.post("/plugins/:pluginId/bridge/data", async (req, res) => {
    assertBoard(req);

    if (!bridgeDeps) {
      res.status(501).json({ error: "El puente de plugins no está habilitado" });
      return;
    }

    const { pluginId } = req.params;

    // Resuelve el plugin
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin no encontrado" });
      return;
    }

    // Valida que el plugin esté en estado ready
    if (plugin.status !== "ready") {
      const bridgeError: PluginBridgeErrorResponse = {
        code: "WORKER_UNAVAILABLE",
        message: `Plugin is not ready (current status: ${plugin.status})`,
      };
      res.status(502).json(bridgeError);
      return;
    }

    // Valida el cuerpo de la solicitud
    const body = req.body as PluginBridgeDataRequest | undefined;
    if (!body || !body.key || typeof body.key !== "string") {
        res.status(400).json({ error: '"key" es requerido y debe ser una cadena' });
      return;
    }

    if (body.companyId) {
      assertCompanyAccess(req, body.companyId);
    }

    try {
      const result = await bridgeDeps.workerManager.call(
        plugin.id,
        "getData",
        {
          key: body.key,
          params: body.params ?? {},
          renderEnvironment: body.renderEnvironment ?? null,
        },
      );
      res.json({ data: result });
    } catch (err) {
      const bridgeError = mapRpcErrorToBridgeError(err);
      res.status(502).json(bridgeError);
    }
  });

  /**
   * POST /api/plugins/:pluginId/bridge/action
   *
   * Hace proxy de una llamada `performAction` desde la UI del plugin al worker del plugin.
   *
   * Esta es la mitad del lado del servidor del hook puente `usePluginAction(key)`.
   * El frontend envía un POST con la clave de acción y parámetros opcionales; el host
   * reenvía la llamada al worker vía el método RPC `performAction` y
   * devuelve el resultado.
   *
   * Cuerpo de solicitud:
   * - `key`: Clave de acción definida por el plugin (p. ej. `"resync"`)
   * - `params`: Parámetros opcionales reenviados al manejador del worker
   *
   * Respuesta: El resultado crudo del manejador `performAction` del worker
   *
   * El cuerpo de respuesta de error sigue la forma `PluginBridgeError`:
   * `{ code: PluginBridgeErrorCode, message: string, details?: unknown }`
   *
   * Errores:
   * - 400 si falla la validación de la solicitud
   * - 404 si el plugin no se encuentra
   * - 501 si las deps puente no están configuradas
   * - 502 si el worker no está disponible o devuelve un error
   *
   * @see PLUGIN_SPEC.md §13.9 — `performAction`
   * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
   */
  router.post("/plugins/:pluginId/bridge/action", async (req, res) => {
    assertBoard(req);

    if (!bridgeDeps) {
      res.status(501).json({ error: "El puente de plugins no está habilitado" });
      return;
    }

    const { pluginId } = req.params;

    // Resuelve el plugin
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    // Valida que el plugin esté en estado ready
    if (plugin.status !== "ready") {
      const bridgeError: PluginBridgeErrorResponse = {
        code: "WORKER_UNAVAILABLE",
        message: `Plugin is not ready (current status: ${plugin.status})`,
      };
      res.status(502).json(bridgeError);
      return;
    }

    // Valida el cuerpo de la solicitud
    const body = req.body as PluginBridgeActionRequest | undefined;
    if (!body || !body.key || typeof body.key !== "string") {
        res.status(400).json({ error: '"key" es requerido y debe ser una cadena' });
      return;
    }

    if (body.companyId) {
      assertCompanyAccess(req, body.companyId);
    }

    try {
      const result = await bridgeDeps.workerManager.call(
        plugin.id,
        "performAction",
        {
          key: body.key,
          params: body.params ?? {},
          renderEnvironment: body.renderEnvironment ?? null,
        },
      );
      res.json({ data: result });
    } catch (err) {
      const bridgeError = mapRpcErrorToBridgeError(err);
      res.status(502).json(bridgeError);
    }
  });

  // ===========================================================================
  // Rutas puente con clave en URL (clave como parámetro de ruta)
  // ===========================================================================

  /**
   * POST /api/plugins/:pluginId/data/:key
   *
   * Hace proxy de una llamada `getData` desde la UI del plugin al worker del plugin, con la
   * clave de datos especificada como parámetro de ruta URL en lugar de en el cuerpo de la solicitud.
   *
   * Esta es una alternativa REST-amigable a `POST /plugins/:pluginId/bridge/data`.
   * Los hooks puente del frontend usan este endpoint para URLs más limpias.
   *
   * Cuerpo de solicitud (opcional):
   * - `params`: Parámetros de consulta opcionales reenviados al manejador del worker
   *
   * Respuesta: El resultado crudo del manejador `getData` del worker envuelto como `{ data: T }`
   *
   * El cuerpo de respuesta de error sigue la forma `PluginBridgeError`:
   * `{ code: PluginBridgeErrorCode, message: string, details?: unknown }`
   *
   * Errores:
   * - 404 si el plugin no se encuentra
   * - 501 si las deps puente no están configuradas
   * - 502 si el worker no está disponible o devuelve un error
   *
   * @see PLUGIN_SPEC.md §13.8 — `getData`
   * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
   */
  router.post("/plugins/:pluginId/data/:key", async (req, res) => {
    assertBoard(req);

    if (!bridgeDeps) {
      res.status(501).json({ error: "El puente de plugins no está habilitado" });
      return;
    }

    const { pluginId, key } = req.params;

    // Resuelve el plugin
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    // Valida que el plugin esté en estado ready
    if (plugin.status !== "ready") {
      const bridgeError: PluginBridgeErrorResponse = {
        code: "WORKER_UNAVAILABLE",
        message: `Plugin is not ready (current status: ${plugin.status})`,
      };
      res.status(502).json(bridgeError);
      return;
    }

    const body = req.body as {
      companyId?: string;
      params?: Record<string, unknown>;
      renderEnvironment?: PluginLauncherRenderContextSnapshot | null;
    } | undefined;

    if (body?.companyId) {
      assertCompanyAccess(req, body.companyId);
    }

    try {
      const result = await bridgeDeps.workerManager.call(
        plugin.id,
        "getData",
        {
          key,
          params: body?.params ?? {},
          renderEnvironment: body?.renderEnvironment ?? null,
        },
      );
      res.json({ data: result });
    } catch (err) {
      const bridgeError = mapRpcErrorToBridgeError(err);
      res.status(502).json(bridgeError);
    }
  });

  /**
   * POST /api/plugins/:pluginId/actions/:key
   *
   * Hace proxy de una llamada `performAction` desde la UI del plugin al worker del plugin, con la
   * clave de acción especificada como parámetro de ruta URL en lugar de en el cuerpo de la solicitud.
   *
   * Esta es una alternativa REST-amigable a `POST /plugins/:pluginId/bridge/action`.
   * Los hooks puente del frontend usan este endpoint para URLs más limpias.
   *
   * Cuerpo de solicitud (opcional):
   * - `params`: Parámetros opcionales reenviados al manejador del worker
   *
   * Respuesta: El resultado crudo del manejador `performAction` del worker envuelto como `{ data: T }`
   *
   * El cuerpo de respuesta de error sigue la forma `PluginBridgeError`:
   * `{ code: PluginBridgeErrorCode, message: string, details?: unknown }`
   *
   * Errores:
   * - 404 si el plugin no se encuentra
   * - 501 si las deps puente no están configuradas
   * - 502 si el worker no está disponible o devuelve un error
   *
   * @see PLUGIN_SPEC.md §13.9 — `performAction`
   * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
   */
  router.post("/plugins/:pluginId/actions/:key", async (req, res) => {
    assertBoard(req);

    if (!bridgeDeps) {
      res.status(501).json({ error: "El puente de plugins no está habilitado" });
      return;
    }

    const { pluginId, key } = req.params;

    // Resuelve el plugin
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    // Valida que el plugin esté en estado ready
    if (plugin.status !== "ready") {
      const bridgeError: PluginBridgeErrorResponse = {
        code: "WORKER_UNAVAILABLE",
        message: `Plugin is not ready (current status: ${plugin.status})`,
      };
      res.status(502).json(bridgeError);
      return;
    }

    const body = req.body as {
      companyId?: string;
      params?: Record<string, unknown>;
      renderEnvironment?: PluginLauncherRenderContextSnapshot | null;
    } | undefined;

    if (body?.companyId) {
      assertCompanyAccess(req, body.companyId);
    }

    try {
      const result = await bridgeDeps.workerManager.call(
        plugin.id,
        "performAction",
        {
          key,
          params: body?.params ?? {},
          renderEnvironment: body?.renderEnvironment ?? null,
        },
      );
      res.json({ data: result });
    } catch (err) {
      const bridgeError = mapRpcErrorToBridgeError(err);
      res.status(502).json(bridgeError);
    }
  });

  // ===========================================================================
  // Ruta puente de stream SSE
  // ===========================================================================

  /**
   * GET /api/plugins/:pluginId/bridge/stream/:channel
   *
   * Endpoint Server-Sent Events para streaming en tiempo real del worker del plugin a la UI.
   *
   * El worker empuja eventos vía `ctx.streams.emit(channel, event)` que llegan
   * como notificaciones JSON-RPC al host, se publican en el PluginStreamBus,
   * y se distribuyen a todos los clientes SSE conectados que coincidan con (pluginId, channel,
   * companyId).
   *
   * Parámetros de consulta:
   * - `companyId` (requerido): Limita los eventos a una empresa específica
   *
   * Tipos de eventos SSE:
   * - `message`: Un evento de datos del worker (por defecto)
   * - `open`: El worker abrió el canal de stream
   * - `close`: El worker cerró el canal de stream — el cliente debe desconectarse
   *
   * Errores:
   * - 400 si falta companyId
   * - 404 si el plugin no se encuentra
   * - 501 si las deps puente o el bus de streams no están configurados
   */
  router.get("/plugins/:pluginId/bridge/stream/:channel", async (req, res) => {
    assertBoard(req);

    if (!bridgeDeps?.streamBus) {
      res.status(501).json({ error: "El puente de streams de plugins no está habilitado" });
      return;
    }

    const { pluginId, channel } = req.params;
    const companyId = req.query.companyId as string | undefined;

    if (!companyId) {
        res.status(400).json({ error: 'Se requiere el parámetro de consulta "companyId"' });
      return;
    }

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    assertCompanyAccess(req, companyId);

    // Establece los encabezados SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    // Envía un comentario inicial para establecer la conexión
    res.write(":ok\n\n");

    let unsubscribed = false;
    const safeUnsubscribe = () => {
      if (!unsubscribed) {
        unsubscribed = true;
        unsubscribe();
      }
    };

    const unsubscribe = bridgeDeps.streamBus.subscribe(
      plugin.id,
      channel,
      companyId,
      (event, eventType) => {
        if (unsubscribed || !res.writable) return;
        try {
          if (eventType !== "message") {
            res.write(`event: ${eventType}\n`);
          }
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // Conexión cerrada o error de escritura — deja de entregar
          safeUnsubscribe();
        }
      },
    );

    req.on("close", safeUnsubscribe);
    res.on("error", safeUnsubscribe);
  });

  /**
   * GET /api/plugins/:pluginId
   *
   * Obtiene información detallada de un solo plugin.
   *
   * El parámetro :pluginId acepta:
   * - UUID de base de datos (p. ej. "abc123-def456")
   * - Clave de plugin (p. ej. "acme.linear")
   *
   * Respuesta: PluginRecord
   * Errores: 404 si el plugin no se encuentra
   */
  router.get("/plugins/:pluginId", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    // Enriquece con capacidades del worker cuando están disponibles
    const worker = bridgeDeps?.workerManager.getWorker(plugin.id);
    const supportsConfigTest = worker
      ? worker.supportedMethods.includes("validateConfig")
      : false;

    res.json({ ...plugin, supportsConfigTest });
  });

  /**
   * DELETE /api/plugins/:pluginId
   *
   * Desinstala un plugin.
   *
   * Parámetros de consulta:
   * - purge: Si es "true", elimina permanentemente todos los datos del plugin (eliminación total)
   *          De lo contrario, eliminación suave con retención de datos de 30 días
   *
   * Respuesta: PluginRecord (el registro eliminado)
   * Errores: 404 si el plugin no se encuentra, 400 para errores de ciclo de vida
   */
  router.delete("/plugins/:pluginId", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;
    const purge = req.query.purge === "true";

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    try {
      const result = await lifecycle.unload(plugin.id, purge);
      await logPluginMutationActivity(req, "plugin.uninstalled", plugin.id, {
        pluginId: plugin.id,
        pluginKey: plugin.pluginKey,
        purge,
      });
      publishGlobalLiveEvent({ type: "plugin.ui.updated", payload: { pluginId: plugin.id, action: "uninstalled" } });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /**
   * POST /api/plugins/:pluginId/enable
   *
   * Habilita un plugin que está actualmente deshabilitado o en estado de error.
   *
   * Transiciona el plugin al estado 'ready' después de la carga y validación.
   *
   * Respuesta: PluginRecord
   * Errores: 404 si el plugin no se encuentra, 400 para errores de ciclo de vida
   */
  router.post("/plugins/:pluginId/enable", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    try {
      const result = await lifecycle.enable(plugin.id);
      await logPluginMutationActivity(req, "plugin.enabled", plugin.id, {
        pluginId: plugin.id,
        pluginKey: plugin.pluginKey,
        version: result?.version ?? plugin.version,
      });
      publishGlobalLiveEvent({ type: "plugin.ui.updated", payload: { pluginId: plugin.id, action: "enabled" } });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /**
   * POST /api/plugins/:pluginId/disable
   *
   * Deshabilita un plugin en ejecución.
   *
   * Cuerpo de solicitud (opcional):
   * - reason: Motivo legible por humanos para deshabilitar
   *
   * El plugin transiciona al estado 'installed' y deja de procesar eventos.
   *
   * Respuesta: PluginRecord
   * Errores: 404 si el plugin no se encuentra, 400 para errores de ciclo de vida
   */
  router.post("/plugins/:pluginId/disable", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;
    const body = req.body as { reason?: string } | undefined;
    const reason = body?.reason;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    try {
      const result = await lifecycle.disable(plugin.id, reason);
      await logPluginMutationActivity(req, "plugin.disabled", plugin.id, {
        pluginId: plugin.id,
        pluginKey: plugin.pluginKey,
        reason: reason ?? null,
      });
      publishGlobalLiveEvent({ type: "plugin.ui.updated", payload: { pluginId: plugin.id, action: "disabled" } });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /**
   * GET /api/plugins/:pluginId/health
   *
   * Ejecuta diagnósticos de salud en un plugin.
   *
   * Realiza las siguientes verificaciones:
   * 1. Registro: El plugin está registrado en la base de datos
   * 2. Manifiesto: El manifiesto es válido y analizable
   * 3. Estado: El plugin está en estado 'ready'
   * 4. Estado de error: El plugin no tiene errores sin manejar
   *
   * Respuesta: PluginHealthCheckResult
   * Errores: 404 si el plugin no se encuentra
   */
  router.get("/plugins/:pluginId/health", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    const checks: PluginHealthCheckResult["checks"] = [];

    // Verificación 1: El plugin está registrado
    checks.push({
      name: "registry",
      passed: true,
      message: "Plugin found in registry",
    });

    // Verificación 2: El manifiesto es válido
    const hasValidManifest = Boolean(plugin.manifestJson?.id);
    checks.push({
      name: "manifest",
      passed: hasValidManifest,
      message: hasValidManifest ? "Manifest is valid" : "Manifest is invalid or missing",
    });

    // Verificación 3: Estado del plugin
    const isHealthy = plugin.status === "ready";
    checks.push({
      name: "status",
      passed: isHealthy,
      message: `Estado actual: ${plugin.status}`,
    });

    // Verificación 4: Sin último error
    const hasNoError = !plugin.lastError;
    if (!hasNoError) {
      checks.push({
        name: "error_state",
        passed: false,
        message: plugin.lastError ?? undefined,
      });
    }

    const result: PluginHealthCheckResult = {
      pluginId: plugin.id,
      status: plugin.status,
      healthy: isHealthy && hasValidManifest && hasNoError,
      checks,
      lastError: plugin.lastError ?? undefined,
    };

    res.json(result);
  });

  /**
   * GET /api/plugins/:pluginId/logs
   *
   * Consulta entradas recientes de log de un plugin.
   *
   * Parámetros de consulta:
   * - limit: Número máximo de entradas (por defecto 25, máximo 500)
   * - level: Filtra por nivel de log (info, warn, error, debug)
   * - since: Marca de tiempo ISO para filtrar logs más nuevos que este momento
   *
   * Respuesta: Arreglo de entradas de log, las más nuevas primero.
   */
  router.get("/plugins/:pluginId/logs", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 25, 1), 500);
    const level = req.query.level as string | undefined;
    const since = req.query.since as string | undefined;

    const conditions = [eq(pluginLogs.pluginId, plugin.id)];
    if (level) {
      conditions.push(eq(pluginLogs.level, level));
    }
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push(gte(pluginLogs.createdAt, sinceDate));
      }
    }

    const rows = await db
      .select()
      .from(pluginLogs)
      .where(and(...conditions))
      .orderBy(desc(pluginLogs.createdAt))
      .limit(limit);

    res.json(rows);
  });

  /**
   * POST /api/plugins/:pluginId/upgrade
   *
   * Actualiza un plugin a una versión más nueva.
   *
   * Cuerpo de solicitud (opcional):
   * - version: Versión objetivo (por defecto latest)
   *
   * Si la actualización agrega nuevas capacidades, el plugin transiciona al
   * estado 'upgrade_pending' para aprobación del board. De lo contrario, pasa
   * directamente a 'ready'.
   *
   * Respuesta: PluginRecord
   * Errores: 404 si el plugin no se encuentra, 400 para errores de ciclo de vida
   */
  router.post("/plugins/:pluginId/upgrade", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;
    const body = req.body as { version?: string } | undefined;
    const version = body?.version;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    try {
      // Actualiza el plugin - esto típicamente:
      // 1. Descarga la nueva versión
      // 2. Compara capacidades
      // 3. Si hay nuevas capacidades, marca como upgrade_pending
      // 4. De lo contrario, transiciona a ready
      const result = await lifecycle.upgrade(plugin.id, version);
      await logPluginMutationActivity(req, "plugin.upgraded", plugin.id, {
        pluginId: plugin.id,
        pluginKey: plugin.pluginKey,
        previousVersion: plugin.version,
        version: result?.version ?? plugin.version,
        targetVersion: version ?? null,
      });
      publishGlobalLiveEvent({ type: "plugin.ui.updated", payload: { pluginId: plugin.id, action: "upgraded" } });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  // ===========================================================================
  // Rutas de configuración de plugins
  // ===========================================================================

  /**
   * GET /api/plugins/:pluginId/config
   *
   * Obtiene la configuración de instancia actual de un plugin.
   *
   * Devuelve el registro `PluginConfig` si existe, o `null` si el plugin
   * aún no se ha configurado.
   *
   * Respuesta: `PluginConfig | null`
   * Errores: 404 si el plugin no se encuentra
   */
  router.get("/plugins/:pluginId/config", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    const config = await registry.getConfig(plugin.id);
    res.json(config);
  });

  /**
   * POST /api/plugins/:pluginId/config
   *
   * Guarda (crea o reemplaza) la configuración de instancia de un plugin.
   *
   * El llamador provee el objeto completo `configJson`. El servidor lo persiste
   * vía `registry.upsertConfig()`.
   *
   * Cuerpo de solicitud:
   * - `configJson`: Valores de configuración que coinciden con el `instanceConfigSchema` del plugin
   *
   * Respuesta: `PluginConfig`
   * Errores:
   * - 400 si falla la validación de la solicitud
   * - 404 si el plugin no se encuentra
   */
  router.post("/plugins/:pluginId/config", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    const body = req.body as { configJson?: Record<string, unknown> } | undefined;
    if (!body?.configJson || typeof body.configJson !== "object") {
        res.status(400).json({ error: '"configJson" es requerido y debe ser un objeto' });
      return;
    }

    // Elimina devUiUrl a menos que el llamador sea un admin de instancia. devUiUrl activa
    // un dev-proxy en la ruta de archivos estáticos que podría abusarse para SSRF si
    // cualquier usuario a nivel de board pudiera establecerlo.
    if (
      "devUiUrl" in body.configJson &&
      !(req.actor.type === "board" && req.actor.isInstanceAdmin)
    ) {
      delete body.configJson.devUiUrl;
    }

    // Valida configJson contra el instanceConfigSchema del plugin (si está declarado).
    // Esto asegura que los llamadores CLI/API obtengan la misma validación que la UI hace del lado del cliente.
    const schema = plugin.manifestJson?.instanceConfigSchema;
    if (schema && Object.keys(schema).length > 0) {
      const validation = validateInstanceConfig(body.configJson, schema);
      if (!validation.valid) {
        res.status(400).json({
          error: "La configuración no coincide con el instanceConfigSchema del plugin",
          fieldErrors: validation.errors,
        });
        return;
      }
    }

    try {
      const result = await registry.upsertConfig(plugin.id, {
        configJson: body.configJson,
      });
      await logPluginMutationActivity(req, "plugin.config.updated", plugin.id, {
        pluginId: plugin.id,
        pluginKey: plugin.pluginKey,
        configKeyCount: Object.keys(body.configJson).length,
      });

      // Notifica al worker en ejecución sobre el cambio de configuración (PLUGIN_SPEC §25.4.4).
      // Si el worker implementa onConfigChanged, envía la nueva configuración vía RPC.
      // Si no lo hace (METHOD_NOT_IMPLEMENTED), reinicia el worker para que tome
      // la nueva configuración al reinicializar. Si no hay worker en ejecución, omite.
      if (bridgeDeps?.workerManager.isRunning(plugin.id)) {
        try {
          await bridgeDeps.workerManager.call(
            plugin.id,
            "configChanged",
            { config: body.configJson },
          );
        } catch (rpcErr) {
          if (
            rpcErr instanceof JsonRpcCallError &&
            rpcErr.code === PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED
          ) {
            // El worker no maneja configuración en vivo — reinícialo.
            try {
              await lifecycle.restartWorker(plugin.id);
            } catch {
              // El fallo de reinicio no es fatal para la respuesta de guardado de configuración.
            }
          }
          // Otros errores RPC (timeout, no disponible) no son fatales — la configuración
          // ya está persistida y surtirá efecto en el próximo reinicio del worker.
        }
      }

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /**
   * POST /api/plugins/:pluginId/config/test
   *
   * Prueba una configuración de plugin sin persistirla llamando al método RPC
   * `validateConfig` del worker del plugin.
   *
   * Solo funciona cuando el worker del plugin implementa `onValidateConfig`.
   * Si el worker no implementa el método, devuelve
   * `{ valid: false, supported: false, message: "..." }` con HTTP 200.
   *
   * Cuerpo de solicitud:
   * - `configJson`: Valores de configuración a validar
   *
   * Respuesta: `{ valid: boolean; message?: string; supported?: boolean }`
   * Errores:
   * - 400 si falla la validación de la solicitud
   * - 404 si el plugin no se encuentra
   * - 501 si las deps puente (gestor de workers) no están configuradas
   * - 502 si el worker no está disponible
   */
  router.post("/plugins/:pluginId/config/test", async (req, res) => {
    assertBoard(req);

    if (!bridgeDeps) {
      res.status(501).json({ error: "El puente de plugins no está habilitado" });
      return;
    }

    const { pluginId } = req.params;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    if (plugin.status !== "ready") {
      res.status(400).json({
        error: `El plugin no está listo (estado actual: ${plugin.status})`,
      });
      return;
    }

    const body = req.body as { configJson?: Record<string, unknown> } | undefined;
    if (!body?.configJson || typeof body.configJson !== "object") {
        res.status(400).json({ error: '"configJson" es requerido y debe ser un objeto' });
      return;
    }

    // Rechazo rápido a nivel de esquema antes de llegar al RPC del worker.
    const schema = plugin.manifestJson?.instanceConfigSchema;
    if (schema && Object.keys(schema).length > 0) {
      const validation = validateInstanceConfig(body.configJson, schema);
      if (!validation.valid) {
        res.status(400).json({
          error: "La configuración no coincide con el instanceConfigSchema del plugin",
          fieldErrors: validation.errors,
        });
        return;
      }
    }

    try {
      const result = await bridgeDeps.workerManager.call(
        plugin.id,
        "validateConfig",
        { config: body.configJson },
      );

      // El worker devuelve PluginConfigValidationResult { ok, warnings?, errors? }
      // Mapea a la forma esperada por el frontend { valid, message? }
      if (result.ok) {
        const warningText = result.warnings?.length
          ? `Warnings: ${result.warnings.join("; ")}`
          : undefined;
        res.json({ valid: true, message: warningText });
      } else {
        const errorText = result.errors?.length
          ? result.errors.join("; ")
          : "Configuration validation failed.";
        res.json({ valid: false, message: errorText });
      }
    } catch (err) {
      // Si el worker no implementa validateConfig, devuelve una respuesta estructurada
      if (
        err instanceof JsonRpcCallError &&
        err.code === PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED
      ) {
        res.json({
          valid: false,
          supported: false,
          message: "This plugin does not support configuration testing.",
        });
        return;
      }

      // Worker no disponible u otros errores RPC
      const bridgeError = mapRpcErrorToBridgeError(err);
      res.status(502).json(bridgeError);
    }
  });

  // ===========================================================================
  // Rutas de programación de trabajos
  // ===========================================================================

  /**
   * GET /api/plugins/:pluginId/jobs
   *
   * Lista todos los trabajos programados de un plugin.
   *
   * Parámetros de consulta:
   * - `status` (opcional): Filtra por estado del trabajo (`active`, `paused`, `failed`)
   *
   * Respuesta: PluginJobRecord[]
   * Errores: 404 si el plugin no se encuentra
   */
  router.get("/plugins/:pluginId/jobs", async (req, res) => {
    assertBoard(req);
    if (!jobDeps) {
      res.status(501).json({ error: "La programación de trabajos no está habilitada" });
      return;
    }

    const { pluginId } = req.params;
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    const rawStatus = req.query.status as string | undefined;
    const validStatuses = ["active", "paused", "failed"];
    if (rawStatus !== undefined && !validStatuses.includes(rawStatus)) {
      res.status(400).json({
        error: `Estado no válido '${rawStatus}'. Debe ser uno de: ${validStatuses.join(", ")}`,
      });
      return;
    }

    try {
      const jobs = await jobDeps.jobStore.listJobs(
        plugin.id,
        rawStatus as "active" | "paused" | "failed" | undefined,
      );
      res.json(jobs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/plugins/:pluginId/jobs/:jobId/runs
   *
   * Lista el historial de ejecución de un trabajo específico.
   *
   * Parámetros de consulta:
   * - `limit` (opcional): Número máximo de ejecuciones a devolver (por defecto: 50)
   *
   * Respuesta: PluginJobRunRecord[]
   * Errores: 404 si el plugin no se encuentra
   */
  router.get("/plugins/:pluginId/jobs/:jobId/runs", async (req, res) => {
    assertBoard(req);
    if (!jobDeps) {
      res.status(501).json({ error: "La programación de trabajos no está habilitada" });
      return;
    }

    const { pluginId, jobId } = req.params;
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    const job = await jobDeps.jobStore.getJobByIdForPlugin(plugin.id, jobId);
    if (!job) {
        res.status(404).json({ error: "Trabajo no encontrado" });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;
    if (isNaN(limit) || limit < 1 || limit > 500) {
        res.status(400).json({ error: "limit debe ser un número entre 1 y 500" });
      return;
    }

    try {
      const runs = await jobDeps.jobStore.listRunsByJob(jobId, limit);
      res.json(runs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/plugins/:pluginId/jobs/:jobId/trigger
   *
   * Dispara manualmente la ejecución de un trabajo fuera de su horario cron.
   *
   * Crea una ejecución con `trigger: "manual"` y despacha inmediatamente.
   * La respuesta vuelve antes de que el trabajo complete (no bloqueante).
   *
   * Respuesta: `{ runId: string, jobId: string }`
   * Errores:
   * - 404 si el plugin no se encuentra
   * - 400 si el trabajo no se encuentra, no está activo, ya está en ejecución o el worker no está disponible
   */
  router.post("/plugins/:pluginId/jobs/:jobId/trigger", async (req, res) => {
    assertBoard(req);
    if (!jobDeps) {
      res.status(501).json({ error: "La programación de trabajos no está habilitada" });
      return;
    }

    const { pluginId, jobId } = req.params;
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    const job = await jobDeps.jobStore.getJobByIdForPlugin(plugin.id, jobId);
    if (!job) {
        res.status(404).json({ error: "Trabajo no encontrado" });
      return;
    }

    try {
      const result = await jobDeps.scheduler.triggerJob(jobId, "manual");
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  // ===========================================================================
  // Ruta de ingestión de webhooks
  // ===========================================================================

  /**
   * POST /api/plugins/:pluginId/webhooks/:endpointKey
   *
   * Recibe una entrega de webhook entrante para un plugin.
   *
   * Esta ruta la llaman sistemas externos (p. ej. GitHub, Linear, Stripe) para
   * entregar payloads de webhook a un plugin. El host valida que:
   * 1. El plugin existe y está en estado 'ready'
   * 2. El plugin declara la capacidad `webhooks.receive`
   * 3. El `endpointKey` coincide con un webhook declarado en el manifiesto
   *
   * La entrega se registra en la tabla `plugin_webhook_deliveries` y se
   * despacha al worker vía el método RPC `handleWebhook`.
   *
   * **Nota:** Esta ruta NO requiere autenticación de board — los endpoints
   * de webhook deben ser públicamente accesibles para llamadores externos. La verificación
   * de firma es responsabilidad del plugin.
   *
   * Respuesta: `{ deliveryId: string, status: string }`
   * Errores:
   * - 404 si el plugin no se encuentra o endpointKey no está declarado
   * - 400 si el plugin no está en estado ready o carece de la capacidad webhooks.receive
   * - 502 si el worker no está disponible o la llamada RPC falla
   */
  router.post("/plugins/:pluginId/webhooks/:endpointKey", async (req, res) => {
    if (!webhookDeps) {
      res.status(501).json({ error: "La ingestión de webhooks no está habilitada" });
      return;
    }

    const { pluginId, endpointKey } = req.params;

    // Paso 1: Resuelve el plugin
    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    // Paso 2: Valida que el plugin esté en estado 'ready'
    if (plugin.status !== "ready") {
      res.status(400).json({
        error: `El plugin no está listo (estado actual: ${plugin.status})`,
      });
      return;
    }

    // Paso 3: Valida que el plugin tiene la capacidad webhooks.receive
    const manifest = plugin.manifestJson;
    if (!manifest) {
      res.status(400).json({ error: "Falta el manifiesto del plugin" });
      return;
    }

    const capabilities = manifest.capabilities ?? [];
    if (!capabilities.includes("webhooks.receive")) {
      res.status(400).json({
          error: "El plugin no tiene la capacidad webhooks.receive",
      });
      return;
    }

    // Paso 4: Valida que el endpointKey existe en las declaraciones de webhook del manifiesto
    const declaredWebhooks = manifest.webhooks ?? [];
    const webhookDecl = declaredWebhooks.find(
      (w) => w.endpointKey === endpointKey,
    );
    if (!webhookDecl) {
      res.status(404).json({
        error: `El endpoint de webhook '${endpointKey}' no está declarado por este plugin`,
      });
      return;
    }

    // Paso 5: Extrae los datos de la solicitud
    const requestId = randomUUID();
    const rawHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        rawHeaders[key] = value;
      } else if (Array.isArray(value)) {
        rawHeaders[key] = value.join(", ");
      }
    }

    // Usa el buffer crudo guardado por el callback `verify` de express.json().
    // Esto preserva los bytes exactos que el proveedor firmó, mientras que
    // JSON.stringify(req.body) reserializaría y rompería la verificación HMAC.
    const stashedRaw = (req as unknown as { rawBody?: Buffer }).rawBody;
    const rawBody = stashedRaw ? stashedRaw.toString("utf-8") : "";
    const parsedBody = req.body as unknown;
    const payload = (req.body as Record<string, unknown> | undefined) ?? {};

    // Paso 6: Registra la entrega en la base de datos
    const startedAt = new Date();
    const [delivery] = await db
      .insert(pluginWebhookDeliveries)
      .values({
        pluginId: plugin.id,
        webhookKey: endpointKey,
        status: "pending",
        payload,
        headers: rawHeaders,
        startedAt,
      })
      .returning({ id: pluginWebhookDeliveries.id });

    // Paso 7: Despacha al worker vía RPC handleWebhook
    try {
      await webhookDeps.workerManager.call(plugin.id, "handleWebhook", {
        endpointKey,
        headers: req.headers as Record<string, string | string[]>,
        rawBody,
        parsedBody,
        requestId,
      });

      // Paso 8: Actualiza el registro de entrega a éxito
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      await db
        .update(pluginWebhookDeliveries)
        .set({
          status: "success",
          durationMs,
          finishedAt,
        })
        .where(eq(pluginWebhookDeliveries.id, delivery.id));

      res.status(200).json({
        deliveryId: delivery.id,
        status: "success",
      });
    } catch (err) {
      // Paso 8 (error): Actualiza el registro de entrega a fallido
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const errorMessage = err instanceof Error ? err.message : String(err);

      await db
        .update(pluginWebhookDeliveries)
        .set({
          status: "failed",
          durationMs,
          error: errorMessage,
          finishedAt,
        })
        .where(eq(pluginWebhookDeliveries.id, delivery.id));

      res.status(502).json({
        deliveryId: delivery.id,
        status: "failed",
        error: errorMessage,
      });
    }
  });

  // ===========================================================================
  // Panel de salud de plugins — diagnósticos agregados para la página de ajustes
  // ===========================================================================

  /**
   * GET /api/plugins/:pluginId/dashboard
   *
   * Datos agregados del panel de salud para la página de ajustes de un plugin.
   *
   * Devuelve diagnósticos del worker (estado, uptime, historial de caídas), ejecuciones
   * recientes de trabajos, entregas recientes de webhooks y el resultado actual de la verificación de salud —
   * todo en una sola respuesta para evitar múltiples idas y vueltas.
   *
   * Respuesta: PluginDashboardData
   * Errores: 404 si el plugin no se encuentra
   */
  router.get("/plugins/:pluginId/dashboard", async (req, res) => {
    assertBoard(req);
    const { pluginId } = req.params;

    const plugin = await resolvePlugin(registry, pluginId);
    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    // --- Diagnósticos del worker ---
    let worker: {
      status: string;
      pid: number | null;
      uptime: number | null;
      consecutiveCrashes: number;
      totalCrashes: number;
      pendingRequests: number;
      lastCrashAt: number | null;
      nextRestartAt: number | null;
    } | null = null;

    // Intenta bridgeDeps primero (fuente primaria del gestor de workers), recurre a webhookDeps
    const wm = bridgeDeps?.workerManager ?? webhookDeps?.workerManager ?? null;
    if (wm) {
      const handle = wm.getWorker(plugin.id);
      if (handle) {
        const diag = handle.diagnostics();
        worker = {
          status: diag.status,
          pid: diag.pid,
          uptime: diag.uptime,
          consecutiveCrashes: diag.consecutiveCrashes,
          totalCrashes: diag.totalCrashes,
          pendingRequests: diag.pendingRequests,
          lastCrashAt: diag.lastCrashAt,
          nextRestartAt: diag.nextRestartAt,
        };
      }
    }

    // --- Ejecuciones recientes de trabajos (últimas 10, las más nuevas primero) ---
    let recentJobRuns: Array<{
      id: string;
      jobId: string;
      jobKey?: string;
      trigger: string;
      status: string;
      durationMs: number | null;
      error: string | null;
      startedAt: string | null;
      finishedAt: string | null;
      createdAt: string;
    }> = [];

    if (jobDeps) {
      try {
        const runs = await jobDeps.jobStore.listRunsByPlugin(plugin.id, undefined, 10);
        // También obtiene las definiciones de trabajos para incluir jobKey
        const jobs = await jobDeps.jobStore.listJobs(plugin.id);
        const jobKeyMap = new Map(jobs.map((j) => [j.id, j.jobKey]));

        recentJobRuns = runs
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((r) => ({
            id: r.id,
            jobId: r.jobId,
            jobKey: jobKeyMap.get(r.jobId) ?? undefined,
            trigger: r.trigger,
            status: r.status,
            durationMs: r.durationMs,
            error: r.error,
            startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
            finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
            createdAt: new Date(r.createdAt).toISOString(),
          }));
      } catch {
        // Datos de trabajo no disponibles — deja vacío
      }
    }

    // --- Entregas recientes de webhooks (últimas 10, las más nuevas primero) ---
    let recentWebhookDeliveries: Array<{
      id: string;
      webhookKey: string;
      status: string;
      durationMs: number | null;
      error: string | null;
      startedAt: string | null;
      finishedAt: string | null;
      createdAt: string;
    }> = [];

    try {
      const deliveries = await db
        .select({
          id: pluginWebhookDeliveries.id,
          webhookKey: pluginWebhookDeliveries.webhookKey,
          status: pluginWebhookDeliveries.status,
          durationMs: pluginWebhookDeliveries.durationMs,
          error: pluginWebhookDeliveries.error,
          startedAt: pluginWebhookDeliveries.startedAt,
          finishedAt: pluginWebhookDeliveries.finishedAt,
          createdAt: pluginWebhookDeliveries.createdAt,
        })
        .from(pluginWebhookDeliveries)
        .where(eq(pluginWebhookDeliveries.pluginId, plugin.id))
        .orderBy(desc(pluginWebhookDeliveries.createdAt))
        .limit(10);

      recentWebhookDeliveries = deliveries.map((d) => ({
        id: d.id,
        webhookKey: d.webhookKey,
        status: d.status,
        durationMs: d.durationMs,
        error: d.error,
        startedAt: d.startedAt ? d.startedAt.toISOString() : null,
        finishedAt: d.finishedAt ? d.finishedAt.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
      }));
    } catch {
      // Datos de webhook no disponibles — deja vacío
    }

    // --- Verificación de salud (misma lógica que GET /health) ---
    const checks: PluginHealthCheckResult["checks"] = [];

    checks.push({
      name: "registry",
      passed: true,
      message: "Plugin found in registry",
    });

    const hasValidManifest = Boolean(plugin.manifestJson?.id);
    checks.push({
      name: "manifest",
      passed: hasValidManifest,
      message: hasValidManifest ? "Manifest is valid" : "Manifest is invalid or missing",
    });

    const isHealthy = plugin.status === "ready";
    checks.push({
      name: "status",
      passed: isHealthy,
      message: `Estado actual: ${plugin.status}`,
    });

    const hasNoError = !plugin.lastError;
    if (!hasNoError) {
      checks.push({
        name: "error_state",
        passed: false,
        message: plugin.lastError ?? undefined,
      });
    }

    const health: PluginHealthCheckResult = {
      pluginId: plugin.id,
      status: plugin.status,
      healthy: isHealthy && hasValidManifest && hasNoError,
      checks,
      lastError: plugin.lastError ?? undefined,
    };

    res.json({
      pluginId: plugin.id,
      worker,
      recentJobRuns,
      recentWebhookDeliveries,
      health,
      checkedAt: new Date().toISOString(),
    });
  });

  return router;
}
