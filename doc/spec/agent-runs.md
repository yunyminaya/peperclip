# Especificación del subsistema de ejecuciones de agentes

Estado: Borrador
Fecha: 2026-02-17
Audiencia: Producto + Ingeniería
Alcance: Runtime de ejecución de agentes, protocolo de adaptadores, orquestación de despertares y entrega de estado en vivo

## 1. Rol del documento

Esta especificación define cómo Paperclip realmente ejecuta los agentes manteniéndose agnóstico al runtime.

- `doc/SPEC-implementation.md` sigue siendo el contrato base de la V1.
- Este documento agrega detalle concreto del subsistema para la ejecución de agentes, incluyendo adaptadores CLI locales, persistencia de estado del runtime, programación de despertares y actualizaciones en vivo en el navegador.
- Si este documento entra en conflicto con el comportamiento actual del runtime en el código, este documento es el comportamiento objetivo para la próxima implementación.

## 2. Intención capturada (de la solicitud)

Las siguientes intenciones se conservan explícitamente en esta especificación:

1. Paperclip es agnóstico a adaptadores. Lo clave es un protocolo, no un runtime específico.
2. Aun así necesitamos adaptadores integrados por defecto para que el sistema sea útil de inmediato.
3. Los primeros dos integrados son `claude-local` y `codex-local`.
4. Esos adaptadores ejecutan CLI locales directamente en la máquina anfitriona, sin sandbox.
5. La configuración del agente incluye directorio de trabajo y prompt inicial/por defecto.
6. Los latidos ejecutan el proceso del adaptador configurado, Paperclip gestiona el ciclo de vida, y al salir Paperclip analiza la salida JSON y actualiza el estado.
7. Los ID de sesión y el uso de tokens deben persistirse para que latidos posteriores puedan reanudar.
8. Los adaptadores deben admitir actualizaciones de estado (mensaje corto + color) y logs de streaming opcionales.
9. La UI debe admitir "píldoras" de plantillas de prompt para inserción de variables.
10. Los errores del CLI deben ser visibles completos (o tanto como sea posible) en la UI.
11. Los cambios de estado deben actualizarse en vivo entre las vistas de tareas y agentes vía push del servidor.
12. Los disparadores de despertar deben centralizarse en un servicio de latido/despertar con al menos:
   - intervalo de temporizador
   - despertar al asignar tarea
   - ping/solicitud explícito

## 3. Objetivos y no objetivos

### 3.1 Objetivos

1. Definir un protocolo de adaptadores estable que admita múltiples runtimes.
2. Distribuir adaptadores locales listos para producción para los CLI de Claude y Codex.
3. Persistir el estado de runtime del adaptador (ID de sesión, uso de tokens/costo, últimos errores).
4. Centralizar las decisiones de despertar y la cola en un servicio.
5. Proveer actualizaciones en tiempo real de ejecuciones/tareas/agentes al navegador.
6. Admitir almacenamiento de logs completos específico del despliegue sin inflar Postgres.
7. Preservar el alcance por empresa y las invariantes de gobernanza existentes.

### 3.2 No objetivos (para esta fase del subsistema)

1. Workers de ejecución distribuidos en múltiples hosts.
2. Marketplace de adaptadores de terceros / SDK de plugins.
3. Contabilidad perfecta de costos para proveedores que no emiten costo.
4. Estrategia de archivo de logs a largo plazo más allá de la retención básica.

## 4. Línea base y brechas (al 2026-02-17)

El código actual ya tiene:

- `agents` con `adapterType` + `adapterConfig`.
- `heartbeat_runs` con seguimiento básico de estado.
- `heartbeatService` en proceso que invoca `process` y `http`.
- endpoints de cancelación para ejecuciones activas.

Brechas actuales que esta especificación aborda:

