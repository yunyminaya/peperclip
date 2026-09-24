# Configuración de automatización de versiones

Este documento cubre la configuración de GitHub y npm requerida para el modelo actual de versiones de Paperclip:

- canaries automáticos desde `master`
- promoción manual de estables desde un ref fuente elegido
- publicación confiable de npm vía GitHub OIDC
- infraestructura de versiones protegida en un repositorio público

Archivos del repo que dependen de esta configuración:

- `.github/workflows/release.yml`
- `.github/CODEOWNERS`

Nota:

- los workflows de versión usan intencionalmente `pnpm install --no-frozen-lockfile`
- esto coincide con la política actual del repo donde `pnpm-lock.yaml` es refrescado por automatización de GitHub después de que cambios de manifiestos aterrizan en `master`
- los jobs de publicación luego restauran `pnpm-lock.yaml` antes de ejecutar `scripts/release.sh`, así el script de versión aún ve un working tree limpio

## 1. Haz merge de los cambios del repo primero

Antes de tocar ajustes de GitHub o npm, haz merge del código de automatización de versiones para que los nombres de archivo de workflow referenciados ya existan en la rama por defecto.

Archivos requeridos:

- `.github/workflows/release.yml`
- `.github/CODEOWNERS`

## 2. Configura publicación confiable de npm

Haz esto para cada paquete público que Paperclip publica.

Como mínimo eso incluye:

- `paperclipai`
- `@paperclipai/server`
- `@paperclipai/ui`
- paquetes públicos bajo `packages/`

### 2.1. En npm, abre la página de ajustes de cada paquete

Para cada paquete:

1. abre npm como propietario del paquete
2. ve al área de ajustes / acceso de publicación del paquete
3. agrega un publicador confiable para el repositorio de GitHub `paperclipai/paperclip`

### 2.2. Agrega una entrada de publicador confiable por paquete

npm actualmente permite una configuración de publicador confiable por paquete.

Configura:

- workflow: `.github/workflows/release.yml`

Repositorio:

- `paperclipai/paperclip`

Nombre de entorno:

- deja en blanco el campo de entorno del publicador confiable de npm

Por qué:

- el único workflow `release.yml` maneja tanto publicación canary como estable
- los entornos de GitHub `npm-canary` y `npm-stable` aún aplican distintas reglas de aprobación del lado de GitHub

### 2.3. Verifica la publicación confiable antes de quitar la autenticación vieja

Después de que los workflows estén en vivo:

1. ejecuta una publicación canary
2. confirma que la publicación npm tiene éxito sin ningún `NPM_TOKEN`
3. ejecuta un dry-run estable
4. ejecuta una publicación estable real

Solo después de eso debes quitar el acceso viejo basado en tokens.

## 3. Quita tokens legacy de npm

Después de que la publicación confiable funcione:

1. revoca cualquier secreto `NPM_TOKEN` de repositorio u organización usado para publicar
2. revoca cualquier token personal de automatización que solía publicar Paperclip
3. si npm ofrece un ajuste a nivel de paquete para restringir la publicación a publicadores confiables, habilítalo

Objetivo:

- ningún token de publicación npm de larga duración debe quedar en GitHub Actions

## 4. Crea entornos de GitHub

Crea dos entornos en el repositorio de GitHub:

- `npm-canary`
- `npm-stable`

Ruta:

1. Repositorio de GitHub
2. `Settings`
3. `Environments`
4. `New environment`

## 5. Configura `npm-canary`

Ajustes recomendados para `npm-canary`:

- nombre de entorno: `npm-canary`
- revisores requeridos: ninguno
- temporizador de espera: ninguno
- ramas y tags de despliegue:
  - solo ramas seleccionadas
  - permitir `master`

Razonamiento:

- cada push a `master` debe poder publicar un canary automáticamente
- no se debe requerir aprobación humana para canaries

## 6. Configura `npm-stable`

Ajustes recomendados para `npm-stable`:

- nombre de entorno: `npm-stable`
- revisores requeridos: al menos un mantenedor distinto de la persona que dispara el workflow cuando sea posible
- prevenir auto-revisión: habilitado
- bypass de admin: deshabilitado si tu equipo lo tolera
- temporizador de espera: opcional
- ramas y tags de despliegue:
  - solo ramas seleccionadas
  - permitir `master`

Razonamiento:

- las publicaciones estables deben requerir una puerta de aprobación humana explícita
- el workflow es manual, pero el entorno aún debe ser el punto de control real

## 7. Protege `master`

Abre los ajustes de protección de rama para `master`.

Reglas recomendadas:

1. requerir pull requests antes de hacer merge
2. requerir que los checks de estado pasen antes de hacer merge
3. requerir revisión de code owners
4. descartar aprobaciones obsoletas cuando se pushean nuevos commits
5. restringir quién puede pushear directamente a `master`

