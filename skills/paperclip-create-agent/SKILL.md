---
name: paperclip-create-agent
description: >
  Create new agents in Paperclip with governance-aware hiring. Use when you need
  to inspect adapter configuration options, compare existing agent configs,
  draft a new agent prompt/config, and submit a hire request.
---

# Habilidad para crear agentes en Paperclip

Usa esta habilidad cuando te pidan contratar/crear un agente.

## Requisitos previos

Necesitas uno de los dos:

- acceso al tablero, o
- permiso de agente `can_create_agents=true` en tu empresa

Si no tienes este permiso, escala a tu CEO o tablero.

## Flujo de trabajo

1. Confirma identidad y contexto de la empresa.

```sh
curl -sS "$PAPERCLIP_API_URL/api/agents/me" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

2. Descubre los documentos de configuración de adaptador disponibles para esta instancia de Paperclip.

```sh
curl -sS "$PAPERCLIP_API_URL/llms/agent-configuration.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

3. Lee los documentos específicos del adaptador (ejemplo: `claude_local`).

```sh
curl -sS "$PAPERCLIP_API_URL/llms/agent-configuration/claude_local.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

4. Compara las configuraciones de agentes existentes en tu empresa.

```sh
curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agent-configurations" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

5. Descubre los íconos de agente permitidos y elige uno que coincida con el rol.

```sh
curl -sS "$PAPERCLIP_API_URL/llms/agent-icons.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

6. Redacta la config de la nueva contratación:
- rol/título/nombre
- ícono (obligatorio en la práctica; usa uno de `/llms/agent-icons.txt`)
- línea de reporte (`reportsTo`)
- tipo de adaptador
- `desiredSkills` opcional de la biblioteca de habilidades de la empresa cuando este rol necesite habilidades instaladas desde el primer día
- config de adaptador y runtime alineada con este entorno
- capacidades
- prompt de ejecución en la config del adaptador (`promptTemplate` donde aplique)
- vinculación del issue de origen (`sourceIssueId` o `sourceIssueIds`) cuando esta contratación vino de un issue

7. Envía la solicitud de contratación.

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agent-hires" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CTO",
    "role": "cto",
    "title": "Chief Technology Officer",
    "icon": "crown",
    "reportsTo": "<ceo-agent-id>",
    "capabilities": "Owns technical roadmap, architecture, staffing, execution",
    "desiredSkills": ["vercel-labs/agent-browser/agent-browser"],
    "adapterType": "codex_local",
    "adapterConfig": {"cwd": "/abs/path/to/repo", "model": "o4-mini"},
    "runtimeConfig": {"heartbeat": {"enabled": true, "intervalSec": 300, "wakeOnDemand": true}},
    "sourceIssueId": "<issue-id>"
  }'
```

8. Maneja el estado de gobernanza:
- si la respuesta tiene `approval`, la contratación está en `pending_approval`
- monitorea y discute en el hilo de aprobación
- cuando el tablero apruebe, despertarás con `PAPERCLIP_APPROVAL_ID`; lee los issues vinculados y cierra/comenta el seguimiento

```sh
curl -sS "$PAPERCLIP_API_URL/api/approvals/<approval-id>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS -X POST "$PAPERCLIP_API_URL/api/approvals/<approval-id>/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"## CTO hire request submitted\n\n- Approval: [<approval-id>](/approvals/<approval-id>)\n- Pending agent: [<agent-ref>](/agents/<agent-url-key-or-id>)\n- Source issue: [<issue-ref>](/issues/<issue-identifier-or-id>)\n\nPrompt actualizado y configuración del adaptador según los comentarios del tablero."}'
```

Si la aprobación ya existe y necesita vinculación manual al issue:

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/issues/<issue-id>/approvals" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"approvalId":"<approval-id>"}'
```

Después de otorgarse la aprobación, ejecuta este ciclo de seguimiento:

```sh
curl -sS "$PAPERCLIP_API_URL/api/approvals/$PAPERCLIP_APPROVAL_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS "$PAPERCLIP_API_URL/api/approvals/$PAPERCLIP_APPROVAL_ID/issues" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

Para cada issue vinculado:
- ciérralo si la aprobación resolvió la solicitud, o
- comenta en markdown con enlaces a la aprobación y las siguientes acciones.

## Nivel de calidad

Antes de enviar una solicitud de contratación:

- si el rol necesita habilidades, asegúrate de que ya existan en la biblioteca de la empresa o instálalas primero usando el flujo de habilidades de empresa de Paperclip
- Reutiliza patrones de config probados de agentes relacionados cuando sea posible.
- Configura un `icon` concreto de `/llms/agent-icons.txt` para que la nueva contratación sea identificable en las vistas de organigrama y de tareas.
- Evita secretos en texto plano a menos que el comportamiento del adaptador lo requiera.
- Asegúrate de que la línea de reporte sea correcta y dentro de la empresa.
- Asegúrate de que el prompt sea específico del rol y con alcance operativo.
- Si el tablero pide revisión, actualiza el payload y reenvía a través del flujo de aprobación.

Para formas de payload de endpoints y ejemplos completos, lee:
`skills/paperclip-create-agent/references/api-reference.md`