1. Sin estado de runtime persistente por agente para reanudar sesiones.
2. Sin abstracción de cola/despertar (la invocación es inmediata).
3. Sin despertares centralizados activados por asignación o por temporizador.
4. Sin ruta de push websocket/SSE al navegador.
5. Sin línea de tiempo persistente de eventos de ejecución ni contrato de almacenamiento externo de logs completos.
6. Sin contratos tipados de adaptadores locales para la extracción de sesión y uso de Claude/Codex.
7. Sin sistema de variables/píldoras de plantillas de prompt en la configuración del agente.
8. Sin adaptador consciente del despliegue para almacenamiento de logs completos de ejecución (disco/almacén de objetos/etc).

## 5. Panorama de arquitectura

El subsistema introduce seis componentes que cooperan:

1. `Adapter Registry`
   - Mapea `adapter_type` a su implementación.
   - Expone metadatos de capacidades y validación de configuración.

2. `Wakeup Coordinator`
   - Único punto de entrada para todos los despertares (`timer`, `assignment`, `on_demand`, `automation`).
   - Aplica deduplicación/coalescencia y reglas de cola.

3. `Run Executor`
   - Toma los despertares en cola.
   - Crea `heartbeat_runs`.
   - Genera/monitorea procesos hijos para adaptadores locales.
   - Maneja timeout/cancelación/terminación controlada.

4. `Runtime State Store`
   - Persiste el estado resumible del adaptador por agente.
   - Persiste resúmenes de uso de ejecuciones y línea de tiempo ligera de eventos de ejecución.

5. `Run Log Store`
   - Persiste los streams completos de stdout/stderr vía un adaptador de almacenamiento intercambiable.
   - Devuelve un `logRef` estable para recuperación (ruta local, clave de objeto o referencia de BD).

6. `Realtime Event Hub`
   - Publica actualizaciones de ejecuciones/agentes/tareas por websocket.
   - Admite suscripción selectiva por empresa.

Flujo de control (ruta feliz):

1. Llega un disparador (`timer`, `assignment`, `on_demand` o `automation`).
2. El coordinador de despertares encola/combina la solicitud de despertar.
3. El ejecutor toma la solicitud, crea la fila de ejecución, marca el agente como `running`.
4. El adaptador ejecuta, emite eventos de estado/log/uso.
5. Los logs completos van al `RunLogStore`; los metadatos/eventos se persisten en la BD y se envían a los suscriptores del websocket.
6. El proceso sale, el analizador de salida actualiza el resultado de la ejecución + el estado de runtime.
7. El agente vuelve a `idle` o `error`; la UI se actualiza en tiempo real.

## 6. Protocolo de ejecución de agentes (versión `agent-run/v1`)

Este protocolo es agnóstico al runtime y lo implementan todos los adaptadores.

```ts
type RunOutcome = "succeeded" | "failed" | "cancelled" | "timed_out";
type StatusColor = "neutral" | "blue" | "green" | "yellow" | "red";

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cachedOutputTokens?: number;
}

interface AdapterInvokeInput {
  protocolVersion: "agent-run/v1";
  companyId: string;
  agentId: string;
  runId: string;
  wakeupSource: "timer" | "assignment" | "on_demand" | "automation";
  triggerDetail?: "manual" | "ping" | "callback" | "system";
  cwd: string;
  prompt: string;
  adapterConfig: Record<string, unknown>;
  runtimeState: Record<string, unknown>;
  env: Record<string, string>;
  timeoutSec: number;
}

interface AdapterHooks {
  status?: (update: { message: string; color?: StatusColor }) => Promise<void>;
  log?: (event: { stream: "stdout" | "stderr" | "system"; chunk: string }) => Promise<void>;
  usage?: (usage: TokenUsage) => Promise<void>;
  event?: (eventType: string, payload: Record<string, unknown>) => Promise<void>;
}

interface AdapterInvokeResult {
  outcome: RunOutcome;
  exitCode: number | null;
  errorMessage?: string | null;
  summary?: string | null;
  sessionId?: string | null;
  usage?: TokenUsage | null;
  provider?: string | null;
  model?: string | null;
  costUsd?: number | null;
  runtimeStatePatch?: Record<string, unknown>;
  rawResult?: Record<string, unknown> | null;
}

interface AgentRunAdapter {
  type: string;
  protocolVersion: "agent-run/v1";
  capabilities: {
    resumableSession: boolean;
    statusUpdates: boolean;
    logStreaming: boolean;
    tokenUsage: boolean;
  };
  validateConfig(config: unknown): { ok: true } | { ok: false; errors: string[] };
  invoke(input: AdapterInvokeInput, hooks: AdapterHooks, signal: AbortSignal): Promise<AdapterInvokeResult>;
}
```

