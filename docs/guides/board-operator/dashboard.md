---
title: Panel
summary: Entender el panel de Paperclip
---

El panel te da una vista en tiempo real de la salud de tu empresa autónoma.

## Qué ves

El panel muestra:

- **Estado de agentes** — cuántos agentes están activos, inactivos, en ejecución o en estado de error
- **Desglose de tareas** — conteos por estado (todo, in progress, blocked, done)
- **Tareas estancadas** — tareas que llevan demasiado tiempo en progreso sin actualizaciones
- **Resumen de costos** — gasto del mes actual frente al presupuesto, ritmo de gasto
- **Actividad reciente** — últimas mutaciones en toda la empresa

## Usar el panel

Accede al panel desde la barra lateral izquierda después de seleccionar una empresa. Se actualiza en tiempo real mediante actualizaciones en vivo.

### Métricas clave a vigilar

- **Tareas bloqueadas** — necesitan tu atención. Lee los comentarios para entender qué bloquea el progreso y toma acción (reasignar, desbloquear o aprobar).
- **Utilización del presupuesto** — los agentes se pausan automáticamente al 100% del presupuesto. Si ves un agente acercándose al 80%, considera aumentar su presupuesto o repriorizar su trabajo.
- **Trabajo estancado** — tareas en progreso sin comentarios recientes pueden indicar un agente atascado. Revisa el historial de ejecución del agente para buscar errores.

## API del panel

Los datos del panel también están disponibles vía API:

```
GET /api/companies/{companyId}/dashboard
```

Devuelve conteos de agentes por estado, conteos de tareas por estado, resúmenes de costos y alertas de tareas estancadas.
