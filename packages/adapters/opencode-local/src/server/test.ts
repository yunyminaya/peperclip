import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asBoolean,
  asString,
  asStringArray,
  parseObject,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { discoverOpenCodeModels, ensureOpenCodeModelConfiguredAndAvailable } from "./models.js";
import { parseOpenCodeJsonl } from "./parse.js";
import { prepareOpenCodeRuntimeConfig } from "./runtime-config.js";

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

const OPENCODE_AUTH_REQUIRED_RE =
  /(?:auth(?:entication)?\s+required|api\s*key|invalid\s*api\s*key|not\s+logged\s+in|opencode\s+auth\s+login|free\s+usage\s+exceeded)/i;

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "opencode");
  const cwd = asString(config.cwd, process.cwd());

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: false });
    checks.push({
      code: "opencode_cwd_valid",
      level: "info",
      message: `El directorio de trabajo es válido: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "opencode_cwd_invalid",
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

  const openaiKeyOverride = "OPENAI_API_KEY" in envConfig ? asString(envConfig.OPENAI_API_KEY, "") : null;
  if (openaiKeyOverride !== null && openaiKeyOverride.trim() === "") {
    checks.push({
      code: "opencode_openai_api_key_missing",
      level: "warn",
      message: "OPENAI_API_KEY override is empty.",
      hint: "The OPENAI_API_KEY override is empty. Set a valid key or remove the override.",
    });
  }

  // Evita que OpenCode escriba un opencode.json en el directorio de trabajo.
  env.OPENCODE_DISABLE_PROJECT_CONFIG = "true";
  const preparedRuntimeConfig = await prepareOpenCodeRuntimeConfig({ env, config });
  if (asBoolean(config.dangerouslySkipPermissions, true)) {
    checks.push({
      code: "opencode_headless_permissions_enabled",
      level: "info",
      message: "Los permisos headless de directorios externos de OpenCode se aprueban automáticamente para ejecuciones desatendidas.",
    });
  }
  try {
    const runtimeEnv = normalizeEnv(ensurePathInEnv({ ...process.env, ...preparedRuntimeConfig.env }));

    const cwdInvalid = checks.some((check) => check.code === "opencode_cwd_invalid");
    if (cwdInvalid) {
      checks.push({
        code: "opencode_command_skipped",
        level: "warn",
        message: "Se omitió la verificación del comando porque falló la validación del directorio de trabajo.",
        detail: command,
      });
    } else {
      try {
        await ensureCommandResolvable(command, cwd, runtimeEnv);
        checks.push({
          code: "opencode_command_resolvable",
          level: "info",
          message: `El comando es ejecutable: ${command}`,
        });
      } catch (err) {
        checks.push({
          code: "opencode_command_unresolvable",
          level: "error",
          message: err instanceof Error ? err.message : "El comando no es ejecutable",
          detail: command,
        });
      }
    }

    const canRunProbe =
      checks.every((check) => check.code !== "opencode_cwd_invalid" && check.code !== "opencode_command_unresolvable");

    let modelValidationPassed = false;
    const configuredModel = asString(config.model, "").trim();

    if (canRunProbe && configuredModel) {
      try {
        const discovered = await discoverOpenCodeModels({ command, cwd, env: runtimeEnv });
        if (discovered.length > 0) {
          checks.push({
            code: "opencode_models_discovered",
            level: "info",
            message: `Se descubrieron ${discovered.length} modelo(s) de los proveedores de OpenCode.`,
          });
        } else {
          checks.push({
            code: "opencode_models_empty",
            level: "error",
            message: "OpenCode no devolvió modelos.",
            hint: "Ejecuta `opencode models` y verifica la autenticación del proveedor.",
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (/ProviderModelNotFoundError/i.test(errMsg)) {
          checks.push({
            code: "opencode_hello_probe_model_unavailable",
            level: "warn",
            message: "El proveedor no encontró el modelo configurado.",
            detail: errMsg,
            hint: "Ejecuta `opencode models` y elige un ID de proveedor/modelo disponible.",
          });
        } else {
          checks.push({
            code: "opencode_models_discovery_failed",
            level: "error",
            message: errMsg || "Falló el descubrimiento de modelos de OpenCode.",
            hint: "Ejecuta `opencode models` manualmente para verificar la autenticación y la configuración del proveedor.",
          });
        }
      }
    } else if (canRunProbe && !configuredModel) {
      try {
        const discovered = await discoverOpenCodeModels({ command, cwd, env: runtimeEnv });
        if (discovered.length > 0) {
          checks.push({
            code: "opencode_models_discovered",
            level: "info",
            message: `Se descubrieron ${discovered.length} modelo(s) de los proveedores de OpenCode.`,
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (/ProviderModelNotFoundError/i.test(errMsg)) {
          checks.push({
            code: "opencode_hello_probe_model_unavailable",
            level: "warn",
            message: "El proveedor no encontró el modelo configurado.",
            detail: errMsg,
            hint: "Ejecuta `opencode models` y elige un ID de proveedor/modelo disponible.",
          });
        } else {
          checks.push({
            code: "opencode_models_discovery_failed",
            level: "warn",
            message: errMsg || "Falló el descubrimiento de modelos de OpenCode (mejor esfuerzo, sin modelo configurado).",
            hint: "Ejecuta `opencode models` manualmente para verificar la autenticación y la configuración del proveedor.",
          });
        }
      }
    }

    const modelUnavailable = checks.some((check) => check.code === "opencode_hello_probe_model_unavailable");
    if (!configuredModel && !modelUnavailable) {
      // Sin modelo configurado: omitir el requisito de modelo si no existen verificaciones relacionadas con el modelo
    } else if (configuredModel && canRunProbe) {
      try {
        await ensureOpenCodeModelConfiguredAndAvailable({
          model: configuredModel,
          command,
          cwd,
          env: runtimeEnv,
        });
        checks.push({
          code: "opencode_model_configured",
          level: "info",
          message: `Modelo configurado: ${configuredModel}`,
        });
        modelValidationPassed = true;
      } catch (err) {
        checks.push({
          code: "opencode_model_invalid",
          level: "error",
          message: err instanceof Error ? err.message : "El modelo configurado no está disponible.",
          hint: "Ejecuta `opencode models` y elige un ID de proveedor/modelo disponible actualmente.",
        });
      }
    }

    if (canRunProbe && modelValidationPassed) {
      const extraArgs = (() => {
        const fromExtraArgs = asStringArray(config.extraArgs);
        if (fromExtraArgs.length > 0) return fromExtraArgs;
        return asStringArray(config.args);
      })();
      const variant = asString(config.variant, "").trim();
      const probeModel = configuredModel;

      const args = ["run", "--format", "json"];
      args.push("--model", probeModel);
      if (variant) args.push("--variant", variant);
      if (extraArgs.length > 0) args.push(...extraArgs);

      try {
        const probe = await runChildProcess(
          `opencode-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          command,
          args,
          {
            cwd,
            env: runtimeEnv,
            timeoutSec: 60,
            graceSec: 5,
            stdin: "Respond with hello.",
            onLog: async () => {},
          },
        );

        const parsed = parseOpenCodeJsonl(probe.stdout);
        const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errorMessage);
        const authEvidence = `${parsed.errorMessage ?? ""}\n${probe.stdout}\n${probe.stderr}`.trim();

        if (probe.timedOut) {
          checks.push({
            code: "opencode_hello_probe_timed_out",
            level: "warn",
            message: "La sonda hello de OpenCode agotó el tiempo de espera.",
            hint: "Reintenta la sonda. Si persiste, ejecuta OpenCode manualmente en este directorio de trabajo.",
          });
        } else if ((probe.exitCode ?? 1) === 0 && !parsed.errorMessage) {
          const summary = parsed.summary.trim();
          const hasHello = /\bhello\b/i.test(summary);
          checks.push({
            code: hasHello ? "opencode_hello_probe_passed" : "opencode_hello_probe_unexpected_output",
            level: hasHello ? "info" : "warn",
            message: hasHello
              ? "La sonda hello de OpenCode se completó correctamente."
              : "La sonda de OpenCode se ejecutó, pero no devolvió `hello` como se esperaba.",
            ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
            ...(hasHello
              ? {}
              : {
                  hint: "Ejecuta `opencode run --format json` manualmente con el prompt `Respond with hello` para inspeccionar la salida.",
                }),
          });
        } else if (/ProviderModelNotFoundError/i.test(authEvidence)) {
          checks.push({
            code: "opencode_hello_probe_model_unavailable",
            level: "warn",
            message: "El proveedor no encontró el modelo configurado.",
            ...(detail ? { detail } : {}),
            hint: "Ejecuta `opencode models` y elige un ID de proveedor/modelo disponible.",
          });
        } else if (OPENCODE_AUTH_REQUIRED_RE.test(authEvidence)) {
          checks.push({
            code: "opencode_hello_probe_auth_required",
            level: "warn",
            message: "OpenCode está instalado, pero la autenticación del proveedor no está lista.",
            ...(detail ? { detail } : {}),
            hint: "Ejecuta `opencode auth login` o configura las credenciales del proveedor, y reintenta la sonda.",
          });
        } else {
          checks.push({
            code: "opencode_hello_probe_failed",
            level: "error",
            message: "La sonda hello de OpenCode falló.",
            ...(detail ? { detail } : {}),
            hint: "Ejecuta `opencode run --format json` manualmente en este directorio de trabajo para depurar.",
          });
        }
      } catch (err) {
        checks.push({
          code: "opencode_hello_probe_failed",
          level: "error",
          message: "La sonda hello de OpenCode falló.",
          detail: err instanceof Error ? err.message : String(err),
          hint: "Ejecuta `opencode run --format json` manualmente en este directorio de trabajo para depurar.",
        });
      }
    }
  } finally {
    await preparedRuntimeConfig.cleanup();
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
