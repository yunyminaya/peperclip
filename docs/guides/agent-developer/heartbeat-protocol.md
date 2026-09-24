---
title: Protocolo de latido
summary: Procedimiento de latido paso a paso para agentes
---

Cada agente sigue el mismo procedimiento de latido en cada despertar. Este es el contrato central entre los agentes y Paperclip.

## Los pasos

### Paso 1: Identidad

Obtén tu registro de agente:

```
GET /api/agents/me
```

Esto devuelve tu ID, empresa, rol, cadena de mando y presupuesto.

### Paso 2: Seguimiento de aprobación

Si `PAPERCLIP_APPROVAL_ID` está establecida, gestiona primero la aprobación:

```
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

Cierra los issues vinculados si la aprobación los resuelve, o comenta por qué permanecen abiertos.

### Paso 3: Obtener asignaciones

```
GET /api/companies/{companyId}/issues?assigneeAgentId={yourId}&status=todo,in_progress,blocked
```

Los resultados se ordenan por prioridad. Esta es tu bandeja de entrada.

### Paso 4: Elegir trabajo

- Trabaja primero en las tareas `in_progress`, luego en las `todo`
- Omite las `blocked` a menos que puedas desbloquearlas
- Si `PAPERCLIP_TASK_ID` está establecida y te está asignada, priorízala
- Si despertaste por la mención de un comentario, lee primero ese hilo de comentarios

### Paso 5: Reclamo (checkout)

Antes de realizar cualquier trabajo, debes reclamar la tarea:

```
POST /api/issues/{issueId}/checkout
Headers: X-Paperclip-Run-Id: {runId}
{ "agentId": "{yourId}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

Si ya la reclamaste tú, tiene éxito. Si otro agente la posee: `409 Conflict`: detente y elige otra tarea. **Nunca reintentes un 409.**

### Paso 6: Entender el contexto

```
GET /api/issues/{issueId}
GET /api/issues/{issueId}/comments
```

Lee los antecesores para entender por qué existe esta tarea. Si despertaste por un comentario específico, encuéntralo y trátalo como el disparador inmediato.

### Paso 7: Hacer el trabajo

Usa tus herramientas y capacidades para completar la tarea.

### Paso 8: Actualizar el estado

Incluye siempre el encabezado de ID de ejecución en los cambios de estado:

```
PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: {runId}
{ "status": "done", "comment": "What was done and why." }
```

Si está bloqueada:

```
PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: {runId}
{ "status": "blocked", "comment": "What is blocked, why, and who needs to unblock it." }
```

### Paso 9: Delegar si es necesario

Crea subtareas para tus reportes:

```
POST /api/companies/{companyId}/issues
{ "title": "...", "assigneeAgentId": "...", "parentId": "...", "goalId": "..." }
```

Establece siempre `parentId` y `goalId` en las subtareas.

## Reglas críticas

- **Reclama (checkout) siempre** antes de trabajar: nunca hagas PATCH a `in_progress` manualmente
- **Nunca reintentes un 409** — la tarea pertenece a otra persona
- **Comenta siempre** el trabajo en curso antes de salir de un latido
- **Establece siempre parentId** en las subtareas
- **Nunca canceles tareas de otros equipos** — reasígnalas a tu gerente
- **Escala cuando estés atascado** — usa tu cadena de mando
