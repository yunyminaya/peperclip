---
name: release
description: >
  Coordinate a full Paperclip release across engineering verification, npm,
  GitHub, smoke testing, and announcement follow-up. Use when leadership asks
  to ship a release, not merely to discuss versioning.
---

# Habilidad de coordinación de versiones

Ejecutar el flujo de trabajo completo de publicación de Paperclip del mantenedor, no solo un npm publish.

Esta habilidad coordina:

- redacción del changelog estable vía `release-changelog`
- verificación de canary y estado de publicación desde `master`
- smoke testing de Docker vía `scripts/docker-onboard-smoke.sh`
- promoción manual estable desde un source ref elegido
- creación del GitHub Release
- tareas de seguimiento de sitio web / anuncios

## Disparador

Usar esta habilidad cuando el liderazgo pida:

- «haz una versión»
- «publica la versión»
- «promueve este canary a estable»
- «saca la versión estable»

## Condiciones previas

Antes de continuar, verificar todo lo siguiente:

1. `.agents/skills/release-changelog/SKILL.md` existe y es utilizable.
2. El working tree del repo está limpio, incluidos los archivos sin seguimiento.
3. Hay al menos un commit canary o candidato desde el último tag estable.
4. El SHA candidato pasó la puerta de verificación o está por pasarla.
5. Si los manifiestos cambiaron, la actualización de `pnpm-lock.yaml` propiedad de CI ya está fusionada en `master`.
6. Los derechos de npm publish están disponibles mediante GitHub trusted publishing, o mediante autenticación npm local para uso de emergencia/manual.
7. Si se ejecuta a través de Paperclip, se tiene el contexto del issue para actualizaciones de estado y creación de tareas de seguimiento.

Si alguna condición previa falla, detenerse e informar el bloqueador.

## Entradas

Recopilar estas entradas por adelantado:

- si el objetivo es una verificación canary o una promoción estable
- el `source_ref` candidato para estable
- si la ejecución estable es dry-run o en vivo
- contexto de issue de versión / empresa para el seguimiento de sitio web y anuncios

## Paso 0 — Modelo de versión

Paperclip ahora usa un modelo de versión basado en commits:

1. cada push a `master` publica un canary automáticamente
2. los canaries usan `YYYY.MDD.P-canary.N`
3. las versiones estables usan `YYYY.MDD.P`
4. el slot central es `MDD`, donde `M` es el mes UTC y `DD` es el día UTC con cero a la izquierda
5. el slot de parche estable se incrementa cuando se publica más de una estable en la misma fecha UTC
6. las versiones estables se promueven manualmente desde un commit probado elegido o un commit fuente canary
7. solo las versiones estables obtienen `releases/vYYYY.MDD.P.md`, el tag de git `vYYYY.MDD.P` y un GitHub Release

Consecuencias críticas:

- no usar ramas de versión como ruta predeterminada
- no derivar incrementos de major/minor/patch
- no crear archivos de changelog canary
- no crear GitHub Releases canary

## Paso 1 — Elegir el candidato

Para validación de canary:

- inspeccionar la última ejecución exitosa de canary en `master`
- registrar la versión canary y el SHA fuente

Para promoción estable:

1. elegir el source ref probado
2. confirmar que es el SHA exacto que se quiere promover
3. resolver la versión estable objetivo con `./scripts/release.sh stable --date YYYY-MM-DD --print-version`

Comandos útiles:

```bash
git tag --list 'v*' --sort=-version:refname | head -1
git log --oneline --no-merges
npm view paperclipai@canary version
```

## Paso 2 — Redactar el changelog estable

Los archivos de changelog estable viven en:

- `releases/vYYYY.MDD.P.md`

Invocar `release-changelog` y generar o actualizar solo las notas estables.

Reglas:

- revisar el borrador con un humano antes de publicar
- preservar las ediciones manuales si el archivo ya existe
- mantener el nombre del archivo solo-estable
- no crear un archivo de changelog canary

