# Publicar en npm

Referencia de bajo nivel sobre cómo se preparan y publican los paquetes de Paperclip en npm.

Para el flujo de trabajo del mantenedor, usa [doc/RELEASING.md](RELEASING.md). Este documento se enfoca en los internos del empaquetado.

## Puntos de entrada de versión actuales

Usa estos scripts:

- [`scripts/release.sh`](../scripts/release.sh) para flujos de publicación canary y stable
- [`scripts/create-github-release.sh`](../scripts/create-github-release.sh) después de pushear un tag estable
- [`scripts/rollback-latest.sh`](../scripts/rollback-latest.sh) para reapuntalar `latest`
- [`scripts/build-npm.sh`](../scripts/build-npm.sh) para el build de empaquetado del CLI

Paperclip ya no usa ramas de versión ni Changesets para publicar.

## Por qué el CLI necesita empaquetado especial

El paquete CLI, `paperclipai`, importa código de paquetes del workspace como:

- `@paperclipai/server`
- `@paperclipai/db`
- `@paperclipai/shared`
- paquetes de adaptadores bajo `packages/adapters/`

Esas referencias del workspace son válidas en desarrollo pero no en un paquete npm publicable. El flujo de versión reescribe versiones temporalmente, luego construye un bundle CLI publicable.

## `build-npm.sh`

Ejecuta:

```bash
./scripts/build-npm.sh
```

Este script:

1. ejecuta el chequeo de tokens prohibidos a menos que se pase `--skip-checks`
2. ejecuta `pnpm -r typecheck`
3. empaqueta el entrypoint del CLI con esbuild en `cli/dist/index.js`
4. verifica el entrypoint empaquetado con `node --check`
5. reescribe `cli/package.json` en un manifiesto npm publicable y guarda la copia de dev como `cli/package.dev.json`
6. copia el `README.md` del repo en `cli/README.md` para metadatos de npm

Después de que el script de versión termina, el manifiesto de dev y los archivos temporales se restauran automáticamente.

## Descubrimiento de paquetes y versionado

Los paquetes públicos se descubren desde:

- `packages/`
- `server/`
- `ui/`
- `cli/`

El paso de reescritura de versión ahora usa [`scripts/release-package-map.mjs`](../scripts/release-package-map.mjs), que:

- encuentra todos los paquetes públicos
- los ordena topológicamente por dependencias internas
- reescribe la versión de cada paquete a la versión de versión objetivo
- reescribe las referencias internas de dependencias `workspace:*` a la versión objetivo exacta
- actualiza la cadena de versión mostrada del CLI

Esas reescrituras son temporales. El working tree se restaura después de publicar o del dry-run.

## Empaquetado de `@paperclipai/ui`

El paquete UI publica assets estáticos preconstruidos, no el workspace fuente.

El paquete `ui` usa [`scripts/generate-ui-package-json.mjs`](../scripts/generate-ui-package-json.mjs) durante `prepack` para cambiar a un manifiesto de publicación ligero que:

- mantiene el `name` y la `version` gestionados por la versión
- publica solo `dist/`
- omite el grafo de dependencias solo de fuente de las instalaciones downstream

Después de empaquetar o publicar, `postpack` restaura automáticamente el manifiesto de desarrollo.

## Formatos de versión

Paperclip usa versiones de calendario:

- estable: `YYYY.MDD.P`
- canary: `YYYY.MDD.P-canary.N`

Ejemplos:

- estable: `2026.318.0`
- canary: `2026.318.1-canary.2`

## Modelo de publicación

### Canary

Los canaries se publican bajo el dist-tag de npm `canary`.

Ejemplo:

- `paperclipai@2026.318.1-canary.2`

Esto mantiene sin cambios la ruta de instalación por defecto mientras permite instalaciones explícitas con:

```bash
npx paperclipai@canary onboard
```

### Estable

Las publicaciones estables usan el dist-tag de npm `latest`.

Ejemplo:

- `paperclipai@2026.318.0`

Las publicaciones estables no crean un commit de versión. En su lugar:

- las versiones de paquetes se reescriben temporalmente
- los paquetes se publican desde el commit fuente elegido
- el tag de git `vYYYY.MDD.P` apunta a ese commit original

## Publicación confiable (trusted publishing)

El modelo de CI previsto es publicación confiable de npm a través de GitHub OIDC.

Eso significa:

- sin `NPM_TOKEN` de larga duración en secretos del repositorio
- GitHub Actions obtiene credenciales de publicación de corta duración
- las reglas de publicador confiable se configuran por archivo de workflow

Consulta [doc/RELEASE-AUTOMATION-SETUP.md](RELEASE-AUTOMATION-SETUP.md) para los pasos de configuración de GitHub/npm.

## Modelo de reversión

La reversión no despublica nada.

Reapunta el dist-tag `latest` a una versión estable anterior:

```bash
./scripts/rollback-latest.sh 2026.318.0
```

Esta es la forma más rápida de restaurar la ruta de instalación por defecto si una versión estable es mala.

## Archivos relacionados

- [`scripts/build-npm.sh`](../scripts/build-npm.sh)
- [`scripts/generate-npm-package-json.mjs`](../scripts/generate-npm-package-json.mjs)
- [`scripts/generate-ui-package-json.mjs`](../scripts/generate-ui-package-json.mjs)
- [`scripts/release-package-map.mjs`](../scripts/release-package-map.mjs)
- [`cli/esbuild.config.mjs`](../cli/esbuild.config.mjs)
- [`doc/RELEASING.md`](RELEASING.md)
