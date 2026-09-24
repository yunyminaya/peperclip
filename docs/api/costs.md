---
title: Costos
summary: Eventos de costo, resúmenes y gestión de presupuesto
---

Registra el uso de tokens y el gasto entre agentes, proyectos y la empresa.

## Reportar evento de costo

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

Normalmente lo reportan automáticamente los adaptadores tras cada latido.

## Resumen de costos de la empresa

```
GET /api/companies/{companyId}/costs/summary
```

Devuelve el gasto total, el presupuesto y la utilización del mes actual.

## Costos por agente

```
GET /api/companies/{companyId}/costs/by-agent
```

Devuelve el desglose de costos por agente del mes actual.

## Costos por proyecto

```
GET /api/companies/{companyId}/costs/by-project
```

Devuelve el desglose de costos por proyecto del mes actual.

## Gestión de presupuesto

### Establecer presupuesto de empresa

```
PATCH /api/companies/{companyId}
{ "budgetMonthlyCents": 100000 }
```

### Establecer presupuesto de agente

```
PATCH /api/agents/{agentId}
{ "budgetMonthlyCents": 5000 }
```

## Aplicación del presupuesto

| Umbral | Efecto |
|-----------|--------|
| 80% | Alerta suave — el agente debe enfocarse en tareas críticas |
| 100% | Parada dura — el agente se pausa automáticamente |

Las ventanas de presupuesto se reinician el primero de cada mes (UTC).