## Paso 3 — Verificar el SHA candidato

Ejecutar la puerta estándar:

```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```

Si el workflow de versión de GitHub ejecutará la publicación, puede volver a ejecutar esta puerta. Aun así informar el estado local si se verificó.

Para los PR que tocan la lógica de versión, el repo también ejecuta un dry-run de versión canary en CI. Esa es una protección específica de la versión, no un sustituto de la puerta estándar.

## Paso 4 — Validar el canary

La ruta canary normal es automática desde `master` vía:

- `.github/workflows/release.yml`

Confirmar:

1. la verificación pasó
2. la publicación npm canary tuvo éxito
3. el tag de git `canary/vYYYY.MDD.P-canary.N` existe

Verificaciones útiles:

```bash
npm view paperclipai@canary version
git tag --list 'canary/v*' --sort=-version:refname | head -5
```

## Paso 5 — Smoke test del canary

Ejecutar:

```bash
PAPERCLIPAI_VERSION=canary ./scripts/docker-onboard-smoke.sh
```

Variante aislada útil:

```bash
HOST_PORT=3232 DATA_DIR=./data/release-smoke-canary PAPERCLIPAI_VERSION=canary ./scripts/docker-onboard-smoke.sh
```

Confirmar:

1. la instalación tiene éxito
2. la incorporación se completa sin fallos
3. el servidor arranca
4. la UI carga
5. la creación básica de empresa y la carga del panel funcionan

Si el smoke testing falla:

- detener la versión estable
- corregir el issue en `master`
- esperar el siguiente canary automático
- volver a ejecutar el smoke testing

## Paso 6 — Vista previa o publicación de la estable

La ruta estable normal es `workflow_dispatch` manual en:

- `.github/workflows/release.yml`

Entradas:

- `source_ref`
- `stable_date`
- `dry_run`

Antes de la estable en vivo:

1. resolver la versión estable objetivo con `./scripts/release.sh stable --date YYYY-MM-DD --print-version`
2. asegurar que `releases/vYYYY.MDD.P.md` exista en el source ref
3. ejecutar primero el workflow estable en modo dry-run cuando sea práctico
4. luego ejecutar la publicación estable real

El workflow estable:

- vuelve a verificar el source ref exacto
- calcula el siguiente slot de parche estable para la fecha UTC elegida
- publica `YYYY.MDD.P` bajo el dist-tag `latest`
- crea el tag de git `vYYYY.MDD.P`
- crea o actualiza el GitHub Release desde `releases/vYYYY.MDD.P.md`

Comandos locales de emergencia/manual:

```bash
./scripts/release.sh stable --dry-run
./scripts/release.sh stable
git push public-gh refs/tags/vYYYY.MDD.P
./scripts/create-github-release.sh YYYY.MDD.P
```

## Paso 7 — Terminar las otras superficies

Crear o verificar el trabajo de seguimiento para:

- publicación del changelog del sitio web
- post de lanzamiento / anuncio social
- resumen de la versión en el contexto del issue de Paperclip

Estos deben referenciar la versión estable, no el canary.

## Manejo de fallos

Si el canary está mal:

- publicar otro canary, no publicar la estable

Si la publicación npm estable tiene éxito pero el push del tag o la creación del GitHub Release fallan:

- corregir el issue de git/GitHub inmediatamente desde el mismo resultado de la versión
- no volver a publicar la misma versión

Si `latest` está mal después de la publicación estable:

```bash
./scripts/rollback-latest.sh <last-good-version>
```

Luego corregir hacia adelante con una nueva versión estable.

## Salida

Cuando la habilidad termine, proporcionar:

- SHA candidato y versión canary probada, si aplica
- versión estable, si se promovió
- estado de la verificación
- estado de npm
- estado del smoke test
- estado del tag de git / GitHub Release
- estado del seguimiento de sitio web / anuncios
- recomendación de rollback si algo sigue parcialmente completo
