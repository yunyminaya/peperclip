---
name: doc-maintenance
description: >
  Audit top-level documentation (README, SPEC, PRODUCT) against recent git
  history to find drift — shipped features missing from docs or features
  listed as upcoming that already landed. Proposes minimal edits, creates
  a branch, and opens a PR. Use when asked to review docs for accuracy,
  after major feature merges, or on a periodic schedule.
---

# Habilidad de mantenimiento de la documentación

Detectar la deriva de la documentación y corregirla mediante PR: sin reescrituras, sin cambios innecesarios.

## Cuándo usar

- Revisión periódica de la documentación (p. ej., semanal o después de versiones)
- Después de fusiones de funciones importantes
- Cuando se pregunte «¿nuestra documentación está actualizada?»
- Cuando se pida auditar la precisión de README / SPEC / PRODUCT

## Documentos objetivo

| Documento | Ruta | Lo que importa |
|----------|------|-------------|
| README | `README.md` | Tabla de funciones, hoja de ruta, inicio rápido, precisión del «qué es», tabla de «funciona con» |
| SPEC | `doc/SPEC.md` | Sin afirmaciones falsas de «no soportado», precisión del modelo/esquema principal |
| PRODUCT | `doc/PRODUCT.md` | Conceptos principales, lista de funciones, precisión de los principios |

Fuera de alcance: DEVELOPING.md, DATABASE.md, CLI.md, doc/plans/, archivos de habilidades, notas de versión. Son para desarrolladores o efímeros: menor riesgo de confusión para el usuario.

## Flujo de trabajo

### Paso 1 — Detectar qué cambió

Encontrar el cursor de la última revisión:

```bash
# Read the last-reviewed commit SHA
CURSOR_FILE=".doc-review-cursor"
if [ -f "$CURSOR_FILE" ]; then
  LAST_SHA=$(cat "$CURSOR_FILE" | head -1)
else
  # First run: look back 60 days
  LAST_SHA=$(git log --format="%H" --after="60 days ago" --reverse | head -1)
fi
```

Luego recopilar los commits desde el cursor:

```bash
git log "$LAST_SHA"..HEAD --oneline --no-merges
```

### Paso 2 — Clasificar los cambios

Analizar los mensajes de commit y los archivos modificados. Clasificar en:

- **Función** — nuevas capacidades (palabras clave: `feat`, `add`, `implement`, `support`)
- **Incompatible (breaking)** — elementos eliminados/renombrados (palabras clave: `remove`, `breaking`, `drop`, `rename`)
- **Estructural** — nuevos directorios, cambios de configuración, nuevos adaptadores, nuevos comandos del CLI

**Ignorar:** refactorizaciones, cambios solo de pruebas, configuración de CI, actualizaciones de dependencias, cambios solo de documentación, commits de estilo/formato. No afectan la precisión de la documentación.

En casos límite, revisar el diff real: un commit titulado «refactor: X» que agrega una API pública nueva es una función.

### Paso 3 — Construir un resumen de cambios

Producir una lista concisa como esta:

```
Since last review (<sha>, <date>):
- FEATURE: Plugin system merged (runtime, SDK, CLI, slots, event bridge)
- FEATURE: Project archiving added
- BREAKING: Removed legacy webhook adapter
- STRUCTURAL: New .agents/skills/ directory convention
```

Si no hay cambios notables, pasar al Paso 7 (actualizar el cursor y salir).

### Paso 4 — Auditar cada documento objetivo

Para cada documento objetivo, leerlo completo y contrastarlo con el resumen de cambios. Revisar:

1. **Falsos negativos** — funciones principales ya publicadas que no se mencionan en absoluto
2. **Falsos positivos** — funciones listadas como «coming soon» / «roadmap» / «planned» / «not supported» / «TBD» que ya se publicaron
3. **Precisión del inicio rápido** — comandos de instalación, requisitos previos e instrucciones de arranque aún correctos (solo README)
4. **Precisión de la tabla de funciones** — ¿la sección de funciones refleja las capacidades actuales? (solo README)
5. **Precisión de «funciona con»** — ¿los adaptadores/integraciones soportados están listados correctamente?

