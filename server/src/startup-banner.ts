import { existsSync, readFileSync } from "node:fs";
import { resolvePaperclipConfigPath, resolvePaperclipEnvPath } from "./paths.js";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";

import { parse as parseEnvFileContents } from "dotenv";

type UiMode = "none" | "static" | "vite-dev";

type ExternalPostgresInfo = {
  mode: "external-postgres";
  connectionString: string;
};

type EmbeddedPostgresInfo = {
  mode: "embedded-postgres";
  dataDir: string;
  port: number;
};

type StartupBannerOptions = {
  host: string;
  deploymentMode: DeploymentMode;
  deploymentExposure: DeploymentExposure;
  authReady: boolean;
  requestedPort: number;
  listenPort: number;
  uiMode: UiMode;
  db: ExternalPostgresInfo | EmbeddedPostgresInfo;
  migrationSummary: string;
  heartbeatSchedulerEnabled: boolean;
  heartbeatSchedulerIntervalMs: number;
  databaseBackupEnabled: boolean;
  databaseBackupIntervalMinutes: number;
  databaseBackupRetentionDays: number;
  databaseBackupDir: string;
};

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

function color(text: string, c: keyof typeof ansi): string {
  return `${ansi[c]}${text}${ansi.reset}`;
}

function row(label: string, value: string): string {
  return `${color(label.padEnd(16), "dim")} ${value}`;
}

function redactConnectionString(raw: string): string {
  try {
    const u = new URL(raw);
    const user = u.username || "user";
    const auth = `${user}:***@`;
    return `${u.protocol}//${auth}${u.host}${u.pathname}`;
  } catch {
    return "<DATABASE_URL inválida>";
  }
}

function resolveAgentJwtSecretStatus(
  envFilePath: string,
): {
  status: "pass" | "warn";
  message: string;
} {
  const envValue = process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim();
  if (envValue) {
    return {
      status: "pass",
      message: "configurado",
    };
  }

  if (existsSync(envFilePath)) {
    const parsed = parseEnvFileContents(readFileSync(envFilePath, "utf-8"));
    const fileValue = typeof parsed.PAPERCLIP_AGENT_JWT_SECRET === "string" ? parsed.PAPERCLIP_AGENT_JWT_SECRET.trim() : "";
    if (fileValue) {
      return {
        status: "warn",
        message: `encontrada en ${envFilePath} pero no cargada`,
      };
    }
  }

  return {
    status: "warn",
    message: "falta (ejecuta `pnpm paperclipai onboard`)",
  };
}

export function printStartupBanner(opts: StartupBannerOptions): void {
  const baseHost = opts.host === "0.0.0.0" ? "localhost" : opts.host;
  const baseUrl = `http://${baseHost}:${opts.listenPort}`;
  const apiUrl = `${baseUrl}/api`;
  const uiUrl = opts.uiMode === "none" ? "deshabilitada" : baseUrl;
  const configPath = resolvePaperclipConfigPath();
  const envFilePath = resolvePaperclipEnvPath();
  const agentJwtSecret = resolveAgentJwtSecretStatus(envFilePath);

  const dbMode =
    opts.db.mode === "embedded-postgres"
      ? color("embedded-postgres", "green")
      : color("external-postgres", "yellow");
  const uiMode =
    opts.uiMode === "vite-dev"
      ? color("vite-dev-middleware", "cyan")
      : opts.uiMode === "static"
        ? color("static-ui", "magenta")
        : color("headless-api", "yellow");

  const portValue =
    opts.requestedPort === opts.listenPort
      ? `${opts.listenPort}`
      : `${opts.listenPort} ${color(`(solicitado ${opts.requestedPort})`, "dim")}`;

  const dbDetails =
    opts.db.mode === "embedded-postgres"
      ? `${opts.db.dataDir} ${color(`(pg:${opts.db.port})`, "dim")}`
      : redactConnectionString(opts.db.connectionString);

  const heartbeat = opts.heartbeatSchedulerEnabled
    ? `habilitado ${color(`(${opts.heartbeatSchedulerIntervalMs}ms)`, "dim")}`
    : color("deshabilitado", "yellow");
  const dbBackup = opts.databaseBackupEnabled
    ? `habilitado ${color(`(cada ${opts.databaseBackupIntervalMinutes}m, conservar ${opts.databaseBackupRetentionDays}d)`, "dim")}`
    : color("deshabilitado", "yellow");

  const art = [
    color("██████╗  █████╗ ██████╗ ███████╗██████╗  ██████╗██╗     ██╗██████╗ ", "cyan"),
    color("██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║     ██║██╔══██╗", "cyan"),
    color("██████╔╝███████║██████╔╝█████╗  ██████╔╝██║     ██║     ██║██████╔╝", "cyan"),
    color("██╔═══╝ ██╔══██║██╔═══╝ ██╔══╝  ██╔══██╗██║     ██║     ██║██╔═══╝ ", "cyan"),
    color("██║     ██║  ██║██║     ███████╗██║  ██║╚██████╗███████╗██║██║     ", "cyan"),
    color("╚═╝     ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝╚═╝     ", "cyan"),
  ];

  const lines = [
    "",
    ...art,
    color("  ───────────────────────────────────────────────────────", "blue"),
    row("Modo", `${dbMode}  |  ${uiMode}`),
    row("Despliegue", `${opts.deploymentMode} (${opts.deploymentExposure})`),
    row("Autenticación", opts.authReady ? color("listo", "green") : color("no listo", "yellow")),
    row("Servidor", portValue),
    row("API", `${apiUrl} ${color(`(salud: ${apiUrl}/health)`, "dim")}`),
    row("UI", uiUrl),
    row("Base de datos", dbDetails),
    row("Migraciones", opts.migrationSummary),
    row(
      "JWT de agente",
      agentJwtSecret.status === "pass"
        ? color(agentJwtSecret.message, "green")
        : color(agentJwtSecret.message, "yellow"),
    ),
    row("Latido", heartbeat),
    row("Respaldo de BD", dbBackup),
    row("Dir de respaldo", opts.databaseBackupDir),
    row("Configuración", configPath),
    agentJwtSecret.status === "warn"
      ? color("  ───────────────────────────────────────────────────────", "yellow")
      : null,
    color("  ───────────────────────────────────────────────────────", "blue"),
    "",
  ];

  console.log(lines.filter((line): line is string => line !== null).join("\n"));
}
