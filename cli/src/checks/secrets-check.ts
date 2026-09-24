import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

function decodeMasterKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // ignorado
  }

  if (Buffer.byteLength(trimmed, "utf8") === 32) {
    return Buffer.from(trimmed, "utf8");
  }
  return null;
}

function withStrictModeNote(
  base: Pick<CheckResult, "name" | "status" | "message" | "canRepair" | "repair" | "repairHint">,
  config: PaperclipConfig,
): CheckResult {
  const strictModeDisabledInDeployedSetup =
    config.database.mode === "postgres" && config.secrets.strictMode === false;
  if (!strictModeDisabledInDeployedSetup) return base;

  if (base.status === "fail") return base;
  return {
    ...base,
    status: "warn",
    message: `${base.message}; el modo estricto de secretos está desactivado para el despliegue postgres`,
    repairHint: base.repairHint
      ? `${base.repairHint}. Considera activar secrets.strictMode`
      : "Considera activar secrets.strictMode",
  };
}

export function secretsCheck(config: PaperclipConfig, configPath?: string): CheckResult {
  const provider = config.secrets.provider;
  if (provider !== "local_encrypted") {
    return {
      name: "Adaptador de secretos",
      status: "fail",
      message: `${provider} está configurado, pero esta versión solo admite local_encrypted`,
      canRepair: false,
      repairHint: "Ejecuta `paperclipai configure --section secrets` y establece el proveedor en local_encrypted",
    };
  }

  const envMasterKey = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  if (envMasterKey && envMasterKey.trim().length > 0) {
    if (!decodeMasterKey(envMasterKey)) {
      return {
        name: "Adaptador de secretos",
        status: "fail",
        message:
          "PAPERCLIP_SECRETS_MASTER_KEY no es válido (se esperaba base64 de 32 bytes, hexadecimal de 64 caracteres o cadena cruda de 32 caracteres)",
        canRepair: false,
        repairHint: "Establece PAPERCLIP_SECRETS_MASTER_KEY con una clave válida o elimínalo para usar un archivo de clave",
      };
    }

    return withStrictModeNote(
      {
        name: "Adaptador de secretos",
        status: "pass",
        message: "Proveedor local cifrado configurado vía PAPERCLIP_SECRETS_MASTER_KEY",
      },
      config,
    );
  }

  const keyFileOverride = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  const configuredPath =
    keyFileOverride && keyFileOverride.trim().length > 0
      ? keyFileOverride.trim()
      : config.secrets.localEncrypted.keyFilePath;
  const keyFilePath = resolveRuntimeLikePath(configuredPath, configPath);

  if (!fs.existsSync(keyFilePath)) {
    return withStrictModeNote(
      {
        name: "Adaptador de secretos",
        status: "warn",
        message: `El archivo de clave de secretos aún no existe: ${keyFilePath}`,
        canRepair: true,
        repair: () => {
          fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });
          fs.writeFileSync(keyFilePath, randomBytes(32).toString("base64"), {
            encoding: "utf8",
            mode: 0o600,
          });
          try {
            fs.chmodSync(keyFilePath, 0o600);
          } catch {
            // mejor esfuerzo
          }
        },
        repairHint: "Ejecuta con --repair para crear un archivo de clave de secretos local cifrado",
      },
      config,
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(keyFilePath, "utf8");
  } catch (err) {
    return {
      name: "Adaptador de secretos",
      status: "fail",
      message: `No se pudo leer el archivo de clave de secretos: ${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "Revisa los permisos de archivo o establece PAPERCLIP_SECRETS_MASTER_KEY",
    };
  }

  if (!decodeMasterKey(raw)) {
    return {
      name: "Adaptador de secretos",
      status: "fail",
      message: `Material de clave inválido en ${keyFilePath}`,
      canRepair: false,
      repairHint: "Reemplázalo con material de clave válido o elimínalo y ejecuta doctor --repair",
    };
  }

  return withStrictModeNote(
    {
      name: "Adaptador de secretos",
      status: "pass",
      message: `Proveedor local cifrado configurado con el archivo de clave ${keyFilePath}`,
    },
    config,
  );
}
