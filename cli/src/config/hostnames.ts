export function normalizeHostnameInput(raw: string): string {
  const input = raw.trim();
  if (!input) {
    throw new Error("Se requiere un hostname");
  }

  try {
    const url = input.includes("://") ? new URL(input) : new URL(`http://${input}`);
    const hostname = url.hostname.trim().toLowerCase();
    if (!hostname) throw new Error("Se requiere un hostname");
    return hostname;
  } catch {
    throw new Error(`Hostname no válido: ${raw}`);
  }
}

export function parseHostnameCsv(raw: string): string[] {
  if (!raw.trim()) return [];
  const unique = new Set<string>();
  for (const part of raw.split(",")) {
    const hostname = normalizeHostnameInput(part);
    unique.add(hostname);
  }
  return Array.from(unique);
}

