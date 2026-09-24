/**
 * PluginDevWatcher — observa los directorios de plugins de ruta local en
 * busca de cambios de archivos y dispara reinicios de workers para que los
 * autores de plugins tengan un ciclo rápido de recompilar-y-recargar sin
 * reiniciar el servidor manualmente.
 *
 * Solo se observan los plugins instalados desde una ruta local (es decir,
 * los que tienen un `packagePath` no nulo en la BD). Los cambios de
 * archivos en el directorio del paquete del plugin disparan un reinicio
 * de worker con debounce vía el manejador de ciclo de vida.
 *
 * Usa chokidar en lugar de fs.watch en crudo para tener un backend de
 * observación de nivel producción entre plataformas y evitar agotar los
 * descriptores de archivo tan rápido en espacios de trabajo de dev grandes.
 *
 * @see PLUGIN_SPEC.md §27.2 — Flujo de desarrollo local
 */
import chokidar, { type FSWatcher } from "chokidar";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { logger } from "../middleware/logger.js";
import type { PluginLifecycleManager } from "./plugin-lifecycle.js";

const log = logger.child({ service: "plugin-dev-watcher" });

/** Intervalo de debounce para cambios de archivos (ms). */
const DEBOUNCE_MS = 500;

export interface PluginDevWatcher {
  /** Empieza a observar el directorio de un plugin de ruta local. */
  watch(pluginId: string, packagePath: string): void;
  /** Deja de observar un plugin específico. */
  unwatch(pluginId: string): void;
  /** Detiene todos los watchers y libera recursos. */
  close(): void;
}

export type ResolvePluginPackagePath = (
  pluginId: string,
) => Promise<string | null | undefined>;

export interface PluginDevWatcherFsDeps {
  existsSync?: typeof existsSync;
  readFileSync?: typeof readFileSync;
  readdirSync?: typeof readdirSync;
  statSync?: typeof statSync;
}

type PluginWatchTarget = {
  path: string;
  recursive: boolean;
  kind: "file" | "dir";
};

type PluginPackageJson = {
  paperclipPlugin?: {
    manifest?: string;
    worker?: string;
    ui?: string;
  };
};

function shouldIgnorePath(filename: string | null | undefined): boolean {
  if (!filename) return false;
  const normalized = filename.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.some(
    (segment) =>
      segment === "node_modules" ||
      segment === ".git" ||
      segment === ".vite" ||
      segment === ".paperclip-sdk" ||
      segment.startsWith("."),
  );
}

