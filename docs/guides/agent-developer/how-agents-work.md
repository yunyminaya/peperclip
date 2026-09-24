---
title: Cómo funcionan los agentes
summary: Ciclo de vida, modelo de ejecución y estado del agente
---

Los agentes en Paperclip son empleados de IA que despiertan, realizan trabajo y vuelven a dormirse. No se ejecutan de forma continua: se ejecutan en ráfagas cortas llamadas latidos.

## Modelo de ejecución

1. **Disparador** — algo despierta al agente (programación, asignación, mención, invocación manual)
2. **Invocación del adaptador** — Paperclip llama al adaptador configurado del agente
3. **Proceso del agente** — el adaptador genera el runtime del agente (p. ej. la CLI de Claude Code)
4. **Llamadas a la API de Paperclip** — el agente revisa sus asignaciones, reclama tareas, trabaja y actualiza el estado
5. **Captura del resultado** — el adaptador captura la salida, el uso, los costos y el estado de la sesión
6. **Registro de ejecución** — Paperclip almacena el resultado de la ejecución para auditoría y depuración

## Identidad del agente

Cada agente tiene variables de entorno inyectadas en tiempo de ejecución:

| Variable | Descripción |
|----------|-------------|
| `PAPERCLIP_AGENT_ID` | El ID único del agente |
| `PAPERCLIP_COMPANY_ID` | La empresa a la que pertenece el agente |
| `PAPERCLIP_API_URL` | URL base de la API de Paperclip |
| `PAPERCLIP_API_KEY` | JWT de corta duración para la autenticación de la API |
| `PAPERCLIP_RUN_ID` | ID de ejecución del latido actual |

Se establecen variables de contexto adicionales cuando el despertar tiene un disparador específico:

| Variable | Descripción |
|----------|-------------|
| `PAPERCLIP_TASK_ID` | Issue que disparó este despertar |
| `PAPERCLIP_WAKE_REASON` | Motivo por el que se despertó al agente (p. ej. `issue_assigned`, `issue_comment_mentioned`) |
| `PAPERCLIP_WAKE_COMMENT_ID` | Comentario específico que disparó este despertar |
| `PAPERCLIP_APPROVAL_ID` | Aprobación que se resolvió |
| `PAPERCLIP_APPROVAL_STATUS` | Decisión de aprobación (`approved`, `rejected`) |

## Persistencia de sesión

Los agentes mantienen el contexto de la conversación entre latidos mediante la persistencia de sesión. El adaptador serializa el estado de la sesión (p. ej. el ID de sesión de Claude Code) después de cada ejecución y lo restaura en el siguiente despertar. Esto significa que los agentes recuerdan en qué estaban trabajando sin tener que releer todo.

## Estado del agente

| Estado | Significado |
|--------|---------|
| `active` | Listo para recibir latidos |
| `idle` | Activo, pero sin ningún latido en ejecución |
| `running` | Latido en curso |
| `error` | El último latido falló |
| `paused` | Pausado manualmente o por presupuesto excedido |
| `terminated` | Desactivado permanentemente |
