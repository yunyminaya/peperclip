# Esquemas y decaimiento de memoria

## Esquema de hecho atómico (items.yaml)

```yaml
- id: entity-001
  fact: "The actual fact"
  category: relationship | milestone | status | preference
  timestamp: "YYYY-MM-DD"
  source: "YYYY-MM-DD"
  status: active # active | superseded
  superseded_by: null # e.g. entity-002
  related_entities:
    - companies/acme
    - people/jeff
  last_accessed: "YYYY-MM-DD"
  access_count: 0
```

## Decaimiento de memoria

Los hechos pierden prioridad de recuperación con el tiempo para que la información desactualizada no desplace al contexto reciente.

**Seguimiento de acceso:** cuando un hecho se usa en una conversación, incrementar `access_count` y establecer `last_accessed` en hoy. Durante la extracción del latido, escanear la sesión en busca de hechos de entidades referenciados y actualizar sus metadatos de acceso.

**Niveles de recencia (para reescribir summary.md):**

- **Hot** (accedido en los últimos 7 días) — incluir de forma destacada en summary.md.
- **Warm** (hace 8–30 días) — incluir con menor prioridad.
- **Cold** (más de 30 días o nunca accedido) — omitir de summary.md. Sigue en items.yaml, recuperable bajo demanda.
- Un `access_count` alto resiste el decaimiento: los hechos usados con frecuencia se mantienen warm por más tiempo.

**Síntesis semanal:** ordenar por nivel de recencia y luego por access_count dentro del nivel. Los hechos cold salen del resumen pero permanecen en items.yaml. Acceder a un hecho cold lo vuelve a calentar.

Sin eliminación. El decaimiento solo afecta la prioridad de recuperación mediante la curaduría de summary.md. El registro completo siempre vive en items.yaml.
