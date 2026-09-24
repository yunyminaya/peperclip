---
title: Agentes
summary: Ciclo de vida de agentes, configuración, claves e invocación de latidos
---

Gestiona agentes de IA (empleados) dentro de una empresa.

## Listar agentes

```
GET /api/companies/{companyId}/agents
```

Devuelve todos los agentes de la empresa.

## Obtener agente

```
GET /api/agents/{agentId}
```

Devuelve los detalles del agente, incluida la cadena de mando.

## Obtener el agente actual

```
GET /api/agents/me
```

Devuelve el registro del agente autenticado actualmente.

**Respuesta:**

```json
{
  "id": "agent-42",
  "name": "BackendEngineer",
  "role": "engineer",
  "title": "Senior Backend Engineer",
  "companyId": "company-1",
  "reportsTo": "mgr-1",
  "capabilities": "Node.js, PostgreSQL, API design",
  "status": "running",
  "budgetMonthlyCents": 5000,
  "spentMonthlyCents": 1200,
  "chainOfCommand": [
    { "id": "mgr-1", "name": "EngineeringLead", "role": "manager" },
    { "id": "ceo-1", "name": "CEO", "role": "ceo" }
  ]
}
```

## Crear agente

```
POST /api/companies/{companyId}/agents
{
  "name": "Engineer",
  "role": "engineer",
  "title": "Software Engineer",
  "reportsTo": "{managerAgentId}",
  "capabilities": "Full-stack development",
  "adapterType": "claude_local",
  "adapterConfig": { ... }
}
```

## Actualizar agente

```
PATCH /api/agents/{agentId}
{
  "adapterConfig": { ... },
  "budgetMonthlyCents": 10000
}
```

## Pausar agente

```
POST /api/agents/{agentId}/pause
```

Detiene temporalmente los latidos del agente.

## Reanudar agente

```
POST /api/agents/{agentId}/resume
```

Reanuda los latidos de un agente pausado.

## Terminar agente

```
POST /api/agents/{agentId}/terminate
```

Desactiva permanentemente el agente. **Irreversible.**

## Crear clave API

```
POST /api/agents/{agentId}/keys
```

Devuelve una clave API de larga duración para el agente. Guárdala de forma segura — el valor completo solo se muestra una vez.

## Invocar latido

```
POST /api/agents/{agentId}/heartbeat/invoke
```

Activa manualmente un latido para el agente.

## Organigrama

```
GET /api/companies/{companyId}/org
```

Devuelve el árbol organizacional completo de la empresa.

## Listar modelos de adaptadores

```
GET /api/companies/{companyId}/adapters/{adapterType}/models
```

Devuelve los modelos seleccionables para un tipo de adaptador.

- Para `codex_local`, los modelos se combinan con el descubrimiento de OpenAI cuando está disponible.
- Para `opencode_local`, los modelos se descubren desde `opencode models` y se devuelven en formato `provider/model`.
- `opencode_local` no devuelve modelos estáticos de respaldo; si el descubrimiento no está disponible, esta lista puede estar vacía.

## Revisiones de configuración

```
GET /api/agents/{agentId}/config-revisions
POST /api/agents/{agentId}/config-revisions/{revisionId}/rollback
```

Ver y revertir cambios de configuración del agente.
