import * as p from "@clack/prompts";
import pc from "picocolors";
import { readConfig, writeConfig, configExists, resolveConfigPath } from "../config/store.js";
import type { PaperclipConfig } from "../config/schema.js";
import { ensureLocalSecretsKeyFile } from "../config/secrets-key.js";
import { promptDatabase } from "../prompts/database.js";
import { promptLlm } from "../prompts/llm.js";
import { promptLogging } from "../prompts/logging.js";
import { defaultSecretsConfig, promptSecrets } from "../prompts/secrets.js";
import { defaultStorageConfig, promptStorage } from "../prompts/storage.js";
import { promptServer } from "../prompts/server.js";
import {
  resolveDefaultBackupDir,
  resolveDefaultEmbeddedPostgresDir,
  resolveDefaultLogsDir,
  resolvePaperclipInstanceId,
} from "../config/home.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

type Section = "llm" | "database" | "logging" | "server" | "storage" | "secrets";

const SECTION_LABELS: Record<Section, string> = {
  llm: "Proveedor de LLM",
  database: "Base de datos",
  logging: "Logs",
  server: "Servidor",
  storage: "Almacenamiento",
  secrets: "Secretos",
};

function defaultConfig(): PaperclipConfig {
  const instanceId = resolvePaperclipInstanceId();
  return {
    $meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: "configure",
    },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(instanceId),
      embeddedPostgresPort: 54329,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: resolveDefaultBackupDir(instanceId),
      },
    },
    logging: {
      mode: "file",
      logDir: resolveDefaultLogsDir(instanceId),
    },
    server: {
      deploymentMode: "local_trusted",
      exposure: "private",
      host: "127.0.0.1",
      port: 3100,
      allowedHostnames: [],
      serveUi: true,
    },
    auth: {
      baseUrlMode: "auto",
      disableSignUp: false,
    },
    storage: defaultStorageConfig(),
    secrets: defaultSecretsConfig(),
  };
}

export async function configure(opts: {
  config?: string;
  section?: string;
}): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclip configure ")));
  const configPath = resolveConfigPath(opts.config);

  if (!configExists(opts.config)) {
    p.log.error("No se encontró el archivo de config. Ejecuta primero `paperclipai onboard`.");
    p.outro("");
    return;
  }

  let config: PaperclipConfig;
  try {
    config = readConfig(opts.config) ?? defaultConfig();
  } catch (err) {
    p.log.message(
      pc.yellow(
        `La config existente es inválida. Cargando valores por defecto para que puedas repararla ahora.\n${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    config = defaultConfig();
  }

  let section: Section | undefined = opts.section as Section | undefined;

  if (section && !SECTION_LABELS[section]) {
    p.log.error(`Sección desconocida: ${section}. Elige entre: ${Object.keys(SECTION_LABELS).join(", ")}`);
    p.outro("");
    return;
  }

  // Bucle de selección de sección
  let continueLoop = true;
  while (continueLoop) {
    if (!section) {
      const choice = await p.select({
        message: "¿Qué sección quieres configurar?",
        options: Object.entries(SECTION_LABELS).map(([value, label]) => ({
          value: value as Section,
          label,
        })),
      });

      if (p.isCancel(choice)) {
        p.cancel("Configuración cancelada.");
        return;
      }

      section = choice;
    }

    p.log.step(pc.bold(SECTION_LABELS[section]));

    switch (section) {
      case "database":
        config.database = await promptDatabase(config.database);
        break;
      case "llm": {
        const llm = await promptLlm();
        if (llm) {
          config.llm = llm;
        } else {
          delete config.llm;
        }
        break;
      }
      case "logging":
        config.logging = await promptLogging();
        break;
      case "server":
        {
          const { server, auth } = await promptServer({
            currentServer: config.server,
            currentAuth: config.auth,
          });
          config.server = server;
          config.auth = auth;
        }
        break;
      case "storage":
        config.storage = await promptStorage(config.storage);
        break;
      case "secrets":
        config.secrets = await promptSecrets(config.secrets);
        {
          const keyResult = ensureLocalSecretsKeyFile(config, configPath);
          if (keyResult.status === "created") {
            p.log.success(`Archivo de clave local de secretos creado en ${pc.dim(keyResult.path)}`);
          } else if (keyResult.status === "existing") {
            p.log.message(pc.dim(`Usando el archivo de clave local de secretos existente en ${keyResult.path}`));
          } else if (keyResult.status === "skipped_provider") {
            p.log.message(pc.dim("Omitiendo la gestión del archivo de clave local para proveedor no local"));
          } else {
            p.log.message(pc.dim("Omitiendo la gestión del archivo de clave local porque PAPERCLIP_SECRETS_MASTER_KEY está definida"));
          }
        }
        break;
    }

    config.$meta.updatedAt = new Date().toISOString();
    config.$meta.source = "configure";

    writeConfig(config, opts.config);
    p.log.success(`Configuración de ${SECTION_LABELS[section]} actualizada.`);

    // Si la sección se pasó por flag del CLI, no iterar
    if (opts.section) {
      continueLoop = false;
    } else {
      const another = await p.confirm({
        message: "¿Configurar otra sección?",
        initialValue: false,
      });

      if (p.isCancel(another) || !another) {
        continueLoop = false;
      } else {
        section = undefined; // Reinicia para mostrar el selector de nuevo
      }
    }
  }

  p.outro("Configuración guardada.");
}
