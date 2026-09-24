/**
 * Analizador ligero de expresiones cron y calculador de próxima ejecución.
 *
 * Admite expresiones cron estándar de 5 campos:
 *
 *   ┌────────────── minuto (0–59)
 *   │ ┌──────────── hora   (0–23)
 *   │ │ ┌────────── día del mes (1–31)
 *   │ │ │ ┌──────── mes  (1–12)
 *   │ │ │ │ ┌────── día de la semana (0–6, dom=0)
 *   │ │ │ │ │
 *   * * * * *
 *
 * Sintaxis admitida por campo:
 *   - `*`        — cualquier valor
 *   - `N`        — valor exacto
 *   - `N-M`      — rango (inclusivo)
 *   - `N/S`      — comienza en N, paso S (dentro de los límites del campo)
 *   - `* /S`     — cada S (desde el mínimo del campo)   [sin espacio — se muestra así para evitar el cierre del comentario]
 *   - `N-M/S`    — rango con paso
 *   - `N,M,...`  — lista de valores, rangos o pasos
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Un horario cron analizado. Cada campo es un arreglo ordenado de valores enteros
 * válidos para ese campo.
 */
export interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

// ---------------------------------------------------------------------------
// Límites de campos
// ---------------------------------------------------------------------------

interface FieldSpec {
  min: number;
  max: number;
  name: string;
}

const FIELD_SPECS: FieldSpec[] = [
  { min: 0, max: 59, name: "minuto" },
  { min: 0, max: 23, name: "hora" },
  { min: 1, max: 31, name: "día del mes" },
  { min: 1, max: 12, name: "mes" },
  { min: 0, max: 6, name: "día de la semana" },
];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Analiza un solo token de campo cron (p. ej. `"5"`, `"1-3"`, `"* /10"`, `"1,3,5"`).
 *
 * @returns Arreglo ordenado sin duplicados de valores enteros coincidentes dentro de los límites.
 * @throws {Error} en caso de sintaxis no válida o valores fuera de rango.
 */
function parseField(token: string, spec: FieldSpec): number[] {
  const values = new Set<number>();

  // Primero divide por comas: cada parte puede ser un valor, un rango o un paso
  const parts = token.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "") {
      throw new Error(`Elemento vacío en el campo cron ${spec.name}`);
    }

    // Revisa la sintaxis de paso: "X/S" donde X es "*" o un rango o un número
    const slashIdx = trimmed.indexOf("/");
    if (slashIdx !== -1) {
      const base = trimmed.slice(0, slashIdx);
      const stepStr = trimmed.slice(slashIdx + 1);
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) {
        throw new Error(
          `Paso no válido "${stepStr}" en el campo cron ${spec.name}`,
        );
      }

      let rangeStart = spec.min;
      let rangeEnd = spec.max;

      if (base === "*") {
        // */S: cada S desde el mínimo del campo
      } else if (base.includes("-")) {
        // N-M/S: rango con paso
        const [a, b] = base.split("-").map((s) => parseInt(s, 10));
        if (isNaN(a!) || isNaN(b!)) {
          throw new Error(
            `Rango no válido "${base}" en el campo cron ${spec.name}`,
          );
        }
        rangeStart = a!;
        rangeEnd = b!;
      } else {
        // N/S: comienza en N, paso S
        const start = parseInt(base, 10);
        if (isNaN(start)) {
          throw new Error(
            `Inicio no válido "${base}" en el campo cron ${spec.name}`,
          );
        }
        rangeStart = start;
      }

      validateBounds(rangeStart, spec);
      validateBounds(rangeEnd, spec);

      for (let i = rangeStart; i <= rangeEnd; i += step) {
        values.add(i);
      }
      continue;
    }

    // Revisa la sintaxis de rango: "N-M"
    if (trimmed.includes("-")) {
      const [aStr, bStr] = trimmed.split("-");
      const a = parseInt(aStr!, 10);
      const b = parseInt(bStr!, 10);
      if (isNaN(a) || isNaN(b)) {
        throw new Error(
          `Rango no válido "${trimmed}" en el campo cron ${spec.name}`,
        );
      }
      validateBounds(a, spec);
      validateBounds(b, spec);
      if (a > b) {
        throw new Error(
          `Rango no válido ${a}-${b} en el campo cron ${spec.name} (el inicio es mayor que el fin)`,
        );
      }
      for (let i = a; i <= b; i++) {
        values.add(i);
      }
      continue;
    }

    // Comodín
    if (trimmed === "*") {
      for (let i = spec.min; i <= spec.max; i++) {
        values.add(i);
      }
      continue;
    }

    // Valor único
    const val = parseInt(trimmed, 10);
    if (isNaN(val)) {
      throw new Error(
        `Valor no válido "${trimmed}" en el campo cron ${spec.name}`,
      );
    }
    validateBounds(val, spec);
    values.add(val);
  }

  if (values.size === 0) {
    throw new Error(`Resultado vacío para el campo cron ${spec.name}`);
  }

  return [...values].sort((a, b) => a - b);
}