### 6.1 Comportamiento requerido

1. `validateConfig` se ejecuta antes de guardar o invocar.
2. `invoke` debe ser determinista para una configuración + estado de runtime + prompt dados.
3. El adaptador no debe mutar la BD directamente; devuelve datos solo vía resultado/eventos.
4. El adaptador debe emitir suficiente contexto para que los errores sean depurables.
5. Si `invoke` lanza una excepción, el ejecutor registra la ejecución como `failed` con el texto del error capturado.

### 6.2 Comportamiento opcional

Los adaptadores pueden omitir los hooks de estado/log. Si se omiten, el runtime aun emite estados del ciclo de vida del sistema (`queued`, `running`, `finished`).

### 6.3 Protocolo de almacenamiento de logs de ejecución

Los logs completos de ejecución los gestiona un almacén intercambiable separado (no el adaptador del agente).

```ts
type RunLogStoreType = "local_file" | "object_store" | "postgres";

interface RunLogHandle {
  store: RunLogStoreType;
  logRef: string; // opaque provider reference (path, key, uri, row id)
}

interface RunLogStore {
  begin(input: { companyId: string; agentId: string; runId: string }): Promise<RunLogHandle>;
  append(
    handle: RunLogHandle,
    event: { stream: "stdout" | "stderr" | "system"; chunk: string; ts: string },
  ): Promise<void>;
  finalize(
    handle: RunLogHandle,
    summary: { bytes: number; sha256?: string; compressed: boolean },
  ): Promise<void>;
  read(
    handle: RunLogHandle,
    opts?: { offset?: number; limitBytes?: number },
  ): Promise<{ content: string; nextOffset?: number }>;
  delete?(handle: RunLogHandle): Promise<void>;
}
```

Valores por defecto del despliegue V1:

1. Dev/local por defecto: `local_file` (escribe en `data/run-logs/...`).
2. Nube/serverless por defecto: `object_store` (compatible con S3/R2/GCS).
3. Respaldo opcional: `postgres` con límites estrictos de tamaño.

### 6.4 Identidad y compatibilidad del adaptador

Para el lanzamiento de la V1, la identidad del adaptador es explícita:

- `claude_local`
- `codex_local`
- `process` (comportamiento genérico existente)
- `http` (comportamiento genérico existente)

`claude_local` y `codex_local` no son envoltorios alrededor de un `process` arbitrario; son adaptadores tipados con semántica conocida de análisis/reanudación.

## 7. Adaptadores integrados (Fase 1)

## 7.1 `claude-local`

Ejecuta el CLI `claude` local directamente.

### Configuración

```json
{
  "cwd": "/absolute/or/relative/path",
  "promptTemplate": "You are agent {{agent.id}} ...",
  "model": "optional-model-id",
  "maxTurnsPerRun": 300,
  "dangerouslySkipPermissions": true,
  "env": {"KEY": "VALUE"},
  "extraArgs": [],
  "timeoutSec": 1800,
  "graceSec": 20
}
```

### Invocación

- Comando base: `claude --print <prompt> --output-format json`
- Reanudación: agregar `--resume <sessionId>` cuando el estado de runtime tenga ID de sesión
- Modo sin sandbox: agregar `--dangerously-skip-permissions` cuando esté habilitado

### Análisis de salida

