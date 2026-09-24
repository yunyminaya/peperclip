import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  asStringArray,
  parseObject,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "../index.js";
import { parseCursorJsonl } from "./parse.js";
import { hasCursorTrustBypassArg } from "../shared/trust.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
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

export interface CursorAuthInfo {
  email: string | null;
  displayName: string | null;
  userId: number | null;
}

export function cursorConfigPath(cursorHome?: string): string {
  return path.join(cursorHome ?? path.join(os.homedir(), ".cursor"), "cli-config.json");
}

export async function readCursorAuthInfo(cursorHome?: string): Promise<CursorAuthInfo | null> {
  let raw: string;
  try {
    raw = await fs.readFile(cursorConfigPath(cursorHome), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const authInfo = obj.authInfo;
  if (typeof authInfo !== "object" || authInfo === null) return null;
  const info = authInfo as Record<string, unknown>;
  const email = typeof info.email === "string" && info.email.trim().length > 0 ? info.email.trim() : null;
  const displayName = typeof info.displayName === "string" && info.displayName.trim().length > 0 ? info.displayName.trim() : null;
  const userId = typeof info.userId === "number" ? info.userId : null;
  if (!email && !displayName && userId == null) return null;
  return { email, displayName, userId };
}

const CURSOR_AUTH_REQUIRED_RE =
  /(?:authentication\s+required|not\s+authenticated|not\s+logged\s+in|unauthorized|invalid(?:\s+or\s+missing)?\s+api(?:[_\s-]?key)?|cursor[_\s-]?api[_\s-]?key|run\s+'?agent\s+login'?\s+first|api(?:[_\s-]?key)?(?:\s+is)?\s+required)/i;

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "agent");
  const cwd = asString(config.cwd, process.cwd());

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
    checks.push({
      code: "cursor_cwd_valid",
      level: "info",
      message: `El directorio de trabajo es válido: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "cursor_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Directorio de trabajo inválido",
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
      code: "cursor_command_resolvable",
      level: "info",
      message: `El comando es ejecutable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: "cursor_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "El comando no es ejecutable",
      detail: command,
    });
  }

  const configCursorApiKey = env.CURSOR_API_KEY;
  const hostCursorApiKey = process.env.CURSOR_API_KEY;
  if (isNonEmpty(configCursorApiKey) || isNonEmpty(hostCursorApiKey)) {
    const source = isNonEmpty(configCursorApiKey) ? "env de la configuración del adaptador" : "entorno del servidor";
    checks.push({
      code: "cursor_api_key_present",
      level: "info",
      message: "CURSOR_API_KEY está definida para la autenticación de Cursor.",
      detail: `Detectado en ${source}.`,
    });
  } else {
    const cursorHome = isNonEmpty(env.CURSOR_HOME) ? env.CURSOR_HOME : undefined;
    const cursorAuth = await readCursorAuthInfo(cursorHome).catch(() => null);
    if (cursorAuth) {
      checks.push({
        code: "cursor_native_auth_present",
        level: "info",
        message: "Cursor está autenticado vía `agent login`.",
        detail: cursorAuth.email
          ? `Sesión iniciada como ${cursorAuth.email}.`
          : `Credenciales encontradas en ${cursorConfigPath(cursorHome)}.`,
      });
    } else {
      checks.push({
        code: "cursor_api_key_missing",
        level: "warn",
        message: "CURSOR_API_KEY no está definida. Las ejecuciones de Cursor pueden fallar hasta que se configure la autenticación.",
        hint: "Define CURSOR_API_KEY en el env del adaptador o ejecuta `agent login`.",
      });
    }
  }

  const canRunProbe =
    checks.every((check) => check.code !== "cursor_cwd_invalid" && check.code !== "cursor_command_unresolvable");
  if (canRunProbe) {
    if (!commandLooksLike(command, "agent")) {
      checks.push({
        code: "cursor_hello_probe_skipped_custom_command",
        level: "info",
        message: "Prueba hello omitida porque el comando no es `agent`.",
        detail: command,
        hint: "Usa el comando CLI `agent` para ejecutar la prueba automática de instalación y autenticación.",
      });
    } else {
      const model = asString(config.model, DEFAULT_CURSOR_LOCAL_MODEL).trim();
      const extraArgs = (() => {
        const fromExtraArgs = asStringArray(config.extraArgs);
        if (fromExtraArgs.length > 0) return fromExtraArgs;
        return asStringArray(config.args);
      })();
      const autoTrustEnabled = !hasCursorTrustBypassArg(extraArgs);
      const args = ["-p", "--mode", "ask", "--output-format", "json", "--workspace", cwd];
      if (model) args.push("--model", model);
      if (autoTrustEnabled) args.push("--yolo");
      if (extraArgs.length > 0) args.push(...extraArgs);
      args.push("Respond with hello.");

      const probe = await runChildProcess(
        `cursor-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command,
        args,
        {
          cwd,
          env,
          timeoutSec: 45,
          graceSec: 5,
          onLog: async () => {},
        },
      );
      const parsed = parseCursorJsonl(probe.stdout);
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errorMessage);
      const authEvidence = `${parsed.errorMessage ?? ""}\n${probe.stdout}\n${probe.stderr}`.trim();

      if (probe.timedOut) {
        checks.push({
          code: "cursor_hello_probe_timed_out",
          level: "warn",
          message: "La prueba hello de Cursor se agotó.",
          hint: "Reintenta la prueba. Si persiste, verifica `agent -p --mode ask --output-format json \"Respond with hello.\"` manualmente.",
        });
      } else if ((probe.exitCode ?? 1) === 0) {
        const summary = parsed.summary.trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello ? "cursor_hello_probe_passed" : "cursor_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "La prueba hello de Cursor tuvo éxito."
            : "La prueba de Cursor se ejecutó pero no devolvió `hello` como se esperaba.",
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
          ...(hasHello
            ? {}
            : {
                hint: "Prueba `agent -p --mode ask --output-format json \"Respond with hello.\"` manualmente para inspeccionar la salida completa.",
              }),
        });
      } else if (CURSOR_AUTH_REQUIRED_RE.test(authEvidence)) {
        checks.push({
          code: "cursor_hello_probe_auth_required",
          level: "warn",
          message: "El CLI de Cursor está instalado, pero la autenticación no está lista.",
          ...(detail ? { detail } : {}),
          hint: "Ejecuta `agent login` o configura CURSOR_API_KEY en el env/shell del adaptador, luego reintenta la prueba.",
        });
      } else {
        checks.push({
          code: "cursor_hello_probe_failed",
          level: "error",
          message: "La prueba hello de Cursor falló.",
          ...(detail ? { detail } : {}),
          hint: "Ejecuta `agent -p --mode ask --output-format json \"Respond with hello.\"` manualmente en este directorio de trabajo para depurar.",
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
