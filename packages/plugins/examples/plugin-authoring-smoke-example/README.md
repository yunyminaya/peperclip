# Ejemplo de humo de autoría de plugins

Un plugin de Paperclip

## Desarrollo

```bash
pnpm install
pnpm dev            # observa las compilaciones
pnpm dev:ui         # servidor de desarrollo local con eventos de recarga en caliente
pnpm test
```

## Instalar en Paperclip

```bash
pnpm paperclipai plugin install ./
```

## Opciones de compilación

- `pnpm build` usa los presets de esbuild de `@paperclipai/plugin-sdk/bundlers`.
- `pnpm build:rollup` usa los presets de rollup del mismo SDK.