1. Analizar el objeto JSON de stdout.
2. Extraer `session_id` para la reanudación.
3. Extraer campos de uso:
   - `usage.input_tokens`
   - `usage.cache_read_input_tokens` (si está presente)
   - `usage.output_tokens`
4. Extraer `total_cost_usd` cuando esté presente.
5. En salida con código distinto de cero: aun intentar el análisis; si el análisis tiene éxito conservar el estado extraído y marcar la ejecución como fallida salvo que el adaptador reporte éxito explícitamente.

## 7.2 `codex-local`

Ejecuta el CLI `codex` local directamente.

### Configuración

```json
{
  "cwd": "/absolute/or/relative/path",
  "promptTemplate": "You are agent {{agent.id}} ...",
  "model": "optional-model-id",
  "search": false,
  "dangerouslyBypassApprovalsAndSandbox": true,
  "env": {"KEY": "VALUE"},
  "extraArgs": [],
  "timeoutSec": 1800,
  "graceSec": 20
}
```

### Invocación

- Comando base: `codex exec --json <prompt>`
- Forma de reanudación: `codex exec --json resume <sessionId> <prompt>`
- Modo sin sandbox: agregar `--dangerously-bypass-approvals-and-sandbox` cuando esté habilitado
- Modo de búsqueda opcional: agregar `--search`

### Análisis de salida

Codex emite eventos JSONL. Analizar línea por línea y extraer:

1. `thread.started.thread_id` -> ID de sesión
2. `item.completed` donde el tipo de item es `agent_message` -> texto de salida
3. `turn.completed.usage`:
   - `input_tokens`
   - `cached_input_tokens`
   - `output_tokens`

El JSONL de Codex actualmente puede no incluir costo; almacenar el uso de tokens y dejar el costo null/desconocido salvo que esté disponible.

## 7.3 Manejo común de procesos de adaptadores locales

Ambos adaptadores locales deben:

1. Usar `spawn(command, args, { shell: false, stdio: "pipe" })`.
2. Capturar stdout/stderr en fragmentos de stream y reenviarlos al `RunLogStore`.
3. Mantener en memoria extractos rodantes de la cola de stdout/stderr para los campos de diagnóstico de la BD.
4. Emitir eventos de log en vivo a los suscriptores del websocket (opcional limitar/agrupar).
5. Admitir cancelación controlada: `SIGTERM`, luego `SIGKILL` después de `graceSec`.
6. Imponer el timeout usando el `timeoutSec` del adaptador.
7. Devolver el código de salida + el resultado analizado + el stderr de diagnóstico.

## 8. Coordinador de latidos y despertares

## 8.1 Fuentes de despertar

Fuentes admitidas:

1. `timer`: latido periódico por agente.
2. `assignment`: issue asignado/reasignado a un agente.
3. `on_demand`: ruta explícita de solicitud de despertar (botón/clic manual o ping de API).
4. `automation`: ruta de despertar no interactiva (callback externo o automatización interna del sistema).

## 8.2 API central

Todas las fuentes llaman a un solo servicio interno:

```ts
enqueueWakeup({
  companyId,
  agentId,
  source,
  triggerDetail, // optional: manual|ping|callback|system
  reason,
  payload,
  requestedBy,
  idempotencyKey?
})
```

Ninguna fuente invoca adaptadores directamente.

## 8.3 Semántica de la cola

1. El máximo de ejecuciones activas por agente sigue siendo `1`.
2. Si el agente ya tiene una ejecución `queued`/`running`:
   - coalescer despertares duplicados
   - incrementar `coalescedCount`
   - conservar los metadatos más recientes de motivo/origen
3. La cola está respaldada por BD para seguridad ante reinicios.
4. El coordinador usa FIFO por `requested_at`, con prioridad opcional:
   - `on_demand` > `assignment` > `timer`/`automation`

## 8.4 Campos de política de latido del agente

Ajustes del plano de control a nivel de agente (no específicos del adaptador):