Usar `references/audit-checklist.md` como lista de verificación estructurada.
Usar `references/section-map.md` para saber dónde buscar cada área de funciones.

### Paso 5 — Crear rama y aplicar ediciones mínimas

```bash
# Create a branch for the doc updates
BRANCH="docs/maintenance-$(date +%Y%m%d)"
git checkout -b "$BRANCH"
```

Aplicar **únicamente** las ediciones necesarias para corregir la deriva. Reglas:

- **Solo parches mínimos.** Corregir inexactitudes, no reescribir secciones.
- **Preservar voz y estilo.** Respetar el tono existente de cada documento.
- **Sin cambios cosméticos.** No corregir errores tipográficos, reformatear tablas ni reorganizar secciones a menos que sean parte de una corrección factual.
- **Sin secciones nuevas.** Si una función necesita una sección completamente nueva, anotarlo en la descripción del PR como seguimiento; no agregarla en una pasada de mantenimiento.
- **Elementos de la hoja de ruta:** sacar las funciones ya publicadas de la hoja de ruta. Agregar una mención breve en la sección existente correspondiente si aún no hay ninguna. No agregar descripciones largas.

### Paso 6 — Abrir un PR

Hacer commit de los cambios y abrir un PR:

```bash
git add README.md doc/SPEC.md doc/PRODUCT.md .doc-review-cursor
git commit -m "docs: update documentation for accuracy

- [list each fix briefly]

Co-Authored-By: Paperclip <noreply@paperclip.ing>"

git push -u origin "$BRANCH"

gh pr create \
  --title "docs: periodic documentation accuracy update" \
  --body "$(cat <<'EOF'
## Summary
Automated doc maintenance pass. Fixes documentation drift detected since
last review.

### Changes
- [list each fix]

### Change summary (since last review)
- [list notable code changes that triggered doc updates]

## Review notes
- Only factual accuracy fixes — no style/cosmetic changes
- Preserves existing voice and structure
- Larger doc additions (new sections, tutorials) noted as follow-ups

🤖 Generated by doc-maintenance skill
EOF
)"
```

### Paso 7 — Actualizar el cursor

Tras una auditoría exitosa (con o sin ediciones), actualizar el cursor:

```bash
git rev-parse HEAD > .doc-review-cursor
```

Si se hicieron ediciones, esto ya quedó en commit en la rama del PR. Si no fueron necesarias, hacer commit de la actualización del cursor en la rama actual.

## Reglas de clasificación de cambios

| Señal | Categoría | ¿Requiere actualizar la documentación? |
|--------|----------|-------------------|
| `feat:`, `add`, `implement`, `support` en el mensaje | Función | Sí, si es visible para el usuario |
| `remove`, `drop`, `breaking`, `!:` en el mensaje | Incompatible (breaking) | Sí |
| Nuevo directorio de nivel superior o archivo de configuración | Estructural | Quizás |
| `fix:`, `bugfix` | Corrección | No (a menos que cambie un comportamiento descrito en la documentación) |
| `refactor:`, `chore:`, `ci:`, `test:` | Mantenimiento | No |
| `docs:` | Cambio de documentación | No (ya gestionado) |
| Solo actualizaciones de dependencias | Mantenimiento | No |

## Guía de estilo de parches

- Corregir el hecho, no la prosa
- Al eliminar un elemento de la hoja de ruta, no dejar un hueco: quitar la viñeta limpiamente
- Al agregar una mención de función, respetar el formato de las entradas circundantes (p. ej., si las funciones están en una tabla, agregar una fila)
- Mantener los cambios del README especialmente mínimos: no debería cambiar a menudo
- Para SPEC/PRODUCT, preferir actualizar afirmaciones existentes antes que agregar nuevas (p. ej., cambiar «not supported in V1» por «supported via X» en lugar de agregar una sección nueva)

## Salida

Cuando la habilidad termine, informar:

- Cuántos commits se analizaron
- Cuántos cambios notables se encontraron
- Cuántas ediciones de documentación se hicieron (y en qué archivos)
- Enlace al PR (si se hicieron ediciones)
- Cualquier pendiente que requiera trabajo de documentación mayor
