import { useEffect, useMemo, useRef, useState } from "react";

export type DatePreset = "mtd" | "7d" | "30d" | "ytd" | "all" | "custom";

export const PRESET_LABELS: Record<DatePreset, string> = {
  mtd: "Este mes",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  ytd: "Este año",
  all: "Todo el tiempo",
  custom: "Personalizado",
};

export const PRESET_KEYS: DatePreset[] = ["mtd", "7d", "30d", "ytd", "all", "custom"];

// nota: computeRange se llama dentro de un useMemo que se reevalúa una vez por minuto
// (impulsado por minuteTick). esto significa que las ventanas deslizantes (7d, 30d) avanzan su
// límite superior como máximo una vez por minuto — aceptable para un panel de costos.
function computeRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (preset) {
    case "mtd": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.toISOString(), to };
    }
    case "7d": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0);
      return { from: d.toISOString(), to };
    }
    case "30d": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0);
      return { from: d.toISOString(), to };
    }
    case "ytd": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d.toISOString(), to };
    }
    case "all":
    case "custom":
      return { from: "", to: "" };
  }
}

// redondear un Date al minuto más cercano para que la clave de consulta sea estable entre
// ciclos de relectura de 30s (evita nuevas entradas de caché en cada ciclo de sondeo)
function floorToMinute(d: Date): string {
  const floored = new Date(d);
  floored.setSeconds(0, 0);
  return floored.toISOString();
}

export interface UseDateRangeResult {
  preset: DatePreset;
  setPreset: (p: DatePreset) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  /** resolved iso strings ready to pass to api calls; empty string means unbounded */
  from: string;
  to: string;
  /** false when preset=custom but both dates are not yet selected */
  customReady: boolean;
}

export function useDateRange(): UseDateRangeResult {
  const [preset, setPreset] = useState<DatePreset>("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // marcar el siguiente límite de minuto calendario y luego cada 60s, para que los presets
  // deslizantes (7d, 30d) avancen su límite superior en sincronía con los minutos del reloj
  // en lugar de derivarse del desfase de montaje.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [minuteTick, setMinuteTick] = useState(() => floorToMinute(new Date()));
  useEffect(() => {
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const timeout = setTimeout(() => {
      setMinuteTick(floorToMinute(new Date()));
      intervalRef.current = setInterval(
        () => setMinuteTick(floorToMinute(new Date())),
        60_000,
      );
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
  }, []);

  const { from, to } = useMemo(() => {
    if (preset !== "custom") return computeRange(preset);
    // tratar las cadenas de fecha personalizadas como límites de fecha local para que el día completo quede incluido
    // sin importar la zona horaria del usuario. "from" empieza a la medianoche local, "to" a las 23:59:59.999.
    const fromDate = customFrom ? new Date(customFrom + "T00:00:00") : null;
    const toDate = customTo ? new Date(customTo + "T23:59:59.999") : null;
    return {
      from: fromDate ? fromDate.toISOString() : "",
      to: toDate ? toDate.toISOString() : "",
    };
  // minuteTick impulsa la reevaluación de los presets deslizantes una vez por minuto.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo, minuteTick]);

  const customReady = preset !== "custom" || (!!customFrom && !!customTo);

  return {
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    from,
    to,
    customReady,
  };
}
