/**
 * PluginLoader — descubrimiento, instalación y activación en tiempo de
 * ejecución de plugins.
 *
 * Este servicio es el punto de entrada del límite de E/S del sistema de
 * plugins:
 *
 * 1. **Descubrimiento** — Escanea el directorio local de plugins
 *    (`~/.paperclip/plugins/`) y `node_modules` buscando paquetes que
 *    coincidan con la convención de nombres `paperclip-plugin-*`. Agrega
 *    resultados con desduplicación basada en rutas.
 *
 * 2. **Instalación** — `installPlugin()` descarga desde npm (o lee una
 *    ruta local), valida el manifiesto, comprueba la consistencia de
 *    capacidades y persiste el registro de instalación.
 *
 * 3. **Activación en tiempo de ejecución** — `activatePlugin()` conecta un
 *    plugin cargado con todos los servicios de runtime: resuelve su
 *    entrypoint, construye manejadores host con capacidades restringidas,
 *    genera un proceso worker, sincroniza declaraciones de trabajos,
 *    registra suscripciones de eventos y descubre herramientas.
 *
 * 4. **Apagado** — `shutdownAll()` detiene elegantemente todos los workers
 *    activos y desregistra los hooks de runtime.
 *
 * @see PLUGIN_SPEC.md §8 — Descubrimiento de plugins
 * @see PLUGIN_SPEC.md §10 — Contrato de paquete
 * @see PLUGIN_SPEC.md §12 — Modelo de procesos
 */
import { existsSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Db } from "@paperclipai/db";
import type {
  PaperclipPluginManifestV1,
  PluginLauncherDeclaration,
  PluginRecord,
  PluginUiSlotDeclaration,
} from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { pluginManifestValidator } from "./plugin-manifest-validator.js";
import { pluginCapabilityValidator } from "./plugin-capability-validator.js";
import { pluginRegistryService } from "./plugin-registry.js";
import type { PluginWorkerManager, WorkerStartOptions, WorkerToHostHandlers } from "./plugin-worker-manager.js";
import type { PluginEventBus } from "./plugin-event-bus.js";
import type { PluginJobScheduler } from "./plugin-job-scheduler.js";
import type { PluginJobStore } from "./plugin-job-store.js";
import type { PluginToolDispatcher } from "./plugin-tool-dispatcher.js";
import type { PluginLifecycleManager } from "./plugin-lifecycle.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Convención de nombres para plugins Paperclip publicados en npm.
 * Los paquetes que coincidan con este patrón se consideran plugins Paperclip.
 *
 * @see PLUGIN_SPEC.md §10 — Contrato de paquete
 */
export const NPM_PLUGIN_PACKAGE_PREFIX = "paperclip-plugin-";

/**
 * Directorio local predeterminado de plugins. El cargador escanea este
 * directorio buscando paquetes de plugins instalados localmente.
 *
 * @see PLUGIN_SPEC.md §8.1 — Disposición en disco
 */
export const DEFAULT_LOCAL_PLUGIN_DIR = path.join(
  os.homedir(),
  ".paperclip",
  "plugins",
);

const DEV_TSX_LOADER_PATH = path.resolve(__dirname, "../../../cli/node_modules/tsx/dist/loader.mjs");

// ---------------------------------------------------------------------------
// Tipos de resultado de descubrimiento
// ---------------------------------------------------------------------------

/**
 * Un paquete de plugin encontrado durante el descubrimiento desde cualquier
 * fuente.
 */
export interface DiscoveredPlugin {
  /** Ruta absoluta a la raíz del directorio del paquete npm. */
  packagePath: string;
  /** El nombre del paquete npm declarado en package.json. */
  packageName: string;
  /** Versión semver de package.json. */
  version: string;
  /** Fuente que encontró este paquete. */
  source: PluginSource;
  /** El manifiesto parseado y validado si está disponible, null si es solo descubrimiento. */
  manifest: PaperclipPluginManifestV1 | null;
}

/**
 * Fuentes desde las que se pueden descubrir plugins.
 *
 * @see PLUGIN_SPEC.md §8.1 — Disposición en disco
 */
export type PluginSource =
  | "local-filesystem"  // directorio local ~/.paperclip/plugins/
  | "npm"               // paquetes npm que coinciden con la convención paperclip-plugin-*
  | "registry";         // futuro: URL del registro remoto de plugins

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

/**
 * Resultado de un escaneo de descubrimiento.
 */
export interface PluginDiscoveryResult {
  /** Plugins descubiertos y validados exitosamente. */
  discovered: DiscoveredPlugin[];
  /** Paquetes encontrados pero con errores de validación. */
  errors: Array<{ packagePath: string; packageName: string; error: string }>;
  /** Fuente(s) que fueron escaneadas. */
  sources: PluginSource[];
}

function getDeclaredPageRoutePaths(manifest: PaperclipPluginManifestV1): string[] {
  return (manifest.ui?.slots ?? [])
    .filter((slot): slot is PluginUiSlotDeclaration => slot.type === "page" && typeof slot.routePath === "string" && slot.routePath.length > 0)
    .map((slot) => slot.routePath!);
}

// ---------------------------------------------------------------------------
// Opciones del cargador
// ---------------------------------------------------------------------------

/**
 * Opciones para el servicio cargador de plugins.
 */
export interface PluginLoaderOptions {
  /**
   * Ruta al directorio local de plugins a escanear.
   * Por defecto es ~/.paperclip/plugins/
   */
  localPluginDir?: string;

  /**
   * Si escanear el directorio del sistema de archivos local en busca de
   * plugins. Por defecto es true.
   */
  enableLocalFilesystem?: boolean;

  /**
   * Si descubrir paquetes npm instalados que coincidan con la convención de
   * nombres paperclip-plugin-*. Por defecto es true.
   */
  enableNpmDiscovery?: boolean;

  /**
   * Futuro: URL del registro remoto de plugins a consultar.
   * Cuando se fija, el cargador también obtendrá plugins disponibles desde
   * este endpoint. El soporte de registro aún no está implementado; este
   * campo está reservado.
   */
  registryUrl?: string;
}

// ---------------------------------------------------------------------------
// Opciones de instalación
// ---------------------------------------------------------------------------

/**
 * Opciones para instalar un solo paquete de plugin.
 */
export interface PluginInstallOptions {
  /**
   * Nombre del paquete npm a instalar (p. ej. "paperclip-plugin-linear" o "@acme/plugin-linear").
   * Debe fijarse packageName o localPath.
   */
  packageName?: string;

  /**
   * Ruta absoluta o relativa a un directorio local de plugin para
   * instalaciones de desarrollo. Cuando se fija, el plugin se carga desde
   * esta ruta sin npm install. Debe fijarse packageName o localPath.
   */
  localPath?: string;

  /**
   * Especificador de versión pasado a npm install (p. ej. "^1.2.0",
   * "latest"). Se ignora cuando se fija localPath.
   */
  version?: string;

  /**
   * Directorio de instalación de plugins donde se manejan los paquetes.
   * Por defecto es el localPluginDir configurado en el servicio.
   */
  installDir?: string;
}

// ---------------------------------------------------------------------------
// Opciones de runtime — servicios necesarios para inicializar plugins cargados
// ---------------------------------------------------------------------------

/**
 * Servicios de runtime pasados al cargador para la inicialización de plugins.
 *
 * Cuando se proveen, el cargador puede activar completamente los plugins
 * (generar workers, registrar suscripciones de eventos, sincronizar
 * trabajos, registrar herramientas). Cuando se omiten, el cargador opera en
 * modo solo descubrimiento/instalación.
 *
 * @see PLUGIN_SPEC.md §8.3 — Proceso de instalación
 * @see PLUGIN_SPEC.md §12 — Modelo de procesos
 */
export interface PluginRuntimeServices {
  /** Administrador de procesos worker para generar y manejar workers de plugins. */
  workerManager: PluginWorkerManager;
  /** Bus de eventos para registrar suscripciones de eventos de plugins. */
  eventBus: PluginEventBus;
  /** Programador de trabajos para registrar trabajos cron de plugins. */
  jobScheduler: PluginJobScheduler;
  /** Almacén de trabajos para sincronizar declaraciones de trabajos del manifiesto a la BD. */
  jobStore: PluginJobStore;
  /** Despachador de herramientas para registrar herramientas de agente aportadas por plugins. */
  toolDispatcher: PluginToolDispatcher;
  /** Administrador de ciclo de vida para transiciones de estado y eventos del ciclo de vida del worker. */
  lifecycleManager: PluginLifecycleManager;
  /**
   * Fábrica que crea manejadores RPC worker→host para un plugin dado.
   *
   * Los manejadores devueltos sirven llamadas worker→host (p. ej.
   * state.get, events.emit, config.get). Cada plugin obtiene su propio
   * conjunto de manejadores con alcance a sus capacidades y ID de plugin.
   */
  buildHostHandlers: (pluginId: string, manifest: PaperclipPluginManifestV1) => WorkerToHostHandlers;
  /**
   * Información de la instancia host pasada al worker durante la
   * inicialización. Incluye el ID de instancia y la versión del host.
   */
  instanceInfo: {
    instanceId: string;
    hostVersion: string;
  };
}

