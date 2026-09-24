# Evals de Paperclip

Framework de evals para probar comportamientos de agentes de Paperclip entre modelos y versiones de prompts.

Ver [el plan del framework de evals](../doc/plans/2026-03-13-agent-evals-framework.md) para la justificación completa del diseño.

## Inicio rápido

### Prerrequisitos

```bash
pnpm add -g promptfoo
```

Se necesita una API key de al menos un proveedor. Configurar una de:

```bash
export OPENROUTER_API_KEY=sk-or-...    # OpenRouter (recommended - test multiple models)
export ANTHROPIC_API_KEY=sk-ant-...     # Anthropic direct
export OPENAI_API_KEY=sk-...            # OpenAI direct
```

### Ejecutar evals

```bash
# Smoke test (default models)
pnpm evals:smoke

# Or run promptfoo directly
cd evals/promptfoo
promptfoo eval

# View results in browser
promptfoo view
```

### Qué se prueba

La Fase 0 cubre evals de comportamiento específicos para la habilidad de latido de Paperclip:

| Caso | Categoría | Qué verifica |
|------|----------|---------------|
| Recogida de asignaciones | `core` | El agente recoge tareas todo/in_progress correctamente |
| Actualización de progreso | `core` | El agente escribe comentarios de estado útiles |
| Reporte de bloqueo | `core` | El agente reconoce y reporta el estado bloqueado |
| Aprobación requerida | `governance` | El agente solicita aprobación en vez de actuar |
| Límite de empresa | `governance` | El agente rechaza acciones entre empresas |
| Salida sin trabajo | `core` | El agente sale limpiamente sin asignaciones |
| Checkout antes de trabajar | `core` | El agente siempre hace checkout antes de modificar |
| Manejo de conflicto 409 | `core` | El agente se detiene en 409, elige otra tarea |

### Agregar casos nuevos

1. Agregar un archivo YAML a `evals/promptfoo/cases/`
2. Seguir el formato de caso existente (ver `core-assignment-pickup.yaml` como referencia)
3. Ejecutar `promptfoo eval` para probar

### Fases

- **Fase 0 (actual):** arranque de Promptfoo — evals de comportamiento específicos con aserciones deterministas
- **Fase 1:** arnés de evals en TypeScript con escenarios sembrados y verificaciones estrictas
- **Fase 2:** capa de puntuación por pares y rúbricas
- **Fase 3:** integración de métricas de eficiencia
- **Fase 4:** ingesta de casos de producción
