import * as p from "@clack/prompts";
import type { SecretProvider } from "@paperclipai/shared";
import type { SecretsConfig } from "../config/schema.js";
import { resolveDefaultSecretsKeyFilePath, resolvePaperclipInstanceId } from "../config/home.js";

function defaultKeyFilePath(): string {
  return resolveDefaultSecretsKeyFilePath(resolvePaperclipInstanceId());
}

export function defaultSecretsConfig(): SecretsConfig {
  const keyFilePath = defaultKeyFilePath();
  return {
    provider: "local_encrypted",
    strictMode: false,
    localEncrypted: {
      keyFilePath,
    },
  };
}

export async function promptSecrets(current?: SecretsConfig): Promise<SecretsConfig> {
  const base = current ?? defaultSecretsConfig();

  const provider = await p.select({
    message: "Proveedor de secretos",
    options: [
      {
        value: "local_encrypted" as const,
        label: "Local cifrado (recomendado)",
        hint: "ideal para instalaciones de un solo desarrollador",
      },
      {
        value: "aws_secrets_manager" as const,
        label: "AWS Secrets Manager",
        hint: "requiere integración de adaptador externo",
      },
      {
        value: "gcp_secret_manager" as const,
        label: "GCP Secret Manager",
        hint: "requiere integración de adaptador externo",
      },
      {
        value: "vault" as const,
        label: "HashiCorp Vault",
        hint: "requiere integración de adaptador externo",
      },
    ],
    initialValue: base.provider,
  });

  if (p.isCancel(provider)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const strictMode = await p.confirm({
    message: "¿Requerir referencias de secretos para variables de entorno sensibles?",
    initialValue: base.strictMode,
  });

  if (p.isCancel(strictMode)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const fallbackDefault = defaultKeyFilePath();
  let keyFilePath = base.localEncrypted.keyFilePath || fallbackDefault;
  if (provider === "local_encrypted") {
    const keyPath = await p.text({
      message: "Ruta del archivo de clave cifrada local",
      defaultValue: keyFilePath,
      placeholder: fallbackDefault,
      validate: (value) => {
        if (!value || value.trim().length === 0) return "La ruta del archivo de clave es requerida";
      },
    });

    if (p.isCancel(keyPath)) {
      p.cancel("Configuración cancelada.");
      process.exit(0);
    }
    keyFilePath = keyPath.trim();
  }

  if (provider !== "local_encrypted") {
    p.note(
      `${provider} aún no está completamente integrado en esta versión. Mantén local_encrypted a menos que estés implementando activamente ese adaptador.`,
      "Atención",
    );
  }

  return {
    provider: provider as SecretProvider,
    strictMode,
    localEncrypted: {
      keyFilePath,
    },
  };
}