function validateBounds(value: number, spec: FieldSpec): void {
  if (value < spec.min || value > spec.max) {
    throw new Error(
      `Valor ${value} fuera de rango [${spec.min}–${spec.max}] para el campo cron ${spec.name}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analiza una cadena de expresión cron en un {@link ParsedCron} estructurado.
 *
 * @param expression — Una expresión cron estándar de 5 campos.
 * @returns Cron analizado con valores válidos ordenados para cada campo.
 * @throws {Error} en caso de sintaxis no válida.
 *
 * @example
 * ```ts
 * const parsed = parseCron("0 * * * *"); // cada hora en el minuto 0
 * // parsed.minutes === [0]
 * // parsed.hours === [0,1,2,...,23]
 * ```
 */
export function parseCron(expression: string): ParsedCron {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error("La expresión cron no debe estar vacía");
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length !== 5) {
    throw new Error(
      `La expresión cron debe tener exactamente 5 campos, se recibieron ${tokens.length}: "${trimmed}"`,
    );
  }

  return {
    minutes: parseField(tokens[0]!, FIELD_SPECS[0]!),
    hours: parseField(tokens[1]!, FIELD_SPECS[1]!),
    daysOfMonth: parseField(tokens[2]!, FIELD_SPECS[2]!),
    months: parseField(tokens[3]!, FIELD_SPECS[3]!),
    daysOfWeek: parseField(tokens[4]!, FIELD_SPECS[4]!),
  };
}

/**
 * Valida una cadena de expresión cron. Devuelve `null` si es válida, o una
 * cadena con el mensaje de error si no lo es.
 *
 * @param expression — Una cadena de expresión cron para validar.
 * @returns `null` en caso de éxito, mensaje de error en caso de fallo.
 */
export function validateCron(expression: string): string | null {
  try {
    parseCron(expression);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Calcula la próxima hora de ejecución después de `after` para el horario cron analizado dado.
 *
 * Comienza desde el minuto inmediatamente posterior a `after` y avanza
 * hasta encontrar un minuto coincidente (hasta un límite de seguridad de ~4 años
 * para evitar bucles infinitos en horarios imposibles).
 *
 * @param cron  — Horario cron analizado.
 * @param after — La fecha de referencia. La fecha devuelta será estrictamente posterior a esta.
 * @returns El siguiente `Date` coincidente, o `null` si no se encuentra coincidencia dentro de la ventana de búsqueda.
 */
export function nextCronTick(cron: ParsedCron, after: Date): Date | null {
  // Trabaja en minutos locales: comienza desde el minuto posterior a `after`
  const d = new Date(after.getTime());
  // Avanza al siguiente minuto completo
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);

  // Seguridad: busca hasta 4 años de minutos (~2.1M iteraciones como máximo).
  // Usa 366 para considerar los años bisiestos.
  const MAX_CRON_SEARCH_YEARS = 4;
  const maxIterations = MAX_CRON_SEARCH_YEARS * 366 * 24 * 60;

  for (let i = 0; i < maxIterations; i++) {
    const month = d.getUTCMonth() + 1; // 1-12
    const dayOfMonth = d.getUTCDate(); // 1-31
    const dayOfWeek = d.getUTCDay(); // 0-6
    const hour = d.getUTCHours(); // 0-23
    const minute = d.getUTCMinutes(); // 0-59

    // Revisa el mes
    if (!cron.months.includes(month)) {
      // Salta al primer día del siguiente mes coincidente
      advanceToNextMonth(d, cron.months);
      continue;
    }

    // Revisa el día del mes Y el día de la semana (ambos deben coincidir)
    if (!cron.daysOfMonth.includes(dayOfMonth) || !cron.daysOfWeek.includes(dayOfWeek)) {
      // Avanza un día
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0, 0, 0);
      continue;
    }

    // Revisa la hora
    if (!cron.hours.includes(hour)) {
      // Avanza a la siguiente hora coincidente dentro del día
      const nextHour = findNext(cron.hours, hour);
      if (nextHour !== null) {
        d.setUTCHours(nextHour, 0, 0, 0);
      } else {
        // No queda ninguna hora coincidente hoy: avanza al día siguiente
        d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(0, 0, 0, 0);
      }
      continue;
    }

    // Revisa el minuto
    if (!cron.minutes.includes(minute)) {
      const nextMin = findNext(cron.minutes, minute);
      if (nextMin !== null) {
        d.setUTCMinutes(nextMin, 0, 0);
      } else {
        // No queda ningún minuto coincidente en esta hora: avanza a la hora siguiente
        d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
      }
      continue;
    }

    // ¡Todos los campos coinciden!
    return new Date(d.getTime());
  }

  // No se encontró coincidencia dentro de la ventana de búsqueda
  return null;
}

/**
 * Conveniencia: analiza una expresión cron y calcula la próxima hora de ejecución.
 *
 * @param expression — Cadena de expresión cron de 5 campos.
 * @param after — Fecha de referencia (por defecto `new Date()`).
 * @returns El siguiente Date coincidente, o `null` si no hay coincidencia en 4 años.
 * @throws {Error} si la expresión cron no es válida.
 */
export function nextCronTickFromExpression(
  expression: string,
  after: Date = new Date(),
): Date | null {
  const cron = parseCron(expression);
  return nextCronTick(cron, after);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Encuentra el siguiente valor en `sortedValues` que sea mayor que `current`.
 * Devuelve `null` si no existe tal valor.
 */
function findNext(sortedValues: number[], current: number): number | null {
  for (const v of sortedValues) {
    if (v > current) return v;
  }
  return null;
}

/**
 * Avanza `d` (mutado en su lugar) hasta la medianoche UTC del primer día del siguiente
 * mes cuyo número de mes (base 1) esté en `months`.
 */
function advanceToNextMonth(d: Date, months: number[]): void {
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth() + 1; // 1-based

  // Avanza los meses hasta encontrar uno en el conjunto (máx. 48 iteraciones = 4 años)
  for (let i = 0; i < 48; i++) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    if (months.includes(month)) {
      d.setUTCFullYear(year, month - 1, 1);
      d.setUTCHours(0, 0, 0, 0);
      return;
    }
  }
}
