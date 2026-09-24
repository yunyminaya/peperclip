import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclipai.plugin-authoring-smoke-example",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Ejemplo de prueba de humo de autor\u00eda de plugin",
  description: "Un plugin de Paperclip",
  author: "Autor del plugin",
  categories: ["connector"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "health-widget",
        displayName: "Salud del ejemplo de prueba de humo de autor\u00eda de plugin",
        exportName: "DashboardWidget"
      }
    ]
  }
};

export default manifest;