Como mínimo, asegúrate de que cambios de workflow y de scripts de versión no puedan aterrizar sin revisión.

## 8. Aplica revisión de CODEOWNERS

Este repo ahora incluye `.github/CODEOWNERS`, pero GitHub solo lo aplica si la protección de rama requiere revisiones de code owner.

En la protección de rama para `master`, habilita:

- `Require review from Code Owners`

Luego verifica que las entradas de propietarios sean correctas para tu conjunto real de mantenedores.

Archivo actual:

- `.github/CODEOWNERS`

Si `@cryppadotta` no es la identidad de revisor correcta en el repo público, cámbiala antes de habilitar la aplicación.

## 9. Protege la infraestructura de versiones específicamente

Estos archivos siempre deben disparar revisión de code owner:

- `.github/workflows/release.yml`
- `scripts/release.sh`
- `scripts/release-lib.sh`
- `scripts/release-package-map.mjs`
- `scripts/create-github-release.sh`
- `scripts/rollback-latest.sh`
- `doc/RELEASING.md`
- `doc/PUBLISHING.md`

Si quieres controles más fuertes, agrega un ruleset de repositorio que bloquee explícitamente pushes directos a:

- `.github/workflows/**`
- `scripts/release*`

## 10. No almacenes un token de Claude en GitHub Actions

No agregues un token personal de Claude o Anthropic para generación automática de changelog.

Política recomendada:

- la generación de changelog estable ocurre en local desde una máquina confiable del mantenedor
- los canaries nunca generan changelogs

Esto mantiene intencional el gasto en LLM y evita un token de alto valor en Actions.

## 11. Verifica el workflow canary

Después de la configuración:

1. haz merge de un commit inofensivo a `master`
2. abre la ejecución del workflow `Release` disparada por ese push
3. confirma que pasa la verificación
4. confirma que la publicación tiene éxito bajo el entorno `npm-canary`
5. confirma que npm ahora muestra una nueva versión `canary`
6. confirma que se pusheó un tag de git llamado `canary/vYYYY.MDD.P-canary.N`

Chequeo de ruta de instalación:

```bash
npx paperclipai@canary onboard
```

## 12. Verifica el workflow estable

Después de que exista al menos un buen canary:

1. resuelve la versión estable objetivo con `./scripts/release.sh stable --date YYYY-MM-DD --print-version`
2. prepara `releases/vYYYY.MDD.P.md` en el commit fuente que quieres promover
3. abre `Actions` -> `Release`
4. ejecútalo con:
   - `source_ref`: el SHA de commit probado o commit fuente del tag canary
   - `stable_date`: déjalo en blanco o define la fecha UTC prevista como `2026-03-18`
     no ingreses una versión como `2026.318.0`; el workflow la calcula desde la fecha
   - `dry_run`: `true`
5. confirma que el dry-run tiene éxito
6. re-ejecuta con `dry_run: false`
7. aprueba el entorno `npm-stable` cuando se pida
8. confirma que `latest` de npm apunta a la nueva versión estable
9. confirma que existe el tag de git `vYYYY.MDD.P`
10. confirma que se creó el GitHub Release

Nota de implementación:

- el workflow estable de GitHub Actions llama a `create-github-release.sh` con `PUBLISH_REMOTE=origin`
- el uso local del mantenedor aún puede pasar `PUBLISH_REMOTE=public-gh` explícitamente cuando se necesite

## 13. Política sugerida del mantenedor

Usa esta política en adelante:

- los canaries son automáticos y baratos
- las estables son manuales y aprobadas
- solo las estables obtienen notas públicas y anuncios
- las notas de versión se commitean antes de la publicación estable
- la reversión usa `npm dist-tag`, no despublicación

## 14. Solución de problemas

### La publicación confiable falla con un error de autenticación

Revisa:

1. el nombre del archivo de workflow en GitHub coincide exactamente con el nombre configurado en npm
2. el paquete tiene la entrada de publicador confiable para el repositorio correcto
3. el job tiene `id-token: write`
4. el job se ejecuta desde el repositorio esperado, no desde un fork

### El workflow estable se ejecuta pero nunca pide aprobación

Revisa:

1. el job `publish` usa el entorno `npm-stable`
2. el entorno realmente tiene revisores requeridos configurados
3. el workflow se ejecuta en el repositorio canónico, no en un fork

### CODEOWNERS no se dispara

Revisa:

1. `.github/CODEOWNERS` está en la rama por defecto
2. la protección de rama en `master` requiere revisión de code owner
3. las identidades de propietario en el archivo son revisores válidos con acceso al repositorio

## Documentos relacionados

- [doc/RELEASING.md](RELEASING.md)
- [doc/PUBLISHING.md](PUBLISHING.md)
- [doc/plans/2026-03-17-release-automation-and-versioning.md](plans/2026-03-17-release-automation-and-versioning.md)