export function resolvePluginWatchTargets(
  packagePath: string,
  fsDeps?: Pick<PluginDevWatcherFsDeps, "existsSync" | "readFileSync" | "readdirSync" | "statSync">,
): PluginWatchTarget[] {
  const fileExists = fsDeps?.existsSync ?? existsSync;
  const readFile = fsDeps?.readFileSync ?? readFileSync;
  const readDir = fsDeps?.readdirSync ?? readdirSync;
  const statFile = fsDeps?.statSync ?? statSync;
  const absPath = path.resolve(packagePath);
  const targets = new Map<string, PluginWatchTarget>();

  function addWatchTarget(targetPath: string, recursive: boolean, kind?: "file" | "dir"): void {
    const resolved = path.resolve(targetPath);
    if (!fileExists(resolved)) return;
    const inferredKind = kind ?? (statFile(resolved).isDirectory() ? "dir" : "file");

    const existing = targets.get(resolved);
    if (existing) {
      existing.recursive = existing.recursive || recursive;
      return;
    }

    targets.set(resolved, { path: resolved, recursive, kind: inferredKind });
  }

  function addRuntimeFilesFromDir(dirPath: string): void {
    if (!fileExists(dirPath)) return;

    for (const entry of readDir(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        addRuntimeFilesFromDir(entryPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".js") && !entry.name.endsWith(".css")) continue;
      addWatchTarget(entryPath, false, "file");
    }
  }

  const packageJsonPath = path.join(absPath, "package.json");
  addWatchTarget(packageJsonPath, false, "file");
  if (!fileExists(packageJsonPath)) {
    return [...targets.values()];
  }

  let packageJson: PluginPackageJson | null = null;
  try {
    packageJson = JSON.parse(readFile(packageJsonPath, "utf8")) as PluginPackageJson;
  } catch {
    packageJson = null;
  }

  const entrypointPaths = [
    packageJson?.paperclipPlugin?.manifest,
    packageJson?.paperclipPlugin?.worker,
    packageJson?.paperclipPlugin?.ui,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  if (entrypointPaths.length === 0) {
    addRuntimeFilesFromDir(path.join(absPath, "dist"));
    return [...targets.values()];
  }

  for (const relativeEntrypoint of entrypointPaths) {
    const resolvedEntrypoint = path.resolve(absPath, relativeEntrypoint);
    if (!fileExists(resolvedEntrypoint)) continue;

    const stat = statFile(resolvedEntrypoint);
    if (stat.isDirectory()) {
      addRuntimeFilesFromDir(resolvedEntrypoint);
    } else {
      addWatchTarget(resolvedEntrypoint, false, "file");
    }
  }

  return [...targets.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Crea un PluginDevWatcher que monitorea directorios de plugins locales y
 * reinicia los workers ante cambios de archivos.
 */
export function createPluginDevWatcher(
  lifecycle: PluginLifecycleManager,
  resolvePluginPackagePath?: ResolvePluginPackagePath,
  fsDeps?: PluginDevWatcherFsDeps,
): PluginDevWatcher {
  const watchers = new Map<string, FSWatcher>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const fileExists = fsDeps?.existsSync ?? existsSync;

  function watchPlugin(pluginId: string, packagePath: string): void {
    // No observar dos veces
    if (watchers.has(pluginId)) return;

    const absPath = path.resolve(packagePath);
    if (!fileExists(absPath)) {
      log.warn(
        { pluginId, packagePath: absPath },
        "plugin-dev-watcher: la ruta del paquete no existe, omitiendo observación",
      );
      return;
    }

    try {
      const watcherTargets = resolvePluginWatchTargets(absPath, fsDeps);
      if (watcherTargets.length === 0) {
        log.warn(
          { pluginId, packagePath: absPath },
          "plugin-dev-watcher: no se encontraron objetivos válidos de observación, omitiendo",
        );
        return;
      }

      const watcher = chokidar.watch(
        watcherTargets.map((target) => target.path),
        {
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 200,
            pollInterval: 100,
          },
          ignored: (watchedPath) => {
            const relativePath = path.relative(absPath, watchedPath);
            return shouldIgnorePath(relativePath);
          },
        },
      );

      watcher.on("all", (_eventName, changedPath) => {
        const relativePath = path.relative(absPath, changedPath);
        if (shouldIgnorePath(relativePath)) return;

        const existing = debounceTimers.get(pluginId);
        if (existing) clearTimeout(existing);

        debounceTimers.set(
          pluginId,
          setTimeout(() => {
            debounceTimers.delete(pluginId);
            log.info(
              { pluginId, changedFile: relativePath || path.basename(changedPath) },
              "plugin-dev-watcher: cambio de archivo detectado, reiniciando worker",
            );

            lifecycle.restartWorker(pluginId).catch((err) => {
              log.warn(
                {
                  pluginId,
                  err: err instanceof Error ? err.message : String(err),
                },
                "plugin-dev-watcher: no se pudo reiniciar el worker tras el cambio de archivo",
              );
            });
          }, DEBOUNCE_MS),
        );
      });

      watcher.on("error", (err) => {
        log.warn(
          {
            pluginId,
            packagePath: absPath,
            err: err instanceof Error ? err.message : String(err),
          },
          "plugin-dev-watcher: error del observador, deteniendo la observación de este plugin",
        );
        unwatchPlugin(pluginId);
      });

      watchers.set(pluginId, watcher);
      log.info(
        {
          pluginId,
          packagePath: absPath,
          watchTargets: watcherTargets.map((target) => ({
            path: target.path,
            kind: target.kind,
          })),
        },
        "plugin-dev-watcher: observando el plugin local en busca de cambios",
      );
    } catch (err) {
      log.warn(
        {
          pluginId,
          packagePath: absPath,
          err: err instanceof Error ? err.message : String(err),
        },
        "plugin-dev-watcher: no se pudo iniciar el observador de archivos",
      );
    }
  }

  function unwatchPlugin(pluginId: string): void {
    const pluginWatcher = watchers.get(pluginId);
    if (pluginWatcher) {
      void pluginWatcher.close();
      watchers.delete(pluginId);
    }
    const timer = debounceTimers.get(pluginId);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.delete(pluginId);
    }
  }

  function close(): void {
    lifecycle.off("plugin.loaded", handlePluginLoaded);
    lifecycle.off("plugin.enabled", handlePluginEnabled);
    lifecycle.off("plugin.disabled", handlePluginDisabled);
    lifecycle.off("plugin.unloaded", handlePluginUnloaded);

    for (const [pluginId] of watchers) {
      unwatchPlugin(pluginId);
    }
  }

  async function watchLocalPluginById(pluginId: string): Promise<void> {
    if (!resolvePluginPackagePath) return;

    try {
      const packagePath = await resolvePluginPackagePath(pluginId);
      if (!packagePath) return;
      watchPlugin(pluginId, packagePath);
    } catch (err) {
      log.warn(
        {
          pluginId,
          err: err instanceof Error ? err.message : String(err),
        },
        "plugin-dev-watcher: no se pudo resolver la ruta del paquete del plugin",
      );
    }
  }

  function handlePluginLoaded(payload: { pluginId: string }): void {
    void watchLocalPluginById(payload.pluginId);
  }

  function handlePluginEnabled(payload: { pluginId: string }): void {
    void watchLocalPluginById(payload.pluginId);
  }

  function handlePluginDisabled(payload: { pluginId: string }): void {
    unwatchPlugin(payload.pluginId);
  }

  function handlePluginUnloaded(payload: { pluginId: string }): void {
    unwatchPlugin(payload.pluginId);
  }

  lifecycle.on("plugin.loaded", handlePluginLoaded);
  lifecycle.on("plugin.enabled", handlePluginEnabled);
  lifecycle.on("plugin.disabled", handlePluginDisabled);
  lifecycle.on("plugin.unloaded", handlePluginUnloaded);

  return {
    watch: watchPlugin,
    unwatch: unwatchPlugin,
    close,
  };
}
