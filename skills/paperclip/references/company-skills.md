# Flujo de trabajo de habilidades de la empresa

Usa esta referencia cuando un usuario del tablero, el CEO o un gerente te pida encontrar una habilidad, instalarla en la biblioteca de la empresa o asignarla a un agente.

## Qué existe

- Biblioteca de habilidades de la empresa: instalar, inspeccionar, actualizar y leer habilidades importadas para toda la empresa.
- Asignación de habilidades a agentes: agregar o quitar habilidades de la empresa en un agente existente.
- Composición de contratación/creación: pasa `desiredSkills` al crear o contratar un agente para que el mismo modelo de asignación se aplique de inmediato.

El modelo canónico es:

1. instalar la habilidad en la empresa
2. asignar la habilidad de la empresa al agente
3. opcionalmente hacer el paso 2 durante la contratación/creación con `desiredSkills`

## Modelo de permisos

- Lecturas de habilidades de la empresa: cualquier actor de la misma empresa
- Mutaciones de habilidades de la empresa: tablero, CEO o un agente con la capacidad efectiva `agents:create`
- Asignación de habilidades a agentes: mismo modelo de permisos que actualizar ese agente

## Endpoints principales

- `GET /api/companies/:companyId/skills`
- `GET /api/companies/:companyId/skills/:skillId`
- `POST /api/companies/:companyId/skills/import`
- `POST /api/companies/:companyId/skills/scan-projects`
- `POST /api/companies/:companyId/skills/:skillId/install-update`
- `GET /api/agents/:agentId/skills`
- `POST /api/agents/:agentId/skills/sync`
- `POST /api/companies/:companyId/agent-hires`
- `POST /api/companies/:companyId/agents`

## Instalar una habilidad en la empresa

Importa usando una **URL de skills.sh**, una cadena de fuente estilo clave, una URL de GitHub o una ruta local.

### Tipos de fuente (en orden de preferencia)

| Formato de fuente | Ejemplo | Cuándo usar |
|---|---|---|
| **URL de skills.sh** | `https://skills.sh/google-labs-code/stitch-skills/design-md` | Cuando un usuario te da un enlace `skills.sh`. Este es el registro de habilidades gestionado — **prefiérelo siempre cuando esté disponible**. |
| **Cadena estilo clave** | `google-labs-code/stitch-skills/design-md` | Forma abreviada de la misma habilidad — formato `org/repo/skill-name`. Equivalente a la URL de skills.sh. |
| **URL de GitHub** | `https://github.com/vercel-labs/agent-browser` | Cuando la habilidad está en un repositorio de GitHub pero no en skills.sh. |
| **Ruta local** | `/abs/path/to/skill-dir` | Cuando la habilidad está en disco (solo desarrollo/pruebas). |

**Crítico:** Si un usuario te da una URL `https://skills.sh/...`, usa esa URL o su equivalente en estilo clave (`org/repo/skill-name`) como `source`. **No** la conviertas a una URL de GitHub — skills.sh es el registro gestionado y la fuente de verdad para versionado, descubrimiento y actualizaciones.

### Ejemplo: importación desde skills.sh (preferida)

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/import" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "https://skills.sh/google-labs-code/stitch-skills/design-md"
  }'
```

O equivalentemente usando la cadena estilo clave:

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/import" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "google-labs-code/stitch-skills/design-md"
  }'
```

### Ejemplo: importación desde GitHub

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/import" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "https://github.com/vercel-labs/agent-browser"
  }'
```

También puedes usar cadenas de fuente como:

- `google-labs-code/stitch-skills/design-md`
- `vercel-labs/agent-browser/agent-browser`
- `npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser`

Si la tarea es descubrir primero las habilidades de los espacios de trabajo de proyectos de la empresa:

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/scan-projects" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Inspeccionar lo instalado

```sh
curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

Lee la entrada de la habilidad y su `SKILL.md`:

```sh
curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/<skill-id>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/skills/<skill-id>/files?path=SKILL.md" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

## Asignar habilidades a un agente existente

`desiredSkills` acepta:

- clave exacta de la habilidad de la empresa
- id exacto de la habilidad de la empresa
- slug exacto cuando es único en la empresa

El servidor persiste las claves canónicas de habilidades de la empresa.

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/agents/<agent-id>/skills/sync" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "desiredSkills": [
      "vercel-labs/agent-browser/agent-browser"
    ]
  }'
```

Si primero necesitas el estado actual:

```sh
curl -sS "$PAPERCLIP_API_URL/api/agents/<agent-id>/skills" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

## Incluir habilidades al contratar o crear

Usa las mismas claves o referencias de habilidades de la empresa en `desiredSkills` al contratar o crear un agente:

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agent-hires" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Browser Agent",
    "role": "qa",
    "adapterType": "codex_local",
    "adapterConfig": {
      "cwd": "/abs/path/to/repo"
    },
    "desiredSkills": [
      "agent-browser"
    ]
  }'
```

Para creación directa sin aprobación:

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agents" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Browser Agent",
    "role": "qa",
    "adapterType": "codex_local",
    "adapterConfig": {
      "cwd": "/abs/path/to/repo"
    },
    "desiredSkills": [
      "agent-browser"
    ]
  }'
```

## Notas

- Las habilidades de runtime integradas de Paperclip aún se agregan automáticamente cuando el adaptador las requiere.
- Si una referencia falta o es ambigua, la API devuelve `422`.
- Prefiere enlazar al issue, la aprobación y el agente relevantes cuando comentes sobre cambios de habilidades.
- Usa las rutas de portabilidad de empresa cuando necesites importación/exportación de todo el paquete, no solo una habilidad:
  - `POST /api/companies/:companyId/imports/preview`
  - `POST /api/companies/:companyId/imports/apply`
  - `POST /api/companies/:companyId/exports/preview`
  - `POST /api/companies/:companyId/exports`
- Usa la importación solo de habilidad cuando la tarea sea específicamente agregar una habilidad a la biblioteca de la empresa sin importar la estructura de empresa/equipo/paquete circundante.
