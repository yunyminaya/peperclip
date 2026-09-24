/**
 * Configuración compartida de content-type de adjuntos.
 *
 * Por defecto solo se permiten tipos de imagen. Configura la
 * variable de entorno `PAPERCLIP_ALLOWED_ATTACHMENT_TYPES` con una
 * lista de tipos MIME o patrones comodín separados por comas para ampliar
 * el conjunto permitido.
 *
 * Ejemplos:
 *   PAPERCLIP_ALLOWED_ATTACHMENT_TYPES=image/*,application/pdf
 *   PAPERCLIP_ALLOWED_ATTACHMENT_TYPES=image/*,application/pdf,text/*
 *
 * Sintaxis de patrones soportada:
 *   - Tipos exactos: "application/pdf"
 *   - Comodines:     "image/*"  o  "application/vnd.openxmlformats-officedocument.*"
 */

export const DEFAULT_ALLOWED_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/markdown",
  "text/plain",
  "application/json",
  "text/csv",
  "text/html",
];

/**
 * Analiza una lista de patrones de tipos MIME separados por comas en un arreglo normalizado.
 * Devuelve la lista por defecto (solo imágenes) cuando la entrada está vacía o es undefined.
 */
export function parseAllowedTypes(raw: string | undefined): string[] {
  if (!raw) return [...DEFAULT_ALLOWED_TYPES];
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_TYPES];
}

/**
 * Verifica si `contentType` coincide con alguna entrada de `allowedPatterns`.
 *
 * Soporta coincidencias exactas ("application/pdf") y patrones comodín / de
 * prefijo ("image/*", "application/vnd.openxmlformats-officedocument.*").
 */
export function matchesContentType(contentType: string, allowedPatterns: string[]): boolean {
  const ct = contentType.toLowerCase();
  return allowedPatterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.endsWith("/*") || pattern.endsWith(".*")) {
      return ct.startsWith(pattern.slice(0, -1));
    }
    return ct === pattern;
  });
}

// ---------- Singletons a nivel de módulo leídos una vez al arrancar ----------

const allowedPatterns: string[] = parseAllowedTypes(
  process.env.PAPERCLIP_ALLOWED_ATTACHMENT_TYPES,
);

/** Envoltorio de conveniencia que usa la lista permitida a nivel de proceso. */
export function isAllowedContentType(contentType: string): boolean {
  return matchesContentType(contentType, allowedPatterns);
}

export const MAX_ATTACHMENT_BYTES =
  Number(process.env.PAPERCLIP_ATTACHMENT_MAX_BYTES) || 10 * 1024 * 1024;
