import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "../types.js";
import { asString, parseObject } from "../utils.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function normalizeMethod(input: string): string {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : "POST";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const urlValue = asString(config.url, "");
  const method = normalizeMethod(asString(config.method, "POST"));

  if (!urlValue) {
    checks.push({
      code: "http_url_missing",
      level: "error",
      message: "El adaptador HTTP requiere una URL.",
      hint: "Configura adapterConfig.url con un endpoint http(s) absoluto.",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(urlValue);
  } catch {
    checks.push({
      code: "http_url_invalid",
      level: "error",
      message: `URL inválida: ${urlValue}`,
    });
  }

  if (url && url.protocol !== "http:" && url.protocol !== "https:") {
    checks.push({
      code: "http_url_protocol_invalid",
      level: "error",
      message: `Protocolo de URL no soportado: ${url.protocol}`,
      hint: "Usa un endpoint http:// o https://.",
    });
  }

  if (url) {
    checks.push({
      code: "http_url_valid",
      level: "info",
      message: `Endpoint configurado: ${url.toString()}`,
    });
  }

  checks.push({
    code: "http_method_configured",
    level: "info",
    message: `Método configurado: ${method}`,
  });

  if (url && (url.protocol === "http:" || url.protocol === "https:")) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });
      if (!response.ok && response.status !== 405 && response.status !== 501) {
        checks.push({
          code: "http_endpoint_probe_unexpected_status",
          level: "warn",
          message: `La prueba del endpoint devolvió HTTP ${response.status}.`,
          hint: "Verifica que el endpoint sea accesible desde el host del servidor Paperclip.",
        });
      } else {
        checks.push({
          code: "http_endpoint_probe_ok",
          level: "info",
          message: "El endpoint respondió a una prueba HEAD.",
        });
      }
    } catch (err) {
      checks.push({
        code: "http_endpoint_probe_failed",
        level: "warn",
        message: err instanceof Error ? err.message : "Falló la prueba del endpoint",
        hint: "Esto puede ser normal en redes restringidas; verifica la conectividad al invocar las ejecuciones.",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
