---
name: release-changelog
description: >
  Generate the stable Paperclip release changelog at releases/vYYYY.MDD.P.md by
  reading commits, changesets, and merged PR context since the last stable tag.
---

# Habilidad de changelog de versión

Generar el changelog orientado al usuario de la versión **estable** de Paperclip.

## Modelo de versionado

Paperclip usa **versionado por calendario (calver)**:

- Versiones estables: `YYYY.MDD.P` (p. ej. `2026.318.0`)
- Versiones canary: `YYYY.MDD.P-canary.N` (p. ej. `2026.318.1-canary.0`)
- Tags de git: `vYYYY.MDD.P` para estable, `canary/vYYYY.MDD.P-canary.N` para canary

No hay incrementos de major/minor/patch. La versión estable se deriva de la fecha de publicación prevista (UTC) más el siguiente slot de parche estable del mismo día.

Salida:

- `releases/vYYYY.MDD.P.md`

Reglas importantes:

- aunque haya versiones canary como `2026.318.1-canary.0`, el archivo de changelog sigue siendo `releases/v2026.318.1.md`
- no derivar versiones de tipos de incremento semver
- no crear archivos de changelog canary

## Paso 0 — Verificación de idempotencia

Antes de generar nada, verificar si el archivo ya existe:

```bash
ls releases/vYYYY.MDD.P.md 2>/dev/null
```

Si existe:

1. leerlo primero
2. presentarlo al revisor
3. preguntar si se conserva, se regenera o se actualizan secciones específicas
4. nunca sobrescribirlo en silencio

## Paso 1 — Determinar el rango estable

Encontrar el último tag estable:

```bash
git tag --list 'v*' --sort=-version:refname | head -1
git log v{last}..HEAD --oneline --no-merges
```

La versión estable proviene de una de estas opciones:

- una solicitud explícita del mantenedor
- `./scripts/release.sh stable --date YYYY-MM-DD --print-version`
- el plan de versión ya acordado en `doc/RELEASING.md`

No derivar la versión del changelog de un tag canary ni de un sufijo de prerelease.
No derivar incrementos de major/minor/patch de la intención de la API: calver usa la fecha y el slot estable del mismo día.

## Paso 2 — Recopilar los datos crudos

Recopilar datos de la versión desde:

1. commits de git desde el último tag estable
2. archivos `.changeset/*.md`
3. PR fusionados vía `gh` cuando esté disponible

Comandos útiles:

```bash
git log v{last}..HEAD --oneline --no-merges
git log v{last}..HEAD --format="%H %s" --no-merges
ls .changeset/*.md | grep -v README.md
gh pr list --state merged --search "merged:>={last-tag-date}" --json number,title,body,labels
```

## Paso 3 — Detectar cambios incompatibles (breaking changes)

Buscar:

- migraciones destructivas
- campos/endpoints de la API eliminados o modificados
- claves de configuración renombradas o eliminadas
- señales de commit `BREAKING:` o `BREAKING CHANGE:`

Comandos clave:

```bash
git diff --name-only v{last}..HEAD -- packages/db/src/migrations/
git diff v{last}..HEAD -- packages/db/src/schema/
git diff v{last}..HEAD -- server/src/routes/ server/src/api/
git log v{last}..HEAD --format="%s" | rg -n 'BREAKING CHANGE|BREAKING:|^[a-z]+!:' || true
```

Si se detectan cambios incompatibles, marcarlos de forma destacada: deben aparecer en la sección de cambios incompatibles (Breaking Changes) con una ruta de actualización.

## Paso 4 — Categorizar para los usuarios

Usar estas secciones del changelog estable:

- `Breaking Changes`
- `Highlights`
- `Improvements`
- `Fixes`
- `Upgrade Guide` cuando sea necesario

Excluir refactorizaciones puramente internas, cambios de CI y trabajo solo de documentación, a menos que afecten materialmente a los usuarios.

Pautas:

- agrupar commits relacionados en una sola entrada orientada al usuario
- escribir desde la perspectiva del usuario
- mantener los highlights breves y concretos
- detallar las acciones de actualización para los cambios incompatibles

### Atribución inline de PR y contribuidores

Cuando un elemento de viñeta se corresponde claramente con un pull request fusionado, agregar atribución inline al final de la entrada en este formato:

```
- **Feature name** — Description. ([#123](https://github.com/paperclipai/paperclip/pull/123), @contributor1, @contributor2)
```

Reglas:

- Agregar un enlace al PR solo cuando se pueda rastrear con confianza la viñeta hasta un PR fusionado específico. Usar mensajes de merge commit (`Merge pull request #N from user/branch`) para mapear los PR.
- Listar el/los contribuidor(es) que crearon el PR. Usar nombres de usuario de GitHub, no nombres reales ni correos.
- Si varios PR contribuyeron a una sola viñeta, listarlos todos: `([#10](url), [#12](url), @user1, @user2)`.
- Si no se puede determinar con confianza el número de PR o el contribuidor, omitir el paréntesis de atribución; no adivinar.
- Los commits del mantenedor principal sin PR externo pueden omitir el paréntesis.

## Paso 5 — Escribir el archivo

Plantilla:

```markdown
# vYYYY.MDD.P

> Released: YYYY-MM-DD

## Breaking Changes

## Highlights

## Improvements

## Fixes

## Upgrade Guide

## Contributors

Thank you to everyone who contributed to this release!

@username1, @username2, @username3
```

Omitir las secciones vacías excepto `Highlights`, `Improvements` y `Fixes`, que normalmente deberían existir.

La sección `Contributors` siempre debe incluirse. Listar a todas las personas que crearon commits en el rango de la versión, mencionándolas con su **nombre de usuario de GitHub** (no su nombre real ni su correo). Para encontrar los nombres de usuario de GitHub:

1. Extraer los nombres de usuario de los mensajes de merge commit: `git log v{last}..HEAD --oneline --merges`; el prefijo de la rama (p. ej. `from username/branch`) da el nombre de usuario de GitHub.
2. Para correos noreply como `user@users.noreply.github.com`, el nombre de usuario es la parte anterior a `@`.
3. Para contribuidores cuyo nombre de usuario sea ambiguo, verificar `gh api users/{guess}` o la página del PR.

**Nunca exponer las direcciones de correo de los contribuidores.** Usar solo `@username`.

Excluir las cuentas de bots (p. ej. `lockfile-bot`, `dependabot`) de la lista. Listar los contribuidores en orden alfabético por nombre de usuario de GitHub (sin distinción de mayúsculas).

## Paso 6 — Revisar antes de la publicación

Antes de entregarlo:

1. confirmar que el encabezado sea solo la versión estable
2. confirmar que no haya lenguaje `-canary` en el título ni en el nombre del archivo
3. confirmar que cualquier cambio incompatible tenga una ruta de actualización
4. presentar el borrador para aprobación humana

Esta habilidad nunca publica nada. Solo prepara el artefacto del changelog estable.
