import * as p from "@clack/prompts";
import type { LoggingConfig } from "../config/schema.js";
import { resolveDefaultLogsDir, resolvePaperclipInstanceId } from "../config/home.js";

export async function promptLogging(): Promise<LoggingConfig> {
  const defaultLogDir = resolveDefaultLogsDir(resolvePaperclipInstanceId());
  const mode = await p.select({
    message: "Modo de logs",
    options: [
      { value: "file" as const, label: "Registro en archivo", hint: "recomendado" },
      { value: "cloud" as const, label: "Registro en la nube", hint: "próximamente" },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  if (mode === "file") {
    const logDir = await p.text({
      message: "Directorio de logs",
      defaultValue: defaultLogDir,
      placeholder: defaultLogDir,
    });

    if (p.isCancel(logDir)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }

    return { mode: "file", logDir: logDir || defaultLogDir };
  }

  p.note("El registro en la nube estará disponible próximamente. Usando registro en archivo por ahora.");
  return { mode: "file", logDir: defaultLogDir };
}
