import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

function isLoopbackHost(host: string) {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

export function deploymentAuthCheck(config: PaperclipConfig): CheckResult {
  const mode = config.server.deploymentMode;
  const exposure = config.server.exposure;
  const auth = config.auth;

  if (mode === "local_trusted") {
    if (!isLoopbackHost(config.server.host)) {
      return {
        name: "Modo de despliegue/autenticación",
        status: "fail",
        message: `local_trusted requiere enlace a host de loopback (se encontró ${config.server.host})`,
        canRepair: false,
        repairHint: "Ejecuta `paperclipai configure --section server` y establece el host en 127.0.0.1",
      };
    }
    return {
      name: "Modo de despliegue/autenticación",
      status: "pass",
      message: "El modo local_trusted está configurado para acceso solo por loopback",
    };
  }

  const secret =
    process.env.BETTER_AUTH_SECRET?.trim() ??
    process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim();
  if (!secret) {
    return {
      name: "Modo de despliegue/autenticación",
      status: "fail",
      message: "El modo authenticated requiere BETTER_AUTH_SECRET (o PAPERCLIP_AGENT_JWT_SECRET)",
      canRepair: false,
      repairHint: "Establece BETTER_AUTH_SECRET antes de iniciar Paperclip",
    };
  }

  if (auth.baseUrlMode === "explicit" && !auth.publicBaseUrl) {
    return {
      name: "Modo de despliegue/autenticación",
      status: "fail",
      message: "auth.baseUrlMode=explicit requiere auth.publicBaseUrl",
      canRepair: false,
      repairHint: "Ejecuta `paperclipai configure --section server` e indica una URL base",
    };
  }

  if (exposure === "public") {
    if (auth.baseUrlMode !== "explicit" || !auth.publicBaseUrl) {
      return {
        name: "Modo de despliegue/autenticación",
        status: "fail",
        message: "authenticated/public requiere auth.publicBaseUrl explícito",
        canRepair: false,
        repairHint: "Ejecuta `paperclipai configure --section server` y selecciona exposición pública",
      };
    }
    try {
      const url = new URL(auth.publicBaseUrl);
      if (url.protocol !== "https:") {
        return {
          name: "Modo de despliegue/autenticación",
          status: "warn",
          message: "La exposición pública debería usar un auth.publicBaseUrl con https://",
          canRepair: false,
          repairHint: "Usa HTTPS en producción para cookies de sesión seguras",
        };
      }
    } catch {
      return {
        name: "Modo de despliegue/autenticación",
        status: "fail",
        message: "auth.publicBaseUrl no es una URL válida",
        canRepair: false,
        repairHint: "Ejecuta `paperclipai configure --section server` e indica una URL válida",
      };
    }
  }

  return {
    name: "Modo de despliegue/autenticación",
    status: "pass",
    message: `Modo ${mode}/${exposure} con modo de URL de autenticación ${auth.baseUrlMode}`,
  };
}
