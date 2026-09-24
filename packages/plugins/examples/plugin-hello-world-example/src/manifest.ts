import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

/**
 * ID de plugin estable usado por el registro del host y el espacio de nombres.
 */
const PLUGIN_ID = "paperclip.hello-world-example";
const PLUGIN_VERSION = "0.1.0";
const DASHBOARD_WIDGET_SLOT_ID = "hello-world-dashboard-widget";
const DASHBOARD_WIDGET_EXPORT_NAME = "HelloWorldDashboardWidget";

/**
 * Manifiesto mínimo que demuestra un plugin solo de interfaz con una ranura de widget de panel.
 */
const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Widget Hola Mundo (Ejemplo)",
  description: "Plugin de interfaz de referencia que agrega un widget simple de Hola Mundo al panel de Paperclip.",
  author: "Paperclip",
  categories: ["ui"],
  capabilities: ["ui.dashboardWidget.register"],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: DASHBOARD_WIDGET_SLOT_ID,
        displayName: "Hola Mundo",
        exportName: DASHBOARD_WIDGET_EXPORT_NAME,
      },
    ],
  },
};

export default manifest;
