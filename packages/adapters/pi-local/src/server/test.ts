import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  parseObject,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import {
  asStringArray,
} from "@paperclipai/adapter-utils/server-utils";
import { discoverPiModelsCached } from "./models.js";
import { parsePiJsonl } from "./parse.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function summarizeProbeDetail(stdout: string, stderr: string, parsedError: string | null): string | null {
  const raw = parsedError?.trim() || firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  const max = 240;
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function normalizeEnv(input: unknown): Record<string, string> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

const PI_AUTH_REQUIRED_RE =
  /(?:auth(?:entication)?\s+required|api\s*key|invalid\s*api\s*key|not\s+logged\s+in|free\s+usage\s+exceeded)/i;
const PI_STALE_PACKAGE_RE = /pi-driver|npm:\s*pi-driver/i;

function buildPiModelDiscoveryFailureCheck(message: string): AdapterEnvironmentCheck {
  if (PI_STALE_PACKAGE_RE.test(message)) {
    return {
      code: "pi_package_install_failed",
      level: "warn",
      message: "Pi falló al iniciar mientras instalaba el paquete configurado `npm:pi-driver`.",
      detail: message,
      hint: "Elimina `npm:pi-driver` de ~/.pi/agent/settings.json o configura el env HOME del adaptador con un perfil limpio de Pi, y reintenta `pi --list-models`.",
    };
  }

  return {
    code: "pi_models_discovery_failed",
    level: "warn",
    message,
    hint: "Ejecuta `pi --list-models` manualmente para verificar la autenticación y la configuración del proveedor.",
  };
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "pi");
  const cwd = asString(config.cwd, process.cwd());

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: false });
    checks.push({
      code: "pi_cwd_valid",
      level: "info",
      message: `El directorio de trabajo es válido: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "pi_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Directorio de trabajo no válido",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = normalizeEnv(ensurePathInEnv({ ...process.env, ...env }));

  const cwdInvalid = checks.some((check) => check.code === "pi_cwd_invalid");
  if (cwdInvalid) {
    checks.push({
      code: "pi_command_skipped",
      level: "warn",
      message: "Se omitió la verificación del comando porque falló la validación del directorio de trabajo.",
      detail: command,
    });
  } else {
    try {
      await ensureCommandResolvable(command, cwd, runtimeEnv);
      checks.push({
        code: "pi_command_resolvable",
        level: "info",
        message: `El comando es ejecutable: ${command}`,
      });
    } catch (err) {
      checks.push({
        code: "pi_command_unresolvable",
        level: "error",
        message: err instanceof Error ? err.message : "El comando no es ejecutable",
        detail: command,
      });
    }
  }

  const canRunProbe =
    checks.every((check) => check.code !== "pi_cwd_invalid" && check.code !== "pi_command_unresolvable");

  if (canRunProbe) {
    try {
      const discovered = await discoverPiModelsCached({ command, cwd, env: runtimeEnv });
      if (discovered.length > 0) {
        checks.push({
          code: "pi_models_discovered",
          level: "info",
          message: `Se descubrieron ${discovered.length} modelo(s) de Pi.`,
        });
      } else {
        checks.push({
          code: "pi_models_empty",
          level: "warn",
          message: "Pi no devolvió modelos.",
          hint: "Ejecuta `pi --list-models` y verifica la autenticación del proveedor.",
        });
      }
    } catch (err) {
      checks.push(
        buildPiModelDiscoveryFailureCheck(
          err instanceof Error ? err.message : "Falló el descubrimiento de modelos de Pi.",
        ),
      );
    }
  }

  const configuredModel = asString(config.model, "").trim();
  if (!configuredModel) {
    checks.push({
      code: "pi_model_required",
      level: "error",
      message: "Pi requiere un modelo configurado en formato proveedor/modelo.",
      hint: "Configura adapterConfig.model usando un ID de `pi --list-models`.",
    });
  } else if (canRunProbe) {
    // Verificar que el modelo esté en la lista
    try {
      const discovered = await discoverPiModelsCached({ command, cwd, env: runtimeEnv });
      const modelExists = discovered.some((m: { id: string }) => m.id === configuredModel);
      if (modelExists) {
        checks.push({
          code: "pi_model_configured",
          level: "info",
          message: `Modelo configurado: ${configuredModel}`,
        });
      } else {
        checks.push({
          code: "pi_model_not_found",
          level: "warn",
          message: `El modelo configurado "${configuredModel}" no se encontró entre los modelos disponibles.`,
          hint: "Ejecuta `pi --list-models` y elige un ID de proveedor/modelo disponible actualmente.",
        });
      }
    } catch {
      // Si no se puede verificar, solo registrarlo
      checks.push({
        code: "pi_model_configured",
        level: "info",
        message: `Modelo configurado: ${configuredModel}`,
      });
    }
  }

  if (canRunProbe && configuredModel) {
    // Analizar el modelo para la sonda
    const provider = configuredModel.includes("/") 
      ? configuredModel.slice(0, configuredModel.indexOf("/")) 
      : "";
    const modelId = configuredModel.includes("/")
      ? configuredModel.slice(configuredModel.indexOf("/") + 1)
      : configuredModel;
    const thinking = asString(config.thinking, "").trim();
    const extraArgs = (() => {
      const fromExtraArgs = asStringArray(config.extraArgs);
      if (fromExtraArgs.length > 0) return fromExtraArgs;
      return asStringArray(config.args);
    })();

    const args = ["-p", "Respond with hello.", "--mode", "json"];
    if (provider) args.push("--provider", provider);
    if (modelId) args.push("--model", modelId);
    if (thinking) args.push("--thinking", thinking);
    args.push("--tools", "read");
    if (extraArgs.length > 0) args.push(...extraArgs);

    try {
      const probe = await runChildProcess(
        `pi-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command,
        args,
        {
          cwd,
          env: runtimeEnv,
          timeoutSec: 60,
          graceSec: 5,
          onLog: async () => {},
        },
      );

      const parsed = parsePiJsonl(probe.stdout);
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errors[0] ?? null);
      const authEvidence = `${parsed.errors.join("\n")}\n${probe.stdout}\n${probe.stderr}`.trim();

      if (probe.timedOut) {
        checks.push({
          code: "pi_hello_probe_timed_out",
          level: "warn",
          message: "La sonda hello de Pi agotó el tiempo de espera.",
          hint: "Reintenta la sonda. Si persiste, ejecuta Pi manualmente en este directorio de trabajo.",
        });
      } else if ((probe.exitCode ?? 1) === 0 && parsed.errors.length === 0) {
        const summary = (parsed.finalMessage || parsed.messages.join(" ")).trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello ? "pi_hello_probe_passed" : "pi_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "La sonda hello de Pi se completó correctamente."
            : "La sonda de Pi se ejecutó, pero no devolvió `hello` como se esperaba.",
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
          ...(hasHello
            ? {}
            : {
                hint: "Ejecuta `pi --mode json` manualmente con el prompt `Respond with hello` para inspeccionar la salida.",
              }),
        });
      } else if (PI_AUTH_REQUIRED_RE.test(authEvidence)) {
        checks.push({
          code: "pi_hello_probe_auth_required",
          level: "warn",
          message: "Pi está instalado, pero la autenticación del proveedor no está lista.",
          ...(detail ? { detail } : {}),
          hint: "Configura la variable de entorno de la clave de API del proveedor (p. ej., ANTHROPIC_API_KEY, XAI_API_KEY) y reintenta.",
        });
      } else {
        checks.push({
          code: "pi_hello_probe_failed",
          level: "error",
          message: "La sonda hello de Pi falló.",
          ...(detail ? { detail } : {}),
          hint: "Ejecuta `pi --mode json` manualmente en este directorio de trabajo para depurar.",
        });
      }
    } catch (err) {
      checks.push({
        code: "pi_hello_probe_failed",
        level: "error",
        message: "La sonda hello de Pi falló.",
        detail: err instanceof Error ? err.message : String(err),
        hint: "Ejecuta `pi --mode json` manualmente en este directorio de trabajo para depurar.",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
