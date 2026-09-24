import * as p from "@clack/prompts";
import type { AuthConfig, ServerConfig } from "../config/schema.js";
import { parseHostnameCsv } from "../config/hostnames.js";

export async function promptServer(opts?: {
  currentServer?: Partial<ServerConfig>;
  currentAuth?: Partial<AuthConfig>;
}): Promise<{ server: ServerConfig; auth: AuthConfig }> {
  const currentServer = opts?.currentServer;
  const currentAuth = opts?.currentAuth;

  const deploymentModeSelection = await p.select({
    message: "Modo de despliegue",
    options: [
      {
        value: "local_trusted",
        label: "Local confiable",
        hint: "Lo más fácil para configuración local (sin inicio de sesión, solo localhost)",
      },
      {
        value: "authenticated",
        label: "Autenticado",
        hint: "Requiere inicio de sesión; úsalo para red privada u hospedaje público",
      },
    ],
    initialValue: currentServer?.deploymentMode ?? "local_trusted",
  });

  if (p.isCancel(deploymentModeSelection)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }
  const deploymentMode = deploymentModeSelection as ServerConfig["deploymentMode"];

  let exposure: ServerConfig["exposure"] = "private";
  if (deploymentMode === "authenticated") {
    const exposureSelection = await p.select({
      message: "Perfil de exposición",
      options: [
        {
          value: "private",
          label: "Red privada",
          hint: "Acceso privado (por ejemplo Tailscale), menor fricción de configuración",
        },
        {
          value: "public",
          label: "Internet público",
          hint: "Despliegue expuesto a internet con requisitos más estrictos",
        },
      ],
      initialValue: currentServer?.exposure ?? "private",
    });
    if (p.isCancel(exposureSelection)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }
    exposure = exposureSelection as ServerConfig["exposure"];
  }

  const hostDefault = deploymentMode === "local_trusted" ? "127.0.0.1" : "0.0.0.0";
  const hostStr = await p.text({
    message: "Host de enlace",
    defaultValue: currentServer?.host ?? hostDefault,
    placeholder: hostDefault,
    validate: (val) => {
      if (!val.trim()) return "El host es requerido";
    },
  });

  if (p.isCancel(hostStr)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const portStr = await p.text({
    message: "Puerto del servidor",
    defaultValue: String(currentServer?.port ?? 3100),
    placeholder: "3100",
    validate: (val) => {
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 65535 || !Number.isInteger(n)) {
        return "Debe ser un entero entre 1 y 65535";
      }
    },
  });

  if (p.isCancel(portStr)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  let allowedHostnames: string[] = [];
  if (deploymentMode === "authenticated" && exposure === "private") {
    const allowedHostnamesInput = await p.text({
      message: "Hostnames permitidos (separados por comas, opcional)",
      defaultValue: (currentServer?.allowedHostnames ?? []).join(", "),
      placeholder: "dotta-macbook-pro, your-host.tailnet.ts.net",
      validate: (val) => {
        try {
          parseHostnameCsv(val);
          return;
        } catch (err) {
          return err instanceof Error ? err.message : "Lista de hostnames inválida";
        }
      },
    });

    if (p.isCancel(allowedHostnamesInput)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }
    allowedHostnames = parseHostnameCsv(allowedHostnamesInput);
  }

  const port = Number(portStr) || 3100;
  let auth: AuthConfig = { baseUrlMode: "auto", disableSignUp: false };
  if (deploymentMode === "authenticated" && exposure === "public") {
    const urlInput = await p.text({
      message: "URL base pública",
      defaultValue: currentAuth?.publicBaseUrl ?? "",
      placeholder: "https://paperclip.example.com",
      validate: (val) => {
        const candidate = val.trim();
        if (!candidate) return "La URL base pública es requerida para exposición pública";
        try {
          const url = new URL(candidate);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "La URL debe empezar con http:// o https://";
          }
          return;
        } catch {
          return "Ingresa una URL válida";
        }
      },
    });
    if (p.isCancel(urlInput)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }
    auth = {
      baseUrlMode: "explicit",
      disableSignUp: false,
      publicBaseUrl: urlInput.trim().replace(/\/+$/, ""),
    };
  } else if (currentAuth?.baseUrlMode === "explicit" && currentAuth.publicBaseUrl) {
    auth = {
      baseUrlMode: "explicit",
      disableSignUp: false,
      publicBaseUrl: currentAuth.publicBaseUrl,
    };
  }

  return {
    server: {
      deploymentMode,
      exposure,
      host: hostStr.trim(),
      port,
      allowedHostnames,
      serveUi: currentServer?.serveUi ?? true,
    },
    auth,
  };
}
