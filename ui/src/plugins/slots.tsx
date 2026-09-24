/**
 * @fileoverview Sistema de slots de UI de plugins — carga dinámica, aislamiento de errores
 * y renderizado de extensiones de UI aportadas por plugins.
 *
 * Proporciona:
 * - `usePluginSlots(type, context?)` — hook de React que descubre y
 *   filtra las contribuciones de UI de plugins para un tipo de slot dado.
 * - `PluginSlotOutlet` — renderiza todos los slots coincidentes en línea con aislamiento
 *   de límite de error por plugin.
 * - `PluginBridgeScope` — envuelve el árbol de componentes de cada plugin para inyectar
 *   el contexto del puente (`pluginId`, contexto del host) que necesitan los hooks del puente.
 *
 * Los módulos de UI de plugins se cargan vía `import()` dinámico de ESM desde el servidor
 * de archivos estáticos del host (`/_plugins/:pluginId/ui/:entryFile`). Cada módulo
 * exporta componentes de React nombrados que corresponden a `ui.slots[].exportName`
 * en el manifiesto.
 *
 * @see PLUGIN_SPEC.md §19 — UI Extension Model
 * @see PLUGIN_SPEC.md §19.0.3 — Bundle Serving
 */
import {
  Component,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type ComponentType,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  PluginLauncherDeclaration,
  PluginUiSlotDeclaration,
  PluginUiSlotEntityType,
  PluginUiSlotType,
} from "@paperclipai/shared";
import { pluginsApi, type PluginUiContribution } from "@/api/plugins";
import { authApi } from "@/api/auth";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import {
  PluginBridgeContext,
  type PluginHostContext,
} from "./bridge";

export type PluginSlotContext = {
  companyId?: string | null;
  companyPrefix?: string | null;
  projectId?: string | null;
  entityId?: string | null;
  entityType?: PluginUiSlotEntityType | null;
  /** ID de entidad padre para slots anidados (p. ej. anotaciones de comentarios dentro de un issue). */
  parentEntityId?: string | null;
  projectRef?: string | null;
};

export type ResolvedPluginSlot = PluginUiSlotDeclaration & {
  pluginId: string;
  pluginKey: string;
  pluginDisplayName: string;
  pluginVersion: string;
};

type PluginSlotComponentProps = {
  slot: ResolvedPluginSlot;
  context: PluginSlotContext;
};

export type RegisteredPluginComponent =
  | {
    kind: "react";
    component: ComponentType<PluginSlotComponentProps>;
  }
  | {
    kind: "web-component";
    tagName: string;
  };

type SlotFilters = {
  slotTypes: PluginUiSlotType[];
  entityType?: PluginUiSlotEntityType | null;
  companyId?: string | null;
  enabled?: boolean;
};

type UsePluginSlotsResult = {
  slots: ResolvedPluginSlot[];
  isLoading: boolean;
  errorMessage: string | null;
};

/**
 * Registro en memoria de las exportaciones de UI de plugins cargadas por la página del host.
 * Las claves son `${pluginKey}:${exportName}` para coincidir con las declaraciones de slots del manifiesto.
 */
const registry = new Map<string, RegisteredPluginComponent>();

function buildRegistryKey(pluginKey: string, exportName: string): string {
  return `${pluginKey}:${exportName}`;
}

function requiresEntityType(slotType: PluginUiSlotType): boolean {
  return slotType === "detailTab" || slotType === "taskDetailView" || slotType === "contextMenuItem" || slotType === "commentAnnotation" || slotType === "commentContextMenuItem" || slotType === "projectSidebarItem" || slotType === "toolbarButton";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Error desconocido";
}

/**
 * Registra una exportación de componente de React para un slot de UI de plugin.
 */
export function registerPluginReactComponent(
  pluginKey: string,
  exportName: string,
  component: ComponentType<PluginSlotComponentProps>,
): void {
  registry.set(buildRegistryKey(pluginKey, exportName), {
    kind: "react",
    component,
  });
}

/**
 * Registra una etiqueta de elemento personalizado para un slot de UI de plugin.
 */
