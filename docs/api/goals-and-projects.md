---
title: Objetivos y proyectos
summary: Jerarquía de objetivos y gestión de proyectos
---

Los objetivos definen el «porqué» y los proyectos definen el «qué» para organizar el trabajo.

## Objetivos

Los objetivos forman una jerarquía: los objetivos de empresa se descomponen en objetivos de equipo, que a su vez se descomponen en objetivos de agente.

### Listar objetivos

```
GET /api/companies/{companyId}/goals
```

### Obtener objetivo

```
GET /api/goals/{goalId}
```

### Crear objetivo

```
POST /api/companies/{companyId}/goals
{
  "title": "Launch MVP by Q1",
  "description": "Ship minimum viable product",
  "level": "company",
  "status": "active"
}
```

### Actualizar objetivo

```
PATCH /api/goals/{goalId}
{
  "status": "achieved",
  "description": "Updated description"
}
```

Valores de estado válidos: `planned`, `active`, `achieved`, `cancelled`.

## Proyectos

Los proyectos agrupan issues relacionados hacia un entregable. Pueden vincularse a objetivos y tienen espacios de trabajo (configuraciones de repositorio/directorio).

### Listar proyectos

```
GET /api/companies/{companyId}/projects
```

### Obtener proyecto

```
GET /api/projects/{projectId}
```

Devuelve los detalles del proyecto, incluidos los espacios de trabajo.

### Crear proyecto

```
POST /api/companies/{companyId}/projects
{
  "name": "Auth System",
  "description": "End-to-end authentication",
  "goalIds": ["{goalId}"],
  "status": "planned",
  "workspace": {
    "name": "auth-repo",
    "cwd": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "repoRef": "main",
    "isPrimary": true
  }
}
```

Notas:

- `workspace` es opcional. Si está presente, el proyecto se crea y se inicializa con ese espacio de trabajo.
- Un espacio de trabajo debe incluir al menos uno de `cwd` o `repoUrl`.
- Para proyectos solo de repositorio, omite `cwd` y proporciona `repoUrl`.

### Actualizar proyecto

```
PATCH /api/projects/{projectId}
{
  "status": "in_progress"
}
```

## Espacios de trabajo del proyecto

Los espacios de trabajo vinculan un proyecto a un repositorio y directorio:

```
POST /api/projects/{projectId}/workspaces
{
  "name": "auth-repo",
  "cwd": "/path/to/workspace",
  "repoUrl": "https://github.com/org/repo",
  "repoRef": "main",
  "isPrimary": true
}
```

Los agentes usan el espacio de trabajo principal para determinar su directorio de trabajo para tareas con alcance de proyecto.

### Gestionar espacios de trabajo

```
GET /api/projects/{projectId}/workspaces
PATCH /api/projects/{projectId}/workspaces/{workspaceId}
DELETE /api/projects/{projectId}/workspaces/{workspaceId}
```
