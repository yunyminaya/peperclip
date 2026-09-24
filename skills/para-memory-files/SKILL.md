---
name: para-memory-files
description: >
  File-based memory system using Tiago Forte's PARA method. Use this skill whenever
  you need to store, retrieve, update, or organize knowledge across sessions. Covers
  three memory layers: (1) Knowledge graph in PARA folders with atomic YAML facts,
  (2) Daily notes as raw timeline, (3) Tacit knowledge about user patterns. Also
  handles planning files, memory decay, weekly synthesis, and recall via qmd.
  Trigger on any memory operation: saving facts, writing daily notes, creating
  entities, running weekly synthesis, recalling past context, or managing plans.
---

# Archivos de memoria PARA

Memoria persistente basada en archivos, organizada con el método PARA de Tiago Forte. Tres capas: un grafo de conocimiento, notas diarias y conocimiento tácito. Todas las rutas son relativas a `$AGENT_HOME`.

## Tres capas de memoria

### Capa 1: Grafo de conocimiento (`$AGENT_HOME/life/`, PARA)

Almacenamiento basado en entidades. Cada entidad tiene una carpeta con dos niveles:

1. `summary.md` — contexto rápido, cargar primero.
2. `items.yaml` — hechos atómicos, cargar bajo demanda.

```text
$AGENT_HOME/life/
  projects/          # Active work with clear goals/deadlines
    <name>/
      summary.md
      items.yaml
  areas/             # Ongoing responsibilities, no end date
    people/<name>/
    companies/<name>/
  resources/         # Reference material, topics of interest
    <topic>/
  archives/          # Inactive items from the other three
  index.md
```

**Reglas PARA:**

- **Projects** — trabajo activo con un objetivo o fecha límite. Mover a archives cuando se complete.
- **Areas** — en curso (personas, empresas, responsabilidades). Sin fecha de finalización.
- **Resources** — material de referencia, temas de interés.
- **Archives** — elementos inactivos de cualquier categoría.

**Reglas de hechos:**

- Guardar los hechos duraderos de inmediato en `items.yaml`.
- Cada semana: reescribir `summary.md` a partir de los hechos activos.
- Nunca eliminar hechos. Reemplazarlos en su lugar (`status: superseded`, agregar `superseded_by`).
- Cuando una entidad se vuelva inactiva, mover su carpeta a `$AGENT_HOME/life/archives/`.

**Cuándo crear una entidad:**

- Mencionado 3 o más veces, O
- Relación directa con el usuario (familia, compañero de trabajo, pareja, cliente), O
- Proyecto o empresa significativa en la vida del usuario.
- En caso contrario, anotarlo en las notas diarias.

Para el esquema YAML de hechos atómicos y las reglas de decaimiento de memoria, ver [references/schemas.md](references/schemas.md).

### Capa 2: Notas diarias (`$AGENT_HOME/memory/YYYY-MM-DD.md`)

Cronología cruda de eventos: la capa del "cuándo".

- Escribir continuamente durante las conversaciones.
- Extraer hechos duraderos a la Capa 1 durante los latidos.

### Capa 3: Conocimiento tácito (`$AGENT_HOME/MEMORY.md`)

Cómo opera el usuario: patrones, preferencias, lecciones aprendidas.

- No son hechos sobre el mundo; son hechos sobre el usuario.
- Actualizar cada vez que aprendas patrones operativos nuevos.

## Escríbelo: sin notas mentales

La memoria no sobrevive a los reinicios de sesión. Los archivos sí.

- ¿Quieres recordar algo? ESCRÍBELO EN UN ARCHIVO.
- "Recuerda esto" → actualizar `$AGENT_HOME/memory/YYYY-MM-DD.md` o el archivo de la entidad relevante.
- Aprende una lección → actualizar AGENTS.md, TOOLS.md o el archivo de la habilidad relevante.
- Comete un error → documentarlo para que tu yo futuro no lo repita.
- Los archivos de texto en disco siempre son mejores que mantenerlo en contexto temporal.

## Recuperación de memoria: usar qmd

Usar `qmd` en vez de buscar con grep en los archivos:

```bash
qmd query "what happened at Christmas"   # Semantic search with reranking
qmd search "specific phrase"              # BM25 keyword search
qmd vsearch "conceptual question"         # Pure vector similarity
```

Indexar tu carpeta personal: `qmd index $AGENT_HOME`

Vectores + BM25 + reranking encuentran cosas incluso cuando la redacción difiere.

## Planificación

Mantener los planes en archivos con marca de tiempo en `plans/` en la raíz del proyecto (fuera de la memoria personal para que otros agentes puedan acceder a ellos). Usar `qmd` para buscar planes. Los planes se desactualizan: si existe un plan más nuevo, no confundirse con una versión anterior. Si se nota desactualización, actualizar el archivo para indicar por qué fue reemplazado (`supersededBy`).
