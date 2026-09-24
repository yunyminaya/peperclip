import { Command } from "commander";
import type { DashboardSummary } from "@paperclipai/shared";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface DashboardGetOptions extends BaseClientOptions {
  companyId?: string;
}

export function registerDashboardCommands(program: Command): void {
  const dashboard = program.command("dashboard").description("Operaciones de resumen del panel");

  addCommonClientOptions(
    dashboard
      .command("get")
      .description("Obtener el resumen del panel de una empresa")
      .requiredOption("-C, --company-id <id>", "ID de empresa")
      .action(async (opts: DashboardGetOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const row = await ctx.api.get<DashboardSummary>(`/api/companies/${ctx.companyId}/dashboard`);
          printOutput(row, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
