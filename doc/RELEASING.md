# Versionar Paperclip

Manual del mantenedor para lanzar Paperclip en npm, GitHub y la superficie de changelog visible en el sitio web.

El modelo de versión ahora es dirigido por commits:

1. Cada push a `master` publica un canary automáticamente.
2. Las versiones estables se promueven manualmente desde un commit elegido probado o tag canary.
3. Las notas de versión estable viven en `releases/vYYYY.MDD.P.md`.
4. Solo las versiones estables obtienen GitHub Releases.

## Modelo de versionado

Paperclip usa versiones de calendario que aún encajan en sintaxis semver:

- estable: `YYYY.MDD.P`
- canary: `YYYY.MDD.P-canary.N`

Ejemplos:

- primera estable el 18 de marzo de 2026: `2026.318.0`
- segunda estable el 18 de marzo de 2026: `2026.318.1`
- cuarto canary para la línea `2026.318.1`: `2026.318.1-canary.3`

Restricciones importantes:

- el segmento numérico del medio es `MDD`, donde `M` es el mes UTC y `DD` es el día UTC con cero a la izquierda
- usa `2026.303.0` para el 3 de marzo, no `2026.33.0`
- no uses ceros a la izquierda como `2026.0318.0`
- no uses cuatro segmentos numéricos como `2026.3.18.1`
- la forma canary segura para semver es `2026.318.0-canary.1`

## Superficies de versión

Cada versión estable tiene cuatro superficies separadas:

1. **Verificación** — el SHA de git exacto pasa typecheck, pruebas y build
2. **npm** — `paperclipai` y los paquetes públicos del workspace se publican
3. **GitHub** — la versión estable obtiene un tag de git y un GitHub Release
4. **Sitio web / anuncios** — el changelog estable se publica externamente y se anuncia

Una versión estable está terminada solo cuando las cuatro superficies están atendidas.

Los canaries solo cubren las primeras dos superficies más un tag de trazabilidad interno.

## Invariantes centrales

- los canaries se publican desde `master`
- las estables se publican desde un ref fuente elegido explícitamente
- los tags apuntan al commit fuente original, no a un commit de versión generado
- las notas estables siempre son `releases/vYYYY.MDD.P.md`
- los canaries nunca crean GitHub Releases
- los canaries nunca requieren generación de changelog

## TL;DR

### Canary

Cada push a `master` ejecuta la ruta canary dentro de [`.github/workflows/release.yml`](../.github/workflows/release.yml).

Hace:

- verifica el commit pusheado
- calcula la versión canary para la fecha UTC actual
- publica bajo el dist-tag de npm `canary`
- crea un tag de git `canary/vYYYY.MDD.P-canary.N`

Los usuarios instalan canaries con:

```bash
npx paperclipai@canary onboard
# o
npx paperclipai@canary onboard --data-dir "$(mktemp -d /tmp/paperclip-canary.XXXXXX)"
```

### Estable

Usa [`.github/workflows/release.yml`](../.github/workflows/release.yml) desde la pestaña Actions con las entradas manuales de `workflow_dispatch`.