```json
{
  "heartbeat": {
    "enabled": true,
    "intervalSec": 300,
    "wakeOnAssignment": true,
    "wakeOnOnDemand": true,
    "wakeOnAutomation": true,
    "cooldownSec": 10
  }
}
```

Valores por defecto:

- `enabled: true`
- `intervalSec: null` (sin temporizador hasta que se establezca explícitamente) o valor por defecto de producto `300` si se desea globalmente
- `wakeOnAssignment: true`
- `wakeOnOnDemand: true`
- `wakeOnAutomation: true`

## 8.5 Reglas de integración de disparadores

1. Las comprobaciones del temporizador corren en el intervalo del worker del servidor y encolan los agentes vencidos.
2. La mutación de asignación de issues encola un despertar cuando el asignado cambia y el agente destino tiene `wakeOnAssignment=true`.
3. El endpoint bajo demanda encola un despertar con `source=on_demand` y `triggerDetail=manual|ping` cuando `wakeOnOnDemand=true`.
4. Las automatizaciones de callback/sistema encolan un despertar con `source=automation` y `triggerDetail=callback|system` cuando `wakeOnAutomation=true`.
5. Los agentes pausados/terminados no reciben nuevos despertares.
6. Los agentes detenidos por límite duro de presupuesto no reciben nuevos despertares.

## 9. Modelo de persistencia

Todas las tablas siguen limitadas por empresa.

## 9.0 Cambios a `agents`

1. Extender el dominio de `adapter_type` para incluir `claude_local` y `codex_local` (junto con los existentes `process`, `http`).
2. Mantener `adapter_config` como configuración propia del adaptador (flags del CLI, cwd, plantillas de prompt, overrides de env).
3. Agregar jsonb `runtime_config` para la política de programación del plano de control:
   - habilitación/intervalo de latido
   - despertar al asignar
   - despertar bajo demanda
   - despertar por automatización
   - enfriamiento

Esta separación mantiene la configuración del adaptador agnóstica al runtime mientras permite al servicio de latidos aplicar lógica de programación consistente.

## 9.1 Nueva tabla: `agent_runtime_state`

Una fila por agente para contadores agregados de runtime y compatibilidad con legado.

- `agent_id` uuid pk fk `agents.id`
- `company_id` uuid fk not null
- `adapter_type` text not null
- `session_id` text null
- `state_json` jsonb not null default `{}`
- `last_run_id` uuid fk `heartbeat_runs.id` null
- `last_run_status` text null
- `total_input_tokens` bigint not null default `0`
- `total_output_tokens` bigint not null default `0`
- `total_cached_input_tokens` bigint not null default `0`
- `total_cost_cents` bigint not null default `0`
- `last_error` text null
- `updated_at` timestamptz not null

Invariante: exactamente una fila de estado de runtime por agente.

## 9.1.1 Nueva tabla: `agent_task_sessions`

Una fila por `(company_id, agent_id, adapter_type, task_key)` para el estado de sesión resumible.

- `id` uuid pk
- `company_id` uuid fk not null
- `agent_id` uuid fk not null
- `adapter_type` text not null
- `task_key` text not null
- `session_params_json` jsonb null (forma definida por el adaptador)
- `session_display_id` text null (para UI/depuración)
- `last_run_id` uuid fk `heartbeat_runs.id` null
- `last_error` text null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Invariante: único `(company_id, agent_id, adapter_type, task_key)`.

## 9.2 Nueva tabla: `agent_wakeup_requests`

Cola + auditoría para despertares.

- `id` uuid pk
- `company_id` uuid fk not null
- `agent_id` uuid fk not null
- `source` text not null (`timer|assignment|on_demand|automation`)
- `trigger_detail` text null (`manual|ping|callback|system`)
- `reason` text null
- `payload` jsonb null
- `status` text not null (`queued|claimed|coalesced|skipped|completed|failed|cancelled`)
- `coalesced_count` int not null default `0`
- `requested_by_actor_type` text null (`user|agent|system`)
- `requested_by_actor_id` text null
- `idempotency_key` text null
- `run_id` uuid fk `heartbeat_runs.id` null
- `requested_at` timestamptz not null
- `claimed_at` timestamptz null
- `finished_at` timestamptz null
- `error` text null

