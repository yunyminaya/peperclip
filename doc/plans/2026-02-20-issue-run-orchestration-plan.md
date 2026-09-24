# Plan de orquestación de ejecuciones de issues

## Contexto

Observamos despertares en cascada en un solo issue (por ejemplo PAP-39) que produjeron múltiples ejecuciones a la vez:

- auto-despertar del asignado desde `issue_commented`
- despertar por mención al gerente/CTO desde `issue_comment_mentioned`
- ejecuciones superpuestas en el mismo issue

El comportamiento actual es céntrico en la ejecución y céntrico en el agente. Coalesce por agente+tarea en `heartbeat.wakeup`, pero no aplica un único slot de ejecución activa por issue entre todos los agentes.

## Lo que sabemos hoy

- El único enlace issue/ejecución confiable hoy se deriva de `heartbeat_runs.context_snapshot.issueId` con estado de ejecución `queued` o `running`.
- `checkoutRunId` en los issues es un bloqueo de propiedad de trabajo, no un bloqueo de orquestación.
- Los despertares se crean desde múltiples rutas (`issues`, `approvals`, `agents`) y todos fluyen a través de `heartbeat.wakeup`.

## Objetivos

1. Prevenir cascadas de auto-despertar para el mismo issue cuando el agente objetivo tiene el mismo nombre normalizado que el ejecutor activo actual del issue.
2. Permitir solicitudes de despertar entre agentes, pero no ejecutarlas hasta que el ejecutor actual del issue salga.
3. Garantizar como máximo un dueño de ejecución activa (queued o running) por issue a la vez.
4. Mantener esta aplicación centralizada en la orquestación (no reglas de prompt/habilidad).

## No objetivos

- Reemplazar la semántica de checkout para propiedad de cambios de código.
- Cambiar la propia política de escalación del gerente.
- Aplicar unicidad de nombres de agente globalmente (manejado como decisión de gobernanza separada).

## Modelo propuesto

Usar un bloqueo de orquestación explícito a nivel de issue en `issues`.

### Nuevas propiedades de issue

- `executionRunId: uuid | null` (FK a `heartbeat_runs.id`, `ON DELETE SET NULL`)
- `executionAgentNameKey: text | null` (nombre de agente normalizado en minúsculas/recortado)
- `executionLockedAt: timestamptz | null`

`executionRunId` es el campo canónico de "quién es dueño actualmente de la orquestación de este issue".

## Reglas de orquestación

### Regla A: Sin auto-despertar por el mismo nombre de agente

Si un despertar tiene alcance de issue y `issues.executionRunId` apunta a una ejecución activa cuyo `executionAgentNameKey` coincide con la clave de nombre del agente que despierta:

- no crear una nueva ejecución de latido
- escribir la solicitud de despertar como `coalesced` con motivo `issue_execution_same_name`
- devolver la referencia de ejecución existente

### Regla B: Un nombre diferente puede despertar, pero espera

Si un issue tiene un bloqueo de ejecución activo en manos de una clave de nombre de agente diferente:

- aceptar la solicitud de despertar
- persistir la solicitud como diferida (nuevo estado de despertar `deferred_issue_execution`)
- aún no crear una ejecución

Cuando la ejecución activa del issue termina, promover la solicitud diferida más antigua de ese issue a una ejecución en cola y transferir `executionRunId`.

### Regla C: Un dueño de ejecución activa por issue

Para despertares con alcance de issue, la creación de ejecuciones se hace solo mientras se mantiene un bloqueo de transacción en la fila del issue. Esto asegura que solo una ejecución queued/running pueda convertirse en dueña a la vez.

## Plan de implementación

## Fase 1: Esquema + contratos compartidos

1. Agregar columnas de issue: `execution_run_id`, `execution_agent_name_key`, `execution_locked_at`.
2. Extender el tipo compartido `Issue` en `packages/shared/src/types/issue.ts`.
3. Agregar migración y actualizaciones de exportaciones.

## Fase 2: Centralizar la puerta de ejecución de issues en `heartbeat.wakeup`

1. En `enqueueWakeup`, derivar `issueId` del contexto/payload como hoy.
2. Si no hay `issueId`, mantener el comportamiento existente.
3. Si existe `issueId`:
   - transacción + `SELECT ... FOR UPDATE` en la fila del issue
   - resolver/reparar `executionRunId` obsoleto (si la ejecución referenciada no es `queued|running`, limpiar el bloqueo)
   - aplicar Regla A/Regla B/Regla C
4. Helper de normalización de nombres:
   - `agentNameKey = agent.name.trim().toLowerCase()`

## Fase 3: Promoción de cola diferida al finalizar la ejecución

1. En estados terminales de ejecución (`succeeded`, `failed`, `cancelled`, huérfano recolectado):
   - si la ejecución es dueña de `issues.executionRunId`, limpiar el bloqueo del issue
   - promover el despertar de issue diferido más antiguo a ejecución en cola
   - establecer el bloqueo del issue a la ejecución promovida
   - disparar `startNextQueuedRunForAgent(promotedAgentId)`

## Fase 4: Higiene de rutas ("aplicar en todas partes")

1. Mantener el dedupe de despertares por id de agente en el lado de las rutas, pero confiar en la puerta de latido como fuente de verdad.
2. Asegurar que todas las llamadas de despertar relacionadas con issues incluyan `issueId` en el payload/instantánea de contexto.
3. Agregar códigos de motivo explícitos para que los registros hagan obvias la supresión/el diferimiento.

## Fase 5: Pruebas

1. Pruebas unitarias para `heartbeat.wakeup`:
   - auto-despertar del mismo nombre suprimido
   - despertar de nombre diferente diferido
   - bloqueo liberado y despertar diferido promovido al completarse el dueño
   - recuperación de bloqueo obsoleto
2. Pruebas de integración:
   - comentario con `@CTO` durante una ejecución activa del asignado no crea una ejecución activa concurrente
   - solo un dueño activo por issue en cualquier momento
3. Pruebas de regresión:
   - despertares sin issue sin cambios
   - comportamiento existente de asignación/temporizador sin cambios para tareas sin contexto de issue

## Telemetría + depurabilidad

- Agregar motivos estructurados en `agent_wakeup_requests.reason`:
  - `issue_execution_same_name`
  - `issue_execution_deferred`
  - `issue_execution_promoted`
- Agregar detalles de registro de actividad para eventos de transferencia de bloqueo:
  - desde id de ejecución / hacia id de ejecución / id de issue / clave de nombre de agente

## Estrategia de despliegue

1. Enviar esquema + feature flag (`ISSUE_EXECUTION_LOCK_ENABLED`) por defecto desactivado.
2. Habilitar en dev y verificar escenarios estilo PAP-39.
3. Habilitar en staging con alta verbosidad de registros.
4. Habilitar por defecto después de una ejecución estable.

## Criterios de aceptación

1. Un solo issue nunca tiene más de una ejecución dueña activa (`queued|running`) a la vez.
2. Los auto-despertares del mismo nombre para el mismo issue se suprimen, no se generan.
3. Los despertares de nombre diferente se aceptan pero se difieren hasta que se libera el bloqueo de ejecución del issue.
4. Mencionar al CTO durante una ejecución activa de un issue no inicia al CTO concurrentemente en ese issue.
5. El paralelismo sigue disponible vía issues/subissues separados.

## Seguimiento (separado pero relacionado)

La lógica de conflicto de checkout debería corregirse independientemente para que los asignados con `checkoutRunId = null` puedan adquirir checkout por el id de ejecución actual sin falsos loops 409.
