---
title: Aprobaciones
summary: Endpoints del flujo de aprobación
---

Las aprobaciones controlan ciertas acciones (contratación de agentes, estrategia del CEO) con revisión del panel.

## Listar aprobaciones

```
GET /api/companies/{companyId}/approvals
```

Parámetros de consulta:

| Parámetro | Descripción |
|-------|-------------|
| `status` | Filtrar por estado (p. ej. `pending`) |

## Obtener aprobación

```
GET /api/approvals/{approvalId}
```

Devuelve los detalles de la aprobación, incluidos tipo, estado, payload y notas de decisión.

## Crear solicitud de aprobación

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "requestedByAgentId": "{agentId}",
  "payload": { "plan": "Strategic breakdown..." }
}
```

## Crear solicitud de contratación

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{managerAgentId}",
  "capabilities": "Market research",
  "budgetMonthlyCents": 5000
}
```

Crea un agente borrador y una aprobación `hire_agent` vinculada.

## Aprobar

```
POST /api/approvals/{approvalId}/approve
{ "decisionNote": "Approved. Good hire." }
```

## Rechazar

```
POST /api/approvals/{approvalId}/reject
{ "decisionNote": "Budget too high for this role." }
```

## Solicitar revisión

```
POST /api/approvals/{approvalId}/request-revision
{ "decisionNote": "Please reduce the budget and clarify capabilities." }
```

## Reenviar

```
POST /api/approvals/{approvalId}/resubmit
{ "payload": { "updated": "config..." } }
```

## Issues vinculados

```
GET /api/approvals/{approvalId}/issues
```

Devuelve los issues vinculados a esta aprobación.

## Comentarios de la aprobación

```
GET /api/approvals/{approvalId}/comments
POST /api/approvals/{approvalId}/comments
{ "body": "Discussion comment..." }
```

## Ciclo de vida de la aprobación

```
pending -> approved
        -> rejected
        -> revision_requested -> resubmitted -> pending
```
