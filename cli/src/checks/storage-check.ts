import fs from "node:fs";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

export function storageCheck(config: PaperclipConfig, configPath?: string): CheckResult {
  if (config.storage.provider === "local_disk") {
    const baseDir = resolveRuntimeLikePath(config.storage.localDisk.baseDir, configPath);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    try {
      fs.accessSync(baseDir, fs.constants.W_OK);
      return {
        name: "Almacenamiento",
        status: "pass",
        message: `El almacenamiento en disco local tiene permiso de escritura: ${baseDir}`,
      };
    } catch {
      return {
        name: "Almacenamiento",
        status: "fail",
        message: `El directorio de almacenamiento local no tiene permiso de escritura: ${baseDir}`,
        canRepair: false,
        repairHint: "Revisa los permisos de archivo de storage.localDisk.baseDir",
      };
    }
  }

  const bucket = config.storage.s3.bucket.trim();
  const region = config.storage.s3.region.trim();
  if (!bucket || !region) {
    return {
      name: "Almacenamiento",
      status: "fail",
      message: "El almacenamiento S3 requiere bucket y región no vacíos",
      canRepair: false,
      repairHint: "Ejecuta `paperclipai configure --section storage`",
    };
  }

  return {
    name: "Almacenamiento",
    status: "warn",
    message: `Almacenamiento S3 configurado (bucket=${bucket}, region=${region}). La comprobación de accesibilidad se omite en doctor.`,
    canRepair: false,
    repairHint: "Verifica las credenciales y el endpoint en el entorno de despliegue",
  };
}
