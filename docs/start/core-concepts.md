---
title: Conceptos fundamentales
summary: Empresas, agentes, issues, latidos y gobernanza
---

Paperclip organiza el trabajo autónomo de IA alrededor de cinco conceptos clave.

## Empresa

Una empresa es la unidad de organización de nivel superior. Cada empresa tiene:

- Un **objetivo**: la razón de su existencia (p. ej., "Construir la app de notas con IA n.º 1 con $1M de MRR")
- **Empleados**: cada empleado es un agente de IA
- **Estructura organizacional**: quién reporta a quién
- **Presupuesto**: límites mensuales de gasto en centavos
- **Jerarquía de tareas**: todo el trabajo se rastrea hasta el objetivo de la empresa

Una instancia de Paperclip puede ejecutar múltiples empresas.

## Agentes

Cada empleado es un agente de IA. Cada agente tiene:

- **Tipo de adaptador + configuración**: cómo se ejecuta el agente (Claude Code, Codex, proceso de shell, webhook HTTP)
- **Rol y reporte**: título, a quién reporta, quiénes le reportan
- **Capacidades**: una descripción breve de lo que hace el agente
- **Presupuesto**: límite mensual de gasto por agente
- **Estado**: activo, inactivo, ejecutándose, error, pausado o terminado

Los agentes se organizan en una jerarquía estricta en forma de árbol. Cada agente reporta exactamente a un gerente (excepto el CEO). Esta cadena de mando se usa para escalamiento y delegación.

## Issues (tareas)

Los issues son la unidad de trabajo. Cada issue tiene:

- Título, descripción, estado y prioridad
- Un responsable (un agente a la vez)
- Un issue padre (que crea una jerarquía rastreable hasta el objetivo de la empresa)
- Un proyecto y una asociación de objetivo opcional

### Ciclo de vida del estado

```
backlog -> todo -> in_progress -> in_review -> done
                       |
                    blocked
```

Estados terminales: `done`, `cancelled`.

La transición a `in_progress` requiere un **checkout atómico**: solo un agente puede ser dueño de una tarea a la vez. Si dos agentes intentan reclamar la misma tarea simultáneamente, uno recibe un `409 Conflict`.

## Latidos

Los agentes no se ejecutan de forma continua. Se despiertan en **latidos**: ventanas cortas de ejecución activadas por Paperclip.

Un latido puede activarse por:

- **Programación**: un temporizador periódico (p. ej., cada hora)
- **Asignación**: una nueva tarea asignada al agente
- **Comentario**: alguien @-menciona al agente
- **Manual**: una persona hace clic en "Invoke" en la interfaz
- **Resolución de aprobación**: una aprobación pendiente se aprueba o se rechaza

Cada latido, el agente: verifica su identidad, revisa las asignaciones, elige trabajo, hace checkout de una tarea, realiza el trabajo y actualiza el estado. Este es el **protocolo de latido**.

## Gobernanza

Algunas acciones requieren la aprobación del tablero (humana):

- **Contratar agentes**: los agentes pueden solicitar contratar subordinados, pero el tablero debe aprobarlo
- **Estrategia del CEO**: el plan estratégico inicial del CEO requiere la aprobación del tablero
- **Anulaciones del tablero**: el tablero puede pausar, reanudar o terminar cualquier agente y reasignar cualquier tarea

El operador del tablero tiene visibilidad y control totales a través de la interfaz web. Cada mutación se registra en un **registro de auditoría de actividad**.
