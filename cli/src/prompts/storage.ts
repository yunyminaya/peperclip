import * as p from "@clack/prompts";
import type { StorageConfig } from "../config/schema.js";
import { resolveDefaultStorageDir, resolvePaperclipInstanceId } from "../config/home.js";

function defaultStorageBaseDir(): string {
  return resolveDefaultStorageDir(resolvePaperclipInstanceId());
}

export function defaultStorageConfig(): StorageConfig {
  return {
    provider: "local_disk",
    localDisk: {
      baseDir: defaultStorageBaseDir(),
    },
    s3: {
      bucket: "paperclip",
      region: "us-east-1",
      endpoint: undefined,
      prefix: "",
      forcePathStyle: false,
    },
  };
}

export async function promptStorage(current?: StorageConfig): Promise<StorageConfig> {
  const base = current ?? defaultStorageConfig();

  const provider = await p.select({
    message: "Proveedor de almacenamiento",
    options: [
      {
        value: "local_disk" as const,
        label: "Disco local (recomendado)",
        hint: "ideal para despliegues locales de un solo usuario",
      },
      {
        value: "s3" as const,
        label: "Compatible con S3",
        hint: "para backends de almacenamiento en nube/objetos",
      },
    ],
    initialValue: base.provider,
  });

  if (p.isCancel(provider)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  if (provider === "local_disk") {
    const baseDir = await p.text({
      message: "Directorio base de almacenamiento local",
      defaultValue: base.localDisk.baseDir || defaultStorageBaseDir(),
      placeholder: defaultStorageBaseDir(),
      validate: (value) => {
        if (!value || value.trim().length === 0) return "El directorio base de almacenamiento es requerido";
      },
    });

    if (p.isCancel(baseDir)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }

    return {
      provider: "local_disk",
      localDisk: {
        baseDir: baseDir.trim(),
      },
      s3: base.s3,
    };
  }

  const bucket = await p.text({
    message: "Bucket S3",
    defaultValue: base.s3.bucket || "paperclip",
    placeholder: "paperclip",
    validate: (value) => {
      if (!value || value.trim().length === 0) return "El bucket es requerido";
    },
  });

  if (p.isCancel(bucket)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const region = await p.text({
    message: "Región S3",
    defaultValue: base.s3.region || "us-east-1",
    placeholder: "us-east-1",
    validate: (value) => {
      if (!value || value.trim().length === 0) return "La región es requerida";
    },
  });

  if (p.isCancel(region)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const endpoint = await p.text({
    message: "Endpoint S3 (opcional para backends compatibles)",
    defaultValue: base.s3.endpoint ?? "",
    placeholder: "https://s3.amazonaws.com",
  });

  if (p.isCancel(endpoint)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const prefix = await p.text({
    message: "Prefijo de clave de objeto (opcional)",
    defaultValue: base.s3.prefix ?? "",
    placeholder: "paperclip/",
  });

  if (p.isCancel(prefix)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const forcePathStyle = await p.confirm({
    message: "¿Usar URLs S3 estilo path?",
    initialValue: base.s3.forcePathStyle ?? false,
  });

  if (p.isCancel(forcePathStyle)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  return {
    provider: "s3",
    localDisk: base.localDisk,
    s3: {
      bucket: bucket.trim(),
      region: region.trim(),
      endpoint: endpoint.trim() || undefined,
      prefix: prefix.trim(),
      forcePathStyle,
    },
  };
}
