import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip-file-browser-example";
const FILES_SIDEBAR_SLOT_ID = "files-link";
const FILES_TAB_SLOT_ID = "files-tab";
const COMMENT_FILE_LINKS_SLOT_ID = "comment-file-links";
const COMMENT_OPEN_FILES_SLOT_ID = "comment-open-files";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.2.0",
  displayName: "Explorador de archivos (Ejemplo)",
  description: "Plugin de ejemplo que agrega un enlace Archivos bajo cada proyecto en la barra lateral, una pesta\u00f1a de explorador de archivos + editor en la p\u00e1gina de detalle del proyecto, y anotaciones de enlaces de archivo por comentario con una acci\u00f3n de men\u00fa contextual para abrir los archivos referenciados.",
  author: "Paperclip",
  categories: ["workspace", "ui"],
  capabilities: [
    "ui.sidebar.register",
    "ui.detailTab.register",
    "ui.commentAnnotation.register",
    "ui.action.register",
    "projects.read",
    "project.workspaces.read",
    "issue.comments.read",
    "plugin.state.read",
  ],
  instanceConfigSchema: {
    type: "object",
    properties: {
      showFilesInSidebar: {
        type: "boolean",
        title: "Mostrar archivos en la barra lateral",
        default: false,
        description: "Agrega el enlace Archivos bajo cada proyecto en la barra lateral.",
      },
      commentAnnotationMode: {
        type: "string",
        title: "Enlaces de archivo en comentarios",
        enum: ["annotation", "contextMenu", "both", "none"],
        default: "both",
        description: "Controla qu\u00e9 extensiones de comentario est\u00e1n activas: 'annotation' muestra enlaces de archivo debajo de cada comentario, 'contextMenu' agrega una acci\u00f3n \"Abrir en archivos\" al men\u00fa del comentario, 'both' habilita ambas, 'none' deshabilita las funciones de comentario.",
      },
    },
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "projectSidebarItem",
        id: FILES_SIDEBAR_SLOT_ID,
        displayName: "Archivos",
        exportName: "FilesLink",
        entityTypes: ["project"],
        order: 10,
      },
      {
        type: "detailTab",
        id: FILES_TAB_SLOT_ID,
        displayName: "Archivos",
        exportName: "FilesTab",
        entityTypes: ["project"],
        order: 10,
      },
      {
        type: "commentAnnotation",
        id: COMMENT_FILE_LINKS_SLOT_ID,
        displayName: "Enlaces de archivo",
        exportName: "CommentFileLinks",
        entityTypes: ["comment"],
      },
      {
        type: "commentContextMenuItem",
        id: COMMENT_OPEN_FILES_SLOT_ID,
        displayName: "Abrir en archivos",
        exportName: "CommentOpenFiles",
        entityTypes: ["comment"],
      },
    ],
  },
};

export default manifest;
