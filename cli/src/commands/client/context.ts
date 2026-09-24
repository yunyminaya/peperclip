import { Command } from "commander";
import pc from "picocolors";
import {
  readContext,
  resolveContextPath,
  resolveProfile,
  setCurrentProfile,
  upsertProfile,
} from "../../client/context.js";
import { printOutput } from "./common.js";

interface ContextOptions {
  dataDir?: string;
  context?: string;
  profile?: string;
  json?: boolean;
}

interface ContextSetOptions extends ContextOptions {
  apiBase?: string;
  companyId?: string;
  apiKeyEnvVarName?: string;
  use?: boolean;
}

export function registerContextCommands(program: Command): void {
  const context = program.command("context").description("Gestionar perfiles de contexto del cliente CLI");

  context
    .command("show")
    .description("Mostrar el contexto actual y el perfil activo")
    .option("-d, --data-dir <path>", "Raíz del directorio de datos de Paperclip (aísla el estado de ~/.paperclip)")
    .option("--context <path>", "Ruta al archivo de contexto del CLI")
    .option("--profile <name>", "Perfil a inspeccionar")
    .option("--json", "Salida en JSON crudo")
    .action((opts: ContextOptions) => {
      const contextPath = resolveContextPath(opts.context);
      const store = readContext(opts.context);
      const resolved = resolveProfile(store, opts.profile);
      const payload = {
        contextPath,
        currentProfile: store.currentProfile,
        profileName: resolved.name,
        profile: resolved.profile,
        profiles: store.profiles,
      };
      printOutput(payload, { json: opts.json });
    });

  context
    .command("list")
    .description("Listar perfiles de contexto disponibles")
    .option("-d, --data-dir <path>", "Raíz del directorio de datos de Paperclip (aísla el estado de ~/.paperclip)")
    .option("--context <path>", "Ruta al archivo de contexto del CLI")
    .option("--json", "Salida en JSON crudo")
    .action((opts: ContextOptions) => {
      const store = readContext(opts.context);
      const rows = Object.entries(store.profiles).map(([name, profile]) => ({
        name,
        current: name === store.currentProfile,
        apiBase: profile.apiBase ?? null,
        companyId: profile.companyId ?? null,
        apiKeyEnvVarName: profile.apiKeyEnvVarName ?? null,
      }));
      printOutput(rows, { json: opts.json });
    });

  context
    .command("use")
    .description("Definir el perfil de contexto activo")
    .argument("<profile>", "Nombre del perfil")
    .option("-d, --data-dir <path>", "Raíz del directorio de datos de Paperclip (aísla el estado de ~/.paperclip)")
    .option("--context <path>", "Ruta al archivo de contexto del CLI")
    .action((profile: string, opts: ContextOptions) => {
      setCurrentProfile(profile, opts.context);
      console.log(pc.green(`Perfil activo definido como '${profile}'.`));
    });

  context
    .command("set")
    .description("Definir valores en un perfil")
    .option("-d, --data-dir <path>", "Raíz del directorio de datos de Paperclip (aísla el estado de ~/.paperclip)")
    .option("--context <path>", "Ruta al archivo de contexto del CLI")
    .option("--profile <name>", "Nombre del perfil (por defecto: perfil actual)")
    .option("--api-base <url>", "URL base de API por defecto")
    .option("--company-id <id>", "ID de empresa por defecto")
    .option("--api-key-env-var-name <name>", "Variable de entorno con la API key (recomendado)")
    .option("--use", "Definir este perfil como activo")
    .option("--json", "Salida en JSON crudo")
    .action((opts: ContextSetOptions) => {
      const existing = readContext(opts.context);
      const targetProfile = opts.profile?.trim() || existing.currentProfile || "default";

      upsertProfile(
        targetProfile,
        {
          apiBase: opts.apiBase,
          companyId: opts.companyId,
          apiKeyEnvVarName: opts.apiKeyEnvVarName,
        },
        opts.context,
      );

      if (opts.use) {
        setCurrentProfile(targetProfile, opts.context);
      }

      const updated = readContext(opts.context);
      const resolved = resolveProfile(updated, targetProfile);
      const payload = {
        contextPath: resolveContextPath(opts.context),
        currentProfile: updated.currentProfile,
        profileName: resolved.name,
        profile: resolved.profile,
      };

      if (!opts.json) {
        console.log(pc.green(`Perfil '${targetProfile}' actualizado.`));
        if (opts.use) {
          console.log(pc.green(`Perfil '${targetProfile}' definido como activo.`));
        }
      }
      printOutput(payload, { json: opts.json });
    });
}
