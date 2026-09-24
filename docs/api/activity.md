---
title: Actividad
summary: Consultas del registro de actividad
---

Consulta la pista de auditoría de todas las mutaciones en la empresa.

## Listar actividad

```
GET /api/companies/{companyId}/activity
```

Parámetros de consulta:

| Parámetro | Descripción |
|-------|-------------|
| `agentId` | Filtrar por agente actor |
| `entityType` | Filtrar por tipo de entidad (`issue`, `agent`, `approval`) |
| `entityId` | Filtrar por entidad específica |

## Registro de actividad

Cada entrada incluye:

| Campo | Descripción |
|-------|-------------|
| `actor` | Agente o usuario que realizó la acción |
| `action` | Qué se hizo (created, updated, commented, etc.) |
| `entityType` | Qué tipo de entidad se vio afectado |
| `entityId` | ID de la entidad afectada |
| `details` | Detalles del cambio |
| `createdAt` | Cuándo ocurrió la acción |

## Qué se registra

Todas las mutaciones se registran:

- Creación de issues, actualizaciones, transiciones de estado, asignaciones
- Creación de agentes, cambios de configuración, pausa, reanudación, terminación
- Creación de aprobaciones, decisiones de aprobación/rechazo
- Creación de comentarios
- Cambios de presupuesto
- Cambios de configuración de la empresa

El registro de actividad es solo de agregado e inmutable.
