# Plan de automatización de versiones y simplificación de versionado

## Contexto

El flujo actual de versiones de Paperclip está documentado en `doc/RELEASING.md` e implementado a través de:

- `.github/workflows/release.yml`
- `scripts/release-lib.sh`
- `scripts/release-start.sh`
- `scripts/release-preflight.sh`
- `scripts/release.sh`
- `scripts/create-github-release.sh`

Hoy el modelo es:

1. elegir `patch`, `minor` o `major`
2. crear `release/X.Y.Z`
3. redactar `releases/vX.Y.Z.md`
4. publicar una o más canaries desde esa rama de versión
5. publicar estable desde esa misma rama
6. hacer push del tag + crear GitHub Release
7. fusionar la rama de versión de vuelta a `master`

Eso es viable, pero crea fricción exactamente en los lugares que deberían ser baratos:

- decidir `patch` vs `minor` vs `major`
- cortar y mantener ramas de versión
- publicar canaries manualmente
- pensar en la generación de changelog para canaries
- manejar credenciales de npm con seguridad en un repositorio público

El estado objetivo de esta discusión es más simple:

- cada push a `master` publica una canary automáticamente
- las versiones estables se promueven deliberadamente desde un commit verificado
- el versionado es basado en fecha en lugar de basado en semántica
- la publicación estable es segura incluso en un repositorio público de código abierto
- la generación de changelog ocurre solo para versiones estables reales

## Recomendación en una oración

Mover Paperclip a versionado de calendario compatible con semver, auto-publicar canaries desde `master`, promover estable desde un commit probado elegido, y usar trusted publishing de npm más entornos de GitHub para que ningún token de npm o LLM de larga vida necesite vivir en Actions.

## Decisiones centrales

### 1. Usar versiones de calendario, pero mantener la sintaxis semver

El repositorio y las herramientas de npm aún asumen cadenas de versión con forma semver en muchos lugares. Eso no significa que Paperclip deba mantener semver como política de producto. Sí significa que el formato de versión debería seguir siendo válido como semver.

Formato recomendado:

- estable: `YYYY.MDD.P`
- canary: `YYYY.MDD.P-canary.N`

Ejemplos:

- primera estable el 17 de marzo de 2026: `2026.317.0`
- tercera canary en la línea `2026.317.0`: `2026.317.0-canary.2`

Por qué esta forma:

- elimina las decisiones de `patch/minor/major`
- es sintaxis semver válida
- sigue siendo compatible con npm, dist-tags y validadores semver existentes
- es cercana al formato que realmente quieres

Restricciones importantes:

- el slot numérico del medio debería ser `MDD`, donde `M` es el mes y `DD` es el día con cero a la izquierda
- `2026.03.17` no es el formato a usar
  - los identificadores numéricos semver no permiten ceros a la izquierda
- `2026.3.17.1` no es el formato a usar
  - semver tiene tres componentes numéricos, no cuatro
- el equivalente semver-safe práctico es `2026.317.0-canary.8`

Esto es efectivamente CalVer sobre rieles de semver.

### 2. Aceptar que CalVer cambia el contrato de compatibilidad

Esto ya no es semver en espíritu. Es semver solo en sintaxis.

Ese tradeoff probablemente es aceptable para Paperclip, pero debería ser explícito:

- los consumidores ya no infieren compatibilidad desde `major/minor/patch`
- las notas de versión se convierten en la señal de compatibilidad
- los usuarios downstream deberían preferir fijados exactos o actualizaciones deliberadas

Esto es especialmente relevante para paquetes públicos de biblioteca como `@paperclipai/shared`, `@paperclipai/db` y los paquetes de adaptadores.

### 3. Eliminar las ramas de versión para publicación normal

Si cada merge a `master` publica una canary, el actual modelo de tren `release/X.Y.Z` se convierte en más ceremonia que valor.

Reemplazo recomendado:

- `master` es el único tren canary
- cada push a `master` puede publicar una canary
- estable se publica desde un commit o tag canary elegido en `master`

Esto coincide con el flujo de trabajo que realmente quieres:

- fusionar continuamente
- dejar que npm siempre tenga una canary fresca
- elegir más adelante una canary conocida-buena y promover ese commit a estable

### 4. Promover por referencia de fuente, no "renombrando" una canary

