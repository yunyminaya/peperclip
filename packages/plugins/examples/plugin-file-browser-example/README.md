# Plugin de ejemplo de explorador de archivos

Plugin de Paperclip de ejemplo que demuestra:

- **projectSidebarItem** — Un enlace opcional "Files" bajo cada proyecto en la barra lateral que abre el detalle del proyecto con la pestaña de este plugin seleccionada. Esto se controla con los ajustes del plugin y viene desactivado por defecto.
- **detailTab** (entityType project) — Una pestaña de detalle del proyecto con un selector de ruta del workspace, un diseño de escritorio de dos columnas (árbol de archivos a la izquierda, editor a la derecha) y un flujo móvil de un solo panel con botón de volver del editor al árbol de archivos, incluyendo soporte de guardado.

Este es un plugin de ejemplo local del repositorio para desarrollo. No debe suponerse que se incluye en una compilación genérica de producción a menos que esté explícitamente incluido.

## Slots

| Slot                | Tipo                | Descripción                                      |
|---------------------|---------------------|--------------------------------------------------|
| Archivos (barra lateral)     | `projectSidebarItem`| Enlace opcional bajo cada proyecto → detalle del proyecto + pestaña. |
| Archivos (pestaña)         | `detailTab`         | Diseño responsive árbol/editor con soporte de guardado.|

## Ajustes

- `Show Files in Sidebar` — activa o desactiva el enlace de la barra lateral del proyecto. Viene desactivado por defecto.
- `Comment File Links` — controla si se muestran las anotaciones de comentarios y la acción del menú contextual de comentarios.

## Capacidades

- `ui.sidebar.register` — elemento de la barra lateral del proyecto
- `ui.detailTab.register` — pestaña de detalle del proyecto
- `projects.read` — resolver proyecto
- `project.workspaces.read` — listar workspaces y leer rutas para el acceso a archivos

## Worker

- **getData `workspaces`** — `ctx.projects.listWorkspaces(projectId, companyId)` (ordenados, el principal primero).
- **getData `fileList`** — `{ projectId, workspaceId, directoryPath? }` → lista las entradas del directorio para la raíz del workspace o un subdirectorio (`fs` de Node).
- **getData `fileContent`** — `{ projectId, workspaceId, filePath }` → lee el contenido del archivo usando rutas relativas al workspace (`fs` de Node).
- **performAction `writeFile`** — `{ projectId, workspaceId, filePath, content }` → escribe el búfer actual del editor de vuelta al disco.

## Instalación local (desarrollo)

Desde la raíz del repositorio, compila el plugin e instálalo por ruta local:

```bash
pnpm --filter @paperclipai/plugin-file-browser-example build
pnpm paperclipai plugin install ./packages/plugins/examples/plugin-file-browser-example
```

Para desinstalar:

```bash
pnpm paperclipai plugin uninstall paperclip-file-browser-example --force
```

**Notas de desarrollo local:**

- **Compila primero.** El host resuelve el worker desde el manifiesto `entrypoints.worker` (p. ej. `./dist/worker.js`). Ejecuta `pnpm build` en el directorio del plugin antes de instalar para que el archivo del worker exista.
- **Ruta de instalación solo para desarrollo.** Este flujo de instalación por ruta local supone que esta copia del monorepositorio está presente en el disco. Para instalaciones desplegadas, publica un paquete npm en lugar de depender de que `packages/plugins/examples/...` exista en el host.
- **Reinstala después de actualizar.** Si instalaste un plugin por ruta local antes de que el servidor almacenara `package_path`, el plugin puede mostrar el estado **error** (worker no encontrado). Desinstala e instala de nuevo para que el servidor conserve la ruta y pueda activar el plugin.
- Opcional: usa `paperclip-plugin-dev-server` para la recarga en caliente de la UI con `devUiUrl` en la configuración del plugin.

## Estructura

- `src/manifest.ts` — manifiesto con `projectSidebarItem` y `detailTab` (entityTypes `["project"]`).
- `src/worker.ts` — manejadores de datos para workspaces, lista de archivos, contenido de archivos.
- `src/ui/index.tsx` — `FilesLink` (barra lateral) y `FilesTab` (selector de ruta del workspace + árbol de archivos/editor de dos paneles).
