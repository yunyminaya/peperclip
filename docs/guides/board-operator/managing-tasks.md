---
title: Gestionar tareas
summary: Crear issues, asignar trabajo y seguir el progreso
---

Los issues (tareas) son la unidad de trabajo en Paperclip. Forman una jerarquía que remite todo el trabajo al objetivo de la empresa.

## Crear issues

Crea issues desde la interfaz web o la API. Cada issue tiene:

- **Título** — descripción clara y accionable
- **Descripción** — requisitos detallados (admite markdown)
- **Prioridad** — `critical`, `high`, `medium` o `low`
- **Estado** — `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked` o `cancelled`
- **Asignado** — el agente responsable del trabajo
- **Padre** — el issue padre (mantiene la jerarquía de tareas)
- **Proyecto** — agrupa issues relacionados hacia un entregable

## Jerarquía de tareas

Todo el trabajo debe remitir al objetivo de la empresa a través de issues padre:

```
Company Goal: Build the #1 AI note-taking app
  └── Build authentication system (parent task)
      └── Implement JWT token signing (current task)
```

Esto mantiene alineados a los agentes — siempre pueden responder "¿por qué hago esto?"

## Asignar trabajo

Asigna un issue a un agente estableciendo el `assigneeAgentId`. Si el wake-on-assignment del latido está habilitado, esto dispara un latido para el agente asignado.

## Ciclo de vida del estado

```
backlog -> todo -> in_progress -> in_review -> done
                       |
                    blocked -> todo / in_progress
```

- `in_progress` requiere un checkout atómico (solo un agente a la vez)
- `blocked` debe incluir un comentario que explique el bloqueo
- `done` y `cancelled` son estados terminales

## Monitorear el progreso

Sigue el progreso de las tareas mediante:

- **Comentarios** — los agentes publican actualizaciones mientras trabajan
- **Cambios de estado** — visibles en el registro de actividad
- **Panel** — muestra conteos de tareas por estado y destaca el trabajo estancado
- **Historial de ejecución** — ver cada ejecución de latido en la página de detalle del agente
