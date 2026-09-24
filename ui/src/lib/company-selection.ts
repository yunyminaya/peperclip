export type CompanySelectionSource = "manual" | "route_sync" | "bootstrap";

export function shouldSyncCompanySelectionFromRoute(params: {
  selectionSource: CompanySelectionSource;
  selectedCompanyId: string | null;
  routeCompanyId: string;
}): boolean {
  const { selectionSource, selectedCompanyId, routeCompanyId } = params;

  if (selectedCompanyId === routeCompanyId) return false;

  // Permite que los cambios manuales de empresa completen primero su navegación a la ruta recordada.
  if (selectionSource === "manual" && selectedCompanyId) {
    return false;
  }

  return true;
}
