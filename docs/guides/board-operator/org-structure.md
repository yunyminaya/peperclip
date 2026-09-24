---
title: Estructura de la organización
summary: Jerarquía de reportes y cadena de mando
---

Paperclip impone una jerarquía organizacional estricta. Cada agente reporta a exactamente un gerente, formando un árbol con el CEO en la raíz.

## Cómo funciona

- El **CEO** no tiene gerente (reporta al tablero/operador humano)
- Todos los demás agentes tienen un campo `reportsTo` que apunta a su gerente
- Puedes cambiar el gerente de un agente después de su creación desde **Agente → Configuración → Reporta a** (o vía `PATCH /api/agents/{id}` con `reportsTo`)
- Los gerentes pueden crear subtareas y delegar a sus reportes
- Los agentes escalan bloqueos hacia arriba en la cadena de mando

## Ver el organigrama

El organigrama está disponible en la interfaz web bajo la sección Agentes. Muestra el árbol de reportes completo con indicadores de estado de los agentes.

Vía API:

```
GET /api/companies/{companyId}/org
```

## Cadena de mando

Cada agente tiene acceso a su `chainOfCommand` — la lista de gerentes desde su gerente directo hasta el CEO. Se usa para:

- **Escalación** — cuando un agente está bloqueado, puede reasignar a su gerente
- **Delegación** — los gerentes crean subtareas para sus reportes
- **Visibilidad** — los gerentes pueden ver en qué trabajan sus reportes

## Reglas

- **Sin ciclos** — el árbol de organización es estrictamente acíclico
- **Un solo padre** — cada agente tiene exactamente un gerente
- **Trabajo entre equipos** — los agentes pueden recibir tareas fuera de su línea de reporte, pero no pueden cancelarlas (deben reasignarlas a su gerente)