## 9.3 Nueva tabla: `heartbeat_run_events`

Línea de tiempo de eventos ligera por ejecución, solo anexable (sin fragmentos crudos de log completos).

- `id` bigserial pk
- `company_id` uuid fk not null
- `run_id` uuid fk `heartbeat_runs.id` not null
- `agent_id` uuid fk `agents.id` not null
- `seq` int not null
- `event_type` text not null (`lifecycle|status|usage|error|structured`)
- `stream` text null (`system|stdout|stderr`) (solo eventos resumidos, no fragmentos completos del stream)
- `level` text null (`info|warn|error`)
- `color` text null
- `message` text null
- `payload` jsonb null
- `created_at` timestamptz not null

## 9.4 Cambios a `heartbeat_runs`

Agregar campos requeridos para resultado y diagnóstico:

- `wakeup_request_id` uuid fk `agent_wakeup_requests.id` null
- `exit_code` int null
- `signal` text null
- `usage_json` jsonb null
- `result_json` jsonb null
- `session_id_before` text null
- `session_id_after` text null
- `log_store` text null (`local_file|object_store|postgres`)
- `log_ref` text null (referencia opaca del proveedor; ruta/clave/uri/id de fila)
- `log_bytes` bigint null
- `log_sha256` text null
- `log_compressed` boolean not null default false
- `stderr_excerpt` text null
- `stdout_excerpt` text null
- `error_code` text null

Esto mantiene los diagnósticos por ejecución consultables sin almacenar logs completos en Postgres.

## 9.5 Configuración del adaptador de almacenamiento de logs

El almacenamiento de logs del runtime se configura por despliegue (no por agente por defecto).

```json
{
  "runLogStore": {
    "type": "local_file | object_store | postgres",
    "basePath": "./data/run-logs",
    "bucket": "paperclip-run-logs",
    "prefix": "runs/",
    "compress": true,
    "maxInlineExcerptBytes": 32768
  }
}
```

Reglas:

1. `log_ref` debe ser opaco y neutral al proveedor en los límites de la API.
2. La UI/API no debe asumir semántica de sistema de archivos local.
3. Los secretos/credenciales específicos del proveedor permanecen en la configuración del servidor, nunca en la configuración del agente.

## 10. Sistema de plantillas de prompt y píldoras

## 10.1 Formato de plantilla

- Placeholders estilo Mustache: `{{path.to.value}}`
- Sin ejecución de código arbitrario.
- Variable desconocida al guardar = error de validación.

## 10.2 Catálogo inicial de variables

- `company.id`
- `company.name`
- `agent.id`
- `agent.name`
- `agent.role`
- `agent.title`
- `run.id`
- `run.source`
- `run.startedAt`
- `heartbeat.reason`
- `paperclip.skill` (bloque de texto compartido de la habilidad de Paperclip)
- `credentials.apiBaseUrl`
- `credentials.apiKey` (opcional, sensible)

## 10.3 Campos de prompt

1. `promptTemplate`
   - Usado en cada despertar (primera ejecución y ejecuciones reanudadas).
   - Puede incluir píldoras de origen/motivo de la ejecución.

## 10.4 Requisitos de UI

1. El formulario de creación/edición del agente incluye editores de prompt con inserción de píldoras.
2. Las variables se muestran como píldoras clicables para inserción rápida.
3. La validación al guardar indica variables desconocidas/faltantes.
4. Las píldoras sensibles (`credentials.*`) muestran una insignia explícita de advertencia.

## 10.5 Notas de seguridad para credenciales

1. Las credenciales en el prompt se permiten por simplicidad inicial pero se desaconsejan.
2. El transporte preferido son variables de entorno (`PAPERCLIP_*`) inyectadas en runtime.
3. La vista previa del prompt y los logs deben redactar los valores sensibles.

