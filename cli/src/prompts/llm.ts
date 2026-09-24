import * as p from "@clack/prompts";
import type { LlmConfig } from "../config/schema.js";

export async function promptLlm(): Promise<LlmConfig | undefined> {
  const configureLlm = await p.confirm({
    message: "¿Configurar un proveedor LLM ahora?",
    initialValue: false,
  });

  if (p.isCancel(configureLlm)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  if (!configureLlm) return undefined;

  const provider = await p.select({
    message: "Proveedor LLM",
    options: [
      { value: "claude" as const, label: "Claude (Anthropic)" },
      { value: "openai" as const, label: "OpenAI" },
    ],
  });

  if (p.isCancel(provider)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  const apiKey = await p.password({
    message: `Clave API de ${provider === "claude" ? "Anthropic" : "OpenAI"}`,
    validate: (val) => {
      if (!val) return "La clave API es requerida";
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Configuración cancelada.");
    process.exit(0);
  }

  return { provider, apiKey };
}
