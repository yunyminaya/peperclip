// Reexportar todo del paquete compartido adapter-utils/server-utils.
// Este archivo se mantiene como un shim de conveniencia para que los
// imports existentes dentro del árbol (process/, http/, heartbeat.ts)
// no necesiten reescribirse.
import { logger } from "../middleware/logger.js";
export {
  type RunProcessResult,
  runningProcesses,
  MAX_CAPTURE_BYTES,
  MAX_EXCERPT_BYTES,
  parseObject,
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  parseJson,
  appendWithCap,
  resolvePathValue,
  renderTemplate,
  redactEnvForLogs,
  buildPaperclipEnv,
  defaultPathForPlatform,
  ensurePathInEnv,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
} from "@paperclipai/adapter-utils/server-utils";

// Reexportar runChildProcess con el logger pino del servidor conectado.
import { runChildProcess as _runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import type { RunProcessResult } from "@paperclipai/adapter-utils/server-utils";

export async function runChildProcess(
  runId: string,
  command: string,
  args: string[],
  opts: {
    cwd: string;
    env: Record<string, string>;
    timeoutSec: number;
    graceSec: number;
    onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  },
): Promise<RunProcessResult> {
  return _runChildProcess(runId, command, args, {
    ...opts,
    onLogError: (err, id, msg) => logger.warn({ err, runId: id }, msg),
  });
}
