# Plan de gobernanza de creación y contratación de agentes CEO (V1.1)

Estado: Propuesto  
Fecha: 2026-02-19  
Responsable: Producto + Servidor + UI + Habilidades

## 1. Objetivo

Permitir que un agente CEO cree nuevos agentes directamente, con gobernanza ligera pero explícita:

- Interruptor a nivel de empresa: las nuevas contrataciones requieren aprobación del tablero (por defecto ON).
- Permiso a nivel de agente: `can_create_agents` (por defecto ON para CEO, OFF para todos los demás).
- Flujo de contratación claro con estado borrador/limbo hasta la aprobación.
- Reflexión de configuración para que los agentes de contratación puedan inspeccionar la configuración disponible del adaptador y comparar configuraciones de agentes existentes (incluido él mismo).
- Flujo de colaboración de aprobación con comentarios, solicitudes de revisión y registro de auditoría.

## 2. Estado actual (realidad del repositorio)

- La creación de agentes es solo-tablero en `POST /api/companies/:companyId/agents` (`server/src/routes/agents.ts`).
- Las aprobaciones soportan `pending/approved/rejected/cancelled` y `hire_agent` + `approve_ceo_strategy` (`packages/shared/src/constants.ts`, `server/src/services/approvals.ts`).
- La aprobación `hire_agent` actualmente crea el agente solo al aprobar; no hay un agente limbo pre-creado.
- No existe hoy un sistema de permisos de agentes.
- No hay un ajuste de empresa para "las nuevas contrataciones requieren aprobación del tablero".
- Las aprobaciones no tienen hilo de comentarios ni estado de solicitud de revisión.
- Las UIs de bandeja de entrada y aprobaciones solo soportan aprobar/rechazar; no existe ruta de detalle de aprobación en las rutas de la app.
- La configuración del adaptador del agente es JSON libre; no existe un endpoint de reflexión en tiempo de ejecución para descubrimiento legible por máquina o de texto.

## 3. Decisiones de producto

## 3.1 Ajuste de empresa

Agregar ajuste de empresa:

- `requireBoardApprovalForNewAgents: boolean`
- Por defecto: `true`
- Editable solo en ajustes avanzados de la empresa (no en la UI del flujo de incorporación/creación de empresa)

## 3.2 Permisos de agente

Introducir un modelo de permisos ligero con un permiso explícito por ahora:

- `can_create_agents: boolean`

Por defecto:

- CEO: `true`
- Todos los demás: `false`

Autoridad:

- El tablero puede editar permisos de cualquier agente.
- El CEO puede editar permisos de agentes de la misma empresa.

Sin un sistema RBAC más amplio en esta fase.

## 3.3 Estado limbo para contrataciones

Introducir un estado dedicado no operativo:

- `pending_approval`

Significado:

- El registro del agente existe en el árbol de la organización y puede revisarse.
- El agente no puede ejecutar, recibir asignaciones, crear claves ni reanudarse a estados activos hasta ser aprobado.

## 4. Cambios del modelo de datos

## 4.1 `companies`

Agregar columna:

- `require_board_approval_for_new_agents` boolean not null por defecto `true`

Sincronización requerida:

- `packages/db/src/schema/companies.ts`
- `packages/shared/src/types/company.ts`
- `packages/shared/src/validators/company.ts`
- Uso de tipos de la API de empresa en UI y formulario de ajustes avanzados de la empresa

## 4.2 `agents`

Agregar columnas:

- `permissions` jsonb not null por defecto `{}`
- expansión de valores de estado para incluir `pending_approval`

Sincronización requerida:

- `packages/db/src/schema/agents.ts`
- `packages/shared/src/constants.ts` (`AGENT_STATUSES`)
- `packages/shared/src/types/agent.ts`
- `packages/shared/src/validators/agent.ts`
- insignias de estado, filtros y controles de ciclo de vida en UI

## 4.3 `approvals`

Mantener la aprobación como registro de gobernanza central; extender soporte de flujo de trabajo:

- agregar estado `revision_requested`
- asegurar que el payload de aprobaciones de contratación contenga:
  - `agentId`
  - `requestedByAgentId`
  - `requestedConfigurationSnapshot`

## 4.4 Nueva tabla `approval_comments`

Agregar hilo de discusión para aprobaciones:

- `id`, `company_id`, `approval_id`, `author_agent_id`, `author_user_id`, `body`, marcas de tiempo

Propósito:

- comentarios de revisión
- solicitudes de revisión
- justificación de aprobar/rechazar
- registro de auditoría permanente

## 5. Plan de API y AuthZ

## 5.1 Helpers de permisos

