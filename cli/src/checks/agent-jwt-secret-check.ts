import {
  ensureAgentJwtSecret,
  readAgentJwtSecretFromEnv,
  readAgentJwtSecretFromEnvFile,
  resolveAgentJwtEnvFile,
} from "../config/env.js";
import type { CheckResult } from "./index.js";

export function agentJwtSecretCheck(configPath?: string): CheckResult {
  if (readAgentJwtSecretFromEnv(configPath)) {
    return {
      name: "Secreto JWT del agente",
      status: "pass",
      message: "PAPERCLIP_AGENT_JWT_SECRET está configurado en el entorno",
    };
  }

  const envPath = resolveAgentJwtEnvFile(configPath);
  const fileSecret = readAgentJwtSecretFromEnvFile(envPath);

  if (fileSecret) {
    return {
      name: "Secreto JWT del agente",
      status: "warn",
      message: `PAPERCLIP_AGENT_JWT_SECRET está presente en ${envPath} pero no está cargado en el entorno`,
      repairHint: `Establece el valor de ${envPath} en tu shell antes de iniciar el servidor de Paperclip`,
    };
  }

  return {
    name: "Secreto JWT del agente",
    status: "fail",
    message: `PAPERCLIP_AGENT_JWT_SECRET no está en el entorno ni en ${envPath}`,
    canRepair: true,
    repair: () => {
      ensureAgentJwtSecret(configPath);
    },
    repairHint: `Ejecuta con --repair para crear ${envPath} con PAPERCLIP_AGENT_JWT_SECRET`,
  };
}
