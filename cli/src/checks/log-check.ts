import fs from "node:fs";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

export function logCheck(config: PaperclipConfig, configPath?: string): CheckResult {
  const logDir = resolveRuntimeLikePath(config.logging.logDir, configPath);
  const reportedDir = logDir;

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(reportedDir, { recursive: true });
  }

  try {
    fs.accessSync(reportedDir, fs.constants.W_OK);
    return {
      name: "Directorio de logs",
      status: "pass",
      message: `Directorio de logs con permiso de escritura: ${reportedDir}`,
    };
  } catch {
    return {
      name: "Directorio de logs",
      status: "fail",
      message: `Directorio de logs sin permiso de escritura: ${logDir}`,
      canRepair: false,
      repairHint: "Revisa los permisos de archivo del directorio de logs",
    };
  }
}