// ---------------------------------------------------------------------------
// Resultados de carga
// ---------------------------------------------------------------------------

/**
 * Resultado de activar (cargar) un solo plugin en tiempo de ejecución.
 *
 * Contiene el registro del plugin, el estado de activación y cualquier error
 * que ocurriera durante el proceso.
 */
export interface PluginLoadResult {
  /** El registro del plugin de la base de datos. */
  plugin: PluginRecord;
  /** Si el plugin se activó exitosamente. */
  success: boolean;
  /** Mensaje de error si la activación falló. */
  error?: string;
  /** Qué subsistemas se registraron durante la activación. */
  registered: {
    /** True si se inició el proceso worker. */
    worker: boolean;
    /** Número de suscripciones de eventos registradas (de las declaraciones de eventos del manifiesto). */
    eventSubscriptions: number;
    /** Número de declaraciones de trabajos sincronizadas a la base de datos. */
    jobs: number;
    /** Número de endpoints de webhook declarados en el manifiesto. */
    webhooks: number;
    /** Número de herramientas de agente registradas. */
    tools: number;
  };
}

/**
 * Resultado de activar todos los plugins en ready al arrancar el servidor.
 */
export interface PluginLoadAllResult {
  /** Número total de plugins que se intentaron. */
  total: number;
  /** Número de plugins activados exitosamente. */
  succeeded: number;
  /** Número de plugins que fallaron al activarse. */
  failed: number;
  /** Resultados por plugin. */
  results: PluginLoadResult[];
}

/**
 * Metadatos normalizados de contribución de UI extraídos de un manifiesto de
 * plugin.
 *
 * El host sirve todos los bundles de UI de plugins desde el directorio
 * `entrypoints.ui` del manifiesto y actualmente espera que el módulo de
 * entrada del bundle sea `index.js`.
 */
export interface PluginUiContributionMetadata {
  uiEntryFile: string;
  slots: PluginUiSlotDeclaration[];
  launchers: PluginLauncherDeclaration[];
}

// ---------------------------------------------------------------------------
// Interfaz del servicio
// ---------------------------------------------------------------------------

export interface PluginLoader {
  /**
   * Descubre todos los plugins disponibles desde las fuentes configuradas.
   *
   * Esto realiza un escaneo no destructivo de todas las fuentes habilitadas
   * y devuelve los plugins descubiertos con sus manifiestos parseados. No
   * ocurre ninguna instalación ni escritura en BD durante el descubrimiento.
   *
   * @param npmSearchDirs - Anulación opcional de los directorios node_modules
   *   a buscar. Se pasa a discoverFromNpm. Cuando se omite se usan los
   *   predeterminados.
   *
   * @see PLUGIN_SPEC.md §8.1 — Disposición en disco
   * @see PLUGIN_SPEC.md §8.3 — Proceso de instalación
   */
  discoverAll(npmSearchDirs?: string[]): Promise<PluginDiscoveryResult>;

  /**
   * Escanea el directorio local del sistema de archivos de plugins buscando
   * paquetes de plugins instalados.
   *
   * Lee el directorio de plugins, intenta cargar cada subdirectorio como un
   * paquete npm y valida el manifiesto del plugin.
   *
   * @param dir - Directorio a escanear (por defecto el localPluginDir configurado).
   */
  discoverFromLocalFilesystem(dir?: string): Promise<PluginDiscoveryResult>;

  /**
   * Descubre plugins Paperclip instalados como paquetes npm en el entorno
   * Node.js actual que coincidan con la convención de nombres
   * "paperclip-plugin-*".
   *
   * Busca paquetes en node_modules que coincidan con la convención de
   * nombres.
   *
   * @param searchDirs - directorios node_modules a buscar (por defecto la resolución del cwd del proceso).
   */
  discoverFromNpm(searchDirs?: string[]): Promise<PluginDiscoveryResult>;

  /**
   * Carga y parsea el manifiesto del plugin desde un directorio de paquete.
   *
   * Lee el package.json, encuentra el entrypoint del manifiesto declarado
   * bajo la clave "paperclipPlugin.manifest", carga el módulo del
   * manifiesto y lo valida contra el esquema del manifiesto de plugin.
   *
   * Devuelve null si el paquete no es un plugin Paperclip.
   * Lanza si el paquete es un plugin Paperclip pero el manifiesto es
   * inválido.
   *
   * @see PLUGIN_SPEC.md §10 — Contrato de paquete
   */
  loadManifest(packagePath: string): Promise<PaperclipPluginManifestV1 | null>;

  /**
   * Instala un paquete de plugin y lo registra en la base de datos.
   *
   * Sigue el proceso de instalación descrito en PLUGIN_SPEC.md §8.3:
   * 1. Resolver paquete npm / ruta local.
   * 2. Instalar en el directorio de plugins (npm install).
   * 3. Leer y validar el manifiesto del plugin.
   * 4. Rechazar versiones incompatibles de la API del plugin.
   * 5. Validar las capacidades del manifiesto.
   * 6. Persistir el registro de instalación en Postgres.
   * 7. Devolver el plugin descubierto para que el llamador lo use.
   *
   * El generado de workers y la gestión del ciclo de vida los maneja el
   * llamador (pluginLifecycleManager y la orquestación de arranque del
   * servidor).
   *
   * @see PLUGIN_SPEC.md §8.3 — Proceso de instalación
   */
  installPlugin(options: PluginInstallOptions): Promise<DiscoveredPlugin>;

  /**
   * Actualiza un plugin ya instalado a una versión más nueva.
   *
   * Similar a installPlugin, pero:
   * 1. Requiere que el plugin ya exista en la base de datos.
   * 2. Usa el packageName existente si no se provee en las opciones.
   * 3. Actualiza el registro existente del plugin en vez de crear uno nuevo.
   * 4. Devuelve los manifiestos viejo y nuevo para la comparación de
   *    capacidades.
   *
   * @see PLUGIN_SPEC.md §25.3 — Ciclo de vida de actualización
   */
  upgradePlugin(pluginId: string, options: Omit<PluginInstallOptions, "installDir">): Promise<{
    oldManifest: PaperclipPluginManifestV1;
    newManifest: PaperclipPluginManifestV1;
    discovered: DiscoveredPlugin;
  }>;

  /**
   * Comprueba si una versión de la API de plugin es soportada por este host.
   */
  isSupportedApiVersion(apiVersion: number): boolean;

  /**
   * Elimina artefactos de instalación en disco manejados por el runtime para
   * un plugin.
   *
   * Esto solo limpia archivos bajo el directorio local de plugins
   * manejado. Los checkouts de origen en rutas locales fuera de ese
   * directorio se dejan intencionalmente intactos.
   */
  cleanupInstallArtifacts(plugin: PluginRecord): Promise<void>;

  /**
   * Obtiene el directorio local de plugins que este cargador está
   * configurado a usar.
   */
  getLocalPluginDir(): string;

  // -----------------------------------------------------------------------
  // Inicialización de runtime (requiere PluginRuntimeServices)
  // -----------------------------------------------------------------------

  /**
   * Carga y activa todos los plugins que están en estado `ready`.
   *
   * Este es el método principal de orquestación al arrancar el servidor.
   * Para cada plugin persistido como `ready`:
   * 1. Resuelve el entrypoint del worker desde el manifiesto.
   * 2. Genera el proceso worker vía el administrador de workers.
   * 3. Sincroniza las declaraciones de trabajos del manifiesto a la tabla
   *    `plugin_jobs`.
   * 4. Registra el plugin con el programador de trabajos.
   * 5. Registra las suscripciones de eventos declaradas en el manifiesto
   *    (con alcance vía el bus de eventos).
   * 6. Registra las herramientas de agente del manifiesto vía el
   *    despachador de herramientas.
   *
   * Los plugins que fallan al activarse se marcan como `error` en la base de
   * datos. Los fallos de activación no son fatales — los otros plugins
   * continúan cargándose.
   *
   * **Requiere** que se hayan provisto `PluginRuntimeServices` al momento de
   * la construcción. Lanza si los servicios de runtime no están disponibles.
   *
   * @returns Resultados agregados de todos los intentos de carga de plugins.
   *
   * @see PLUGIN_SPEC.md §8.4 — Carga de plugins al arrancar el servidor
   * @see PLUGIN_SPEC.md §12 — Modelo de procesos
   */
  loadAll(): Promise<PluginLoadAllResult>;