Esta es la restricción mecánica más importante.

npm puede mover dist-tags, pero no permite renombrar una versión ya publicada. Eso significa:

- puedes mover `latest` a `paperclipai@1.2.3`
- no puedes convertir `paperclipai@2026.317.0-canary.8` en `paperclipai@2026.317.0`

Así que "promover canary a estable" realmente significa:

1. elegir el commit o tag canary en el que confías
2. reconstruir desde ese commit exacto
3. publicarlo de nuevo con la cadena de versión estable

Por eso, el flujo de trabajo estable debería tomar una referencia de fuente, no solo un tipo de bump.

Entrada estable recomendada:

- `source_ref`
  - SHA de commit, o
  - un tag canary de git como `canary/v2026.317.1-canary.8`

### 5. Solo las versiones estables obtienen notas de versión, tags y GitHub Releases

Las canaries deberían seguir siendo ligeras:

- publicar en npm bajo `canary`
- opcionalmente crear un tag de git ligero o anotado
- no crear GitHub Releases
- no requerir `releases/v*.md`
- no gastar tokens de LLM

Las versiones estables deberían seguir siendo la superficie narrativa pública:

- tag de git `v2026.317.0`
- GitHub Release `v2026.317.0`
- archivo de changelog estable `releases/v2026.317.0.md`

## Modelo de seguridad

### Recomendación

Usar trusted publishing de npm con GitHub Actions OIDC, luego deshabilitar el acceso de publicación basado en token para los paquetes.

Por qué:

- sin `NPM_TOKEN` de larga vida en secretos del repositorio u organización
- sin token personal de npm en Actions
- credenciales de corta vida emitidas solo para el flujo de trabajo autorizado
- procedencia automática de npm para paquetes públicos en repositorios públicos

Esta es la respuesta más limpia a la preocupación de seguridad del repositorio abierto.

### Controles concretos

#### 1. Usar un archivo de flujo de trabajo de versión

Usar un nombre de archivo de flujo de trabajo para publicación canary y estable:

- `.github/workflows/release.yml`

Por qué:

- el trusted publishing de npm se configura por nombre de archivo de flujo de trabajo
- npm actualmente permite una configuración de publicador confiable por paquete
- los entornos de GitHub aún pueden proporcionar reglas separadas de aprobación canary/estable dentro del mismo flujo de trabajo

#### 2. Usar entornos separados de GitHub

Entornos recomendados:

- `npm-canary`
- `npm-stable`

Política recomendada:

- `npm-canary`
  - rama permitida: `master`
  - sin revisor humano requerido
- `npm-stable`
  - rama permitida: `master`
  - revisor requerido habilitado
  - autorevisión prevenida habilitada
  - bypass de admin deshabilitado

Estable debería requerir una segunda puerta humana explícita incluso si el flujo de trabajo se despacha manualmente.

#### 3. Bloquear ediciones del flujo de trabajo

Agregar o reforzar la cobertura de `CODEOWNERS` para:

- `.github/workflows/*`
- `scripts/release*`
- `doc/RELEASING.md`

Esto importa porque el trusted publishing autoriza un archivo de flujo de trabajo. El mayor riesgo restante no es la exfiltración de secretos desde forks. Es un cambio aprobado por un mantenedor al propio flujo de trabajo de versión.

#### 4. Eliminar el acceso tradicional de token de npm después de que OIDC funcione

Después de verificar el trusted publishing:

- establecer el acceso de publicación del paquete para requerir 2FA y no permitir tokens
- revocar cualquier token de automatización heredado

Eso elimina la clase de falla de "alguien robó el token de npm".

### Qué no hacer

- no poner tu token personal de Claude o npm en GitHub Actions
- no ejecutar lógica de versión desde `pull_request_target`
- no hacer que la publicación estable dependa de un secreto del repositorio si OIDC puede manejarlo
- no crear GitHub Releases canary

## Estrategia de changelog

### Recomendación

Generar changelogs solo estables, y mantener la generación de changelog asistida por LLM fuera de CI por ahora.

Razonamiento:

- las canaries ocurren con demasiada frecuencia
- las canaries no necesitan notas públicas pulidas
- poner un token personal de Claude en Actions no vale el riesgo
- la cadencia de versiones estables es lo suficientemente baja como para que un paso humano en el ciclo sea aceptable

