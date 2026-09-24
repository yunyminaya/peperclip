# @paperclipai/plugin-hello-world-example

Plugin de referencia propio que muestra la extensión de UI más pequeña posible.

## Qué demuestra

- un manifiesto con un slot de UI `dashboardWidget`
- cableado de `entrypoints.ui` para los paquetes de UI del plugin
- un widget React mínimo mostrado en el panel de Paperclip
- lectura del contexto del host (`companyId`) desde `PluginWidgetProps`
- hooks de ciclo de vida del worker (`setup`, `onHealth`) para observabilidad básica del runtime

## Superficie de API

- Este ejemplo no agrega endpoints HTTP personalizados.
- El widget se descubre/muestra a través de las APIs de plugins gestionadas por el host (por ejemplo `GET /api/plugins/ui-contributions`).

## Notas

Es intencionalmente simple y está diseñado como el punto de partida "hello world" más rápido para autores de plugins de UI.
Es un plugin de ejemplo local del repositorio para desarrollo, no un plugin que deba suponerse que se incluye en compilaciones genéricas de producción.

## Instalación local (desarrollo)

Desde la raíz del repositorio, compila el plugin e instálalo por ruta local:

```bash
pnpm --filter @paperclipai/plugin-hello-world-example build
pnpm paperclipai plugin install ./packages/plugins/examples/plugin-hello-world-example
```

**Notas de desarrollo local:**

- **Compila primero.** El host resuelve el worker desde el manifiesto `entrypoints.worker` (p. ej. `./dist/worker.js`). Ejecuta `pnpm build` en el directorio del plugin antes de instalar para que el archivo del worker exista.
- **Ruta de instalación solo para desarrollo.** Este flujo de instalación por ruta local supone una copia de código fuente con este paquete de ejemplo presente en el disco. Para instalaciones desplegadas, publica un paquete npm en lugar de depender de la ruta del ejemplo del monorepositorio.
- **Reinstala después de actualizar.** Si instalaste un plugin por ruta local antes de que el servidor almacenara `package_path`, el plugin puede mostrar el estado **error** (worker no encontrado). Desinstala e instala de nuevo para que el servidor conserve la ruta y pueda activar el plugin:  
  `pnpm paperclipai plugin uninstall paperclip.hello-world-example --force` luego  
  `pnpm paperclipai plugin install ./packages/plugins/examples/plugin-hello-world-example`.
