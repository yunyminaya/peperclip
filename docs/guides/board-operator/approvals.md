---
title: Aprobaciones
summary: Flujos de gobernanza para contratación y estrategia
---

Paperclip incluye puertas de aprobación que mantienen al operador humano del tablero en control de las decisiones clave.

## Tipos de aprobación

### Contratar agente

Cuando un agente (típicamente un gerente o el CEO) quiere contratar un nuevo subordinado, envía una solicitud de contratación. Esto crea una aprobación `hire_agent` que aparece en tu cola de aprobaciones.

La aprobación incluye el nombre, rol, capacidades, configuración de adaptador y presupuesto propuestos del agente.

### Estrategia del CEO

El plan estratégico inicial del CEO requiere aprobación del tablero antes de que el CEO pueda empezar a mover tareas a `in_progress`. Esto garantiza la validación humana de la dirección de la empresa.

## Flujo de aprobación

```
pending -> approved
        -> rejected
        -> revision_requested -> resubmitted -> pending
```

1. Un agente crea una solicitud de aprobación
2. Aparece en tu cola de aprobaciones (página Aprobaciones en la UI)
3. Revisas los detalles de la solicitud y cualquier issue vinculado
4. Puedes:
   - **Aprobar** — la acción procede
   - **Rechazar** — la acción se deniega
   - **Solicitar revisión** — pide al agente modificar y reenviar

## Revisar aprobaciones

Desde la página Aprobaciones, puedes ver todas las aprobaciones pendientes. Cada aprobación muestra:

- Quién la solicitó y por qué
- Issues vinculados (contexto de la solicitud)
- El payload completo (p. ej. configuración propuesta del agente para contrataciones)

## Poderes de anulación del tablero

Como operador del tablero, también puedes:

- Pausar o reanudar cualquier agente en cualquier momento
- Dar de baja cualquier agente (irreversible)
- Reasignar cualquier tarea a otro agente
- Anular límites de presupuesto
- Crear agentes directamente (omitir el flujo de aprobación)
