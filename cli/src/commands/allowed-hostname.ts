import * as p from "@clack/prompts";
import pc from "picocolors";
import { normalizeHostnameInput } from "../config/hostnames.js";
import { readConfig, resolveConfigPath, writeConfig } from "../config/store.js";

export async function addAllowedHostname(host: string, opts: { config?: string }): Promise<void> {
  const configPath = resolveConfigPath(opts.config);
  const config = readConfig(opts.config);

  if (!config) {
    p.log.error(`No se encontró config en ${configPath}. Ejecuta primero ${pc.cyan("paperclip onboard")}.`);
    return;
  }

  const normalized = normalizeHostnameInput(host);
  const current = new Set((config.server.allowedHostnames ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  const existed = current.has(normalized);
  current.add(normalized);

  config.server.allowedHostnames = Array.from(current).sort();
  config.$meta.updatedAt = new Date().toISOString();
  config.$meta.source = "configure";
  writeConfig(config, opts.config);

  if (existed) {
    p.log.info(`El hostname ${pc.cyan(normalized)} ya está permitido.`);
  } else {
    p.log.success(`Hostname permitido agregado: ${pc.cyan(normalized)}`);
    p.log.message(
      pc.dim("Reinicia el servidor de Paperclip para que este cambio surta efecto."),
    );
  }

  if (!(config.server.deploymentMode === "authenticated" && config.server.exposure === "private")) {
    p.log.message(
      pc.dim("Nota: los hostnames permitidos solo se aplican en modo authenticated/private."),
    );
  }
}

