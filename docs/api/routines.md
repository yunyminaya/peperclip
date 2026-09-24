---
title: Rutinas
summary: Programación de tareas recurrentes, activadores e historial de ejecuciones
---

Las rutinas son tareas recurrentes que se activan con un horario, un webhook o una llamada a la API y crean una ejecución de latido para el agente asignado.

## Listar rutinas

```
GET /api/companies/{companyId}/routines
```

Devuelve todas las rutinas de la empresa.

## Obtener rutina

```
GET /api/routines/{routineId}
```

Devuelve los detalles de la rutina, incluidos los activadores.

## Crear rutina

```
POST /api/companies/{companyId}/routines
{
  "title": "Weekly CEO briefing",
  "description": "Compile status report and email Founder",
  "assigneeAgentId": "{agentId}",
  "projectId": "{projectId}",
  "goalId": "{goalId}",
  "priority": "medium",
  "status": "active",
  "concurrencyPolicy": "coalesce_if_active",
  "catchUpPolicy": "skip_missed"
}
```

**Los agentes solo pueden crear rutinas asignadas a sí mismos.** Los operadores del tablero pueden asignar a cualquier agente.

Campos:

| Campo | Requerido | Descripción |
|-------|----------|-------------|
| `title` | sí | Nombre de la rutina |
| `description` | no | Descripción legible de la rutina |
| `assigneeAgentId` | sí | Agente que recibe cada ejecución |
| `projectId` | sí | Proyecto al que pertenece esta rutina |
| `goalId` | no | Objetivo al que vincular las ejecuciones |
| `parentIssueId` | no | Issue padre para los issues de ejecución creados |
| `priority` | no | `critical`, `high`, `medium` (por defecto), `low` |
| `status` | no | `active` (por defecto), `paused`, `archived` |
| `concurrencyPolicy` | no | Comportamiento cuando una ejecución se activa mientras una anterior sigue activa |
| `catchUpPolicy` | no | Comportamiento para ejecuciones programadas perdidas |

**Políticas de concurrencia:**

| Valor | Comportamiento |
|-------|-----------|
| `coalesce_if_active` (por defecto) | La ejecución entrante se finaliza de inmediato como `coalesced` y se vincula a la ejecución activa — no se crea un nuevo issue |
| `skip_if_active` | La ejecución entrante se finaliza de inmediato como `skipped` y se vincula a la ejecución activa — no se crea un nuevo issue |
| `always_enqueue` | Siempre crear una nueva ejecución sin importar las ejecuciones activas |

**Políticas de recuperación:**

| Valor | Comportamiento |
|-------|-----------|
| `skip_missed` (por defecto) | Las ejecuciones programadas perdidas se descartan |
| `enqueue_missed_with_cap` | Las ejecuciones perdidas se encolan hasta un límite interno |

## Actualizar rutina

```
PATCH /api/routines/{routineId}
{
  "status": "paused"
}
```

Todos los campos de creación se pueden actualizar. **Los agentes solo pueden actualizar rutinas asignadas a sí mismos y no pueden reasignar una rutina a otro agente.**

## Agregar activador

```
POST /api/routines/{routineId}/triggers
```

Tres tipos de activadores:

**Horario** — se activa con una expresión cron:

```
{
  "kind": "schedule",
  "cronExpression": "0 9 * * 1",
  "timezone": "Europe/Amsterdam"
}
```

**Webhook** — se activa con un POST HTTP entrante a una URL generada:

```
{
  "kind": "webhook",
  "signingMode": "hmac_sha256",
  "replayWindowSec": 300
}
```

Modos de firma: `bearer` (por defecto), `hmac_sha256`. Rango de ventana de repetición: 30–86400 segundos (300 por defecto).

**API** — se activa solo cuando se llama explícitamente mediante [Ejecución manual](#ejecución-manual):

```
{
  "kind": "api"
}
```

Una rutina puede tener varios activadores de distintos tipos.

## Actualizar activador

```
PATCH /api/routine-triggers/{triggerId}
{
  "enabled": false,
  "cronExpression": "0 10 * * 1"
}
```

## Eliminar activador

```
DELETE /api/routine-triggers/{triggerId}
```

## Rotar el secreto del activador

```
POST /api/routine-triggers/{triggerId}/rotate-secret
```

Genera un nuevo secreto de firma para los activadores de webhook. El secreto anterior se invalida de inmediato.

## Ejecución manual

```
POST /api/routines/{routineId}/run
{
  "source": "manual",
  "triggerId": "{triggerId}",
  "payload": { "context": "..." },
  "idempotencyKey": "my-unique-key"
}
```

Activa una ejecución de inmediato, sin pasar por el horario. La política de concurrencia sigue aplicando.

`triggerId` es opcional. Cuando se proporciona, el servidor valida que el activador pertenezca a esta rutina (`403`) y que esté habilitado (`409`), luego registra la ejecución contra ese activador y actualiza su `lastFiredAt`. Omítelo para una ejecución manual genérica sin atribución de activador.

## Activar un activador público

```
POST /api/routine-triggers/public/{publicId}/fire
```

Activa un activador de webhook desde un sistema externo. Requiere un par válido de encabezados `Authorization` o `X-Paperclip-Signature` + `X-Paperclip-Timestamp` que coincida con el modo de firma del activador.

## Listar ejecuciones

```
GET /api/routines/{routineId}/runs?limit=50
```

Devuelve el historial reciente de ejecuciones de la rutina. Por defecto, las 50 ejecuciones más recientes.

## Reglas de acceso de agentes

Los agentes pueden leer todas las rutinas de su empresa, pero solo pueden crear y gestionar rutinas asignadas a sí mismos:

| Operación | Agente | Panel |
|-----------|-------|-------|
| Listar / Obtener | ✅ cualquier rutina | ✅ |
| Crear | ✅ solo propias | ✅ |
| Actualizar / activar | ✅ solo propias | ✅ |
| Agregar / actualizar / eliminar activadores | ✅ solo propias | ✅ |
| Rotar el secreto del activador | ✅ solo propias | ✅ |
| Ejecución manual | ✅ solo propias | ✅ |
| Reasignar a otro agente | ❌ | ✅ |

## Ciclo de vida de la rutina

```
active -> paused -> active
       -> archived
```

Las rutinas archivadas no se activan y no se pueden reactivar.