export function registerPluginWebComponent(
  pluginKey: string,
  exportName: string,
  tagName: string,
): void {
  registry.set(buildRegistryKey(pluginKey, exportName), {
    kind: "web-component",
    tagName,
  });
}

function resolveRegisteredComponent(slot: ResolvedPluginSlot): RegisteredPluginComponent | null {
  return registry.get(buildRegistryKey(slot.pluginKey, slot.exportName)) ?? null;
}

export function resolveRegisteredPluginComponent(
  pluginKey: string,
  exportName: string,
): RegisteredPluginComponent | null {
  return registry.get(buildRegistryKey(pluginKey, exportName)) ?? null;
}

// ---------------------------------------------------------------------------
// Cargador dinámico de módulos de plugins con import
// ---------------------------------------------------------------------------

type PluginLoadState = "idle" | "loading" | "loaded" | "error";

/**
 * Rastrea el estado de carga del módulo de UI de cada plugin por clave de caché de contribución.
 *
 * Una vez cargado un módulo de plugin, todas sus exportaciones nombradas se inspeccionan y
 * se registran en el `registry` de componentes para que `resolveRegisteredComponent`
 * pueda encontrarlas cuando los slots se rendericen.
 */
const pluginLoadStates = new Map<string, PluginLoadState>();

/**
 * Caché de promesas para evitar importaciones duplicadas concurrentes del mismo plugin.
 */
const inflightImports = new Map<string, Promise<void>>();

/**
 * Construye la URL completa del módulo de entrada de UI de un plugin.
 *
 * El servidor sirve los bundles de UI de plugins en `/_plugins/:pluginId/ui/*`.
 * El `uiEntryFile` de la contribución (típicamente `"index.js"`) se
 * añade para formar la ruta de importación completa.
 */
function buildPluginModuleKey(contribution: PluginUiContribution): string {
  const cacheHint = contribution.updatedAt ?? contribution.version ?? "0";
  return `${contribution.pluginId}:${cacheHint}`;
}

function buildPluginUiUrl(contribution: PluginUiContribution): string {
  const cacheHint = encodeURIComponent(contribution.updatedAt ?? contribution.version ?? "0");
  return `/_plugins/${encodeURIComponent(contribution.pluginId)}/ui/${contribution.uiEntryFile}?v=${cacheHint}`;
}

/**
 * Importa el módulo de entrada de UI de un plugin con reescritura de especificadores desnudos.
 *
 * Los bundles de plugins se construyen con `external: ["@paperclipai/plugin-sdk/ui", "react", "react-dom"]`,
 * por lo que su salida ESM contiene importaciones de especificadores desnudos como:
 *
 * ```js
 * import { usePluginData } from "@paperclipai/plugin-sdk/ui";
 * import React from "react";
 * ```
 *
 * Los navegadores no pueden resolver especificadores desnudos sin un mapa de importación. En lugar de
 * lidiar con las restricciones de tiempo de los mapas de importación, hacemos:
 * 1. Obtener el texto fuente del módulo
 * 2. Reescribir las importaciones de especificadores desnudos para usar blob URLs que reexportan desde
 *    el registro global del puente del host (`globalThis.__paperclipPluginBridge__`)
 * 3. Importar el módulo reescrito vía blob URL
 *
 * Este enfoque es compatible con todos los navegadores modernos y evita problemas de
 * orden de los mapas de importación.
 */
const shimBlobUrls: Record<string, string> = {};

function applyJsxRuntimeKey(
  props: Record<string, unknown> | null | undefined,
  key: string | number | undefined,
): Record<string, unknown> {
  if (key === undefined) return props ?? {};
  return { ...(props ?? {}), key };
}