## 11. Entrega de estado en tiempo real

## 11.1 Transporte

Transporte principal: canal websocket por empresa.

- Endpoint: `GET /api/companies/:companyId/events/ws`
- Autenticación: sesión del panel u API key de agente (ligada a la empresa)

## 11.2 Envoltorio del evento

```json
{
  "eventId": "uuid-or-monotonic-id",
  "companyId": "uuid",
  "type": "heartbeat.run.status",
  "entityType": "heartbeat_run",
  "entityId": "uuid",
  "occurredAt": "2026-02-17T12:00:00Z",
  "payload": {}
}
```

## 11.3 Tipos de eventos requeridos

1. `agent.status.changed`
2. `heartbeat.run.queued`
3. `heartbeat.run.started`
4. `heartbeat.run.status` (actualizaciones cortas de color+mensaje)
5. `heartbeat.run.log` (stream opcional de fragmentos en vivo; la persistencia completa la maneja el `RunLogStore`)
6. `heartbeat.run.finished`
7. `issue.updated`
8. `issue.comment.created`
9. `activity.appended`

## 11.4 Comportamiento de la UI

1. La vista de detalle del agente actualiza la línea de tiempo de ejecuciones en vivo.
2. El panel de tareas refleja cambios de asignación/estado/comentarios de la actividad del agente sin recargar.
3. La lista de organización/agentes refleja los cambios de estado en vivo.
4. Si el websocket se desconecta, el cliente recurre a polling corto hasta reconectar.

## 12. Manejo de errores y diagnóstico

## 12.1 Clases de error

- `adapter_not_installed`
- `invalid_working_directory`
- `spawn_failed`
- `timeout`
- `cancelled`
- `nonzero_exit`
- `output_parse_error`
- `resume_session_invalid`
- `budget_blocked`

## 12.2 Requisitos de registro

1. Persistir el stream completo de stdout/stderr en el `RunLogStore` configurado.
2. Persistir solo metadatos/eventos ligeros de ejecución en Postgres (`heartbeat_runs`, `heartbeat_run_events`).
3. Persistir `stdout_excerpt` y `stderr_excerpt` acotados en Postgres para diagnóstico rápido.
4. Marcar el truncamiento explícitamente cuando los extractos están limitados.
5. Redactar secretos de los logs, extractos y payloads del websocket.

## 12.3 Retención y ciclo de vida de logs

1. La retención del `RunLogStore` es configurable por despliegue (por ejemplo 7/30/90 días).
2. Los metadatos de ejecución en Postgres pueden sobrevivir a los objetos de log completos.
3. Los trabajos de eliminación/poda deben manejar de forma segura las referencias huérfanas de metadatos/objetos de log.
4. Si el objeto de log completo ya no existe, las API aun devuelven metadatos y extractos con estado `log_unavailable`.

## 12.4 Recuperación ante reinicios

Al iniciar el servidor:

1. Buscar ejecuciones `queued`/`running` obsoletas.
2. Marcarlas como `failed` con `error_code=control_plane_restart`.
3. Poner los agentes afectados no pausados/no terminados en `error` (o `idle` según política).
4. Emitir eventos de recuperación al websocket y al log de actividad.

## 13. Cambios a la superficie de API

## 13.1 Endpoints nuevos/actualizados

1. `POST /agents/:agentId/wakeup`
   - encola un despertar con origen/motivo
2. `POST /agents/:agentId/heartbeat/invoke`
   - alias retrocompatible a la API de despertar
3. `GET /agents/:agentId/runtime-state`
   - vista de depuración solo para el panel
4. `GET /agents/:agentId/task-sessions`
   - listado solo del panel de las sesiones de adaptador por tarea
5. `POST /agents/:agentId/runtime-state/reset-session`
   - borra todas las sesiones de tarea del agente, o una cuando se provee `taskKey`
