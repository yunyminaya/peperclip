import { cn } from "@/lib/utils";

interface QuotaBarProps {
  label: string;
  // valor entre 0 y 100
  percentUsed: number;
  leftLabel: string;
  rightLabel?: string;
  // muestra una muesca destructiva de 2px en la punta del relleno cuando es true
  showDeficitNotch?: boolean;
  className?: string;
}

function fillColor(pct: number): string {
  if (pct > 90) return "bg-red-400";
  if (pct > 70) return "bg-yellow-400";
  return "bg-green-400";
}

export function QuotaBar({
  label,
  percentUsed,
  leftLabel,
  rightLabel,
  showDeficitNotch = false,
  className,
}: QuotaBarProps) {
  const clampedPct = Math.min(100, Math.max(0, percentUsed));
  // mantener la muesca visible incluso cerca de los bordes
  const notchLeft = Math.min(clampedPct, 97);

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* encabezado de la fila */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium tabular-nums">{leftLabel}</span>
          {rightLabel && (
            <span className="text-xs text-muted-foreground tabular-nums">{rightLabel}</span>
          )}
        </div>
      </div>

      {/* pista — borde encajonado, esquinas cuadradas para coincidir con el tema */}
      <div className="relative h-2 w-full border border-border overflow-hidden">
        {/* relleno */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width,background-color] duration-150",
            fillColor(clampedPct),
          )}
          style={{ width: `${clampedPct}%` }}
        />
        {/* muesca de déficit — 2px de ancho, situada en la punta del relleno */}
        {showDeficitNotch && clampedPct > 0 && (
          <div
            className="absolute inset-y-0 w-[2px] bg-destructive z-10"
            style={{ left: `${notchLeft}%` }}
          />
        )}
      </div>
    </div>
  );
}
