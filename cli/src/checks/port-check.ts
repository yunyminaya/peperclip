import type { PaperclipConfig } from "../config/schema.js";
import { checkPort } from "../utils/net.js";
import type { CheckResult } from "./index.js";

export async function portCheck(config: PaperclipConfig): Promise<CheckResult> {
  const port = config.server.port;
  const result = await checkPort(port);

  if (result.available) {
    return {
      name: "Puerto del servidor",
      status: "pass",
      message: `El puerto ${port} está disponible`,
    };
  }

  return {
    name: "Puerto del servidor",
    status: "warn",
    message: result.error ?? `El puerto ${port} no está disponible`,
    canRepair: false,
    repairHint: `Revisa qué está usando el puerto ${port} con: lsof -i :${port}`,
  };
}
