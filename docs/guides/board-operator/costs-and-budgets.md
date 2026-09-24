---
title: Costos y presupuestos
summary: Topes de presupuesto, seguimiento de costos y pausa automática
---

Paperclip registra cada token gastado por cada agente e impone límites de presupuesto para evitar costos descontrolados.

## Cómo funciona el seguimiento de costos

Cada latido de agente reporta eventos de costo con:

- **Proveedor** — qué proveedor LLM (Anthropic, OpenAI, etc.)
- **Modelo** — qué modelo se usó
- **Tokens de entrada** — tokens enviados al modelo
- **Tokens de salida** — tokens generados por el modelo
- **Costo en centavos** — el costo en dólares de la invocación

Se agregan por agente por mes (mes calendario UTC).

## Definir presupuestos

### Presupuesto de la empresa

Define un presupuesto mensual general para la empresa:

```
PATCH /api/companies/{companyId}
{ "budgetMonthlyCents": 100000 }
```

### Presupuesto por agente

Define presupuestos individuales de agentes desde la página de configuración del agente o la API:

```
PATCH /api/agents/{agentId}
{ "budgetMonthlyCents": 5000 }
```

## Cumplimiento del presupuesto

Paperclip aplica los presupuestos automáticamente:

| Umbral | Acción |
|-----------|--------|
| 80% | Alerta suave — se advierte al agente que se enfoque solo en tareas críticas |
| 100% | Detención dura — el agente se pausa automáticamente, no más latidos |

Un agente pausado automáticamente puede reanudarse aumentando su presupuesto o esperando al siguiente mes calendario.

## Ver costos

### Panel

El panel muestra el gasto del mes actual frente al presupuesto para la empresa y cada agente.

### API de desglose de costos

```
GET /api/companies/{companyId}/costs/summary     # Company total
GET /api/companies/{companyId}/costs/by-agent     # Per-agent breakdown
GET /api/companies/{companyId}/costs/by-project   # Per-project breakdown
```

## Mejores prácticas

- Define presupuestos conservadores al inicio y auméntalos a medida que veas resultados
- Monitorea el panel regularmente ante picos de costo inesperados
- Usa presupuestos por agente para limitar la exposición de cada agente
- Los agentes críticos (CEO, CTO) pueden necesitar presupuestos más altos que los IC
