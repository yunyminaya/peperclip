import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

export async function llmCheck(config: PaperclipConfig): Promise<CheckResult> {
  if (!config.llm) {
    return {
      name: "Proveedor LLM",
      status: "pass",
      message: "No hay proveedor LLM configurado (opcional)",
    };
  }

  if (!config.llm.apiKey) {
    return {
      name: "Proveedor LLM",
      status: "pass",
      message: `${config.llm.provider} configurado pero no hay clave API (opcional)`,
    };
  }

  try {
    if (config.llm.provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": config.llm.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (res.ok || res.status === 400) {
        return { name: "Proveedor LLM", status: "pass", message: "La clave API de Claude es válida" };
      }
      if (res.status === 401) {
        return {
          name: "Proveedor LLM",
          status: "fail",
          message: "La clave API de Claude no es válida (401)",
          canRepair: false,
          repairHint: "Ejecuta `paperclipai configure --section llm`",
        };
      }
      return {
        name: "Proveedor LLM",
        status: "warn",
        message: `La API de Claude devolvió el estado ${res.status}`,
      };
    } else {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${config.llm.apiKey}` },
      });
      if (res.ok) {
        return { name: "Proveedor LLM", status: "pass", message: "La clave API de OpenAI es válida" };
      }
      if (res.status === 401) {
        return {
          name: "Proveedor LLM",
          status: "fail",
          message: "La clave API de OpenAI no es válida (401)",
          canRepair: false,
          repairHint: "Ejecuta `paperclipai configure --section llm`",
        };
      }
      return {
        name: "Proveedor LLM",
        status: "warn",
        message: `La API de OpenAI devolvió el estado ${res.status}`,
      };
    }
  } catch {
    return {
      name: "Proveedor LLM",
      status: "warn",
      message: "No se pudo contactar la API para validar la clave",
    };
  }
}
