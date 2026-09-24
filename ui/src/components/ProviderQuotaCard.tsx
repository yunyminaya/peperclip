import { useMemo } from "react";
import type { CostByProviderModel, CostWindowSpendRow, QuotaWindow } from "@paperclipai/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QuotaBar } from "./QuotaBar";
import { ClaudeSubscriptionPanel } from "./ClaudeSubscriptionPanel";
import { CodexSubscriptionPanel } from "./CodexSubscriptionPanel";
import {
  billingTypeDisplayName,
  formatCents,
  formatTokens,
  providerDisplayName,
  quotaSourceDisplayName,
} from "@/lib/utils";

// etiquetas de visualización ordenadas para las filas de ventana móvil
const ROLLING_WINDOWS = ["5h", "24h", "7d"] as const;

interface ProviderQuotaCardProps {
  provider: string;
  rows: CostByProviderModel[];
  /** presupuesto mensual de la empresa en centavos (0 significa ilimitado) */
  budgetMonthlyCents: number;
  /** gasto total de la empresa en este período en centavos, todos los proveedores */
  totalCompanySpendCents: number;
  /** gasto en la semana calendario actual en centavos, solo este proveedor */
  weekSpendCents: number;
  /** filas de ventana móvil para este proveedor: 5h, 24h, 7d */
  windowRows: CostWindowSpendRow[];
  showDeficitNotch: boolean;
  /** ventanas de cuota de suscripción en vivo desde la propia API del proveedor */
  quotaWindows?: QuotaWindow[];
  quotaError?: string | null;
  quotaSource?: string | null;
  quotaLoading?: boolean;
}

