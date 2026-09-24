# Referencia de la especificación de Agent Companies

La especificación normativa se encuentra en:

- Web: https://agentcompanies.io/specification
- Local: docs/companies/companies-spec.md

Lee el archivo local de la especificación antes de generar cualquier archivo del paquete. La especificación define el formato canónico y todos los campos del frontmatter. Abajo hay un resumen de referencia rápida para tareas comunes de autoría.

## Tipos de paquete

| Archivo    | Tipo      | Propósito                                                           |
| ---------- | ------- | ------------------------------------------------- |
| COMPANY.md | company | Punto de entrada raíz, límite de la organización y valores predeterminados |
| TEAM.md    | team    | Subárbol reutilizable de la organización                                |
| AGENTS.md  | agent   | Un rol, instrucciones y habilidades asociadas                       |
| PROJECT.md | project | Agrupación de trabajo planificado                                     |
| TASK.md    | task    | Tarea inicial portable                                                  |
| SKILL.md   | skill   | Paquete de capacidad de habilidades de agente (no redefinir)            |

## Diseño de directorios

```
company-package/
├── COMPANY.md
├── agents/
│   └── <slug>/AGENTS.md
├── teams/
│   └── <slug>/TEAM.md
├── projects/
│   └── <slug>/
│       ├── PROJECT.md
│       └── tasks/
│           └── <slug>/TASK.md
├── tasks/
│   └── <slug>/TASK.md
├── skills/
│   └── <slug>/SKILL.md
├── assets/
├── scripts/
├── references/
└── .paperclip.yaml          (optional vendor extension)
```

## Campos comunes del frontmatter

```yaml
schema: agentcompanies/v1
kind: company | team | agent | project | task
slug: url-safe-stable-identity
name: Human Readable Name
description: Short description for discovery
version: 0.1.0
license: MIT
authors:
  - name: Jane Doe
tags: []
metadata: {}
sources: []
```

- `schema` suele aparecer solo en la raíz del paquete
- `kind` es opcional cuando el nombre del archivo lo hace obvio
- `slug` debe ser apto para URL y estable
- los exportadores deben omitir campos vacíos o con valores predeterminados

## Campos requeridos de COMPANY.md

```yaml
name: Company Name
description: What this company does
slug: company-slug
schema: agentcompanies/v1
```

Opcional: `version`, `license`, `authors`, `goals`, `includes`, `requirements.secrets`

## Campos clave de AGENTS.md

```yaml
name: Agent Name
title: Role Title
reportsTo: <agent-slug or null>
skills:
  - skill-shortname
```

- El contenido del cuerpo son las instrucciones predeterminadas del agente
- Las habilidades se resuelven por nombre corto: `skills/<shortname>/SKILL.md`
- No exportes rutas específicas de la máquina ni secretos

## Campos clave de TEAM.md

```yaml
name: Team Name
description: What this team does
slug: team-slug
manager: ../agent-slug/AGENTS.md
includes:
  - ../agent-slug/AGENTS.md
  - ../../skills/skill-slug/SKILL.md
```

## Campos clave de PROJECT.md

```yaml
name: Project Name
description: What this project delivers
owner: agent-slug
```

## Campos clave de TASK.md

```yaml
name: Task Name
assignee: agent-slug
project: project-slug
schedule:
  timezone: America/Chicago
  startsAt: 2026-03-16T09:00:00-05:00
  recurrence:
    frequency: weekly
    interval: 1
    weekdays: [monday]
    time: { hour: 9, minute: 0 }
```

## Referencias de fuente (para habilidades/contenido externos)

```yaml
sources:
  - kind: github-file
    repo: owner/repo
    path: path/to/SKILL.md
    commit: <full-sha>
    sha256: <hash>
    attribution: Owner Name
    license: MIT
    usage: referenced
```

Modos de uso: `vendored` (bytes incluidos), `referenced` (solo puntero), `mirrored` (en caché local)

Por defecto, `referenced` para contenido de terceros.
