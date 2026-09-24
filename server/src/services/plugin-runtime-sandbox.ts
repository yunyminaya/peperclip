import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import type { PluginCapabilityValidator } from "./plugin-capability-validator.js";

export class PluginSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginSandboxError";
  }
}

/**
 * Opciones de runtime del sandbox usadas al cargar un módulo worker de
 * plugin.
 *
 * `allowedModuleSpecifiers` controla qué especificadores de módulo
 * desnudos están permitidos. `allowedModules` provee bindings concretos
 * provistos por el host para esos especificadores.
 */
export interface PluginSandboxOptions {
  entrypointPath: string;
  allowedModuleSpecifiers?: ReadonlySet<string>;
  allowedModules?: Readonly<Record<string, Record<string, unknown>>>;
  allowedGlobals?: Record<string, unknown>;
  timeoutMs?: number;
}

/**
 * Puerta de runtime a nivel de operación para llamadas de la API host de
 * plugins. Cada operación host debe comprobarse contra las capacidades del
 * manifiesto antes de ejecutarse.
 */
export interface CapabilityScopedInvoker {
  invoke<T>(operation: string, fn: () => Promise<T> | T): Promise<T>;
}

interface LoadedModule {
  namespace: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 2_000;
const MODULE_PATH_SUFFIXES = ["", ".js", ".mjs", ".cjs", "/index.js", "/index.mjs", "/index.cjs"];
const DEFAULT_GLOBALS: Record<string, unknown> = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  AbortController,
  AbortSignal,
};

export function createCapabilityScopedInvoker(
  manifest: PaperclipPluginManifestV1,
  validator: PluginCapabilityValidator,
): CapabilityScopedInvoker {
  return {
    async invoke<T>(operation: string, fn: () => Promise<T> | T): Promise<T> {
      validator.assertOperation(manifest, operation);
      return await fn();
    },
  };
}

/**
 * Carga un módulo de plugin CommonJS en un contexto VM con allow-listing
 * explícito de importaciones de módulos.
 *
 * Propiedades de seguridad:
 * - sin acceso implícito a globales del host como `process`
 * - sin importaciones irrestrictas de módulos integrados
 * - las importaciones relativas solo se resuelven dentro del directorio raíz
 *   del plugin
 */
export async function loadPluginModuleInSandbox(
  options: PluginSandboxOptions,
): Promise<LoadedModule> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowedSpecifiers = options.allowedModuleSpecifiers ?? new Set<string>();
  const entrypointPath = path.resolve(options.entrypointPath);
  const pluginRoot = path.dirname(entrypointPath);

  const context = vm.createContext({
    ...DEFAULT_GLOBALS,
    ...options.allowedGlobals,
  });

  const moduleCache = new Map<string, Record<string, unknown>>();
  const allowedModules = options.allowedModules ?? {};

  const realPluginRoot = realpathSync(pluginRoot);

  const loadModuleSync = (modulePath: string): Record<string, unknown> => {
    const resolvedPath = resolveModulePathSync(path.resolve(modulePath));
    const realPath = realpathSync(resolvedPath);

    if (!isWithinRoot(realPath, realPluginRoot)) {
      throw new PluginSandboxError(
        `La importación '${modulePath}' escapa la raíz del plugin y no está permitida`,
      );
    }

    const cached = moduleCache.get(realPath);
    if (cached) return cached;

    const code = readModuleSourceSync(realPath);

    if (looksLikeEsm(code)) {
      throw new PluginSandboxError(
        "El cargador del sandbox solo soporta módulos CommonJS. Compile los entrypoints de workers de plugins como CJS para la carga en sandbox.",
      );
    }

    const module = { exports: {} as Record<string, unknown> };
    // Guarda el módulo en caché antes de ejecutarlo para preservar la
    // semántica de ciclos de CommonJS.
    moduleCache.set(realPath, module.exports);

    const requireInSandbox = (specifier: string): Record<string, unknown> => {
      if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
        if (!allowedSpecifiers.has(specifier)) {
          throw new PluginSandboxError(
            `Importación denegada para el módulo '${specifier}'. Agregue una entrada explícita a la allow-list del sandbox.`,
          );
        }

        const binding = allowedModules[specifier];
        if (!binding) {
          throw new PluginSandboxError(
            `El módulo desnudo '${specifier}' está en la allow-list pero no hay ningún binding del host registrado.`,
          );
        }

        return binding;
      }

      const candidatePath = path.resolve(path.dirname(realPath), specifier);
      return loadModuleSync(candidatePath);
    };

    // Inyecta los argumentos del módulo CJS en el contexto para que el
    // script pueda llamar al wrapper inmediatamente. Esto es crítico: el
    // timeout en runInContext solo aplica durante la evaluación del script.
    // Al incluir la auto-invocación `(fn)(exports, module, ...)` en el texto
    // del script, el timeout también cubre la ejecución real del cuerpo del
    // módulo — evitando que bucles infinitos cuelguen.
    const sandboxArgs = {
      __paperclip_exports: module.exports,
      __paperclip_module: module,
      __paperclip_require: requireInSandbox,
      __paperclip_filename: realPath,
      __paperclip_dirname: path.dirname(realPath),
    };
    // Inyecta temporalmente los args en el contexto, ejecuta, y luego los
    // elimina para evitar contaminación.
    Object.assign(context, sandboxArgs);
    const wrapped = `(function (exports, module, require, __filename, __dirname) {\n${code}\n})(__paperclip_exports, __paperclip_module, __paperclip_require, __paperclip_filename, __paperclip_dirname)`;
    const script = new vm.Script(wrapped, { filename: realPath });
    try {
      script.runInContext(context, { timeout: timeoutMs });
    } finally {
      for (const key of Object.keys(sandboxArgs)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (context as Record<string, unknown>)[key];
      }
    }

    const normalizedExports = normalizeModuleExports(module.exports);
    moduleCache.set(realPath, normalizedExports);
    return normalizedExports;
  };

  const entryExports = loadModuleSync(entrypointPath);

  return {
    namespace: { ...entryExports },
  };
}

function resolveModulePathSync(candidatePath: string): string {
  for (const suffix of MODULE_PATH_SUFFIXES) {
    const fullPath = `${candidatePath}${suffix}`;
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  throw new PluginSandboxError(`No se pudo resolver la importación del módulo en la ruta '${candidatePath}'`);
}

/**
 * True cuando `targetPath` está dentro de `rootPath` (o es igual a
 * rootPath), false en caso contrario. Usa `path.relative` para que rutas de
 * prefijo hermanas (p. ej. `/root-a` vs `/root`) no puedan evadir los
 * chequeos.
 */
function isWithinRoot(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readModuleSourceSync(modulePath: string): string {
  try {
    return readFileSync(modulePath, "utf8");
  } catch (error) {
    throw new PluginSandboxError(
      `No se pudo leer el módulo del sandbox '${modulePath}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function normalizeModuleExports(exportsValue: unknown): Record<string, unknown> {
  if (typeof exportsValue === "object" && exportsValue !== null) {
    return exportsValue as Record<string, unknown>;
  }

  return { default: exportsValue };
}

/**
 * Guarda liviana para rechazar sintaxis ESM en el cargador CommonJS de la VM.
 */
function looksLikeEsm(code: string): boolean {
  return /(^|\n)\s*import\s+/m.test(code) || /(^|\n)\s*export\s+/m.test(code);
}
