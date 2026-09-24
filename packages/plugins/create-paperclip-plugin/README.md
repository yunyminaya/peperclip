# @paperclipai/create-paperclip-plugin

Herramienta de andamiaje para crear nuevos plugins de Paperclip.

```bash
npx @paperclipai/create-paperclip-plugin my-plugin
```

O con opciones:

```bash
npx @paperclipai/create-paperclip-plugin @acme/my-plugin \
  --template connector \
  --category connector \
  --display-name "Acme Connector" \
  --description "Syncs Acme data into Paperclip" \
  --author "Acme Inc"
```

Plantillas admitidas: `default`, `connector`, `workspace`  
Categorías admitidas: `connector`, `workspace`, `automation`, `ui`

Genera:
- manifiesto tipado + punto de entrada del worker
- widget de UI de ejemplo que usa los hooks admitidos de `@paperclipai/plugin-sdk/ui`
- archivo de prueba que usa `@paperclipai/plugin-sdk/testing`
- archivos de configuración de `esbuild` y `rollup` que usan los presets del empaquetador del SDK
- script de servidor de desarrollo para recarga en caliente (`paperclip-plugin-dev-server`)

El andamiaje usa intencionalmente elementos React simples en lugar de componentes del kit de UI proporcionado por el host, porque el runtime actual de plugins aún no incluye una biblioteca estable de componentes compartidos.

Dentro de este repositorio, el paquete generado usa `@paperclipai/plugin-sdk` mediante `workspace:*`.

Fuera de este repositorio, el andamiaje toma una instantánea de `@paperclipai/plugin-sdk` de tu copia local de Paperclip en un tarball `.paperclip-sdk/` y apunta el paquete generado a ese archivo local por defecto. Puedes sobrescribir el origen del SDK explícitamente:

```bash
node packages/plugins/create-paperclip-plugin/dist/index.js @acme/my-plugin \
  --output /absolute/path/to/plugins \
  --sdk-path /absolute/path/to/paperclip/packages/plugins/sdk
```

Eso te da una ruta de desarrollo local fuera del repositorio antes de que el SDK se publique en npm.

## Flujo de trabajo después del andamiaje

```bash
cd my-plugin
pnpm install
pnpm dev       # observa los paquetes de worker + manifiesto + ui
pnpm dev:ui    # servidor local de vista previa de UI con eventos de recarga en caliente
pnpm test
```