Ruta estable recomendada:

1. elegir un commit o tag canary
2. ejecutar la generación de changelog localmente desde una máquina confiable
3. hacer commit de `releases/vYYYY.MDD.P.md`
4. ejecutar la promoción estable

Si las notas aún no están listas, un fallback es aceptable:

- publicar estable
- crear un GitHub Release mínimo
- actualizar `releases/vYYYY.MDD.P.md` inmediatamente después

Pero el estado estable mejor es tener las notas estables en commit antes de la publicación estable.

### Opción futura

Si más adelante quieres borrador de changelog asistido por CI, hacerlo con:

- una cuenta de servicio dedicada
- un token con alcance solo para generación de changelog
- un flujo de trabajo manual
- un entorno dedicado con revisores requeridos

Eso es trabajo de endurecimiento de fase dos, no un requisito de fase uno.

## Flujo de trabajo futuro propuesto

### Flujo de trabajo canary

Activador:

- `push` en `master`

Pasos:

1. checkout del commit fusionado de `master`
2. ejecutar verificación en ese commit exacto
3. calcular la versión canary para la fecha UTC actual
4. versionar los paquetes públicos a `YYYY.MDD.P-canary.N`
5. publicar en npm con dist-tag `canary`
6. crear un tag canary de git para trazabilidad

Formato recomendado de tag canary:

- `canary/v2026.317.1-canary.4`

Salidas:

- canary de npm publicada
- tag de git creado
- sin GitHub Release
- sin archivo de changelog requerido

### Flujo de trabajo estable

Activador:

- `workflow_dispatch`

Entradas:

- `source_ref`
- `stable_date` opcional
- `dry_run`

Pasos:

1. checkout de `source_ref`
2. ejecutar verificación en ese commit exacto
3. calcular el siguiente slot de parche estable para la fecha UTC o la sobrescritura proporcionada
4. fallar si `vYYYY.MDD.P` ya existe
5. requerir `releases/vYYYY.MDD.P.md`
6. versionar los paquetes públicos a `YYYY.MDD.P`
7. publicar en npm bajo `latest`
8. crear tag de git `vYYYY.MDD.P`
9. hacer push del tag
10. crear GitHub Release desde `releases/vYYYY.MDD.P.md`

Salidas:

- versión estable de npm
- tag estable de git
- GitHub Release
- superficie pública limpia de changelog

## Guía de implementación

### 1. Reemplazar la matemática de versionado de tipo bump con computación explícita de versión

Los scripts actuales de versión dependen de:

- `patch`
- `minor`
- `major`

Esa lógica debería reemplazarse con:

- `compute_canary_version_for_date`
- `compute_stable_version_for_date`

Por ejemplo:

- `next_stable_version(2026-03-17) -> 2026.317.0`
- `next_canary_for_utc_date(2026-03-17) -> 2026.317.0-canary.0`

### 2. Dejar de requerir `release/X.Y.Z`

Estas invariantes actuales deberían eliminarse de la ruta feliz:

- "debe ejecutarse desde la rama `release/X.Y.Z`"
- "estable y canary para `X.Y.Z` vienen de la misma rama de versión"
- `release-start.sh`

Reemplazarlas con:

- canary debe ejecutarse desde `master`
- estable puede ejecutarse desde un `source_ref` fijado

### 3. Mantener Changesets solo si sigue siendo útil

El sistema actual usa Changesets para:

- reescribir versiones de paquetes
- mantener archivos `CHANGELOG.md` a nivel de paquete
- publicar paquetes

Con CalVer, Changesets aún puede ser útil para la orquestación de publicación, pero ya no debería ser dueño de la selección de versión.

Orden de implementación recomendado:

1. mantener `changeset publish` si funciona con versiones establecidas explícitamente
2. reemplazar la computación de versión con un pequeño script explícito de versionado
3. si Changesets sigue peleando con el modelo, eliminarlo por completo de la publicación de versiones

El problema de versión de Paperclip es ahora "publicar todo el conjunto fijo de paquetes en una versión explícita", no "derivar el próximo bump semántico desde la intención humana".

### 4. Agregar un script dedicado de versionado

Nuevo script recomendado:

- `scripts/set-release-version.mjs`