  /**
   * Activa un solo plugin que esté en estado `installed` o `ready`.
   *
   * Se usa tras una instalación fresca (POST /api/plugins/install) o tras
   * activar un plugin previamente desactivado. Realiza el mismo registro de
   * subsistemas que `loadAll()` pero para un solo plugin.
   *
   * Si el plugin está en estado `installed`, lo transiciona a `ready` vía el
   * administrador de ciclo de vida antes de generar el worker.
   *
   * **Requiere** que se hayan provisto `PluginRuntimeServices` al momento de
   * la construcción.
   *
   * @param pluginId - UUID del plugin a activar
   * @returns El resultado de activación de este plugin
   *
   * @see PLUGIN_SPEC.md §8.3 — Proceso de instalación
   */
  loadSingle(pluginId: string): Promise<PluginLoadResult>;

  /**
   * Desactiva un solo plugin — detiene su worker y desregistra todos los
   * registros de subsistemas (eventos, trabajos, herramientas).
   *
   * Se usa durante la desactivación, desinstalación y antes de actualizar un
   * plugin. NO cambia el estado del plugin en la base de datos — eso es
   * responsabilidad del llamador (vía el administrador de ciclo de vida).
   *
   * **Requiere** que se hayan provisto `PluginRuntimeServices` al momento de
   * la construcción.
   *
   * @param pluginId - UUID del plugin a desactivar
   * @param pluginKey - La clave del plugin (ID del manifiesto) para la limpieza con alcance
   *
   * @see PLUGIN_SPEC.md §8.5 — Proceso de desinstalación
   */
  unloadSingle(pluginId: string, pluginKey: string): Promise<void>;

  /**
   * Detiene todos los workers de plugins manejados. Se llama durante el
   * apagado del servidor.
   *
   * Detiene el programador de trabajos y luego detiene todos los workers vía
   * el administrador de workers. NO cambia los estados de plugins en la
   * base de datos — los plugins permanecen en `ready` para reiniciarse en el
   * próximo arranque.
   *
   * **Requiere** que se hayan provisto `PluginRuntimeServices` al momento de
   * la construcción.
   */
  shutdownAll(): Promise<void>;

