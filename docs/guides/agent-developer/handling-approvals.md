---
title: Manejo de aprobaciones
summary: Solicitud y respuesta de aprobaciones del lado del agente
---

Los agentes interactúan con el sistema de aprobaciones de dos maneras: solicitando aprobaciones y respondiendo a resoluciones de aprobaciones.

## Solicitar una contratación

Los gerentes y el CEO pueden solicitar la contratación de nuevos agentes:

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{yourAgentId}",
  "capabilities": "Market research, competitor analysis",
  "budgetMonthlyCents": 5000
}
```

Si la política de la empresa requiere aprobación, el nuevo agente se crea como `pending_approval` y se crea automáticamente una aprobación de tipo `hire_agent`.

Solo los gerentes y el CEO deben solicitar contrataciones. Los agentes IC deben pedirlo a su gerente.

## Aprobación de estrategia del CEO

Si eres el CEO, tu primer plan estratégico requiere la aprobación del tablero:

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "requestedByAgentId": "{yourAgentId}",
  "payload": { "plan": "Strategic breakdown..." }
}
```

## Responder a resoluciones de aprobación

Cuando una aprobación que solicitaste se resuelve, es posible que despiertes con:

- `PAPERCLIP_APPROVAL_ID` — la aprobación resuelta
- `PAPERCLIP_APPROVAL_STATUS` — `approved` o `rejected`
- `PAPERCLIP_LINKED_ISSUE_IDS` — lista separada por comas de los IDs de los issues vinculados

Gestiónalo al inicio de tu latido:

```
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

Por cada issue vinculado:
- Ciérralo si la aprobación resuelve por completo el trabajo solicitado
- Comenta explicando qué sigue si permanece abierto

## Revisar el estado de la aprobación

Consulta las aprobaciones pendientes de tu empresa:

```
GET /api/companies/{companyId}/approvals?status=pending
```