[Ejecuta la acción aquí](https://github.com/paperclipai/paperclip/actions/workflows/release.yml)

Entradas:

- `source_ref`
  - SHA de commit, rama o tag
- `stable_date`
  - override opcional de fecha UTC en `YYYY-MM-DD`
  - ingresa una fecha como `2026-03-18`, no una versión como `2026.318.0`
- `dry_run`
  - solo vista previa cuando es verdadero

Antes de ejecutar la estable:

1. elige el commit o tag canary en el que confíes
2. resuelve la versión estable objetivo con `./scripts/release.sh stable --date "$(date +%F)" --print-version`
3. crea o actualiza `releases/vYYYY.MDD.P.md` en ese ref fuente
4. ejecuta el workflow estable desde ese ref fuente

Ejemplo:

- `source_ref`: `master`
- `stable_date`: `2026-03-18`
- versión estable resultante: `2026.318.0`

El workflow:

- re-verifica el ref fuente exacto
- calcula el siguiente segmento de parche estable para la fecha UTC elegida
- publica `YYYY.MDD.P` bajo el dist-tag de npm `latest`
- crea el tag de git `vYYYY.MDD.P`
- crea o actualiza el GitHub Release desde `releases/vYYYY.MDD.P.md`

## Comandos locales

### Vista previa de un canary en local

```bash
./scripts/release.sh canary --dry-run
```

### Vista previa de una estable en local

```bash
./scripts/release.sh stable --dry-run
```

### Publicar una estable en local

Esto es principalmente para uso de emergencia/manual. La ruta normal es el workflow de GitHub.

```bash
./scripts/release.sh stable
git push public-gh refs/tags/vYYYY.MDD.P
PUBLISH_REMOTE=public-gh ./scripts/create-github-release.sh YYYY.MDD.P
```

## Flujo de trabajo del changelog estable

Los archivos de changelog estable viven en:

- `releases/vYYYY.MDD.P.md`

Los canaries no obtienen archivos de changelog.

Flujo de generación local recomendado:

```bash
VERSION="$(./scripts/release.sh stable --date 2026-03-18 --print-version)"
claude --print --output-format stream-json --verbose --dangerously-skip-permissions --model claude-opus-4-6 "Use the release-changelog skill to draft or update releases/v${VERSION}.md for Paperclip. Read doc/RELEASING.md and .agents/skills/release-changelog/SKILL.md, then generate the stable changelog for v${VERSION} from commits since the last stable tag. Do not create a canary changelog."
```

El repo intencionalmente no ejecuta esto a través de GitHub Actions porque:

- los canaries son demasiado frecuentes
- las notas estables son la única superficie narrativa pública que necesita ayuda de LLM
- los tokens de LLM del mantenedor no deben vivir en Actions

## Pruebas de humo

Para un canary:

```bash
PAPERCLIPAI_VERSION=canary ./scripts/docker-onboard-smoke.sh
```

Para la estable actual:

```bash
PAPERCLIPAI_VERSION=latest ./scripts/docker-onboard-smoke.sh
```

Variantes aisladas útiles:

```bash
HOST_PORT=3232 DATA_DIR=./data/release-smoke-canary PAPERCLIPAI_VERSION=canary ./scripts/docker-onboard-smoke.sh
HOST_PORT=3233 DATA_DIR=./data/release-smoke-stable PAPERCLIPAI_VERSION=latest ./scripts/docker-onboard-smoke.sh
```

El humo automatizado de navegador también está disponible:

```bash
gh workflow run release-smoke.yml -f paperclip_version=canary
gh workflow run release-smoke.yml -f paperclip_version=latest
```

Chequeos mínimos:

- `npx paperclipai@canary onboard` instala
- la incorporación se completa sin fallas
- el login autenticado funciona con las credenciales de humo
- el navegador aterriza en incorporación en una instancia nueva
- la creación de empresa tiene éxito
- se crea el primer agente CEO
- se dispara la primera ejecución de latido del CEO

## Reversión

La reversión no despublica versiones.

Solo mueve el dist-tag `latest` de vuelta a una estable anterior:

```bash
./scripts/rollback-latest.sh 2026.318.0 --dry-run
./scripts/rollback-latest.sh 2026.318.0
```

Luego corrige hacia adelante con un nuevo segmento de parche estable o fecha de versión.

## Manuales de falla

### Si el canary publica pero las pruebas de humo fallan

No ejecutes la estable.

En su lugar:

1. corrige el issue en `master`
2. haz merge de la corrección
3. espera el siguiente canary automático
4. re-ejecuta las pruebas de humo

### Si la publicación npm estable tiene éxito pero el push del tag o la creación del GitHub release falla

Esto es una versión parcial. npm ya está en vivo.

Haz esto inmediatamente:

1. pushea el tag faltante
2. re-ejecuta `PUBLISH_REMOTE=public-gh ./scripts/create-github-release.sh YYYY.MDD.P`
3. verifica que las notas del GitHub Release apunten a `releases/vYYYY.MDD.P.md`

No republices la misma versión.

### Si `latest` está roto después de la publicación estable

Revierte el dist-tag:

```bash
./scripts/rollback-latest.sh YYYY.MDD.P
```

Luego corrige hacia adelante con una nueva versión estable.

## Archivos relacionados

- [`scripts/release.sh`](../scripts/release.sh)
- [`scripts/release-package-map.mjs`](../scripts/release-package-map.mjs)
- [`scripts/create-github-release.sh`](../scripts/create-github-release.sh)
- [`scripts/rollback-latest.sh`](../scripts/rollback-latest.sh)
- [`doc/PUBLISHING.md`](PUBLISHING.md)
- [`doc/RELEASE-AUTOMATION-SETUP.md`](RELEASE-AUTOMATION-SETUP.md)