  /**
   * Si los servicios de runtime están disponibles para la activación de
   * plugins.
   */
  hasRuntimeServices(): boolean;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Comprueba si un nombre de paquete coincide con la convención de nombres de
 * plugins Paperclip. Acepta tanto el prefijo "paperclip-plugin-" como
 * paquetes con scope "@scope/plugin-".
 *
 * @see PLUGIN_SPEC.md §10 — Contrato de paquete
 */
export function isPluginPackageName(name: string): boolean {
  if (name.startsWith(NPM_PLUGIN_PACKAGE_PREFIX)) return true;
  // También acepta paquetes con scope como @acme/plugin-linear o @paperclipai/plugin-*
  if (name.includes("/")) {
    const localPart = name.split("/")[1] ?? "";
    return localPart.startsWith("plugin-");
  }
  return false;
}

/**
 * Lee y parsea un package.json desde una ruta de directorio.
 * Devuelve null si no existe package.json.
 */
async function readPackageJson(
  dir: string,
): Promise<Record<string, unknown> | null> {
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;

  try {
    const raw = await readFile(pkgPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Resuelve el entrypoint del manifiesto desde un package.json y la raíz del
 * paquete.
 *
 * La especificación define una clave "paperclipPlugin" en package.json con
 * una subclave "manifest" que apunta al módulo del manifiesto. Esta
 * utilidad resuelve la ruta.
 *
 * @see PLUGIN_SPEC.md §10 — Contrato de paquete
 */
function resolveManifestPath(
  packageRoot: string,
  pkgJson: Record<string, unknown>,
): string | null {
  const paperclipPlugin = pkgJson["paperclipPlugin"];
  if (
    paperclipPlugin !== null &&
    typeof paperclipPlugin === "object" &&
    !Array.isArray(paperclipPlugin)
  ) {
    const manifestRelPath = (paperclipPlugin as Record<string, unknown>)[
      "manifest"
    ];
    if (typeof manifestRelPath === "string") {
      // NOTA: la ruta resuelta se devuelve tal cual aunque el archivo aún no
      // exista en disco (p. ej. el paquete no se ha compilado). Los llamadores
      // DEBEN protegerse con existsSync() antes de pasar la ruta a
      // loadManifestFromPath().
      return path.resolve(packageRoot, manifestRelPath);
    }
  }

  // Alternativa: busca dist/manifest.js como convención
  const conventionalPath = path.join(packageRoot, "dist", "manifest.js");
  if (existsSync(conventionalPath)) {
    return conventionalPath;
  }

  // Alternativa: busca manifest.js en la raíz del paquete
  const rootManifestPath = path.join(packageRoot, "manifest.js");
  if (existsSync(rootManifestPath)) {
    return rootManifestPath;
  }

  return null;
}

function parseSemver(version: string): ParsedSemver | null {
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(left: string, right: string): number {
  const leftIsNumeric = /^\d+$/.test(left);
  const rightIsNumeric = /^\d+$/.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    return Number(left) - Number(right);
  }

  if (leftIsNumeric) return -1;
  if (rightIsNumeric) return 1;
  return left.localeCompare(right);
}

function compareSemver(left: string, right: string): number {
  const leftParsed = parseSemver(left);
  const rightParsed = parseSemver(right);

  if (!leftParsed || !rightParsed) {
    throw new Error(`Comparación semver inválida: '${left}' vs '${right}'`);
  }

  const coreOrder = (
    ["major", "minor", "patch"] as const
  ).map((key) => leftParsed[key] - rightParsed[key]).find((delta) => delta !== 0);
  if (coreOrder) {
    return coreOrder;
  }

  if (leftParsed.prerelease.length === 0 && rightParsed.prerelease.length === 0) {
    return 0;
  }
  if (leftParsed.prerelease.length === 0) return 1;
  if (rightParsed.prerelease.length === 0) return -1;

  const maxLength = Math.max(leftParsed.prerelease.length, rightParsed.prerelease.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftId = leftParsed.prerelease[index];
    const rightId = rightParsed.prerelease[index];
    if (leftId === undefined) return -1;
    if (rightId === undefined) return 1;

    const diff = compareIdentifiers(leftId, rightId);
    if (diff !== 0) return diff;
  }

  return 0;
}

function getMinimumHostVersion(manifest: PaperclipPluginManifestV1): string | undefined {
  return manifest.minimumHostVersion ?? manifest.minimumPaperclipVersion;
}

/**
 * Extrae los metadatos de contribución de UI de un manifiesto para la
 * serialización de rutas.
 *
 * Devuelve `null` cuando el plugin no declara slots de UI ni launchers.
 * Las declaraciones de launchers se agregan tanto del campo heredado de
 * nivel superior `launchers` como del campo preferido `ui.launchers`.
 */
export function getPluginUiContributionMetadata(
  manifest: PaperclipPluginManifestV1,
): PluginUiContributionMetadata | null {
  const slots = manifest.ui?.slots ?? [];
  const launchers = [
    ...(manifest.launchers ?? []),
    ...(manifest.ui?.launchers ?? []),
  ];

  if (slots.length === 0 && launchers.length === 0) {
    return null;
  }

  return {
    uiEntryFile: "index.js",
    slots,
    launchers,
  };
}

// ---------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------

/**
 * Crea un servicio PluginLoader.
 *
 * El cargador es responsable del descubrimiento, instalación y activación en
 * tiempo de ejecución de plugins. Lee paquetes de plugins del sistema de
 * archivos local y npm, valida sus manifiestos, los registra en la base de
 * datos y — cuando se proveen servicios de runtime — inicializa procesos
 * worker, suscripciones de eventos, programas de trabajos, endpoints de
 * webhook y herramientas de agente.
 *
 * Uso (solo descubrimiento e instalación):
 * ```ts
 * const loader = pluginLoader(db, { enableLocalFilesystem: true });
 *
 * // Descubre todos los plugins disponibles
 * const result = await loader.discoverAll();
 * for (const plugin of result.discovered) {
 *   console.log(plugin.packageName, plugin.manifest?.id);
 * }
 *
 * // Instala un plugin específico
 * const discovered = await loader.installPlugin({
 *   packageName: "paperclip-plugin-linear",
 *   version: "^1.0.0",
 * });
 * ```
 *
 * Uso (activación completa de runtime al arrancar el servidor):
 * ```ts
 * const loader = pluginLoader(db, loaderOpts, {
 *   workerManager,
 *   eventBus,
 *   jobScheduler,
 *   jobStore,
 *   toolDispatcher,
 *   lifecycleManager,
 *   buildHostHandlers: (pluginId, manifest) => ({ ... }),
 *   instanceInfo: { instanceId: "inst-1", hostVersion: "1.0.0" },
 * });
 *
 * // Carga todos los plugins en ready al arrancar
 * const loadResult = await loader.loadAll();
 * console.log(`Cargados ${loadResult.succeeded}/${loadResult.total} plugins`);
 *
 * // Carga un solo plugin tras la instalación
 * const singleResult = await loader.loadSingle(pluginId);
 *
 * // Apaga todos los workers de plugins al salir del servidor
 * await loader.shutdownAll();
 * ```
 *
 * @see PLUGIN_SPEC.md §8.1 — Disposición en disco
 * @see PLUGIN_SPEC.md §8.3 — Proceso de instalación
 * @see PLUGIN_SPEC.md §12 — Modelo de procesos
 */
export function pluginLoader(
  db: Db,
  options: PluginLoaderOptions = {},
  runtimeServices?: PluginRuntimeServices,
): PluginLoader {
  const {
    localPluginDir = DEFAULT_LOCAL_PLUGIN_DIR,
    enableLocalFilesystem = true,
    enableNpmDiscovery = true,
  } = options;

  const registry = pluginRegistryService(db);
  const manifestValidator = pluginManifestValidator();
  const capabilityValidator = pluginCapabilityValidator();
  const log = logger.child({ service: "plugin-loader" });
  const hostVersion = runtimeServices?.instanceInfo.hostVersion;

  async function assertPageRoutePathsAvailable(manifest: PaperclipPluginManifestV1): Promise<void> {
    const requestedRoutePaths = getDeclaredPageRoutePaths(manifest);
    if (requestedRoutePaths.length === 0) return;

    const uniqueRequested = new Set(requestedRoutePaths);
    if (uniqueRequested.size !== requestedRoutePaths.length) {
      throw new Error(`El plugin ${manifest.id} declara valores de routePath de página duplicados`);
    }

    const installedPlugins = await registry.listInstalled();
    for (const plugin of installedPlugins) {
      if (plugin.pluginKey === manifest.id) continue;
      const installedManifest = plugin.manifestJson as PaperclipPluginManifestV1 | null;
      if (!installedManifest) continue;
      const installedRoutePaths = new Set(getDeclaredPageRoutePaths(installedManifest));
      const conflictingRoute = requestedRoutePaths.find((routePath) => installedRoutePaths.has(routePath));
      if (conflictingRoute) {
        throw new Error(
          `El routePath "${conflictingRoute}" del plugin ${manifest.id} entra en conflicto con el plugin instalado ${plugin.pluginKey}`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Utilidades internas
  // -------------------------------------------------------------------------

  /**
   * Obtiene un plugin de npm o de una ruta local, y luego parsea y valida su
   * manifiesto.
   *
   * Esta utilidad interna encapsula la lógica central de obtención y
   * validación de plugins usada tanto por instalación como por
   * actualización. Maneja:
   * 1. Resolver el paquete desde npm o el sistema de archivos local.
   * 2. Instalar el paquete vía npm si es necesario.
   * 3. Leer y parsear el manifiesto del plugin.
   * 4. Validar la compatibilidad de la versión de API.
   * 5. Validar las capacidades del manifiesto.
   *
   * @param installOptions - Opciones que especifican el paquete a obtener.
   * @returns Un objeto `DiscoveredPlugin` con el manifiesto validado.
   */
  async function fetchAndValidate(
    installOptions: PluginInstallOptions,
  ): Promise<DiscoveredPlugin> {
    const { packageName, localPath, version, installDir } = installOptions;

    if (!packageName && !localPath) {
      throw new Error("Debe proveerse packageName o localPath");
    }

    const targetInstallDir = installDir ?? localPluginDir;

    // Paso 1 y 2: Resuelve e instala el paquete
    let resolvedPackagePath: string;
    let resolvedPackageName: string;

    if (localPath) {
      // Instalación desde ruta local — valida que el directorio exista
      const absLocalPath = path.resolve(localPath);
      if (!existsSync(absLocalPath)) {
        throw new Error(`La ruta local del plugin no existe: ${absLocalPath}`);
      }
      resolvedPackagePath = absLocalPath;
      const pkgJson = await readPackageJson(absLocalPath);
      resolvedPackageName =
        typeof pkgJson?.["name"] === "string"
          ? pkgJson["name"]
          : path.basename(absLocalPath);

      log.info(
        { localPath: absLocalPath, packageName: resolvedPackageName },
        "plugin-loader: obteniendo plugin desde la ruta local",
      );
    } else {
      // npm install
      const spec = version ? `${packageName}@${version}` : packageName!;

      log.info(
        { spec, installDir: targetInstallDir },
        "plugin-loader: obteniendo plugin desde npm",
      );

      try {
        // Usa execFile (no exec) para evitar inyección de shell desde el
        // nombre/versión del paquete. --ignore-scripts evita que los hooks
        // preinstall/install/postinstall ejecuten código arbitrario en el
        // host antes de la validación del manifiesto.
        await execFileAsync(
          "npm",
          ["install", spec, "--prefix", targetInstallDir, "--save", "--ignore-scripts"],
          { timeout: 120_000 }, // 2 minutos de timeout para npm install
        );
      } catch (err) {
        throw new Error(`npm install falló para ${spec}: ${String(err)}`);
      }

      // Resuelve la ruta del paquete tras la instalación
      const nodeModulesPath = path.join(targetInstallDir, "node_modules");
      resolvedPackageName = packageName!;

      // Maneja paquetes con scope
      if (resolvedPackageName.startsWith("@")) {
        const [scope, name] = resolvedPackageName.split("/");
        resolvedPackagePath = path.join(nodeModulesPath, scope!, name!);
      } else {
        resolvedPackagePath = path.join(nodeModulesPath, resolvedPackageName);
      }

      if (!existsSync(resolvedPackagePath)) {
        throw new Error(
          `Directorio del paquete no encontrado tras la instalación: ${resolvedPackagePath}`,
        );
      }
    }

    // Paso 3: Leer y validar el manifiesto del plugin
    // Nota: this.loadManifest (usado vía el contexto actual)
    const pkgJson = await readPackageJson(resolvedPackagePath);
    if (!pkgJson) throw new Error(`Falta package.json en ${resolvedPackagePath}`);

    const manifestPath = resolveManifestPath(resolvedPackagePath, pkgJson);
    if (!manifestPath || !existsSync(manifestPath)) {
      throw new Error(
        `El paquete ${resolvedPackageName} en ${resolvedPackagePath} no parece ser un plugin Paperclip (no se encontró manifiesto).`,
      );
    }

    const manifest = await loadManifestFromPath(manifestPath);

    // Paso 4: Rechaza versiones incompatibles de la API del plugin
    if (!manifestValidator.getSupportedVersions().includes(manifest.apiVersion)) {
      throw new Error(
        `El plugin ${manifest.id} declara apiVersion ${manifest.apiVersion} que no es soportada por este host. ` +
          `Versiones soportadas: ${manifestValidator.getSupportedVersions().join(", ")}`,
      );
    }

    // Paso 5: Valida que las capacidades del manifiesto sean consistentes
    const capResult = capabilityValidator.validateManifestCapabilities(manifest);
    if (!capResult.allowed) {
      throw new Error(
        `El manifiesto del plugin ${manifest.id} tiene capacidades inconsistentes. ` +
          `Faltan capacidades requeridas para las características declaradas: ${capResult.missing.join(", ")}`,
      );
    }

    await assertPageRoutePathsAvailable(manifest);

    // Paso 6: Rechaza plugins que requieren un host más nuevo que el servidor en ejecución
    const minimumHostVersion = getMinimumHostVersion(manifest);
    if (minimumHostVersion && hostVersion) {
      if (compareSemver(hostVersion, minimumHostVersion) < 0) {
        throw new Error(
          `El plugin ${manifest.id} requiere la versión de host ${minimumHostVersion} o más nueva, ` +
            `pero este servidor ejecuta ${hostVersion}`,
        );
      }
    }

    // Usa la versión declarada en el manifiesto (campo requerido según la especificación)
    const resolvedVersion = manifest.version;

    return {
      packagePath: resolvedPackagePath,
      packageName: resolvedPackageName,
      version: resolvedVersion,
      source: localPath ? "local-filesystem" : "npm",
      manifest,
    };
  }

  /**
   * Intenta cargar y validar un manifiesto de plugin desde una ruta
   * resuelta. Devuelve el manifiesto en éxito o lanza con un error
   * descriptivo.
   */
  async function loadManifestFromPath(
    manifestPath: string,
  ): Promise<PaperclipPluginManifestV1> {
    let raw: unknown;

    try {
      // La importación dinámica funciona para manifiestos .js (ESM) y .cjs (CJS)
      const mod = await import(manifestPath) as Record<string, unknown>;
      // El manifiesto puede ser el export default o el propio módulo
      raw = mod["default"] ?? mod;
    } catch (err) {
      throw new Error(
        `No se pudo cargar el módulo del manifiesto en ${manifestPath}: ${String(err)}`,
      );
    }

    return manifestValidator.parseOrThrow(raw);
  }

  /**
   * Construye un DiscoveredPlugin desde un directorio de paquete resuelto,
   * o null si el paquete no es un plugin Paperclip.
   */
  async function buildDiscoveredPlugin(
    packagePath: string,
    source: PluginSource,
  ): Promise<DiscoveredPlugin | null> {
    const pkgJson = await readPackageJson(packagePath);
    if (!pkgJson) return null;

    const packageName = typeof pkgJson["name"] === "string" ? pkgJson["name"] : "";
    const version = typeof pkgJson["version"] === "string" ? pkgJson["version"] : "0.0.0";

    // Determina si este es un paquete de plugin
    const hasPaperclipPlugin = "paperclipPlugin" in pkgJson;
    const nameMatchesConvention = isPluginPackageName(packageName);

    if (!hasPaperclipPlugin && !nameMatchesConvention) {
      return null;
    }

    const manifestPath = resolveManifestPath(packagePath, pkgJson);
    if (!manifestPath || !existsSync(manifestPath)) {
      // Se encontró un posible paquete de plugin pero sin punto de entrada
      // de manifiesto — se trata como resultado de solo descubrimiento sin
      // manifiesto
      return {
        packagePath,
        packageName,
        version,
        source,
        manifest: null,
      };
    }

    try {
      const manifest = await loadManifestFromPath(manifestPath);
      return {
        packagePath,
        packageName,
        version,
        source,
        manifest,
      };
    } catch (err) {
      // Relanza con contexto — los llamadores capturan y derivan al array de errores
      throw new Error(
        `Plugin ${packageName}: ${String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  return {
    // -----------------------------------------------------------------------
    // discoverAll
    // -----------------------------------------------------------------------

    async discoverAll(npmSearchDirs?: string[]): Promise<PluginDiscoveryResult> {
      const allDiscovered: DiscoveredPlugin[] = [];
      const allErrors: Array<{ packagePath: string; packageName: string; error: string }> = [];
      const sources: PluginSource[] = [];

      if (enableLocalFilesystem) {
        sources.push("local-filesystem");
        const fsResult = await this.discoverFromLocalFilesystem();
        allDiscovered.push(...fsResult.discovered);
        allErrors.push(...fsResult.errors);
      }

      if (enableNpmDiscovery) {
        sources.push("npm");
        const npmResult = await this.discoverFromNpm(npmSearchDirs);
        // Deduplicate against already-discovered packages (same package path)
        const existingPaths = new Set(allDiscovered.map((d) => d.packagePath));
        for (const plugin of npmResult.discovered) {
          if (!existingPaths.has(plugin.packagePath)) {
            allDiscovered.push(plugin);
          }
        }
        allErrors.push(...npmResult.errors);
      }

      // Futuro: fuente de registro (options.registryUrl)
      if (options.registryUrl) {
        sources.push("registry");
        log.warn(
          { registryUrl: options.registryUrl },
          "plugin-loader: el descubrimiento del registro remoto aún no está implementado",
        );
      }

      log.info(
        {
          discovered: allDiscovered.length,
          errors: allErrors.length,
          sources,
        },
        "plugin-loader: descubrimiento completo",
      );

      return { discovered: allDiscovered, errors: allErrors, sources };
    },

    // -----------------------------------------------------------------------
    // discoverFromLocalFilesystem
    // -----------------------------------------------------------------------

    async discoverFromLocalFilesystem(dir?: string): Promise<PluginDiscoveryResult> {
      const scanDir = dir ?? localPluginDir;
      const discovered: DiscoveredPlugin[] = [];
      const errors: Array<{ packagePath: string; packageName: string; error: string }> = [];

      if (!existsSync(scanDir)) {
        log.debug(
          { dir: scanDir },
          "plugin-loader: el directorio local de plugins no existe, se omite",
        );
        return { discovered, errors, sources: ["local-filesystem"] };
      }

      let entries: string[];
      try {
        entries = await readdir(scanDir);
      } catch (err) {
        log.warn({ dir: scanDir, err }, "plugin-loader: no se pudo leer el directorio local de plugins");
        return { discovered, errors, sources: ["local-filesystem"] };
      }

      for (const entry of entries) {
        const entryPath = path.join(scanDir, entry);

        // Comprueba si la entrada es un directorio
        let entryStat;
        try {
          entryStat = await stat(entryPath);
        } catch {
          continue;
        }
        if (!entryStat.isDirectory()) continue;

        // Maneja paquetes con scope: @scope/plugin-name es un subdirectorio
        if (entry.startsWith("@")) {
          let scopedEntries: string[];
          try {
            scopedEntries = await readdir(entryPath);
          } catch {
            continue;
          }
          for (const scopedEntry of scopedEntries) {
            const scopedPath = path.join(entryPath, scopedEntry);
            try {
              const scopedStat = await stat(scopedPath);
              if (!scopedStat.isDirectory()) continue;
              const plugin = await buildDiscoveredPlugin(scopedPath, "local-filesystem");
              if (plugin) discovered.push(plugin);
            } catch (err) {
              errors.push({
                packagePath: scopedPath,
                packageName: `${entry}/${scopedEntry}`,
                error: String(err),
              });
            }
          }
          continue;
        }

        try {
          const plugin = await buildDiscoveredPlugin(entryPath, "local-filesystem");
          if (plugin) discovered.push(plugin);
        } catch (err) {
          const pkgJson = await readPackageJson(entryPath);
          const packageName =
            typeof pkgJson?.["name"] === "string" ? pkgJson["name"] : entry;
          errors.push({ packagePath: entryPath, packageName, error: String(err) });
        }
      }

      log.debug(
        { dir: scanDir, discovered: discovered.length, errors: errors.length },
        "plugin-loader: escaneo del sistema de archivos local completo",
      );

      return { discovered, errors, sources: ["local-filesystem"] };
    },

    // -----------------------------------------------------------------------
    // discoverFromNpm
    // -----------------------------------------------------------------------

    async discoverFromNpm(searchDirs?: string[]): Promise<PluginDiscoveryResult> {
      const discovered: DiscoveredPlugin[] = [];
      const errors: Array<{ packagePath: string; packageName: string; error: string }> = [];

      // Determina los directorios node_modules a buscar.
      // Cuando searchDirs es undefined O vacío, se vuelve a los
      // predeterminados convencionales (cwd/node_modules y
      // localPluginDir/node_modules). Para no buscar en ningún lado
      // explícitamente, pase un array no vacío de rutas inexistentes.
      const dirsToSearch: string[] = searchDirs && searchDirs.length > 0 ? searchDirs : [];

      if (dirsToSearch.length === 0) {
        // Predeterminado: busca node_modules relativo al directorio de
        // trabajo del proceso y también el node_modules del directorio
        // local de plugins
        const cwdNodeModules = path.join(process.cwd(), "node_modules");
        const localNodeModules = path.join(localPluginDir, "node_modules");

        if (existsSync(cwdNodeModules)) dirsToSearch.push(cwdNodeModules);
        if (existsSync(localNodeModules)) dirsToSearch.push(localNodeModules);
      }

      for (const nodeModulesDir of dirsToSearch) {
        if (!existsSync(nodeModulesDir)) continue;

        let entries: string[];
        try {
          entries = await readdir(nodeModulesDir);
        } catch {
          continue;
        }

        for (const entry of entries) {
          const entryPath = path.join(nodeModulesDir, entry);

          // Maneja paquetes con scope (@scope/*)
          if (entry.startsWith("@")) {
            let scopedEntries: string[];
            try {
              scopedEntries = await readdir(entryPath);
            } catch {
              continue;
            }
            for (const scopedEntry of scopedEntries) {
              const fullName = `${entry}/${scopedEntry}`;
              if (!isPluginPackageName(fullName)) continue;

              const scopedPath = path.join(entryPath, scopedEntry);
              try {
                const plugin = await buildDiscoveredPlugin(scopedPath, "npm");
                if (plugin) discovered.push(plugin);
              } catch (err) {
                errors.push({
                  packagePath: scopedPath,
                  packageName: fullName,
                  error: String(err),
                });
              }
            }
            continue;
          }

          // Paquetes sin scope: comprueba la convención de nombres
          if (!isPluginPackageName(entry)) continue;

          let entryStat;
          try {
            entryStat = await stat(entryPath);
          } catch {
            continue;
          }
          if (!entryStat.isDirectory()) continue;

          try {
            const plugin = await buildDiscoveredPlugin(entryPath, "npm");
            if (plugin) discovered.push(plugin);
          } catch (err) {
            const pkgJson = await readPackageJson(entryPath);
            const packageName =
              typeof pkgJson?.["name"] === "string" ? pkgJson["name"] : entry;
            errors.push({ packagePath: entryPath, packageName, error: String(err) });
          }
        }
      }

      log.debug(
        { searchDirs: dirsToSearch, discovered: discovered.length, errors: errors.length },
        "plugin-loader: escaneo de descubrimiento npm completo",
      );

      return { discovered, errors, sources: ["npm"] };
    },

    // -----------------------------------------------------------------------
    // loadManifest
    // -----------------------------------------------------------------------

    async loadManifest(packagePath: string): Promise<PaperclipPluginManifestV1 | null> {
      const pkgJson = await readPackageJson(packagePath);
      if (!pkgJson) return null;

      const hasPaperclipPlugin = "paperclipPlugin" in pkgJson;
      const packageName = typeof pkgJson["name"] === "string" ? pkgJson["name"] : "";
      const nameMatchesConvention = isPluginPackageName(packageName);

      if (!hasPaperclipPlugin && !nameMatchesConvention) {
        return null;
      }

      const manifestPath = resolveManifestPath(packagePath, pkgJson);
      if (!manifestPath || !existsSync(manifestPath)) return null;

      return loadManifestFromPath(manifestPath);
    },

    // -----------------------------------------------------------------------
    // installPlugin
    // -----------------------------------------------------------------------

    async installPlugin(installOptions: PluginInstallOptions): Promise<DiscoveredPlugin> {
      const discovered = await fetchAndValidate(installOptions);

      // Paso 6: Persiste el registro de instalación en Postgres (incluye
      // packagePath para instalaciones locales para que el worker pueda
      // resolverse)
      await registry.install(
        {
          packageName: discovered.packageName,
          packagePath: discovered.source === "local-filesystem" ? discovered.packagePath : undefined,
        },
        discovered.manifest!,
      );

      log.info(
        {
          pluginId: discovered.manifest!.id,
          packageName: discovered.packageName,
          version: discovered.version,
          capabilities: discovered.manifest!.capabilities,
        },
        "plugin-loader: plugin instalado exitosamente",
      );

      return discovered;
    },

    // -----------------------------------------------------------------------
    // upgradePlugin
    // -----------------------------------------------------------------------

    /**
     * Actualiza un plugin ya instalado a una versión más nueva.
     *
     * Este método:
     * 1. Obtiene y valida el nuevo paquete del plugin usando
     *    `fetchAndValidate`.
     * 2. Asegura que el ID del nuevo manifiesto coincida con el ID del
     *    plugin existente por seguridad.
     * 3. Actualiza el registro del plugin en el registro con la nueva
     *    versión y manifiesto.
     *
     * @param pluginId - El UUID del plugin a actualizar.
     * @param upgradeOptions - Opciones para la actualización (packageName, localPath, version).
     * @returns Los manifiestos viejo y nuevo, junto con los metadatos de descubrimiento.
     * @throws {Error} Si el plugin no se encuentra o si el ID del nuevo manifiesto difiere.
     */
    async upgradePlugin(
      pluginId: string,
      upgradeOptions: Omit<PluginInstallOptions, "installDir">,
    ): Promise<{
      oldManifest: PaperclipPluginManifestV1;
      newManifest: PaperclipPluginManifestV1;
      discovered: DiscoveredPlugin;
    }> {
      const plugin = (await registry.getById(pluginId)) as {
        id: string;
        packageName: string;
        packagePath: string | null;
        manifestJson: PaperclipPluginManifestV1;
      } | null;
      if (!plugin) throw new Error(`Plugin no encontrado: ${pluginId}`);

      const oldManifest = plugin.manifestJson;
      const {
        packageName = plugin.packageName,
        // Para instalaciones en ruta local, vuelve al packagePath almacenado
        // para que `upgradePlugin` pueda releer el manifiesto desde disco sin
        // necesitar que el llamador vuelva a pasar la ruta cada vez.
        localPath = plugin.packagePath ?? undefined,
        version,
      } = upgradeOptions;

      log.info(
        { pluginId, packageName, version, localPath },
        "plugin-loader: actualizando plugin",
      );

      // 1. Obtiene/Instala la nueva versión
      const discovered = await fetchAndValidate({
        packageName,
        localPath,
        version,
        installDir: localPluginDir,
      });

      const newManifest = discovered.manifest!;

      // 2. Valida que sea el mismo ID de plugin
      if (newManifest.id !== oldManifest.id) {
        throw new Error(
          `La actualización falló: el ID del nuevo manifiesto '${newManifest.id}' no coincide con el ID del plugin existente '${oldManifest.id}'`,
        );
      }

      // 3. Detecta escalada de capacidades — nuevas capacidades no presentes en el manifiesto viejo
      const oldCaps = new Set(oldManifest.capabilities ?? []);
      const newCaps = newManifest.capabilities ?? [];
      const escalated = newCaps.filter((c) => !oldCaps.has(c));

      if (escalated.length > 0) {
        log.warn(
          { pluginId, escalated, oldVersion: oldManifest.version, newVersion: newManifest.version },
          "plugin-loader: la actualización introduce nuevas capacidades — requiere aprobación del admin",
        );
        throw new Error(
          `La actualización de "${pluginId}" introduce nuevas capacidades que requieren aprobación: ${escalated.join(", ")}. ` +
            `La versión anterior declaraba [${[...oldCaps].join(", ")}]. ` +
            `Revise y apruebe la escalada de capacidades antes de actualizar.`,
        );
      }

      // 4. Actualiza el registro existente
      await registry.update(pluginId, {
        packageName: discovered.packageName,
        version: discovered.version,
        manifest: newManifest,
      });

      return {
        oldManifest,
        newManifest,
        discovered,
      };
    },

    // -----------------------------------------------------------------------
    // isSupportedApiVersion
    // -----------------------------------------------------------------------

    isSupportedApiVersion(apiVersion: number): boolean {
      return manifestValidator.getSupportedVersions().includes(apiVersion);
    },

    // -----------------------------------------------------------------------
    // cleanupInstallArtifacts
    // -----------------------------------------------------------------------

    async cleanupInstallArtifacts(plugin: PluginRecord): Promise<void> {
      const managedTargets = new Set<string>();
      const managedNodeModulesDir = resolveManagedInstallPackageDir(localPluginDir, plugin.packageName);
      const directManagedDir = path.join(localPluginDir, plugin.packageName);

      managedTargets.add(managedNodeModulesDir);
      if (isPathInsideDir(directManagedDir, localPluginDir)) {
        managedTargets.add(directManagedDir);
      }
      if (plugin.packagePath && isPathInsideDir(plugin.packagePath, localPluginDir)) {
        managedTargets.add(path.resolve(plugin.packagePath));
      }

      const packageJsonPath = path.join(localPluginDir, "package.json");
      if (existsSync(packageJsonPath)) {
        try {
          await execFileAsync(
            "npm",
            ["uninstall", plugin.packageName, "--prefix", localPluginDir, "--ignore-scripts"],
            { timeout: 120_000 },
          );
        } catch (err) {
          log.warn(
            {
              pluginId: plugin.id,
              pluginKey: plugin.pluginKey,
              packageName: plugin.packageName,
              err: err instanceof Error ? err.message : String(err),
            },
            "plugin-loader: npm uninstall falló durante la limpieza, se recurre a la eliminación directa",
          );
        }
      }

      for (const target of managedTargets) {
        if (!existsSync(target)) continue;
        await rm(target, { recursive: true, force: true });
      }
    },

    // -----------------------------------------------------------------------
    // getLocalPluginDir
    // -----------------------------------------------------------------------

    getLocalPluginDir(): string {
      return localPluginDir;
    },

    // -----------------------------------------------------------------------
    // hasRuntimeServices
    // -----------------------------------------------------------------------

    hasRuntimeServices(): boolean {
      return runtimeServices !== undefined;
    },

    // -----------------------------------------------------------------------
    // -----------------------------------------------------------------------
    // loadAll
    // -----------------------------------------------------------------------

    /**
     * loadAll — Carga y activa todos los plugins que están actualmente en
     * estado 'ready'.
     *
     * Este método típicamente se llama durante el arranque del servidor.
     * Obtiene todos los plugins en ready del registro e intenta activarlos
     * en paralelo usando Promise.allSettled. Los fallos en plugins
     * individuales no impiden que los otros se carguen.
     *
     * @returns Una promesa que resuelve con estadísticas resumidas de la operación de carga.
     */
    async loadAll(): Promise<PluginLoadAllResult> {
      if (!runtimeServices) {
        throw new Error(
          "No se puede ejecutar loadAll: no se proveyeron PluginRuntimeServices. " +
            "Pase los servicios de runtime como tercer argumento de pluginLoader().",
        );
      }

      log.info("plugin-loader: cargando todos los plugins en ready");

      // Obtiene todos los plugins en estado ready, ordenados por installOrder
      const readyPlugins = (await registry.listByStatus("ready")) as PluginRecord[];

      if (readyPlugins.length === 0) {
        log.info("plugin-loader: no hay plugins en ready para cargar");
        return { total: 0, succeeded: 0, failed: 0, results: [] };
      }

      log.info(
        { count: readyPlugins.length },
        "plugin-loader: se encontraron plugins en ready para cargar",
      );

      // Carga los plugins en paralelo
      const results = await Promise.allSettled(
        readyPlugins.map((plugin) => activatePlugin(plugin))
      );

      const loadResults = results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        return {
          plugin: readyPlugins[i]!,
          success: false,
          error: String(r.reason),
          registered: { worker: false, eventSubscriptions: 0, jobs: 0, webhooks: 0, tools: 0 },
        };
      });

      const succeeded = loadResults.filter((r) => r.success).length;
      const failed = loadResults.filter((r) => !r.success).length;

      log.info(
        {
          total: readyPlugins.length,
          succeeded,
          failed,
        },
        "plugin-loader: loadAll completo",
      );

      return {
        total: readyPlugins.length,
        succeeded,
        failed,
        results: loadResults,
      };
    },

    // -----------------------------------------------------------------------
    // loadSingle
    // -----------------------------------------------------------------------

    /**
     * loadSingle — Carga y activa un solo plugin por su ID.
     *
     * Este método recupera el plugin del registro, asegura que esté en un
     * estado válido, y luego llama a activatePlugin para iniciar su worker y
     * registrar sus capacidades (herramientas, trabajos, etc.).
     *
     * @param pluginId - El UUID del plugin a cargar.
     * @returns Una promesa que resuelve con el resultado de la activación.
     */
    async loadSingle(pluginId: string): Promise<PluginLoadResult> {
      if (!runtimeServices) {
        throw new Error(
          "No se puede ejecutar loadSingle: no se proveyeron PluginRuntimeServices. " +
            "Pase los servicios de runtime como tercer argumento de pluginLoader().",
        );
      }

      const plugin = (await registry.getById(pluginId)) as PluginRecord | null;
      if (!plugin) {
        throw new Error(`Plugin no encontrado: ${pluginId}`);
      }

      // Si el plugin está en estado 'installed', primero transiciona a 'ready'.
      // lifecycleManager.load() transiciona el estado Y activa el plugin
      // vía activateReadyPlugin() → loadSingle() (llamada recursiva con estado
      // 'ready') → activatePlugin(). NO debemos llamar activatePlugin() de
      // nuevo aquí, ya que eso iniciaría el worker dos veces y duplicaría los
      // registros.
      if (plugin.status === "installed") {
        await runtimeServices.lifecycleManager.load(pluginId);
        const updated = (await registry.getById(pluginId)) as PluginRecord | null;
        if (!updated) throw new Error(`Plugin no encontrado tras la actualización de estado: ${pluginId}`);
        return {
          plugin: updated,
          success: true,
          registered: { worker: true, eventSubscriptions: 0, jobs: 0, webhooks: 0, tools: 0 },
        };
      }

      if (plugin.status !== "ready") {
        throw new Error(
          `No se puede cargar el plugin en estado '${plugin.status}'. ` +
            `El plugin debe estar en estado 'installed' o 'ready'.`,
        );
      }

      return activatePlugin(plugin);
    },

    // -----------------------------------------------------------------------
    // unloadSingle
    // -----------------------------------------------------------------------

    async unloadSingle(pluginId: string, pluginKey: string): Promise<void> {
      if (!runtimeServices) {
        throw new Error(
          "No se puede ejecutar unloadSingle: no se proveyeron PluginRuntimeServices.",
        );
      }

      log.info(
        { pluginId, pluginKey },
        "plugin-loader: descargando un solo plugin",
      );

      const {
        workerManager,
        eventBus,
        jobScheduler,
        toolDispatcher,
      } = runtimeServices;

      // 1. Desregistra del programador de trabajos (cancela ejecuciones en curso)
      try {
        await jobScheduler.unregisterPlugin(pluginId);
      } catch (err) {
        log.warn(
          { pluginId, err: err instanceof Error ? err.message : String(err) },
          "plugin-loader: no se pudo desregistrar del programador de trabajos (mejor esfuerzo)",
        );
      }

      // 2. Limpia las suscripciones de eventos
      eventBus.clearPlugin(pluginKey);

      // 3. Desregistra las herramientas de agente
      toolDispatcher.unregisterPluginTools(pluginKey);

      // 4. Detiene el proceso worker
      try {
        if (workerManager.isRunning(pluginId)) {
          await workerManager.stopWorker(pluginId);
        }
      } catch (err) {
        log.warn(
          { pluginId, err: err instanceof Error ? err.message : String(err) },
          "plugin-loader: no se pudo detener el worker durante la descarga (mejor esfuerzo)",
        );
      }

      log.info(
        { pluginId, pluginKey },
        "plugin-loader: plugin descargado exitosamente",
      );
    },

    // -----------------------------------------------------------------------
    // shutdownAll
    // -----------------------------------------------------------------------

    async shutdownAll(): Promise<void> {
      if (!runtimeServices) {
        throw new Error(
          "No se puede ejecutar shutdownAll: no se proveyeron PluginRuntimeServices.",
        );
      }

      log.info("plugin-loader: apagando todos los plugins");

      const { workerManager, jobScheduler } = runtimeServices;

      // 1. Detiene el ciclo de tick del programador de trabajos
      jobScheduler.stop();

      // 2. Detiene todos los procesos worker
      await workerManager.stopAll();

      log.info("plugin-loader: todos los plugins apagados");
    },
  };

  // -------------------------------------------------------------------------
  // Interno: activatePlugin — lógica compartida para loadAll y loadSingle
  // -------------------------------------------------------------------------

  /**
   * Activa un solo plugin: genera su worker, registra suscripciones de
   * eventos, sincroniza trabajos, registra herramientas.
   *
   * Esta es la lógica central de orquestación compartida por `loadAll()` y
   * `loadSingle()`. Los fallos se capturan y reportan en el resultado; el
   * plugin se marca como `error` en la base de datos cuando la activación
   * falla.
   */
  async function activatePlugin(plugin: PluginRecord): Promise<PluginLoadResult> {
    const manifest = plugin.manifestJson;
    const pluginId = plugin.id;
    const pluginKey = plugin.pluginKey;

    const registered: PluginLoadResult["registered"] = {
      worker: false,
      eventSubscriptions: 0,
      jobs: 0,
      webhooks: 0,
      tools: 0,
    };

    // Guarda: los servicios de runtime deben existir (los llamadores ya lo
    // comprobaron)
    if (!runtimeServices) {
      return {
        plugin,
        success: false,
        error: "No hay servicios de runtime disponibles",
        registered,
      };
    }

    const {
      workerManager,
      eventBus,
      jobScheduler,
      jobStore,
      toolDispatcher,
      lifecycleManager,
      buildHostHandlers,
      instanceInfo,
    } = runtimeServices;

    try {
      log.info(
        { pluginId, pluginKey, version: plugin.version },
        "plugin-loader: activando plugin",
      );

      // ------------------------------------------------------------------
      // 1. Resuelve el entrypoint del worker
      // ------------------------------------------------------------------
      const workerEntrypoint = resolveWorkerEntrypoint(plugin, localPluginDir);

      // ------------------------------------------------------------------
      // 2. Construye los manejadores host para este plugin
      // ------------------------------------------------------------------
      const hostHandlers = buildHostHandlers(pluginId, manifest);

      // ------------------------------------------------------------------
      // 3. Recupera la configuración del plugin (si hay)
      // ------------------------------------------------------------------
      let config: Record<string, unknown> = {};
      try {
        const configRow = await registry.getConfig(pluginId);
        if (configRow && typeof configRow === "object" && "configJson" in configRow) {
          config = (configRow as { configJson: Record<string, unknown> }).configJson ?? {};
        }
      } catch {
        // La configuración puede no existir aún — usa un objeto vacío
        log.debug({ pluginId }, "plugin-loader: no se encontró config, usando config vacía");
      }

      // ------------------------------------------------------------------
      // 4. Genera el proceso worker
      // ------------------------------------------------------------------
      const workerOptions: WorkerStartOptions = {
        entrypointPath: workerEntrypoint,
        manifest,
        config,
        instanceInfo,
        apiVersion: manifest.apiVersion,
        hostHandlers,
        autoRestart: true,
      };

      // Las instalaciones locales de plugins del repo pueden resolver
      // fuentes TS del workspace en tiempo de ejecución (por ejemplo los
      // exports de @paperclipai/shared). Ejecuta esos workers a través del
      // loader de tsx para que los plugins de ejemplo de primera parte
      // funcionen en desarrollo.
      if (plugin.packagePath && existsSync(DEV_TSX_LOADER_PATH)) {
        workerOptions.execArgv = ["--import", DEV_TSX_LOADER_PATH];
      }

      await workerManager.startWorker(pluginId, workerOptions);
      registered.worker = true;

      log.info(
        { pluginId, pluginKey },
        "plugin-loader: worker iniciado",
      );

      // ------------------------------------------------------------------
      // 5. Sincroniza las declaraciones de trabajos y registra con el programador
      // ------------------------------------------------------------------
      const jobDeclarations = manifest.jobs ?? [];
      if (jobDeclarations.length > 0) {
        await jobStore.syncJobDeclarations(pluginId, jobDeclarations);
        await jobScheduler.registerPlugin(pluginId);
        registered.jobs = jobDeclarations.length;

        log.info(
          { pluginId, pluginKey, jobs: jobDeclarations.length },
          "plugin-loader: declaraciones de trabajos sincronizadas y plugin registrado con el programador",
        );
      }

      // ------------------------------------------------------------------
      // 6. Registra suscripciones de eventos
      //
      // Nota: Las suscripciones de eventos las declara en tiempo de
      // ejecución el worker del plugin vía las llamadas ctx.events.on() del
      // SDK. El bus de eventos maneja el alcance de suscripciones por
      // plugin. Aquí nos aseguramos de que el bus de eventos tenga un
      // manejador con alcance listo para este plugin — las suscripciones
      // reales las registra la capa de manejadores host cuando el worker
      // llama a events.subscribe vía RPC.
      //
      // La llamada bus.forPlugin() crea el manejador con alcance si es
      // necesario; cualquier suscripción previa de este plugin se preserva si
      // el worker se está reiniciando.
      // ------------------------------------------------------------------
      const _scopedBus = eventBus.forPlugin(pluginKey);
      registered.eventSubscriptions = eventBus.subscriptionCount(pluginKey);

      log.debug(
        { pluginId, pluginKey },
        "plugin-loader: manejador con alcance del bus de eventos listo",
      );

      // ------------------------------------------------------------------
      // 7. Registra endpoints de webhook (declarados en el manifiesto)
      //
      // Los webhooks se declaran estáticamente en el manifiesto. El ruteo
      // real de endpoints lo maneja el módulo de rutas de plugins que
      // consulta el manifiesto en busca de webhooks declarados. No se
      // necesita ningún paso de registro explícito aquí — el manifiesto se
      // persiste en la BD y el manejador de rutas lo lee al momento de la
      // petición.
      //
      // Llevamos el conteo para el reporte de resultados.
      // ------------------------------------------------------------------
      const webhookDeclarations = manifest.webhooks ?? [];
      registered.webhooks = webhookDeclarations.length;

      if (webhookDeclarations.length > 0) {
        log.info(
          { pluginId, pluginKey, webhooks: webhookDeclarations.length },
          "plugin-loader: endpoints de webhook declarados en el manifiesto",
        );
      }

      // ------------------------------------------------------------------
      // 8. Registra herramientas de agente
      // ------------------------------------------------------------------
      const toolDeclarations = manifest.tools ?? [];
      if (toolDeclarations.length > 0) {
        toolDispatcher.registerPluginTools(pluginKey, manifest);
        registered.tools = toolDeclarations.length;

        log.info(
          { pluginId, pluginKey, tools: toolDeclarations.length },
          "plugin-loader: herramientas de agente registradas",
        );
      }

      // ------------------------------------------------------------------
      // Listo — plugin completamente activado
      // ------------------------------------------------------------------
      log.info(
        {
          pluginId,
          pluginKey,
          version: plugin.version,
          registered,
        },
        "plugin-loader: plugin activado exitosamente",
      );

      return { plugin, success: true, registered };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      log.error(
        { pluginId, pluginKey, err: errorMessage },
        "plugin-loader: falló la activación del plugin",
      );

      // Marca el plugin como con error en la base de datos para que no se
      // reintente automáticamente en el próximo arranque sin intervención
      // del operador.
      try {
        await lifecycleManager.markError(pluginId, `La activación falló: ${errorMessage}`);
      } catch (markErr) {
        log.error(
          {
            pluginId,
            err: markErr instanceof Error ? markErr.message : String(markErr),
          },
          "plugin-loader: no se pudo marcar el plugin como error tras el fallo de activación",
        );
      }

      return {
        plugin,
        success: false,
        error: errorMessage,
        registered,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Resolución del entrypoint del worker
// ---------------------------------------------------------------------------

/**
 * Resuelve la ruta absoluta al entrypoint del worker de un plugin desde su
 * manifiesto y ubicaciones de instalación conocidas.
 *
 * El campo `entrypoints.worker` del manifiesto es relativo a la raíz del
 * paquete. Revisamos el directorio local de plugins (donde se instaló el
 * paquete) y también el directorio del paquete si fue una instalación en
 * ruta local.
 *
 * @see PLUGIN_SPEC.md §10 — Contrato de paquete
 */
function resolveWorkerEntrypoint(
  plugin: PluginRecord & { packagePath?: string | null },
  localPluginDir: string,
): string {
  const manifest = plugin.manifestJson;
  const workerRelPath = manifest.entrypoints.worker;

  // Para instalaciones en ruta local persistimos la ruta resuelta del
  // paquete; úsala primero
  if (plugin.packagePath && existsSync(plugin.packagePath)) {
    const entrypoint = path.resolve(plugin.packagePath, workerRelPath);
    if (entrypoint.startsWith(path.resolve(plugin.packagePath)) && existsSync(entrypoint)) {
      return entrypoint;
    }
  }

  // Prueba el directorio local de plugins (ubicación estándar de npm install)
  const packageName = plugin.packageName;
  let packageDir: string;

  if (packageName.startsWith("@")) {
    // Paquete con scope: @scope/plugin-name → localPluginDir/node_modules/@scope/plugin-name
    const [scope, name] = packageName.split("/");
    packageDir = path.join(localPluginDir, "node_modules", scope!, name!);
  } else {
    packageDir = path.join(localPluginDir, "node_modules", packageName);
  }

  // También comprueba si el paquete existe directamente bajo localPluginDir
  // (para instalaciones directas en ruta local o paquetes con symlink)
  const directDir = path.join(localPluginDir, packageName);

  // Prueba en orden: ruta node_modules, ruta directa
  for (const dir of [packageDir, directDir]) {
    const entrypoint = path.resolve(dir, workerRelPath);

    // Seguridad: asegura que el entrypoint esté realmente dentro del
    // directorio (evita path traversal)
    if (!entrypoint.startsWith(path.resolve(dir))) {
      continue;
    }

    if (existsSync(entrypoint)) {
      return entrypoint;
    }
  }

  // Alternativa: prueba la ruta del worker tal cual (absoluta o relativa al
  // cwd) SOLO si ya es una ruta absoluta y confiamos en el manifiesto (que
  // ya validamos)
  if (path.isAbsolute(workerRelPath) && existsSync(workerRelPath)) {
    return workerRelPath;
  }

  throw new Error(
    `Entrypoint del worker no encontrado para el plugin "${plugin.pluginKey}". ` +
      `Revisado: ${path.resolve(packageDir, workerRelPath)}, ` +
      `${path.resolve(directDir, workerRelPath)}`,
  );
}

function resolveManagedInstallPackageDir(localPluginDir: string, packageName: string): string {
  if (packageName.startsWith("@")) {
    return path.join(localPluginDir, "node_modules", ...packageName.split("/"));
  }
  return path.join(localPluginDir, "node_modules", packageName);
}

function isPathInsideDir(candidatePath: string, parentDir: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedParent = path.resolve(parentDir);
  const relative = path.relative(resolvedParent, resolvedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