function getShimBlobUrl(specifier: "react" | "react-dom" | "react-dom/client" | "react/jsx-runtime" | "sdk-ui"): string {
  if (shimBlobUrls[specifier]) return shimBlobUrls[specifier];

  let source: string;
  switch (specifier) {
    case "react":
      source = `
        const R = globalThis.__paperclipPluginBridge__?.react;
        export default R;
        const { useState, useEffect, useCallback, useMemo, useRef, useContext,
          createContext, createElement, Fragment, Component, forwardRef,
          memo, lazy, Suspense, StrictMode, cloneElement, Children,
          isValidElement, createRef } = R;
        export { useState, useEffect, useCallback, useMemo, useRef, useContext,
          createContext, createElement, Fragment, Component, forwardRef,
          memo, lazy, Suspense, StrictMode, cloneElement, Children,
          isValidElement, createRef };
      `;
      break;
    case "react/jsx-runtime":
      source = `
        const R = globalThis.__paperclipPluginBridge__?.react;
        const withKey = ${applyJsxRuntimeKey.toString()};
        export const jsx = (type, props, key) => R.createElement(type, withKey(props, key));
        export const jsxs = (type, props, key) => R.createElement(type, withKey(props, key));
        export const Fragment = R.Fragment;
      `;
      break;
    case "react-dom":
    case "react-dom/client":
      source = `
        const RD = globalThis.__paperclipPluginBridge__?.reactDom;
        export default RD;
        const { createRoot, hydrateRoot, createPortal, flushSync } = RD ?? {};
        export { createRoot, hydrateRoot, createPortal, flushSync };
      `;
      break;
    case "sdk-ui":
      source = `
        const SDK = globalThis.__paperclipPluginBridge__?.sdkUi ?? {};
        const { usePluginData, usePluginAction, useHostContext, usePluginStream, usePluginToast } = SDK;
        export { usePluginData, usePluginAction, useHostContext, usePluginStream, usePluginToast };
      `;
      break;
  }

  const blob = new Blob([source], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  shimBlobUrls[specifier] = url;
  return url;
}

/**
 * Reescribe las importaciones de especificadores desnudos en una cadena fuente de ESM para usar blob URLs.
 *
 * Esto maneja los patrones de importación estándar que emiten esbuild/rollup:
 * - `import { ... } from "react";`
 * - `import React from "react";`
 * - `import * as React from "react";`
 * - `import { ... } from "@paperclipai/plugin-sdk/ui";`
 *
 * También maneja reexportaciones:
 * - `export { ... } from "react";`
 */
function rewriteBareSpecifiers(source: string): string {
  // Build a mapping of bare specifiers to blob URLs.
  const rewrites: Record<string, string> = {
    '"@paperclipai/plugin-sdk/ui"': `"${getShimBlobUrl("sdk-ui")}"`,
    "'@paperclipai/plugin-sdk/ui'": `'${getShimBlobUrl("sdk-ui")}'`,
    '"@paperclipai/plugin-sdk/ui/hooks"': `"${getShimBlobUrl("sdk-ui")}"`,
    "'@paperclipai/plugin-sdk/ui/hooks'": `'${getShimBlobUrl("sdk-ui")}'`,
    '"react/jsx-runtime"': `"${getShimBlobUrl("react/jsx-runtime")}"`,
    "'react/jsx-runtime'": `'${getShimBlobUrl("react/jsx-runtime")}'`,
    '"react-dom/client"': `"${getShimBlobUrl("react-dom/client")}"`,
    "'react-dom/client'": `'${getShimBlobUrl("react-dom/client")}'`,
    '"react-dom"': `"${getShimBlobUrl("react-dom")}"`,
    "'react-dom'": `'${getShimBlobUrl("react-dom")}'`,
    '"react"': `"${getShimBlobUrl("react")}"`,
    "'react'": `'${getShimBlobUrl("react")}'`,
  };

  let result = source;
  for (const [from, to] of Object.entries(rewrites)) {
    // Solo reescribir en contextos de import/export from, no en cadenas arbitrarias.
    // La expresión coincide con patrones `from "..."` o `from '...'`.
    result = result.replaceAll(` from ${from}`, ` from ${to}`);
    // También manejar `import "..."` (importaciones solo por efecto colateral)
    result = result.replaceAll(`import ${from}`, `import ${to}`);
  }

  return result;
}

/**
 * Obtiene, reescribe e importa un módulo de UI de plugin.
 *
 * @param url - La URL del módulo de entrada de UI del plugin
 * @returns Las exportaciones del módulo
 */
async function importPluginModule(url: string): Promise<Record<string, unknown>> {
  // Revisa si el registro del puente está disponible. Si no, recurre a la
  // importación directa (que fallará con especificadores desnudos pero no romperá el cargador).
  if (!globalThis.__paperclipPluginBridge__) {
    console.warn("[plugin-loader] Registro del puente no inicializado, recurriendo a la importación directa");
    return import(/* @vite-ignore */ url);
  }

  // Obtener el texto fuente del módulo
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo obtener el módulo del plugin: ${response.status} ${response.statusText}`);
  }

  const source = await response.text();

  // Reescribir las importaciones de especificadores desnudos a blob URLs
  const rewritten = rewriteBareSpecifiers(source);

  // Crear una blob URL desde la fuente reescrita e importarla
  const blob = new Blob([rewritten], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);

  try {
    const mod = await import(/* @vite-ignore */ blobUrl);
    return mod;
  } finally {
    // Limpiar la blob URL tras la importación (el módulo ya está cargado)
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Importa dinámicamente el módulo de entrada de UI de un plugin y registra todas las
 * exportaciones nombradas que parezcan componentes de React (funciones o clases) en el
 * registro de componentes.
 *
 * Esto reemplaza el enfoque anterior donde los bundles de plugins tenían que
 * autorregistrarse vía `window.paperclipPlugins.registerReactComponent()`.
 * Ahora el host es responsable de importar el módulo y vincular
 * las exportaciones a las claves correctas del registro `pluginKey:exportName`.
 *
 * Los módulos de plugins se cargan con reescritura de especificadores desnudos para que las importaciones
 * de `@paperclipai/plugin-sdk/ui`, `react` y `react-dom` resuelvan a las
 * implementaciones proporcionadas por el host vía el registro del puente.
 *
 * Los registros de web components siguen funcionando: si el módulo tiene una exportación nombrada
 * que coincide con un `exportName` declarado en un slot Y esa exportación es una
 * cadena (el nombre de etiqueta del elemento personalizado), se registra como web component.
 */
async function loadPluginModule(contribution: PluginUiContribution): Promise<void> {
  const { pluginId, pluginKey, slots, launchers } = contribution;
  const moduleKey = buildPluginModuleKey(contribution);

  // Ya cargado o cargando — retorno temprano.
  const state = pluginLoadStates.get(moduleKey);
  if (state === "loaded" || state === "loading") {
    // Si está cargando actualmente, espera la promesa en curso.
    const inflight = inflightImports.get(pluginId);
    if (inflight) await inflight;
    return;
  }

  // Si otra importación de este ID de plugin está en curso, espera a que termine.
  const running = inflightImports.get(pluginId);
  if (running) {
    await running;
    const recheckedState = pluginLoadStates.get(moduleKey);
    if (recheckedState === "loaded") {
      return;
    }
  }

  pluginLoadStates.set(moduleKey, "loading");

  const url = buildPluginUiUrl(contribution);

  const importPromise = (async () => {
    try {
      // Importación dinámica de ESM del módulo de entrada de UI del plugin con
      // reescritura de especificadores desnudos para dependencias provistas por el host.
      const mod: Record<string, unknown> = await importPluginModule(url);

      // Recopila el conjunto de nombres de exportación declarados en todas las contribuciones de UI para
      // solo registrar lo que el manifiesto anuncia (ignora exportaciones extra).
      const declaredExports = new Set<string>();
      for (const slot of slots) {
        declaredExports.add(slot.exportName);
      }
      for (const launcher of launchers) {
        if (launcher.exportName) {
          declaredExports.add(launcher.exportName);
        }
        if (isLauncherComponentTarget(launcher)) {
          declaredExports.add(launcher.action.target);
        }
      }

      for (const exportName of declaredExports) {
        const exported = mod[exportName];
        if (exported === undefined) {
          console.warn(
            `El plugin "${pluginKey}" declara la exportación de slot "${exportName}" pero el módulo no la exporta.`,
          );
          continue;
        }

        if (typeof exported === "function") {
          // Componente de React (componente de función o de clase).
          registerPluginReactComponent(
            pluginKey,
            exportName,
            exported as ComponentType<PluginSlotComponentProps>,
          );
        } else if (typeof exported === "string") {
          // Nombre de etiqueta del web component.
          registerPluginWebComponent(pluginKey, exportName, exported);
        } else {
          console.warn(
            `La exportación "${exportName}" del plugin "${pluginKey}" no es ni función ni cadena de nombre de etiqueta — se omite.`,
          );
        }
      }

      pluginLoadStates.set(moduleKey, "loaded");
    } catch (err) {
      pluginLoadStates.set(moduleKey, "error");
      console.error(`No se pudo cargar el módulo de UI del plugin "${pluginKey}"`, err);
    } finally {
      inflightImports.delete(pluginId);
    }
  })();

  inflightImports.set(pluginId, importPromise);
  await importPromise;
}

function isLauncherComponentTarget(launcher: PluginLauncherDeclaration): boolean {
  return launcher.action.type === "openModal"
    || launcher.action.type === "openDrawer"
    || launcher.action.type === "openPopover";
}

/**
 * Carga los módulos de UI para un conjunto de contribuciones de plugins.
 *
 * Devuelve una promesa que se resuelve cuando todos los módulos se han cargado (o
 * fallado). Los plugins que ya están cargados se omiten.
 */
async function ensurePluginModulesLoaded(contributions: PluginUiContribution[]): Promise<void> {
  await Promise.all(
    contributions.map((c) => loadPluginModule(c)),
  );
}

export async function ensurePluginContributionLoaded(
  contribution: PluginUiContribution,
): Promise<void> {
  await loadPluginModule(contribution);
}

/**
 * Devuelve el estado de carga agregado para un conjunto de contribuciones de plugins.
 * - Si algún plugin sigue cargando → "loading"
 * - Si todos están cargados (o no hay contribuciones) → "loaded"
 * - Si todos terminaron pero algunos fallaron → "loaded" (los errores se registran, no son fatales)
 */
function aggregateLoadState(contributions: PluginUiContribution[]): "loading" | "loaded" {
  for (const c of contributions) {
    const state = pluginLoadStates.get(buildPluginModuleKey(c));
    if (state === "loading" || state === "idle" || state === undefined) {
      return "loading";
    }
  }
  return "loaded";
}

// ---------------------------------------------------------------------------
// Hooks de React
// ---------------------------------------------------------------------------

/**
 * Activa la carga dinámica de módulos de UI de plugins cuando cambian las contribuciones.
 *
 * Este hook está intencionalmente desacoplado de usePluginSlots para que quienes
 * consumen slots vía `usePluginSlots()` obtengan automáticamente la carga de módulos
 * sin cableado extra.
 */
function usePluginModuleLoader(contributions: PluginUiContribution[] | undefined) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!contributions || contributions.length === 0) return;

    // Filtrar las contribuciones que aún no se han cargado.
    const unloaded = contributions.filter((c) => {
      const state = pluginLoadStates.get(buildPluginModuleKey(c));
      return state !== "loaded" && state !== "loading";
    });

    if (unloaded.length === 0) return;

    let cancelled = false;
    void ensurePluginModulesLoaded(unloaded).then(() => {
      // Volver a renderizar para que el montaje del slot pueda resolver los componentes recién registrados.
      if (!cancelled) setTick((t) => t + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [contributions]);
}

/**
 * Resuelve y ordena slots entre todas las contribuciones de plugins listas.
 *
 * Reglas de filtrado:
 * - `slotTypes` debe coincidir con uno de los tipos de slot del host solicitados por quien llama.
 * - Los tipos de slot con alcance de entidad (`detailTab`, `taskDetailView`, `contextMenuItem`)
 *   requieren `entityType` y deben incluirlo en `slot.entityTypes`.
 *
 * Activa automáticamente la importación dinámica de módulos de UI de plugins para cualquier
 * contribución recién descubierta. Los componentes se renderizan cuando termina la carga.
 */
export function usePluginSlots(filters: SlotFilters): UsePluginSlotsResult {
  const queryEnabled = filters.enabled ?? true;
  const { data, isLoading: isQueryLoading, error } = useQuery({
    queryKey: queryKeys.plugins.uiContributions,
    queryFn: () => pluginsApi.listUiContributions(),
    enabled: queryEnabled,
  });

  // Inicia las importaciones dinámicas para cualquier contribución de plugin nueva.
  usePluginModuleLoader(data);

  const slotTypesKey = useMemo(() => [...filters.slotTypes].sort().join("|"), [filters.slotTypes]);

  const slots = useMemo(() => {
    const allowedTypes = new Set(slotTypesKey.split("|").filter(Boolean) as PluginUiSlotType[]);
    const rows: ResolvedPluginSlot[] = [];
    for (const contribution of data ?? []) {
      for (const slot of contribution.slots) {
        if (!allowedTypes.has(slot.type)) continue;
        if (requiresEntityType(slot.type)) {
          if (!filters.entityType) continue;
          if (!slot.entityTypes?.includes(filters.entityType)) continue;
        }
        rows.push({
          ...slot,
          pluginId: contribution.pluginId,
          pluginKey: contribution.pluginKey,
          pluginDisplayName: contribution.displayName,
          pluginVersion: contribution.version,
        });
      }
    }
    rows.sort((a, b) => {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      const pluginCmp = a.pluginDisplayName.localeCompare(b.pluginDisplayName);
      if (pluginCmp !== 0) return pluginCmp;
      return a.displayName.localeCompare(b.displayName);
    });
    return rows;
  }, [data, filters.entityType, slotTypesKey]);

  // Considerar cargando hasta que terminen tanto la consulta como las importaciones de módulos.
  const modulesLoaded = data ? aggregateLoadState(data) === "loaded" : true;
  const isLoading = queryEnabled && (isQueryLoading || !modulesLoaded);

  return {
    slots,
    isLoading,
    errorMessage: error ? getErrorMessage(error) : null,
  };
}

type PluginSlotErrorBoundaryProps = {
  slot: ResolvedPluginSlot;
  className?: string;
  children: ReactNode;
};

type PluginSlotErrorBoundaryState = {
  hasError: boolean;
};

class PluginSlotErrorBoundary extends Component<PluginSlotErrorBoundaryProps, PluginSlotErrorBoundaryState> {
  override state: PluginSlotErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PluginSlotErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Mantiene los fallos de plugins aislados sin perder diagnósticos accionables.
    console.error("Falló el renderizado del slot del plugin", {
      pluginKey: this.props.slot.pluginKey,
      slotId: this.props.slot.id,
      error,
      info: info.componentStack,
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className={cn("rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive", this.props.className)}>
          {this.props.slot.pluginDisplayName}: no se pudo renderizar
        </div>
      );
    }
    return this.props.children;
  }
}

function PluginWebComponentMount({
  tagName,
  slot,
  context,
  className,
}: {
  tagName: string;
  slot: ResolvedPluginSlot;
  context: PluginSlotContext;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Puentea los metadatos de slot/contexto del manifiesto en la instancia del elemento personalizado.
    const el = ref.current as HTMLElement & {
      pluginSlot?: ResolvedPluginSlot;
      pluginContext?: PluginSlotContext;
    };
    el.pluginSlot = slot;
    el.pluginContext = context;
  }, [context, slot]);

  return createElement(tagName, { ref, className });
}

type PluginSlotMountProps = {
  slot: ResolvedPluginSlot;
  context: PluginSlotContext;
  className?: string;
  missingBehavior?: "hidden" | "placeholder";
};

/**
 * Mapea el `PluginSlotContext` del slot a un `PluginHostContext` para el puente.
 *
 * Los hooks del puente necesitan la forma completa del contexto del host; el contexto del slot lleva
 * el subconjunto disponible desde la ubicación de renderizado.
 */
function slotContextToHostContext(
  pluginSlotContext: PluginSlotContext,
  userId: string | null,
): PluginHostContext {
  return {
    companyId: pluginSlotContext.companyId ?? null,
    companyPrefix: pluginSlotContext.companyPrefix ?? null,
    projectId: pluginSlotContext.projectId ?? (pluginSlotContext.entityType === "project" ? pluginSlotContext.entityId ?? null : null),
    entityId: pluginSlotContext.entityId ?? null,
    entityType: pluginSlotContext.entityType ?? null,
    parentEntityId: pluginSlotContext.parentEntityId ?? null,
    userId,
    renderEnvironment: null,
  };
}

/**
 * Componente envoltorio que establece el contexto del puente activo alrededor de los renderizados de plugins.
 *
 * Esto garantiza que `usePluginData()`, `usePluginAction()` y `useHostContext()`
 * tengan acceso al ID del plugin actual y al contexto del host durante la fase de renderizado.
 */
function PluginBridgeScope({
  pluginId,
  context,
  children,
}: {
  pluginId: string;
  context: PluginSlotContext;
  children: ReactNode;
}) {
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const userId = session?.user?.id ?? session?.session?.userId ?? null;
  const hostContext = useMemo(() => slotContextToHostContext(context, userId), [context, userId]);
  const value = useMemo(() => ({ pluginId, hostContext }), [pluginId, hostContext]);

  return (
    <PluginBridgeContext.Provider value={value}>
      {children}
    </PluginBridgeContext.Provider>
  );
}

export function PluginSlotMount({
  slot,
  context,
  className,
  missingBehavior = "hidden",
}: PluginSlotMountProps) {
  const [, forceRerender] = useState(0);
  const component = resolveRegisteredComponent(slot);

  useEffect(() => {
    if (component) return;
    const inflight = inflightImports.get(slot.pluginId);
    if (!inflight) return;

    let cancelled = false;
    void inflight.finally(() => {
      if (!cancelled) {
        forceRerender((tick) => tick + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [component, slot.pluginId]);

  if (!component) {
    if (missingBehavior === "hidden") return null;
    return (
      <div className={cn("rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground", className)}>
        {slot.pluginDisplayName}: {slot.displayName}
      </div>
    );
  }

  if (component.kind === "react") {
    const node = createElement(component.component, { slot, context });
    return (
      <PluginSlotErrorBoundary slot={slot} className={className}>
        <PluginBridgeScope pluginId={slot.pluginId} context={context}>
          {className ? <div className={className}>{node}</div> : node}
        </PluginBridgeScope>
      </PluginSlotErrorBoundary>
    );
  }

  return (
    <PluginSlotErrorBoundary slot={slot} className={className}>
      <PluginWebComponentMount
        tagName={component.tagName}
        slot={slot}
        context={context}
        className={className}
      />
    </PluginSlotErrorBoundary>
  );
}

type PluginSlotOutletProps = {
  slotTypes: PluginUiSlotType[];
  context: PluginSlotContext;
  entityType?: PluginUiSlotEntityType | null;
  className?: string;
  itemClassName?: string;
  errorClassName?: string;
  missingBehavior?: "hidden" | "placeholder";
};

export function PluginSlotOutlet({
  slotTypes,
  context,
  entityType,
  className,
  itemClassName,
  errorClassName,
  missingBehavior = "hidden",
}: PluginSlotOutletProps) {
  const { slots, errorMessage } = usePluginSlots({
    slotTypes,
    entityType,
    companyId: context.companyId,
  });

  if (errorMessage) {
    return (
      <div className={cn("rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive", errorClassName)}>
        Extensiones de plugins no disponibles: {errorMessage}
      </div>
    );
  }

  if (slots.length === 0) return null;

  return (
    <div className={className}>
      {slots.map((slot) => (
        <PluginSlotMount
          key={`${slot.pluginKey}:${slot.id}`}
          slot={slot}
          context={context}
          className={itemClassName}
          missingBehavior={missingBehavior}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilidades de pruebas — exportadas solo para uso en suites de pruebas.
// ---------------------------------------------------------------------------

/**
 * Reinicia el estado del cargador de módulos. Usar solo en pruebas.
 * @internal
 */
export function _resetPluginModuleLoader(): void {
  pluginLoadStates.clear();
  inflightImports.clear();
  registry.clear();
  if (typeof URL.revokeObjectURL === "function") {
    for (const url of Object.values(shimBlobUrls)) {
      URL.revokeObjectURL(url);
    }
  }
  for (const key of Object.keys(shimBlobUrls)) {
    delete shimBlobUrls[key];
  }
}

export const _applyJsxRuntimeKeyForTests = applyJsxRuntimeKey;
export const _rewriteBareSpecifiersForTests = rewriteBareSpecifiers;
