import path from "node:path";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  parseObject,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "../index.js";
import { detectGeminiAuthRequired, detectGeminiQuotaExhausted, parseGeminiJsonl } from "./parse.js";
import { firstNonEmptyLine } from "./utils.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function commandLooksLike(command: string, expected: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === expected || base === `${expected}.cmd` || base === `${expected}.exe`;
}

function summarizeProbeDetail(stdout: string, stderr: string, parsedError: string | null): string | null {
  const raw = parsedError?.trim() || firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  const max = 240;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "gemini");
  const cwd = asString(config.cwd, process.cwd());

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
    checks.push({
      code: "gemini_cwd_valid",
      level: "info",
      message: `El directorio de trabajo es válido: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "gemini_cwd_invalid",
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
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  try {
    await ensureCommandResolvable(command, cwd, runtimeEnv);
    checks.push({
      code: "gemini_command_resolvable",
      level: "info",
      message: `El comando es ejecutable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: "gemini_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "El comando no es ejecutable",
      detail: command,
    });
  }

  const configGeminiApiKey = env.GEMINI_API_KEY;
  const hostGeminiApiKey = process.env.GEMINI_API_KEY;
  const configGoogleApiKey = env.GOOGLE_API_KEY;
  const hostGoogleApiKey = process.env.GOOGLE_API_KEY;
  const hasGca = env.GOOGLE_GENAI_USE_GCA === "true" || process.env.GOOGLE_GENAI_USE_GCA === "true";
  if (
    isNonEmpty(configGeminiApiKey) ||
    isNonEmpty(hostGeminiApiKey) ||
    isNonEmpty(configGoogleApiKey) ||
    isNonEmpty(hostGoogleApiKey) ||
    hasGca
  ) {
    const source = hasGca
      ? "Inicio de sesión con cuenta de Google (GCA)"
      : isNonEmpty(configGeminiApiKey) || isNonEmpty(configGoogleApiKey)
        ? "env de la configuración del adaptador"
        : "entorno del servidor";
    checks.push({
      code: "gemini_api_key_present",
      level: "info",
      message: "Las credenciales de la API de Gemini están configuradas para la autenticación de la CLI.",
      detail: `Detectadas en ${source}.`,
    });
  } else {
    checks.push({
      code: "gemini_api_key_missing",
      level: "info",
      message: "No se detectó una clave de API explícita. La CLI de Gemini aún puede autenticarse con `gemini auth login` (OAuth).",
      hint: "Si la sonda hello falla con un error de autenticación, configura GEMINI_API_KEY o GOOGLE_API_KEY en el env del adaptador, o ejecuta `gemini auth login`.",
    });
  }

  const canRunProbe =
    checks.every((check) => check.code !== "gemini_cwd_invalid" && check.code !== "gemini_command_unresolvable");
  if (canRunProbe) {
    if (!commandLooksLike(command, "gemini")) {
      checks.push({
        code: "gemini_hello_probe_skipped_custom_command",
        level: "info",
        message: "Se omitió la sonda hello porque el comando no es `gemini`.",
        detail: command,
        hint: "Usa el comando CLI `gemini` para ejecutar la instalación automática y la sonda de autenticación.",
      });
    } else {
      const model = asString(config.model, DEFAULT_GEMINI_LOCAL_MODEL).trim();
      const approvalMode = asString(config.approvalMode, asBoolean(config.yolo, false) ? "yolo" : "default");
      const sandbox = asBoolean(config.sandbox, false);
      const helloProbeTimeoutSec = Math.max(1, asNumber(config.helloProbeTimeoutSec, 10));
      const extraArgs = (() => {
        const fromExtraArgs = asStringArray(config.extraArgs);
        if (fromExtraArgs.length > 0) return fromExtraArgs;
        return asStringArray(config.args);
      })();

      const args = ["--output-format", "stream-json", "--prompt", "Respond with hello."];
      if (model && model !== DEFAULT_GEMINI_LOCAL_MODEL) args.push("--model", model);
      if (approvalMode !== "default") args.push("--approval-mode", approvalMode);
      if (sandbox) {
        args.push("--sandbox");
      } else {
        args.push("--sandbox=none");
      }
      if (extraArgs.length > 0) args.push(...extraArgs);

      const probe = await runChildProcess(
        `gemini-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command,
        args,
        {
          cwd,
          env,
          timeoutSec: helloProbeTimeoutSec,
          graceSec: 5,
          onLog: async () => { },
        },
      );
      const parsed = parseGeminiJsonl(probe.stdout);
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errorMessage);
      const authMeta = detectGeminiAuthRequired({
        parsed: parsed.resultEvent,
        stdout: probe.stdout,
        stderr: probe.stderr,
      });
      const quotaMeta = detectGeminiQuotaExhausted({
        parsed: parsed.resultEvent,
        stdout: probe.stdout,
        stderr: probe.stderr,
      });

      if (quotaMeta.exhausted) {
        checks.push({
          code: "gemini_hello_probe_quota_exhausted",
          level: "warn",
          message: probe.timedOut
            ? "La CLI de Gemini está reintentando tras agotar la cuota."
            : "La autenticación de la CLI de Gemini está configurada, pero la cuenta actual o la clave de API superó la cuota.",
          ...(detail ? { detail } : {}),
          hint: "La cuenta de Gemini configurada o la clave de API superó la cuota. Revisa el uso/facturación en ai.google.dev y reintenta la sonda.",
        });
      } else if (probe.timedOut) {
        checks.push({
          code: "gemini_hello_probe_timed_out",
          level: "warn",
          message: "La sonda hello de Gemini agotó el tiempo de espera.",
          hint: "Reintenta la sonda. Si persiste, verifica que Gemini pueda ejecutar `Respond with hello.` manualmente desde este directorio.",
        });
      } else if ((probe.exitCode ?? 1) === 0) {
        const summary = parsed.summary.trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello ? "gemini_hello_probe_passed" : "gemini_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "La sonda hello de Gemini se completó correctamente."
            : "La sonda de Gemini se ejecutó, pero no devolvió `hello` como se esperaba.",
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
          ...(hasHello
            ? {}
            : {
              hint: "Prueba `gemini --output-format json \"Respond with hello.\"` manualmente para inspeccionar la salida completa.",
            }),
        });
      } else if (authMeta.requiresAuth) {
        checks.push({
          code: "gemini_hello_probe_auth_required",
          level: "warn",
          message: "La CLI de Gemini está instalada, pero la autenticación no está lista.",
          ...(detail ? { detail } : {}),
          hint: "Ejecuta `gemini auth` o configura GEMINI_API_KEY / GOOGLE_API_KEY en el env/shell del adaptador, y reintenta la sonda.",
        });
      } else {
        checks.push({
          code: "gemini_hello_probe_failed",
          level: "error",
          message: "La sonda hello de Gemini falló.",
          ...(detail ? { detail } : {}),
          hint: "Ejecuta `gemini --output-format json \"Respond with hello.\"` manualmente en este directorio de trabajo para depurar.",
        });
      }
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
