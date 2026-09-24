import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

// ---------------------------------------------------------------------------
// Tipos que reflejan las formas del lado del servidor
// ---------------------------------------------------------------------------

interface PluginRecord {
  id: string;
  pluginKey: string;
  packageName: string;
  version: string;
  status: string;
  displayName?: string;
  lastError?: string | null;
  installedAt: string;
  updatedAt: string;
}


// ---------------------------------------------------------------------------
// Tipos de opciones
// ---------------------------------------------------------------------------

interface PluginListOptions extends BaseClientOptions {
  status?: string;
}

interface PluginInstallOptions extends BaseClientOptions {
  local?: boolean;
  version?: string;
}

interface PluginUninstallOptions extends BaseClientOptions {
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Resolve a local path argument to an absolute path so the server can find the
 * plugin on disk regardless of where the user ran the CLI.
 */
function resolvePackageArg(packageArg: string, isLocal: boolean): string {
  if (!isLocal) return packageArg;
  // Ya es absoluta
  if (path.isAbsolute(packageArg)) return packageArg;
  // Expandir el ~ inicial al directorio home
  if (packageArg.startsWith("~")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return path.resolve(home, packageArg.slice(1).replace(/^[\\/]/, ""));
  }
  return path.resolve(process.cwd(), packageArg);
}

function formatPlugin(p: PluginRecord): string {
  const statusColor =
    p.status === "ready"
      ? pc.green(p.status)
      : p.status === "error"
        ? pc.red(p.status)
        : p.status === "disabled"
          ? pc.dim(p.status)
          : pc.yellow(p.status);

  const parts = [
    `key=${pc.bold(p.pluginKey)}`,
    `status=${statusColor}`,
    `version=${p.version}`,
    `id=${pc.dim(p.id)}`,
  ];

  if (p.lastError) {
    parts.push(`error=${pc.red(p.lastError.slice(0, 80))}`);
  }

  return parts.join("  ");
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerPluginCommands(program: Command): void {
  const plugin = program.command("plugin").description("Gestión del ciclo de vida de plugins");

  // -------------------------------------------------------------------------
  // plugin list
  // -------------------------------------------------------------------------
  addCommonClientOptions(
    plugin
      .command("list")
      .description("Listar plugins instalados")
      .option("--status <status>", "Filtrar por estado (ready, error, disabled, installed, upgrade_pending)")
      .action(async (opts: PluginListOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const qs = opts.status ? `?status=${encodeURIComponent(opts.status)}` : "";
          const plugins = await ctx.api.get<PluginRecord[]>(`/api/plugins${qs}`);

          if (ctx.json) {
            printOutput(plugins, { json: true });
            return;
          }

          const rows = plugins ?? [];
          if (rows.length === 0) {
            console.log(pc.dim("No hay plugins instalados."));
            return;
          }

          for (const p of rows) {
            console.log(formatPlugin(p));
          }
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  // -------------------------------------------------------------------------
  // plugin install <package-or-path>
  // -------------------------------------------------------------------------
  addCommonClientOptions(
    plugin
      .command("install <package>")
      .description(
        "Instala un plugin desde una ruta local o un paquete npm.\n" +
          "  Ejemplos:\n" +
          "    paperclipai plugin install ./my-plugin              # ruta local\n" +
          "    paperclipai plugin install @acme/plugin-linear      # paquete npm\n" +
          "    paperclipai plugin install @acme/plugin-linear@1.2  # versión fija",
      )
      .option("-l, --local", "Tratar <package> como una ruta local del sistema de archivos", false)
      .option("--version <version>", "Versión npm específica a instalar (solo paquetes npm)")
      .action(async (packageArg: string, opts: PluginInstallOptions) => {
        try {
          const ctx = resolveCommandContext(opts);

          // Detectar rutas locales automáticamente: empieza con . o / o ~ o es una ruta absoluta
          const isLocal =
            opts.local ||
            packageArg.startsWith("./") ||
            packageArg.startsWith("../") ||
            packageArg.startsWith("/") ||
            packageArg.startsWith("~");

          const resolvedPackage = resolvePackageArg(packageArg, isLocal);

          if (!ctx.json) {
            console.log(
              pc.dim(
                isLocal
                  ? `Instalando plugin desde ruta local: ${resolvedPackage}`
                  : `Instalando plugin: ${resolvedPackage}${opts.version ? `@${opts.version}` : ""}`,
              ),
            );
          }

          const installedPlugin = await ctx.api.post<PluginRecord>("/api/plugins/install", {
            packageName: resolvedPackage,
            version: opts.version,
            isLocalPath: isLocal,
          });

          if (ctx.json) {
            printOutput(installedPlugin, { json: true });
            return;
          }

          if (!installedPlugin) {
            console.log(pc.dim("La instalación no devolvió registro de plugin."));
            return;
          }

          console.log(
            pc.green(
              `✓ Instalado ${pc.bold(installedPlugin.pluginKey)} v${installedPlugin.version} (${installedPlugin.status})`,
            ),
          );

          if (installedPlugin.lastError) {
            console.log(pc.red(`  Advertencia: ${installedPlugin.lastError}`));
          }
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  // -------------------------------------------------------------------------
  // plugin uninstall <plugin-key-or-id>
  // -------------------------------------------------------------------------
  addCommonClientOptions(
    plugin
      .command("uninstall <pluginKey>")
      .description(
        "Desinstala un plugin por su clave de plugin o ID de base de datos.\n" +
          "  Usa --force para purgar todo el estado y la config.",
      )
      .option("--force", "Purgar todo el estado y la config del plugin (eliminación dura)", false)
      .action(async (pluginKey: string, opts: PluginUninstallOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const purge = opts.force === true;
          const qs = purge ? "?purge=true" : "";

          if (!ctx.json) {
            console.log(
              pc.dim(
                purge
                  ? `Desinstalando y purgando plugin: ${pluginKey}`
                  : `Desinstalando plugin: ${pluginKey}`,
              ),
            );
          }

          const result = await ctx.api.delete<PluginRecord | null>(
            `/api/plugins/${encodeURIComponent(pluginKey)}${qs}`,
          );

          if (ctx.json) {
            printOutput(result, { json: true });
            return;
          }

          console.log(pc.green(`✓ Desinstalado ${pc.bold(pluginKey)}${purge ? " (purgado)" : ""}`));
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  // -------------------------------------------------------------------------
  // plugin enable <plugin-key-or-id>
  // -------------------------------------------------------------------------
  addCommonClientOptions(
    plugin
      .command("enable <pluginKey>")
      .description("Habilitar un plugin deshabilitado o con error")
      .action(async (pluginKey: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.post<PluginRecord>(
            `/api/plugins/${encodeURIComponent(pluginKey)}/enable`,
          );

          if (ctx.json) {
            printOutput(result, { json: true });
            return;
          }

          console.log(pc.green(`✓ Habilitado ${pc.bold(pluginKey)} — estado: ${result?.status ?? "unknown"}`));
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  // -------------------------------------------------------------------------
  // plugin disable <plugin-key-or-id>
  // -------------------------------------------------------------------------
  addCommonClientOptions(
    plugin
      .command("disable <pluginKey>")
      .description("Deshabilitar un plugin en ejecución sin desinstalarlo")
      .action(async (pluginKey: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.post<PluginRecord>(
            `/api/plugins/${encodeURIComponent(pluginKey)}/disable`,
          );

          if (ctx.json) {
            printOutput(result, { json: true });
            return;
          }

          console.log(pc.dim(`Deshabilitado ${pc.bold(pluginKey)} — estado: ${result?.status ?? "unknown"}`));
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  // -------------------------------------------------------------------------
  // plugin inspect <plugin-key-or-id>
  // -------------------------------------------------------------------------
  addCommonClientOptions(
    plugin
      .command("inspect <pluginKey>")
      .description("Mostrar detalles completos de un plugin instalado")
      .action(async (pluginKey: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get<PluginRecord>(
            `/api/plugins/${encodeURIComponent(pluginKey)}`,
          );

          if (ctx.json) {
            printOutput(result, { json: true });
            return;
          }

          if (!result) {
            console.log(pc.red(`Plugin no encontrado: ${pluginKey}`));
            process.exit(1);
          }

          console.log(formatPlugin(result));
          if (result.lastError) {
            console.log(`\n${pc.red("Último error:")}\n${result.lastError}`);
          }
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  // -------------------------------------------------------------------------
  // plugin examples
  // -------------------------------------------------------------------------
  addCommonClientOptions(
    plugin
      .command("examples")
      .description("Listar plugins de ejemplo incluidos disponibles para instalación local")
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const examples = await ctx.api.get<
            Array<{
              packageName: string;
              pluginKey: string;
              displayName: string;
              description: string;
              localPath: string;
              tag: string;
            }>
          >("/api/plugins/examples");

          if (ctx.json) {
            printOutput(examples, { json: true });
            return;
          }

          const rows = examples ?? [];
          if (rows.length === 0) {
            console.log(pc.dim("No hay ejemplos incluidos disponibles."));
            return;
          }

          for (const ex of rows) {
            console.log(
              `${pc.bold(ex.displayName)}  ${pc.dim(ex.pluginKey)}\n` +
                `  ${ex.description}\n` +
                `  ${pc.cyan(`paperclipai plugin install ${ex.localPath}`)}`,
            );
          }
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}
