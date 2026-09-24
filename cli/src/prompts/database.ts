import * as p from "@clack/prompts";
import type { DatabaseConfig } from "../config/schema.js";
import {
  resolveDefaultBackupDir,
  resolveDefaultEmbeddedPostgresDir,
  resolvePaperclipInstanceId,
} from "../config/home.js";

export async function promptDatabase(current?: DatabaseConfig): Promise<DatabaseConfig> {
  const instanceId = resolvePaperclipInstanceId();
  const defaultEmbeddedDir = resolveDefaultEmbeddedPostgresDir(instanceId);
  const defaultBackupDir = resolveDefaultBackupDir(instanceId);
  const base: DatabaseConfig = current ?? {
    mode: "embedded-postgres",
    embeddedPostgresDataDir: defaultEmbeddedDir,
    embeddedPostgresPort: 54329,
    backup: {
      enabled: true,
      intervalMinutes: 60,
      retentionDays: 30,
      dir: defaultBackupDir,
    },
  };

  const mode = await p.select({
    message: "Modo de base de datos",
    options: [
      { value: "embedded-postgres" as const, label: "PostgreSQL embebido (gestionado localmente)", hint: "recomendado" },
      { value: "postgres" as const, label: "PostgreSQL (servidor externo)" },
    ],
    initialValue: base.mode,
  });

  if (p.isCancel(mode)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  let connectionString: string | undefined = base.connectionString;
  let embeddedPostgresDataDir = base.embeddedPostgresDataDir || defaultEmbeddedDir;
  let embeddedPostgresPort = base.embeddedPostgresPort || 54329;

  if (mode === "postgres") {
    const value = await p.text({
      message: "Cadena de conexión de PostgreSQL",
      defaultValue: base.connectionString ?? "",
      placeholder: "postgres://user:pass@localhost:5432/paperclip",
      validate: (val) => {
        if (!val) return "La cadena de conexión es requerida para el modo PostgreSQL";
        if (!val.startsWith("postgres")) return "Debe ser una URL postgres:// o postgresql://";
      },
    });

    if (p.isCancel(value)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }

    connectionString = value;
  } else {
    const dataDir = await p.text({
      message: "Directorio de datos de PostgreSQL embebido",
      defaultValue: base.embeddedPostgresDataDir || defaultEmbeddedDir,
      placeholder: defaultEmbeddedDir,
    });

    if (p.isCancel(dataDir)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }

    embeddedPostgresDataDir = dataDir || defaultEmbeddedDir;

    const portValue = await p.text({
      message: "Puerto de PostgreSQL embebido",
      defaultValue: String(base.embeddedPostgresPort || 54329),
      placeholder: "54329",
      validate: (val) => {
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1 || n > 65535) return "El puerto debe ser un entero entre 1 y 65535";
      },
    });

    if (p.isCancel(portValue)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }

    embeddedPostgresPort = Number(portValue || "54329");
    connectionString = undefined;
  }

  const backupEnabled = await p.confirm({
    message: "¿Activar respaldos automáticos de la base de datos?",
    initialValue: base.backup.enabled,
  });
  if (p.isCancel(backupEnabled)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const backupDirInput = await p.text({
    message: "Directorio de respaldos",
    defaultValue: base.backup.dir || defaultBackupDir,
    placeholder: defaultBackupDir,
    validate: (val) => (!val || val.trim().length === 0 ? "El directorio de respaldos es requerido" : undefined),
  });
  if (p.isCancel(backupDirInput)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const backupIntervalInput = await p.text({
    message: "Intervalo de respaldo (minutos)",
    defaultValue: String(base.backup.intervalMinutes || 60),
    placeholder: "60",
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) return "El intervalo debe ser un entero positivo";
      if (n > 10080) return "El intervalo debe ser 10080 minutos (7 días) o menos";
      return undefined;
    },
  });
  if (p.isCancel(backupIntervalInput)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const backupRetentionInput = await p.text({
    message: "Retención de respaldos (días)",
    defaultValue: String(base.backup.retentionDays || 30),
    placeholder: "30",
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) return "La retención debe ser un entero positivo";
      if (n > 3650) return "La retención debe ser 3650 días o menos";
      return undefined;
    },
  });
  if (p.isCancel(backupRetentionInput)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  return {
    mode,
    connectionString,
    embeddedPostgresDataDir,
    embeddedPostgresPort,
    backup: {
      enabled: backupEnabled,
      intervalMinutes: Number(backupIntervalInput || "60"),
      retentionDays: Number(backupRetentionInput || "30"),
      dir: backupDirInput || defaultBackupDir,
    },
  };
}
