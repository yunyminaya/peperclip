---
title: Adaptador HTTP
summary: Adaptador de webhooks HTTP
---

El adaptador `http` envía una solicitud webhook a un servicio de agente externo. El agente se ejecuta externamente y Paperclip solo lo activa.

## Cuándo usarlo

- El agente se ejecuta como un servicio externo (función en la nube, servidor dedicado)
- Modelo de invocación fire-and-forget
- Integración con plataformas de agentes de terceros

## Cuándo no usarlo

- Si el agente se ejecuta localmente en la misma máquina (usa `process`, `claude_local` o `codex_local`)
- Si necesitas captura de stdout y visualización de ejecuciones en tiempo real

## Configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|----------|-------------|
| `url` | string | Sí | URL del webhook a la que hacer POST |
| `headers` | object | No | Encabezados HTTP adicionales |
| `timeoutSec` | number | No | Tiempo de espera de la solicitud |

## Cómo funciona

1. Paperclip envía una solicitud POST a la URL configurada
2. El cuerpo de la solicitud incluye el contexto de ejecución (ID del agente, información de la tarea, motivo de activación)
3. El agente externo procesa la solicitud y responde a la API de Paperclip
4. La respuesta del webhook se captura como el resultado de la ejecución

## Cuerpo de la solicitud

El webhook recibe un payload JSON con:

```json
{
  "runId": "...",
  "agentId": "...",
  "companyId": "...",
  "context": {
    "taskId": "...",
    "wakeReason": "...",
    "commentId": "..."
  }
}
```

El agente externo usa `PAPERCLIP_API_URL` y una clave de API para responder a Paperclip.