Responsabilidades:

- establecer la versión en todos los paquetes públicos publicables
- actualizar cualquier referencia interna de versión exacta necesaria para publicar
- actualizar cadenas de versión del CLI
- evitar reemplazo amplio de cadenas en archivos no relacionados

Esto es más seguro que mantener un flujo de changeset orientado a bump y luego forzarlo en un esquema basado en fecha.

### 5. Mantener el rollback basado en dist-tags

`rollback-latest.sh` debería mantenerse, pero debería dejar de asumir un significado semver más allá de la sintaxis.

Debería seguir:

- reapuntando `latest` a una versión estable previa
- nunca despublicando

## Tradeoffs y riesgos

### 1. El slot de parche estable ahora es parte del contrato de versión

Con `YYYY.MDD.P`, los hotfixes del mismo día están admitidos, pero el slot de parche estable ahora es parte del formato de versión visible.

Ese es el tradeoff correcto porque:

1. npm aún obtiene versiones válidas como semver
2. los hotfixes del mismo día siguen siendo posibles
3. el orden cronológico aún funciona mientras el día esté con cero a la izquierda dentro de `MDD`

### 2. Los consumidores de paquetes públicos pierden la señal de intención semver

Esta es la principal desventaja de CalVer.

Si eso se convierte en un problema, una alternativa es:

- usar CalVer solo para el paquete CLI
- mantener semver para paquetes de biblioteca

Eso es más complejo operativamente, así que no empezaría ahí a menos que los consumidores de paquetes realmente lo necesiten.

### 3. La canary automática significa más tráfico de publicación

Publicar en cada merge de `master` significa:

- más versiones de npm
- más tags de git
- más ruido de registro

Eso es aceptable si las canaries se mantienen claramente separadas:

- dist-tag de npm `canary`
- sin GitHub Release
- sin anuncio externo

## Plan de despliegue

### Fase 1: Base de seguridad

1. Crear `release.yml`
2. Configurar publicadores confiables de npm para todos los paquetes públicos
3. Crear entornos `npm-canary` y `npm-stable`
4. Agregar protección de `CODEOWNERS` para archivos de versión
5. Verificar que la publicación OIDC funciona
6. Deshabilitar el acceso de publicación basado en token y revocar tokens antiguos

### Fase 2: Automatización canary

1. Agregar flujo de trabajo canary en `push` a `master`
2. Agregar computación explícita de versión de calendario
3. Agregar etiquetado canary de git
4. Eliminar el requisito de changelog de las canaries
5. Actualizar `doc/RELEASING.md`

### Fase 3: Promoción estable

1. Agregar flujo de trabajo estable manual con `source_ref`
2. Requerir archivo de notas estables
3. Publicar estable + tag + GitHub Release
4. Actualizar documentos y scripts de rollback
5. Retirar los supuestos de ramas de versión

### Fase 4: Limpieza

1. Eliminar `release-start.sh` de la ruta principal
2. Eliminar `patch/minor/major` de los documentos de mantenedor
3. Decidir si mantener o eliminar Changesets de la publicación
4. Documentar públicamente el contrato de compatibilidad de CalVer

## Recomendación concreta

Paperclip debería adoptar este modelo:

- versiones estables: `YYYY.MDD.P`
- versiones canary: `YYYY.MDD.P-canary.N`
- canaries auto-publicadas en cada push a `master`
- estables promovidas manualmente desde un commit o tag canary probado elegido
- sin ramas de versión en la ruta predeterminada
- sin archivos de changelog canary
- sin GitHub Releases canary
- sin token de Claude en GitHub Actions
- sin token de automatización de npm en GitHub Actions
- trusted publishing de npm más entornos de GitHub para seguridad de versión

Eso elimina la parte molesta de semver sin pelear con npm, hace baratas las canaries, mantiene deliberadas las estables, y mejora materialmente la postura de seguridad del repositorio público.

## Referencias externas

- trusted publishing de npm: https://docs.npmjs.com/trusted-publishers/
- dist-tags de npm: https://docs.npmjs.com/adding-dist-tags-to-packages/
- guía de versionado semántico de npm: https://docs.npmjs.com/about-semantic-versioning/
- entornos de GitHub y reglas de protección de despliegue: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- comportamiento de secretos de GitHub para forks: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
