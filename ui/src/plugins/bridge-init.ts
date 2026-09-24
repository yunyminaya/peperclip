/**
 * Inicialización del puente de plugins.
 *
 * Registra las instancias de React del host y las implementaciones de hooks
 * del puente en un objeto global para que el cargador de módulos de plugins
 * pueda inyectarlas en los bundles de UI de plugins al cargarlos.
 *
 * Llama a `initPluginBridge()` una vez durante el arranque de la app (en `main.tsx`), antes
 * de que se cargue cualquier módulo de UI de plugins.
 *
 * @see PLUGIN_SPEC.md §19.0.1 — Plugin UI SDK
 * @see PLUGIN_SPEC.md §19.0.2 — Bundle Isolation
 */

import {
  usePluginData,
  usePluginAction,
  useHostContext,
  usePluginStream,
  usePluginToast,
} from "./bridge.js";

// ---------------------------------------------------------------------------
// Registro global del puente
// ---------------------------------------------------------------------------

/**
 * La forma del registro global del puente.
 *
 * Se coloca en `globalThis.__paperclipPluginBridge__` y el cargador de módulos
 * de plugins lo consume para proporcionar implementaciones de las importaciones externas.
 */
export interface PluginBridgeRegistry {
  react: unknown;
  reactDom: unknown;
  sdkUi: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __paperclipPluginBridge__: PluginBridgeRegistry | undefined;
}

/**
 * Inicializa el registro global del puente de plugins.
 *
 * Registra las implementaciones de React, ReactDOM y el puente de UI del SDK
 * del host en `globalThis.__paperclipPluginBridge__` para que el cargador de módulos
 * de plugins pueda proporcionárselas a los bundles de plugins.
 *
 * @param react - El módulo React del host
 * @param reactDom - El módulo ReactDOM del host
 */
export function initPluginBridge(
  react: typeof import("react"),
  reactDom: typeof import("react-dom"),
): void {
  globalThis.__paperclipPluginBridge__ = {
    react,
    reactDom,
    sdkUi: {
      usePluginData,
      usePluginAction,
      useHostContext,
      usePluginStream,
      usePluginToast,
    },
  };
}