6. `GET /heartbeat-runs/:runId/events?afterSeq=:n`
   - obtiene la línea de tiempo ligera persistida
7. `GET /heartbeat-runs/:runId/log`
   - lee el stream completo de logs vía `RunLogStore` (o redirige/URL prefirmada para almacén de objetos)
8. `GET /api/companies/:companyId/events/ws`
   - stream websocket

## 13.2 Registro de mutaciones

Todas las mutaciones de estado de despertar/ejecución deben crear entradas en `activity_log`:

- `wakeup.requested`
- `wakeup.coalesced`
- `heartbeat.started`
- `heartbeat.finished`
- `heartbeat.failed`
- `heartbeat.cancelled`
- `runtime_state.updated`

## 14. Plan de implementación del servicio de latidos

## Fase 1: Contratos y esquema

1. Agregar nuevas tablas/columnas de BD (`agent_runtime_state`, `agent_wakeup_requests`, `heartbeat_run_events`, campos `log_*` de `heartbeat_runs`).
2. Agregar la interfaz `RunLogStore` y el cableado de configuración.
3. Agregar tipos/constantes/validadores compartidos.
4. Mantener funcionales las rutas existentes durante la migración.

## Fase 2: Coordinador de despertares

1. Implementar la cola de despertares respaldada por BD.
2. Convertir las rutas invoke/wake a encolar con `source=on_demand` y `triggerDetail` apropiado.
3. Agregar bucle de worker para tomar y ejecutar despertares en cola.

## Fase 3: Adaptadores locales

1. Implementar el adaptador `claude-local`.
2. Implementar el adaptador `codex-local`.
3. Analizar y persistir ID de sesión y uso de tokens.
4. Cablear comportamiento de cancelación/timeout/gracia.

## Fase 4: Push en tiempo real

1. Implementar el hub websocket de la empresa.
2. Publicar eventos de ejecución/agente/issue.
3. Actualizar las páginas de la UI para suscribirse e invalidar/actualizar los datos relevantes.

## Fase 5: Píldoras de prompt y UX de configuración

1. Agregar editor de configuración específico del adaptador con plantillas de prompt.
2. Agregar inserción de píldoras y validación de variables.
3. Agregar advertencias de variables sensibles y redacción.

## Fase 6: Endurecimiento

1. Agregar barridos de recuperación ante fallos/reinicios.
2. Agregar políticas de retención de metadatos/logs completos y trabajos de poda.
3. Agregar cobertura de integración/e2e para disparadores de despertar y actualizaciones en vivo.

## 15. Criterios de aceptación

1. Un agente con `claude-local` o `codex-local` puede ejecutar, salir y persistir el resultado de la ejecución.
2. Los parámetros de sesión se persisten por alcance de tarea y se reutilizan automáticamente para reanudaciones de la misma tarea.
3. El uso de tokens se persiste por ejecución y se acumula en el estado de runtime del agente.
4. Los despertares de temporizador, asignación, bajo demanda y automatización se encolan todos vía un solo coordinador.
5. Pausar/terminar interrumpe el proceso local en ejecución e impide nuevos despertares.
6. El navegador recibe actualizaciones websocket en vivo de estado/logs de ejecución y cambios de tareas/agentes.
7. Las ejecuciones fallidas exponen diagnóstico rico del CLI en la UI con extractos disponibles de inmediato y log completo recuperable vía `RunLogStore`.
8. Todas las acciones siguen limitadas por empresa y auditables.

## 16. Preguntas abiertas

1. ¿Debe el valor por defecto del temporizador ser `null` (apagado hasta habilitarlo) o `300` segundos por defecto?
2. ¿Cuál debe ser la política de retención por defecto para objetos de log completos vs metadatos de Postgres?
3. ¿Deben permitirse las credenciales de API del agente en plantillas de prompt por defecto, o requerir un toggle explícito de opt-in?
4. ¿Debe el websocket ser el único canal en tiempo real, o también exponer SSE para clientes más simples?