export function ProviderQuotaCard({
  provider,
  rows,
  budgetMonthlyCents,
  totalCompanySpendCents,
  weekSpendCents,
  windowRows,
  showDeficitNotch,
  quotaWindows = [],
  quotaError = null,
  quotaSource = null,
  quotaLoading = false,
}: ProviderQuotaCardProps) {
  // agregación de una sola pasada sobre rows — memoizada para que los 8 valores derivados no se
  // recalculen en cada render del padre (la pestaña de proveedores consulta cada 30s, y cada
  // tarjeta se monta dos veces: una en la cuadrícula de la pestaña "todos" y otra en su pestaña por proveedor).
  const totals = useMemo(() => {
    let inputTokens = 0, outputTokens = 0, costCents = 0;
    let apiRunCount = 0, subRunCount = 0, subInputTokens = 0, subOutputTokens = 0;
    for (const r of rows) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      costCents += r.costCents;
      apiRunCount += r.apiRunCount;
      subRunCount += r.subscriptionRunCount;
      subInputTokens += r.subscriptionInputTokens;
      subOutputTokens += r.subscriptionOutputTokens;
    }
    const totalTokens = inputTokens + outputTokens;
    const subTokens = subInputTokens + subOutputTokens;
    // denominador: tokens facturados por API (de cost_events) + tokens de suscripción (de heartbeat_runs)
    const allTokens = totalTokens + subTokens;
    return {
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalTokens,
      totalCostCents: costCents,
      totalApiRuns: apiRunCount,
      totalSubRuns: subRunCount,
      totalSubInputTokens: subInputTokens,
      totalSubOutputTokens: subOutputTokens,
      totalSubTokens: subTokens,
      subSharePct: allTokens > 0 ? (subTokens / allTokens) * 100 : 0,
    };
  }, [rows]);

  const {
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalCostCents,
    totalApiRuns,
    totalSubRuns,
    totalSubInputTokens,
    totalSubOutputTokens,
    totalSubTokens,
    subSharePct,
  } = totals;

  // barras de presupuesto: usar el gasto propio de este proveedor frente a su parte proporcional del presupuesto
  // proporcional: si un proveedor es el 40% del gasto total, se le asigna el 40% del presupuesto.
  // se vuelve al gasto bruto del proveedor frente al presupuesto total cuando totalCompanySpend es 0.
  const providerBudgetShare =
    budgetMonthlyCents > 0 && totalCompanySpendCents > 0
      ? (totalCostCents / totalCompanySpendCents) * budgetMonthlyCents
      : budgetMonthlyCents;

  const budgetPct =
    providerBudgetShare > 0
      ? Math.min(100, (totalCostCents / providerBudgetShare) * 100)
      : 0;

  // 4.33 = promedio de semanas por mes calendario (52 / 12)
  const weeklyBudgetShare = providerBudgetShare > 0 ? providerBudgetShare / 4.33 : 0;
  const weekPct =
    weeklyBudgetShare > 0 ? Math.min(100, (weekSpendCents / weeklyBudgetShare) * 100) : 0;

  const hasBudget = budgetMonthlyCents > 0;

  // memoizado para que el Map y el máximo no se reconstruyan en cada render del padre
  const windowMap = useMemo(
    () => new Map(windowRows.map((r) => [r.window, r])),
    [windowRows],
  );
  const maxWindowCents = useMemo(
    () => Math.max(...windowRows.map((r) => r.costCents), 0),
    [windowRows],
  );
  const isClaudeQuotaPanel = provider === "anthropic";
  const isCodexQuotaPanel = provider === "openai" && quotaSource?.startsWith("codex-");
  const supportsSubscriptionQuota = provider === "anthropic" || provider === "openai";
  const showSubscriptionQuotaSection =
    supportsSubscriptionQuota && (quotaLoading || quotaWindows.length > 0 || quotaError != null);

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-0 gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">
              {providerDisplayName(provider)}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              <span className="font-mono">{formatTokens(totalInputTokens)}</span> entrada
              {" · "}
              <span className="font-mono">{formatTokens(totalOutputTokens)}</span> salida
              {(totalApiRuns > 0 || totalSubRuns > 0) && (
                <span className="ml-1.5">
                  ·{" "}
                  {totalApiRuns > 0 && `~${totalApiRuns} api`}
                  {totalApiRuns > 0 && totalSubRuns > 0 && " / "}
                  {totalSubRuns > 0 && `~${totalSubRuns} sub`}
                  {" ejecuciones"}
                </span>
              )}
            </CardDescription>
          </div>
          <span className="text-xl font-bold tabular-nums shrink-0">
            {formatCents(totalCostCents)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-3 space-y-4">
        {hasBudget && (
          <div className="space-y-3">
            <QuotaBar
              label="Gasto del período"
              percentUsed={budgetPct}
              leftLabel={formatCents(totalCostCents)}
              rightLabel={`${Math.round(budgetPct)}% de la asignación`}
              showDeficitNotch={showDeficitNotch}
            />
            <QuotaBar
              label="Esta semana"
              percentUsed={weekPct}
              leftLabel={formatCents(weekSpendCents)}
              rightLabel={`~${formatCents(Math.round(weeklyBudgetShare))} / sem`}
              showDeficitNotch={weekPct >= 100}
            />
          </div>
        )}

        {/* consumo de ventana móvil — siempre se muestra cuando hay datos */}
        {windowRows.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Ventanas móviles
              </p>
              <div className="space-y-2.5">
                {ROLLING_WINDOWS.map((w) => {
                  const row = windowMap.get(w);
                  // omitir ventanas sin datos en lugar de mostrar ceros falsos de $0.00
                  if (!row) return null;
                  const cents = row.costCents;
                  const tokens = row.inputTokens + row.outputTokens;
                  const barPct = maxWindowCents > 0 ? (cents / maxWindowCents) * 100 : 0;
                  return (
                    <div key={w} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-muted-foreground w-6 shrink-0">{w}</span>
                        <span className="text-muted-foreground font-mono flex-1">
                          {formatTokens(tokens)} tokens
                        </span>
                        <span className="font-medium tabular-nums">{formatCents(cents)}</span>
                      </div>
                      <div className="h-2 w-full border border-border overflow-hidden">
                        <div
                          className="h-full bg-primary/60 transition-[width] duration-150"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* uso de suscripción — se muestra cuando existen ejecuciones facturadas por suscripción */}
        {totalSubRuns > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Suscripción
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{totalSubRuns}</span> ejecuciones
                {" · "}
                {totalSubTokens > 0 && (
                  <>
                    <span className="font-mono text-foreground">{formatTokens(totalSubTokens)}</span> total
                    {" · "}
                  </>
                )}
                <span className="font-mono text-foreground">{formatTokens(totalSubInputTokens)}</span> entrada
                {" · "}
                <span className="font-mono text-foreground">{formatTokens(totalSubOutputTokens)}</span> salida
              </p>
              {subSharePct > 0 && (
                <>
                  <div className="h-1.5 w-full border border-border overflow-hidden">
                    <div
                      className="h-full bg-primary/60 transition-[width] duration-150"
                      style={{ width: `${subSharePct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(subSharePct)}% del uso de tokens vía suscripción
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {/* desglose por modelo — siempre se muestra, con barras de proporción de tokens */}
        {rows.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-3">
              {rows.map((row) => {
                const rowTokens = row.inputTokens + row.outputTokens;
                const tokenPct = totalTokens > 0 ? (rowTokens / totalTokens) * 100 : 0;
                const costPct = totalCostCents > 0 ? (row.costCents / totalCostCents) * 100 : 0;
                return (
                  <div key={`${row.provider}:${row.model}`} className="space-y-1.5">
                    {/* nombre del modelo y costo */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs text-muted-foreground truncate font-mono block">
                          {row.model}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate block">
                          {providerDisplayName(row.biller)} · {billingTypeDisplayName(row.billingType)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 tabular-nums text-xs">
                        <span className="text-muted-foreground">
                          {formatTokens(rowTokens)} tokens
                        </span>
                        <span className="font-medium">{formatCents(row.costCents)}</span>
                      </div>
                    </div>
                    {/* barra de proporción de tokens */}
                    <div className="relative h-2 w-full border border-border overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/60 transition-[width] duration-150"
                        style={{ width: `${tokenPct}%` }}
                        title={`${Math.round(tokenPct)}% de los tokens del proveedor`}
                      />
                      {/* superposición de proporción de costo — más angosta, opaca, muestra el peso relativo del costo */}
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/85 transition-[width] duration-150"
                        style={{ width: `${costPct}%` }}
                        title={`${Math.round(costPct)}% del costo del proveedor`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ventanas de cuota de suscripción desde la API del proveedor — se muestran cuando hay datos */}
        {showSubscriptionQuotaSection && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Cuota de suscripción
                </p>
                {quotaSource && !isClaudeQuotaPanel && !isCodexQuotaPanel ? (
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {quotaSourceDisplayName(quotaSource)}
                  </span>
                ) : null}
              </div>
              {quotaLoading ? (
                <QuotaPanelSkeleton />
              ) : isClaudeQuotaPanel ? (
                <ClaudeSubscriptionPanel windows={quotaWindows} source={quotaSource} error={quotaError} />
              ) : isCodexQuotaPanel ? (
                <CodexSubscriptionPanel windows={quotaWindows} source={quotaSource} error={quotaError} />
              ) : (
                <>
                  {quotaError ? (
                    <p className="text-xs text-destructive">
                      {quotaError}
                    </p>
                  ) : null}
                  <div className="space-y-2.5">
                    {quotaWindows.map((qw) => {
                      const fillColor =
                        qw.usedPercent == null
                          ? null
                          : qw.usedPercent >= 90
                            ? "bg-red-400"
                            : qw.usedPercent >= 70
                              ? "bg-yellow-400"
                              : "bg-green-400";
                      return (
                        <div key={qw.label} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono text-muted-foreground shrink-0">{qw.label}</span>
                            <span className="flex-1" />
                            {qw.valueLabel != null ? (
                              <span className="font-medium tabular-nums">{qw.valueLabel}</span>
                            ) : qw.usedPercent != null ? (
                              <span className="font-medium tabular-nums">{qw.usedPercent}% usado</span>
                            ) : null}
                          </div>
                          {qw.usedPercent != null && fillColor != null && (
                            <div className="h-2 w-full border border-border overflow-hidden">
                              <div
                                className={`h-full transition-[width] duration-150 ${fillColor}`}
                                style={{ width: `${qw.usedPercent}%` }}
                              />
                            </div>
                          )}
                          {qw.detail ? (
                            <p className="text-xs text-muted-foreground">
                              {qw.detail}
                            </p>
                          ) : qw.resetsAt ? (
                            <p className="text-xs text-muted-foreground">
                              se renueva el {new Date(qw.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuotaPanelSkeleton() {
  return (
    <div className="border border-border px-4 py-4">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="border border-border px-3.5 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44 max-w-full" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-3 h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
