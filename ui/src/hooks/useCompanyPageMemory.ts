import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { toCompanyRelativePath } from "../lib/company-routes";
import {
  getRememberedPathOwnerCompanyId,
  isRememberableCompanyPath,
  sanitizeRememberedPathForCompany,
} from "../lib/company-page-memory";

const STORAGE_KEY = "paperclip.companyPaths";

function getCompanyPaths(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function saveCompanyPath(companyId: string, path: string) {
  const paths = getCompanyPaths();
  paths[companyId] = path;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
}

/**
 * Recuerda la última página visitada por empresa y navega a ella al cambiar de empresa.
 * Vuelve a /dashboard si no se visitó ninguna página antes para una empresa.
 */
export function useCompanyPageMemory() {
  const { companies, selectedCompanyId, selectedCompany, selectionSource } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();
  const prevCompanyId = useRef<string | null>(selectedCompanyId);
  const rememberedPathOwnerCompanyId = useMemo(
    () =>
      getRememberedPathOwnerCompanyId({
        companies,
        pathname: location.pathname,
        fallbackCompanyId: prevCompanyId.current,
      }),
    [companies, location.pathname],
  );

  // Guarda la ruta actual para la empresa actual en cada cambio de ubicación.
  // Usa la referencia prevCompanyId para guardar bajo la empresa correcta incluso
  // durante el render en el que selectedCompanyId ya cambió.
  const fullPath = location.pathname + location.search;
  useEffect(() => {
    const companyId = rememberedPathOwnerCompanyId;
    const relativePath = toCompanyRelativePath(fullPath);
    if (companyId && isRememberableCompanyPath(relativePath)) {
      saveCompanyPath(companyId, relativePath);
    }
  }, [fullPath, rememberedPathOwnerCompanyId]);

  // Navegar a la ruta guardada cuando cambia la empresa
  useEffect(() => {
    if (!selectedCompanyId) return;

    if (
      prevCompanyId.current !== null &&
      selectedCompanyId !== prevCompanyId.current
    ) {
      if (selectionSource !== "route_sync" && selectedCompany) {
        const paths = getCompanyPaths();
        const targetPath = sanitizeRememberedPathForCompany({
          path: paths[selectedCompanyId],
          companyPrefix: selectedCompany.issuePrefix,
        });
        navigate(`/${selectedCompany.issuePrefix}${targetPath}`, { replace: true });
      }
    }
    prevCompanyId.current = selectedCompanyId;
  }, [selectedCompany, selectedCompanyId, selectionSource, navigate]);
}
