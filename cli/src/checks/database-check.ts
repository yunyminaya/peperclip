import fs from "node:fs";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

export async function databaseCheck(config: PaperclipConfig, configPath?: string): Promise<CheckResult> {
  if (config.database.mode === "postgres") {
    if (!config.database.connectionString) {
      return {
        name: "Base de datos",
        status: "fail",
        message: "Modo PostgreSQL seleccionado pero no hay cadena de conexión configurada",
        canRepair: false,
        repairHint: "Ejecuta `paperclipai configure --section database`",
      };
    }

    try {
      const { createDb } = await import("@paperclipai/db");
      const db = createDb(config.database.connectionString);
      await db.execute("SELECT 1");
      return {
        name: "Base de datos",
        status: "pass",
        message: "Conexión a PostgreSQL exitosa",
      };
    } catch (err) {
      return {
        name: "Base de datos",
        status: "fail",
        message: `No se pudo conectar a PostgreSQL: ${err instanceof Error ? err.message : String(err)}`,
        canRepair: false,
        repairHint: "Revisa tu cadena de conexión y asegúrate de que PostgreSQL esté en ejecución",
      };
    }
  }

  if (config.database.mode === "embedded-postgres") {
    const dataDir = resolveRuntimeLikePath(config.database.embeddedPostgresDataDir, configPath);
    const reportedPath = dataDir;
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(reportedPath, { recursive: true });
    }

    return {
      name: "Base de datos",
      status: "pass",
      message: `PostgreSQL embebido configurado en ${dataDir} (puerto ${config.database.embeddedPostgresPort})`,
    };
  }

  return {
    name: "Base de datos",
    status: "fail",
    message: `Modo de base de datos desconocido: ${String(config.database.mode)}`,
    canRepair: false,
    repairHint: "Ejecuta `paperclipai configure --section database`",
  };
}
