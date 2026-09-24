---
name: paperclip-create-plugin
description: >
  Create new Paperclip plugins with the current alpha SDK/runtime. Use when
  scaffolding a plugin package, adding a new example plugin, or updating plugin
  authoring docs. Covers the supported worker/UI surface, route conventions,
  scaffold flow, and verification steps.
---

# Crear un plugin de Paperclip

Usa esta habilidad cuando la tarea sea crear, generar el scaffold o documentar un plugin de Paperclip.

## 1. Reglas básicas

Lee estos primero cuando lo necesites:

1. `doc/plugins/PLUGIN_AUTHORING_GUIDE.md`
2. `packages/plugins/sdk/README.md`
3. `doc/plugins/PLUGIN_SPEC.md` solo para contexto futuro

Suposiciones del runtime actual:

- los workers de plugins son código de confianza
- la UI del plugin es código de host confiable del mismo origen
- las APIs de workers están limitadas por capacidades
- la UI del plugin no está aislada por capacidades del manifiesto
- aún no hay un kit compartido de componentes UI de plugin provisto por el host
- `ctx.assets` no está soportado en el runtime actual

## 2. Flujo de trabajo preferido

Usa el paquete scaffold en lugar de escribir el boilerplate a mano:

```bash
pnpm --filter @paperclipai/create-paperclip-plugin build
node packages/plugins/create-paperclip-plugin/dist/index.js <npm-package-name> --output <target-dir>
```

Para un plugin que vive fuera del repositorio de Paperclip, pasa `--sdk-path` y deja que el scaffold copie el SDK/paquetes compartidos locales en `.paperclip-sdk/`:

```bash
pnpm --filter @paperclipai/create-paperclip-plugin build
node packages/plugins/create-paperclip-plugin/dist/index.js @acme/plugin-name \
  --output /absolute/path/to/plugin-repos \
  --sdk-path /absolute/path/to/paperclip/packages/plugins/sdk
```

Destino recomendado dentro de este repositorio:

- `packages/plugins/examples/` para plugins de ejemplo
- otra carpeta `packages/plugins/<name>/` si se está convirtiendo en un paquete real

## 3. Después del scaffold

Revisa y ajusta:

- `src/manifest.ts`
- `src/worker.ts`
- `src/ui/index.tsx`
- `tests/plugin.spec.ts`
- `package.json`

Asegúrate de que el plugin:

- declare solo capacidades soportadas
- no use `ctx.assets`
- no importe stubs de componentes UI del host
- mantenga la UI autocontenida
- use `routePath` solo en slots de `page`
- se instale en Paperclip desde una ruta local absoluta durante el desarrollo

## 4. Si el plugin debe aparecer en la app

Para el comportamiento de ejemplo incluido/descubrible, actualiza el cableado del host relevante:

- lista de ejemplos incluidos en `server/src/routes/plugins.ts`
- cualquier documento que liste ejemplos del repositorio

Haz esto solo si el usuario quiere que el plugin aparezca como un ejemplo incluido.

## 5. Verificación

Ejecuta siempre:

```bash
pnpm --filter <plugin-package> typecheck
pnpm --filter <plugin-package> test
pnpm --filter <plugin-package> build
```

Si también cambiaste código del SDK/host/runtime de plugins, ejecuta también verificaciones más amplias del repositorio según corresponda.

## 6. Expectativas de la documentación

Al crear o actualizar documentos del plugin:

- distingue la implementación actual de las ideas futuras de la especificación
- sé explícito sobre el modelo de código de confianza
- no prometas componentes UI del host ni APIs de assets
- prefiere guía de despliegue como paquete npm sobre flujos locales del repositorio para producción
