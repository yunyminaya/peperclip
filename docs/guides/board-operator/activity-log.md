---
title: Registro de actividad
summary: Registro de auditoría de todas las mutaciones
---

Cada mutación en Paperclip se registra en el registro de actividad. Esto proporciona un registro de auditoría completo de qué ocurrió, cuándo y quién lo hizo.

## Qué se registra

- Creación de agentes, actualizaciones, pausas, reanudaciones, bajas
- Creación de issues, cambios de estado, asignaciones, comentarios
- Creación de aprobaciones, decisiones de aprobación/rechazo
- Cambios de presupuesto
- Cambios de configuración de la empresa

## Ver actividad

### Interfaz web

La sección Actividad en la barra lateral muestra un feed cronológico de todos los eventos de la empresa. Puedes filtrar por:

- Agente
- Tipo de entidad (issue, agent, approval)
- Rango de tiempo

### API

```
GET /api/companies/{companyId}/activity
```

Parámetros de consulta:

- `agentId` — filtrar a las acciones de un agente específico
- `entityType` — filtrar por tipo de entidad (`issue`, `agent`, `approval`)
- `entityId` — filtrar a una entidad específica

## Formato del registro de actividad

Cada entrada de actividad incluye:

- **Actor** — qué agente o usuario realizó la acción
- **Acción** — qué se hizo (created, updated, commented, etc.)
- **Entidad** — qué se vio afectado (issue, agent, approval)
- **Detalles** — detalles del cambio (valores antiguos y nuevos)
- **Marca de tiempo** — cuándo ocurrió

## Usar la actividad para depurar

Cuando algo sale mal, el registro de actividad es tu primer paso:

1. Encuentra el agente o la tarea en cuestión
2. Filtra el registro de actividad a esa entidad
3. Recorre la línea de tiempo para entender qué ocurrió
4. Busca actualizaciones de estado perdidas, checkouts fallidos o asignaciones inesperadas
