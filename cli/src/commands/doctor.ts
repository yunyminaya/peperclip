import * as p from "@clack/prompts";
import pc from "picocolors";
import type { PaperclipConfig } from "../config/schema.js";
import { readConfig, resolveConfigPath } from "../config/store.js";
import {
  agentJwtSecretCheck,
  configCheck,
  databaseCheck,
  deploymentAuthCheck,
  llmCheck,
  logCheck,
  portCheck,
  secretsCheck,
  storageCheck,
  type CheckResult,
} from "../checks/index.js";
import { loadPaperclipEnvFile } from "../config/env.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

const STATUS_ICON = {
  pass: pc.green("✓"),
  warn: pc.yellow("!"),
  fail: pc.red("✗"),
} as const;

export async function doctor(opts: {
  config?: string;
  repair?: boolean;
  yes?: boolean;
}): Promise<{ passed: number; warned: number; failed: number }> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclip doctor ")));

  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);
  const results: CheckResult[] = [];

  // 1. Chequeo de config (debe pasar antes que los demás)
  const cfgResult = configCheck(opts.config);
  results.push(cfgResult);
  printResult(cfgResult);

  if (cfgResult.status === "fail") {
    return printSummary(results);
  }

  let config: PaperclipConfig;
  try {
    config = readConfig(opts.config)!;
  } catch (err) {
    const readResult: CheckResult = {
      name: "Archivo de config",
      status: "fail",
      message: `No se pudo leer la config: ${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "Ejecuta `paperclipai configure --section database` o `paperclipai onboard`",
    };
    results.push(readResult);
    printResult(readResult);
    return printSummary(results);
  }

  // 2. Deployment/auth mode check
  const deploymentAuthResult = deploymentAuthCheck(config);
  results.push(deploymentAuthResult);
  printResult(deploymentAuthResult);

  // 3. Agent JWT check
  results.push(
    await runRepairableCheck({
      run: () => agentJwtSecretCheck(opts.config),
      configPath,
      opts,
    }),
  );

  // 4. Secrets adapter check
  results.push(
    await runRepairableCheck({
      run: () => secretsCheck(config, configPath),
      configPath,
      opts,
    }),
  );

  // 5. Storage check
  results.push(
    await runRepairableCheck({
      run: () => storageCheck(config, configPath),
      configPath,
      opts,
    }),
  );

  // 6. Database check
  results.push(
    await runRepairableCheck({
      run: () => databaseCheck(config, configPath),
      configPath,
      opts,
    }),
  );

  // 7. LLM check
  const llmResult = await llmCheck(config);
  results.push(llmResult);
  printResult(llmResult);

  // 8. Log directory check
  results.push(
    await runRepairableCheck({
      run: () => logCheck(config, configPath),
      configPath,
      opts,
    }),
  );

  // 9. Port check
  const portResult = await portCheck(config);
  results.push(portResult);
  printResult(portResult);

  // Resumen
  return printSummary(results);
}

function printResult(result: CheckResult): void {
  const icon = STATUS_ICON[result.status];
  p.log.message(`${icon} ${pc.bold(result.name)}: ${result.message}`);
  if (result.status !== "pass" && result.repairHint) {
    p.log.message(`  ${pc.dim(result.repairHint)}`);
  }
}

async function maybeRepair(
  result: CheckResult,
  opts: { repair?: boolean; yes?: boolean },
): Promise<boolean> {
  if (result.status === "pass" || !result.canRepair || !result.repair) return false;
  if (!opts.repair) return false;

  let shouldRepair = opts.yes;
  if (!shouldRepair) {
    const answer = await p.confirm({
      message: `¿Reparar "${result.name}"?`,
      initialValue: true,
    });
    if (p.isCancel(answer)) return false;
    shouldRepair = answer;
  }

  if (shouldRepair) {
    try {
      await result.repair();
      p.log.success(`Reparado: ${result.name}`);
      return true;
    } catch (err) {
      p.log.error(`Reparación fallida: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return false;
}

async function runRepairableCheck(input: {
  run: () => CheckResult | Promise<CheckResult>;
  configPath: string;
  opts: { repair?: boolean; yes?: boolean };
}): Promise<CheckResult> {
  let result = await input.run();
  printResult(result);

  const repaired = await maybeRepair(result, input.opts);
  if (!repaired) return result;

  // Las reparaciones pueden crear/actualizar el archivo .env adyacente u otros recursos locales.
  loadPaperclipEnvFile(input.configPath);
  result = await input.run();
  printResult(result);
  return result;
}

function printSummary(results: CheckResult[]): { passed: number; warned: number; failed: number } {
  const passed = results.filter((r) => r.status === "pass").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;

  const parts: string[] = [];
  parts.push(pc.green(`${passed} pasados`));
  if (warned) parts.push(pc.yellow(`${warned} advertencias`));
  if (failed) parts.push(pc.red(`${failed} fallidos`));

  p.note(parts.join(", "), "Resumen");

  if (failed > 0) {
    p.outro(pc.red("Algunos chequeos fallaron. Corrige los problemas de arriba y vuelve a ejecutar doctor."));
  } else if (warned > 0) {
    p.outro(pc.yellow("Todos los chequeos críticos pasaron con algunas advertencias."));
  } else {
    p.outro(pc.green("¡Todos los chequeos pasaron!"));
  }

  return { passed, warned, failed };
}
