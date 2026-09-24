---
title: Escribir una habilidad
summary: Formato de SKILL.md y mejores prácticas
---

Las habilidades son instrucciones reutilizables que los agentes pueden invocar durante sus latidos. Son archivos markdown que enseñan a los agentes cómo realizar tareas específicas.

## Estructura de la habilidad

Una habilidad es un directorio que contiene un archivo `SKILL.md` con frontmatter YAML:

```
skills/
└── my-skill/
    ├── SKILL.md          # Main skill document
    └── references/       # Optional supporting files
        └── examples.md
```

## Formato de SKILL.md

```markdown
---
name: my-skill
description: >
  Short description of what this skill does and when to use it.
  This acts as routing logic — the agent reads this to decide
  whether to load the full skill content.
---

# My Skill

Detailed instructions for the agent...
```

### Campos del frontmatter

- **name** — identificador único de la habilidad (kebab-case)
- **description** — descripción de enrutamiento que le indica al agente cuándo usar esta habilidad. Escríbela como lógica de decisión, no como texto de marketing.

## Cómo funcionan las habilidades en tiempo de ejecución

1. El agente ve los metadatos de la habilidad (nombre + descripción) en su contexto
2. El agente decide si la habilidad es relevante para su tarea actual
3. Si es relevante, el agente carga el contenido completo del SKILL.md
4. El agente sigue las instrucciones de la habilidad

Esto mantiene el prompt base pequeño: el contenido completo de la habilidad solo se carga bajo demanda.

## Mejores prácticas

- **Escribe las descripciones como lógica de enrutamiento** — incluye orientación de "úsala cuando" y "no la uses cuando"
- **Sé específico y accionable** — los agentes deben poder seguir las habilidades sin ambigüedad
- **Incluye ejemplos de código** — las llamadas concretas a la API y los ejemplos de comandos son más confiables que la prosa
- **Mantén las habilidades enfocadas** — una habilidad por tema; no combines procedimientos no relacionados
- **Referencia archivos con moderación** — coloca los detalles de apoyo en `references/` en lugar de inflar el SKILL.md principal

## Inyección de habilidades

Los adaptadores son responsables de hacer que las habilidades sean descubribles para su runtime de agente. El adaptador `claude_local` usa un directorio temporal con enlaces simbólicos y `--add-dir`. El adaptador `codex_local` usa el directorio global de habilidades. Consulta la guía [Creating an Adapter](/adapters/creating-an-adapter) para más detalles.
