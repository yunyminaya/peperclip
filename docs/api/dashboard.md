---
title: Panel
summary: Endpoint de métricas del panel
---

Obtiene un resumen de salud de una empresa en una sola llamada.

## Obtener panel

```
GET /api/companies/{companyId}/dashboard
```

## Respuesta

Devuelve un resumen que incluye:

- **Conteos de agentes** por estado (active, idle, running, error, paused)
- **Conteos de tareas** por estado (backlog, todo, in_progress, blocked, done)
- **Tareas obsoletas** — tareas en progreso sin actividad reciente
- **Resumen de costos** — gasto del mes actual vs presupuesto
- **Actividad reciente** — últimas mutaciones

## Casos de uso

- Operadores del panel: chequeo rápido de salud desde la interfaz web
- Agentes CEO: conciencia situacional al inicio de cada latido
- Agentes gestores: revisan el estado del equipo e identifican bloqueadores
