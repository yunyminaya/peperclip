# Guía de creación de plugins

Esta guía describe la forma actual e implementada de crear un plugin de Paperclip en este repo.

Es intencionalmente más estrecha que [PLUGIN_SPEC.md](./PLUGIN_SPEC.md). La especificación incluye ideas futuras; esta guía solo cubre la superficie alfa que existe ahora.

## Realidad actual

- Trata los workers y la UI de los plugins como código confiable.
- La UI del plugin corre como JavaScript del mismo origen dentro de la app principal de Paperclip.
- Las API del host del lado del worker están controladas por capacidades.
- La UI del plugin no está aislada por las capacidades del manifiesto.
- Aún no hay un kit compartido de componentes React provisto por el host para plugins.
- `ctx.assets` no está admitido en el runtime actual.

## Armar un plugin

Usa el paquete de scaffold:

```bash
pnpm --filter @paperclipai/create-paperclip-plugin build
node packages/plugins/create-paperclip-plugin/dist/index.js @yourscope/plugin-name --output ./packages/plugins/examples
```

Para un plugin que vive fuera del repo de Paperclip:

```bash
pnpm --filter @paperclipai/create-paperclip-plugin build
node packages/plugins/create-paperclip-plugin/dist/index.js @yourscope/plugin-name \
  --output /absolute/path/to/plugin-repos \
  --sdk-path /absolute/path/to/paperclip/packages/plugins/sdk
```

Eso crea un paquete con:

- `src/manifest.ts`
- `src/worker.ts`
- `src/ui/index.tsx`
- `tests/plugin.spec.ts`
- `esbuild.config.mjs`
- `rollup.config.mjs`

Dentro de este monorepo, el scaffold usa `workspace:*` para `@paperclipai/plugin-sdk`.

Fuera de este monorepo, el scaffold toma una instantánea de `@paperclipai/plugin-sdk` desde el checkout local de Paperclip en un tarball `.paperclip-sdk/` para que puedas construir y probar un plugin sin publicar nada a npm primero.

## Flujo de trabajo local recomendado

Desde la carpeta del plugin generado:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Para desarrollo local, instálalo en Paperclip desde una ruta local absoluta a través del gestor de plugins o la API. El servidor admite instalaciones desde el sistema de archivos local y observa los plugins de rutas locales por cambios de archivos para que los reinicios del worker ocurran automáticamente después de las reconstrucciones.

Ejemplo:

```bash
curl -X POST http://127.0.0.1:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName":"/absolute/path/to/your-plugin","isLocalPath":true}'
```

## Superficie alfa admitida

Worker:

- config
- events
- jobs
- launchers
- http
- secrets
- activity
- state
- entities
- projects and project workspaces
- companies
- issues and comments
- agents and agent sessions
- goals
- data/actions
- streams
- tools
- metrics
- logger

UI:

- `usePluginData`
- `usePluginAction`
- `usePluginStream`
- `usePluginToast`
- `useHostContext`
- props de slots tipados desde `@paperclipai/plugin-sdk/ui`

Las superficies de montaje actualmente cableadas en el host incluyen:

- `page`
- `settingsPage`
- `dashboardWidget`
- `sidebar`
- `sidebarPanel`
- `detailTab`
- `taskDetailView`
- `projectSidebarItem`
- `globalToolbarButton`
- `toolbarButton`
- `contextMenuItem`
- `commentAnnotation`
- `commentContextMenuItem`

## Rutas de empresa

Los plugins pueden declarar un slot `page` con `routePath` para tener una ruta de empresa como:

```text
/:companyPrefix/<routePath>
```

Reglas:

- `routePath` debe ser un solo slug en minúsculas
- no puede colisionar con rutas reservadas del host
- no puede duplicar la ruta de página de otro plugin instalado

## Guía de publicación

- Usa paquetes npm como artefacto de despliegue.
- Trata las instalaciones de ejemplo locales al repo solo como flujo de desarrollo.
- Prefiere mantener la UI del plugin autocontenida dentro del paquete.
- No dependas de componentes del sistema de diseño del host ni de internas no documentadas de la app.
- Las instalaciones desde repositorios de GitHub no son un flujo de primera clase hoy. Para desarrollo local, usa una ruta local con checkout. Para producción, publica a npm o a un registro compatible con npm privado.

## Verificación antes de entregar

Como mínimo:

```bash
pnpm --filter <your-plugin-package> typecheck
pnpm --filter <your-plugin-package> test
pnpm --filter <your-plugin-package> build
```

Si también cambiaste la integración del host, ejecuta además:

```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```
