import { readConfig, configExists, resolveConfigPath } from "../config/store.js";
import type { CheckResult } from "./index.js";

export function configCheck(configPath?: string): CheckResult {
  const filePath = resolveConfigPath(configPath);

  if (!configExists(configPath)) {
    return {
      name: "Archivo de configuración",
      status: "fail",
      message: `Archivo de configuración no encontrado en ${filePath}`,
      canRepair: false,
      repairHint: "Ejecuta `paperclipai onboard` para crear uno",
    };
  }

  try {
    readConfig(configPath);
    return {
      name: "Archivo de configuración",
      status: "pass",
      message: `Configuración válida en ${filePath}`,
    };
  } catch (err) {
    return {
      name: "Archivo de configuración",
      status: "fail",
      message: `Configuración inválida: ${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "Ejecuta `paperclipai configure --section database` (o `paperclipai onboard` para recrearlo)",
    };
  }
}