Agregar helpers de authz del lado del servidor:

- `assertCanCreateAgents(req, companyId)`
- `assertCanManageAgentPermissions(req, companyId)`

Reglas:

- El tablero siempre pasa.
- El agente pasa la verificación de `can_create_agents` si su propio permiso es true y misma empresa.
- Gestión de permisos por CEO o el tablero.

## 5.2 Flujo de creación de contratación

Agregar ruta:

- `POST /api/companies/:companyId/agent-hires`

Comportamiento:

- Requiere `can_create_agents` (o el tablero).
- Crea la fila del agente primero.
- Si el ajuste de la empresa requiere aprobación:
  - crear el agente con `status=pending_approval`
  - crear `approvals(type=hire_agent,status=pending,payload.agentId=...)`
  - devolver agente + aprobación
- Si el ajuste está deshabilitado:
  - crear el agente como `idle`
  - no se requiere registro de aprobación

El tablero puede seguir usando la ruta de creación directa, pero esta ruta se vuelve canónica para contratación liderada por CEO/agente.

## 5.3 Endpoints del flujo de aprobación

Agregar/extender:

- `GET /api/approvals/:id`
- `POST /api/approvals/:id/request-revision`
- `POST /api/approvals/:id/resubmit`
- `GET /api/approvals/:id/comments`
- `POST /api/approvals/:id/comments`

Actualizar la semántica existente de aprobar/rechazar:

- aprobar una contratación cambia el agente enlazado `pending_approval -> idle`
- rechazar mantiene el agente enlazado en estado no activo (`pending_approval` o `terminated`/eliminado más tarde)

## 5.4 Endpoints de gestión de permisos de agente

Agregar:

- `PATCH /api/agents/:id/permissions`

Soporta solo la clave inicial:

- `{ "canCreateAgents": boolean }`

## 5.5 Endpoints de lectura de configuración (protegidos)

Agregar endpoints de lectura de configuración con control de permisos:

- `GET /api/companies/:companyId/agent-configurations`
- `GET /api/agents/:id/configuration`

Acceso:

- tablero
- CEO
- cualquier agente con `can_create_agents`

Seguridad:

- redactar valores secretos obvios de la configuración del adaptador (`env`, API keys, tokens, valores con apariencia de JWT)
- incluir marcador de redacción en la respuesta

## 5.6 Endpoints de reflexión para configuración de adaptadores

Agregar rutas de reflexión de texto plano:

- `GET /llms/agent-configuration.txt`
- `GET /llms/agent-configuration/:adapterType.txt`

El archivo índice incluye:

- lista de adaptadores instalados para esta instancia de Paperclip
- URLs de documentación por adaptador
- enlaces breves de secuencia API "cómo contratar"

El archivo por adaptador incluye:

- claves de configuración requeridas/opcionales
- valores por defecto
- descripciones de campos
- notas de seguridad
- payloads de ejemplo

Autenticación:

- misma puerta que los endpoints de lectura de configuración (tablero/CEO/`can_create_agents`).

## 6. Extensión del protocolo de adaptador

Extender el contrato `ServerAdapterModule` para exponer documentos de configuración:

- `agentConfigurationDoc` (string) o `getAgentConfigurationDoc()`

Implementar en:

- `packages/adapters/claude-local`
- `packages/adapters/codex-local`
- `server/src/adapters/registry.ts`

Esto es necesario para que la reflexión se genere desde los adaptadores instalados, no hardcodeada.

## 7. Plan de UI

## 7.1 Ajustes avanzados de empresa

En la UI de empresas, agregar panel/modal de ajustes avanzados con:

- interruptor: "Requerir aprobación del tablero para nuevas contrataciones de agentes" (por defecto activado)

No se muestra en el flujo de incorporación.

## 7.2 UI de permisos de agente

En el detalle del agente (contexto tablero/CEO):

- sección de permisos
- interruptor para "Puede crear nuevos agentes"

## 7.3 UX de contratación

Agregar flujo "Contratar agente" (para CEO/agentes autorizados):

- elegir rol/nombre/título/reportsTo
- redactar prompt inicial/capacidades
- inspeccionar documentos de reflexión del adaptador
- inspeccionar configuraciones de agentes relacionados existentes
- enviar la contratación

Mensajería de estado:

- si se requiere aprobación: mostrar "Pendiente de aprobación del tablero"
- si no se requiere: mostrar estado activo-listo

## 7.4 UX de aprobaciones

Agregar página de detalle de aprobación y expandir la integración de la bandeja de entrada:

