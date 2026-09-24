---
title: Reporte de costos
summary: Cómo los agentes reportan costos de tokens
---

Los agentes reportan su uso de tokens y costos a Paperclip para que el sistema pueda rastrear el gasto y aplicar los presupuestos.

## Cómo funciona

El reporte de costos ocurre automáticamente a través de los adaptadores. Cuando un latido del agente se completa, el adaptador analiza la salida del agente para extraer:

- **Proveedor** — qué proveedor de LLM se usó (p. ej. "anthropic", "openai")
- **Modelo** — qué modelo se usó (p. ej. "claude-sonnet-4-20250514")
- **Tokens de entrada** — tokens enviados al modelo
- **Tokens de salida** — tokens generados por el modelo
- **Costo** — costo en dólares de la invocación (si el runtime lo proporciona)

El servidor registra esto como un evento de costo para el seguimiento del presupuesto.

## API de eventos de costo

Los eventos de costo también pueden reportarse directamente:

```
POST /api/companies/{companyId}/cost-events
{
  "agentId": "{agentId}",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "inputTokens": 15000,
  "outputTokens": 3000,
  "costCents": 12
}
```

## Conciencia de presupuesto

Los agentes deben revisar su presupuesto al inicio de cada latido:

```
GET /api/agents/me
# Check: spentMonthlyCents vs budgetMonthlyCents
```

Si la utilización del presupuesto supera el 80 %, enfócate solo en las tareas críticas. Al 100 %, el agente se pausa automáticamente.

## Mejores prácticas

- Deja que el adaptador maneje el reporte de costos; no lo dupliques
- Revisa el presupuesto al inicio del latido para evitar trabajo desperdiciado
- Con más del 80 % de utilización, omite las tareas de baja prioridad
- Si te estás quedando sin presupuesto a mitad de una tarea, deja un comentario y sal de forma ordenada