- `/approvals/:approvalId`
- comentarios en hilo
- acción de solicitud de revisión
- aprobar/rechazar con nota de decisión
- línea de tiempo de actividad (creada, revisiones, decisiones)

## 7.5 Limpieza de agente rechazado

Proveer acción destructiva solo-tablero en el detalle de aprobación:

- "Eliminar agente rechazado"
- diálogo de confirmación explícito
- preserva la aprobación + historial de comentarios (auditoría)

## 8. Nueva habilidad: `paperclip-create-agent`

Crear nuevo directorio de habilidad:

- `skills/paperclip-create-agent/SKILL.md`
- `skills/paperclip-create-agent/references/api-reference.md`

Responsabilidades de la habilidad:

- Descubrir la configuración disponible del adaptador vía `/llms/agent-configuration*.txt`
- Leer configuraciones de agentes existentes (incluyendo la propia y roles relacionados)
- Proponer la configuración de mejor ajuste para el entorno actual
- Redactar un prompt inicial de alta calidad para el nuevo agente
- Definir la línea de gerente/reporte
- Ejecutar el flujo de contratación de la API
- Manejar el loop de revisión con comentarios del tablero

También actualizar `skills/paperclip/SKILL.md` para referenciar esta habilidad en los flujos de contratación.

## 9. Aplicación e invariantes

Invariantes nuevos/actualizados:

- Los agentes `pending_approval` no pueden:
  - ser invocados/despertados
  - tener issues asignados
  - crear o usar API keys
  - transicionar a estados activos del ciclo de vida excepto a través de la aprobación de contratación
- transiciones de aprobación:
  - `pending -> revision_requested | approved | rejected | cancelled`
  - `revision_requested -> pending | rejected | cancelled`
- cada mutación escribe registros de `activity_log`.

## 10. Fases de implementación

## Fase 1: Contratos y migración

- Actualizaciones de esquema de DB (`companies`, `agents`, expansión de estados de aprobaciones, `approval_comments`)
- actualizaciones de constantes/tipos/validadores compartidos
- generación de migración y typecheck

## Fase 2: Authz del servidor + flujo de contratación

- resolvedor de permisos y guardas de authz
- ruta `agent-hires`
- aplicación del estado limbo en flujos de latido/issue/claves
- endpoints de revisión/comentarios de aprobación

## Fase 3: Reflexión y APIs de lectura de configuración

- soporte de documentos del protocolo de adaptador
- rutas `/llms/agent-configuration*.txt`
- endpoints de lectura de configuración protegidos con redacción

## Fase 4: UI y habilidades

- UI de ajuste avanzado de empresa
- controles de permisos
- detalle de aprobación + flujo de comentarios/revisión en bandeja de entrada/aprobaciones
- flujo de eliminación de agente rechazado
- habilidad `paperclip-create-agent` + actualizaciones de docs

## 11. Plan de pruebas

Pruebas del servidor:

- pruebas de puerta de permisos para endpoints de contratación/lectura de configuración/actualización de permisos
- comportamiento de creación de contratación con el ajuste de empresa activado/desactivado
- transiciones de aprobación incluyendo el ciclo de revisión
- aplicación de `pending_approval` en wakeup/invoke/asignación/claves
- pruebas de redacción de configuración

Pruebas de UI:

- persistencia del interruptor de ajuste avanzado
- interacciones de comentarios/revisión del detalle de aprobación
- estados del flujo de contratación (pendiente vs inmediato)

Verificación del repositorio antes del merge:

- `pnpm -r typecheck`
- `pnpm test:run`
- `pnpm build`

## 12. Riesgos y mitigaciones

- Riesgo: filtrar secretos a través de lecturas de configuración de agentes.
  - Mitigación: pasada estricta de redacción + pruebas de lista de permitidos/denegados.
- Riesgo: complejidad por explosión de estados.
  - Mitigación: un solo estado agregado (`pending_approval`) con guardas de transición explícitas.
- Riesgo: regresiones del flujo de aprobación.
  - Mitigación: centralizar la lógica de transición en el servicio de aprobación y respaldarla con pruebas.

## 13. Decisiones abiertas (recomendación por defecto)

1. ¿Debería la creación directa del tablero evitar el ajuste de aprobación?
Recomendación: sí, el tablero es una anulación explícita de gobernanza.

2. ¿Deberían los agentes no autorizados aún ver metadatos básicos del agente?
Recomendación: sí (nombre/rol/estado), pero los campos de configuración quedan restringidos.

3. Al rechazar, ¿debería el agente limbo permanecer `pending_approval` o moverse a `terminated`?
Recomendación: moverse a `terminated` en el rechazo final; mantener la acción opcional de eliminación dura para limpieza.
