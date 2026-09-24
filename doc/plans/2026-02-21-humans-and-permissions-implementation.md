# Humanos y permisos — Implementación (V1)

Estado: Borrador
Fecha: 2026-02-21
Responsables: Servidor + UI + CLI + DB + Shared
Plan compañero: `doc/plan/humans-and-permissions.md`

## 1. Rol del documento

Este documento es el contrato de implementación de ingeniería para el plan de humanos y permisos.
Traduce las decisiones de producto en trabajo concreto de esquema, API, middleware, UI, CLI y pruebas.

Si este documento entra en conflicto con notas exploratorias previas, este documento gana para la ejecución V1.

## 2. Decisiones V1 bloqueadas

1. Se mantienen dos modos de despliegue:
- `local_trusted`
- `cloud_hosted`

2. `local_trusted`:
- sin UX de login
- actor admin implícito de la instancia local
- bind del servidor solo a loopback
- capacidades completas de admin/ajustes/invitación/aprobación disponibles localmente

3. `cloud_hosted`:
- Better Auth para humanos
- solo email/contraseña
- sin requisito de verificación de email en V1

4. Permisos:
- un sistema de autorización compartido para humanos y agentes
- tabla de grants normalizada (`principal_permission_grants`)
- sin un "motor de permisos de agentes" separado

5. Invitaciones:
- solo copiar-enlace (sin envío de email saliente en V1)
- enlace unificado `company_join` que soporta la ruta humana o de agente
- la aceptación crea una solicitud de unión `pending_approval`
- sin acceso hasta la aprobación del admin

6. Metadatos de revisión de uniones:
- IP de origen requerida
- sin búsqueda GeoIP/país en V1

7. API keys de agentes:
- indefinidas por defecto
- hash en reposo
- mostrar una sola vez al reclamar
- revocación/regeneración soportadas

8. Ingreso local:
- el ingreso público/no confiable está fuera de alcance para V1
- sin `--dangerous-agent-ingress` en V1

## 3. Línea base actual y delta

Línea base actual (repo a la fecha de este documento):

- el modelo de actor del servidor por defecto es `board` en `server/src/middleware/auth.ts`
- la autorización es mayormente `assertBoard` + verificación de empresa en `server/src/routes/authz.ts`
- sin tablas de auth/sesión de humanos en el esquema local
- sin tablas de membresía principal o grants
- sin ciclo de vida de invitaciones o solicitudes de unión

Delta requerido:

- moverse de authz tablero-vs-agente a authz basada en principales
- agregar integración de Better Auth en modo nube
- agregar persistencia de membresías/grants/invitaciones/solicitudes de unión
- agregar señales y acciones de la bandeja de entrada de aprobación
- preservar la UX local sin login sin debilitar la seguridad en la nube

## 4. Arquitectura

## 4.1 Contrato de modo de despliegue

Agregar modo de tiempo de ejecución explícito:

- `deployment.mode = local_trusted | cloud_hosted`

Comportamiento de configuración:

- el modo se almacena en el archivo de configuración (`packages/shared/src/config-schema.ts`)
- se carga en la configuración del servidor (`server/src/config.ts`)
- se expone en `/api/health`

Guardas de arranque:

- `local_trusted`: fallar el arranque si el host de bind no es loopback
- `cloud_hosted`: fallar el arranque si Better Auth no está configurado

## 4.2 Modelo de actor

Reemplazar la semántica implícita de "board" con actores explícitos:

- `user` (humano autenticado por sesión)
- `agent` (API key bearer)
- `local_implicit_admin` (solo local_trusted)

Nota de implementación:

- mantener la forma de `req.actor` retrocompatible durante la migración introduciendo un helper normalizador
- eliminar las verificaciones `"board"` hardcodeadas ruta por ruta después de que los nuevos helpers de authz estén en su lugar

## 4.3 Modelo de autorización

Tupla de entrada de autorización:

- `(company_id, principal_type, principal_id, permission_key, scope_payload)`

Tipos de principal:

- `user`
- `agent`

Capas de roles:

- `instance_admin` (toda la instancia)
- grants con alcance de empresa vía `principal_permission_grants`

Orden de evaluación:

1. resolver el principal desde el actor
2. resolver el rol de instancia (`instance_admin` atajo para acciones solo-admin)
3. resolver la membresía de empresa (se requiere `active` para acceso a la empresa)
4. resolver grant + alcance para la acción solicitada

## 5. Modelo de datos

## 5.1 Tablas de Better Auth

Gestionadas por el adaptador/migraciones de Better Auth (mínimo esperado):

- `user`
- `session`
- `account`
- `verification`

Nota:

- usar los nombres/tipos de tabla canónicos de Better Auth para evitar forks personalizados

## 5.2 Nuevas tablas de Paperclip

1. `instance_user_roles`

- `id` uuid pk
- `user_id` text not null
- `role` text not null (`instance_admin`)
- `created_at`, `updated_at`
- índice único: `(user_id, role)`

2. `company_memberships`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `principal_type` text not null (`user | agent`)
- `principal_id` text not null
- `status` text not null (`pending | active | suspended`)
- `membership_role` text null
- `created_at`, `updated_at`
- índice único: `(company_id, principal_type, principal_id)`
- índice: `(principal_type, principal_id, status)`

3. `principal_permission_grants`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `principal_type` text not null (`user | agent`)
- `principal_id` text not null
- `permission_key` text not null
- `scope` jsonb null
- `granted_by_user_id` text null
- `created_at`, `updated_at`
- índice único: `(company_id, principal_type, principal_id, permission_key)`
- índice: `(company_id, permission_key)`

4. `invites`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `invite_type` text not null (`company_join | bootstrap_ceo`)
- `token_hash` text not null
- `allowed_join_types` text not null (`human | agent | both`) para `company_join`
- `defaults_payload` jsonb null
- `expires_at` timestamptz not null
- `invited_by_user_id` text null
- `revoked_at` timestamptz null
- `accepted_at` timestamptz null
- `created_at` timestamptz not null por defecto now()
- índice único: `(token_hash)`
- índice: `(company_id, invite_type, revoked_at, expires_at)`

5. `join_requests`

- `id` uuid pk
- `invite_id` uuid fk `invites.id` not null
- `company_id` uuid fk `companies.id` not null
- `request_type` text not null (`human | agent`)
- `status` text not null (`pending_approval | approved | rejected`)
- `request_ip` text not null
- `requesting_user_id` text null
- `request_email_snapshot` text null
- `agent_name` text null
- `adapter_type` text null
- `capabilities` text null
- `agent_defaults_payload` jsonb null
- `created_agent_id` uuid fk `agents.id` null
- `approved_by_user_id` text null
- `approved_at` timestamptz null
- `rejected_by_user_id` text null
- `rejected_at` timestamptz null
- `created_at`, `updated_at`
- índice: `(company_id, status, request_type, created_at desc)`
- índice único: `(invite_id)` para aplicar una solicitud por invitación consumida

## 5.3 Cambios en tablas existentes

1. `issues`

- agregar `assignee_user_id` text null
- aplicar la invariante de un solo asignado:
  - como máximo uno de `assignee_agent_id` y `assignee_user_id` es no-nulo

2. `agents`

- mantener el JSON `permissions` existente solo para la transición
- marcarlo como deprecado en la ruta de código una vez que los grants principales estén en vivo

## 5.4 Estrategia de migración

Orden de migración:

1. agregar nuevas tablas/columnas/índices
2. rellenar membresías/grants mínimos para datos existentes:
- crear el contexto de membresía de admin implícito local en modo local en tiempo de ejecución (no persistido como usuario de Better Auth)
- para la nube, bootstrap crea el primer rol de usuario admin al aceptar
3. cambiar las lecturas de authz a las nuevas tablas
4. eliminar las verificaciones solo-tablero heredadas

## 6. Contrato de API (nuevo/cambiado)

Todo bajo `/api`.

## 6.1 Health

`GET /api/health` adiciones a la respuesta:

- `deploymentMode`
- `authReady`
- `bootstrapStatus` (`ready | bootstrap_pending`)

## 6.2 Invitaciones

1. `POST /api/companies/:companyId/invites`
- crear invitación `company_join`
- el valor de copiar-enlace se devuelve una sola vez

2. `GET /api/invites/:token`
- validar el token
- devolver el payload de aterrizaje de la invitación
- incluye `allowedJoinTypes`

3. `POST /api/invites/:token/accept`
- cuerpo:
  - `requestType: human | agent`
  - ruta humana: sin payload extra más allá del usuario autenticado
  - ruta de agente: `agentName`, `adapterType`, `capabilities`, defaults opcionales del adaptador
- consume el token de invitación
- crea `join_requests(status=pending_approval)`

4. `POST /api/invites/:inviteId/revoke`
- revoca una invitación no consumida

## 6.3 Solicitudes de unión

1. `GET /api/companies/:companyId/join-requests?status=pending_approval&requestType=...`

2. `POST /api/companies/:companyId/join-requests/:requestId/approve`
- humano:
  - crear/activar `company_memberships`
  - aplicar grants por defecto
- agente:
  - crear fila `agents`
  - crear contexto de reclamo pendiente para la API key
  - crear/activar membresía del agente
  - aplicar grants por defecto

3. `POST /api/companies/:companyId/join-requests/:requestId/reject`

4. `POST /api/join-requests/:requestId/claim-api-key`
- solo solicitud de agente aprobada
- devuelve la clave en texto plano una sola vez
- almacena el hash en `agent_api_keys`

## 6.4 Membresía y grants

1. `GET /api/companies/:companyId/members`
- devuelve ambos tipos de principal

2. `PATCH /api/companies/:companyId/members/:memberId/permissions`
- upsert/eliminar grants

3. `PUT /api/admin/users/:userId/company-access`
- solo admin de instancia

4. `GET /api/admin/users/:userId/company-access`

5. `POST /api/admin/users/:userId/promote-instance-admin`

6. `POST /api/admin/users/:userId/demote-instance-admin`

## 6.5 Bandeja de entrada

`GET /api/companies/:companyId/inbox` adiciones:

- elementos de alerta de solicitudes de unión pendientes cuando el actor puede `joins:approve`
- cada elemento incluye metadatos de acción inline:
  - id de solicitud de unión
  - tipo de solicitud
  - IP de origen
  - instantánea de email humano cuando aplique

## 7. Detalles de implementación del servidor

## 7.1 Configuración y arranque

Archivos:

- `packages/shared/src/config-schema.ts`
- `server/src/config.ts`
- `server/src/index.ts`
- `server/src/startup-banner.ts`

Cambios:

- agregar ajustes de modo de despliegue + host de bind
- aplicar loopback-only para `local_trusted`
- aplicar preparación de Better Auth en `cloud_hosted`
- el banner muestra el modo y el estado de bootstrap

## 7.2 Integración de Better Auth

Archivos:

- `server/package.json` (dependencia)
- `server/src/auth/*` (nuevo)
- `server/src/app.ts` (montar endpoints del manejador de auth + middleware de sesión)

Cambios:

- agregar instancia de servidor de Better Auth
- manejo de cookie/sesión para modo nube
- auth de sesión no-op en modo local

## 7.3 Middleware de actor

Archivos:

- `server/src/middleware/auth.ts`
- `server/src/routes/authz.ts`
- `server/src/middleware/board-mutation-guard.ts`

Cambios:

- dejar de defaultear cada solicitud al tablero en modo nube
- mapear solicitudes locales al actor `local_implicit_admin` en modo local
- mapear la sesión de Better Auth al actor `user` en modo nube
- preservar la ruta bearer de agente
- reemplazar `assertBoard` con helpers orientados a permisos:
  - `requireInstanceAdmin(req)`
  - `requireCompanyAccess(req, companyId)`
  - `requireCompanyPermission(req, companyId, permissionKey, scope?)`

## 7.4 Servicios de autorización

Archivos:

- `server/src/services` (nuevos módulos)
  - `memberships.ts`
  - `permissions.ts`
  - `invites.ts`
  - `join-requests.ts`
  - `instance-admin.ts`

Cambios:

- evaluación centralizada de permisos
- resolución centralizada de membresía
- un lugar para la ramificación por tipo de principal

## 7.5 Rutas

Archivos:

- `server/src/routes/index.ts` y nuevos módulos de rutas:
  - `auth.ts` (si se necesita)
  - `invites.ts`
  - `join-requests.ts`
  - `members.ts`
  - `instance-admin.ts`
  - `inbox.ts` (o extensión de la fuente de inbox existente)

Cambios:

- agregar los nuevos endpoints listados arriba
- aplicar verificaciones de empresa y permisos de forma consistente
- registrar todas las mutaciones a través del servicio de registro de actividad

## 7.6 Registro de actividad y auditoría

Archivos:

- `server/src/services/activity-log.ts`
- sitios de llamada en rutas de invitación/unión/miembro/admin

Acciones requeridas:

- `invite.created`
- `invite.revoked`
- `join.requested`
- `join.approved`
- `join.rejected`
- `membership.activated`
- `permission.granted`
- `permission.revoked`
- `instance_admin.promoted`
- `instance_admin.demoted`
- `agent_api_key.claimed`
- `agent_api_key.revoked`

## 7.7 Tiempo real y propagación de la bandeja de entrada

Archivos:

- `server/src/services/live-events.ts`
- `server/src/realtime/live-events-ws.ts`
- endpoint(s) de fuente de datos de la bandeja de entrada

Cambios:

- emitir eventos de solicitud de unión
- asegurar que la ruta de refresco de la bandeja de entrada incluya alertas de unión

## 8. Implementación del CLI

Archivos:

- `cli/src/index.ts`
- `cli/src/commands/onboard.ts`
- `cli/src/commands/configure.ts`
- `cli/src/prompts/server.ts`

Comandos:

1. `paperclipai auth bootstrap-ceo`
- crear invitación de bootstrap
- imprimir URL de un solo uso

2. `paperclipai onboard`
- en modo nube con `bootstrap_pending`, imprimir la URL de bootstrap y próximos pasos
- en modo local, omitir el requisito de bootstrap

Adiciones de configuración:

- modo de despliegue
- host de bind (validado contra el modo)

## 9. Implementación de UI

Archivos:

- enrutamiento: `ui/src/App.tsx`
- clientes de API: `ui/src/api/*`
- páginas/componentes (nuevos):
  - `AuthLogin` / `AuthSignup` (modo nube)
  - página `BootstrapPending`
  - página `InviteLanding`
  - página `InstanceSettings`
  - componentes de aprobación de unión en `Inbox`
  - gestión de miembros/grants en ajustes de empresa

UX requerida:

1. Usuario no autenticado en la nube:
- redirigir a login/signup

2. Bootstrap pendiente en la nube:
- bloquear la app con guía del comando de configuración

3. Aterrizaje de invitación:
- elegir la ruta humana vs agente (respetar `allowedJoinTypes`)
- enviar solicitud de unión
- mostrar confirmación de aprobación pendiente

4. Bandeja de entrada:
- mostrar tarjetas de aprobación de unión con acciones de aprobar/rechazar
- incluir IP de origen e instantánea de email humano cuando aplique

5. Modo local:
- sin prompts de login
- UI completa de ajustes/invitación/aprobación disponible

## 10. Controles de seguridad

1. Manejo de tokens

- tokens de invitación hasheados en reposo
- API keys hasheadas en reposo
- revelación de clave en texto plano de un solo uso solo

2. Aislamiento del modo local

- aplicación de bind de loopback
- fallo duro de arranque en host no-loopback

3. Auth en la nube

- sin fallback implícito al tablero
- auth de sesión obligatoria para mutaciones humanas

4. Endurecimiento del flujo de unión

- una solicitud por token de invitación
- la solicitud pendiente no tiene acceso a datos
- aprobación requerida antes de activar la membresía

5. Controles de abuso

- limitar por tasa los endpoints de aceptar invitación y reclamar clave
- registro estructurado para fallas de unión y reclamo

## 11. Migración y compatibilidad

## 11.1 Compatibilidad en tiempo de ejecución

- mantener funcionales las rutas existentes dependientes del tablero mientras se migran los usos de helpers de authz
- eliminar llamadas `assertBoard` solo después de que los helpers de permisos cubran todas las rutas

## 11.2 Compatibilidad de datos

- no eliminar `agents.permissions` en V1
- dejar de leerlo una vez que los grants estén conectados
- eliminar en migración de limpieza post-V1

## 11.3 Manejo de ID de usuario de Better Auth

- tratar `user.id` como texto de punta a punta
- los campos de texto existentes `created_by_user_id` y similares siguen siendo válidos

## 12. Estrategia de pruebas

## 12.1 Pruebas unitarias

- evaluador de permisos:
  - bypass de admin de instancia
  - verificaciones de grants
  - verificaciones de alcance
- máquina de estados de aprobación de unión
- ciclo de vida del token de invitación

## 12.2 Pruebas de integración

- mutación no autenticada en modo nube -> `401`
- mutación de admin implícito en modo local -> éxito
- aceptar invitación -> unión pendiente -> sin acceso
- aprobar unión (humano) -> membresía/grants activos
- aprobar unión (agente) -> reclamo de clave una vez
- acceso entre empresas denegado para principales usuario y agente
- bind no-loopback en modo local -> falla de arranque

## 12.3 Pruebas de UI

- puerta de login en modo nube
- pantalla de bootstrap pendiente
- UX de elegir-ruta en el aterrizaje de invitación
- flujos de aprobar/rechazar de alertas de unión en la bandeja de entrada

## 12.4 Pruebas de regresión

- los flujos existentes de API keys de agentes siguen funcionando
- invariantes de asignación de tareas y checkout sin cambios
- registro de actividad aún emitido para todas las mutaciones

## 13. Plan de entrega

## Fase A: Bases

- soporte de modo/bind host en configuración
- guardas de arranque
- esqueleto de integración de Better Auth
- expansión de tipos de actor

## Fase B: Esquema y núcleo de authz

- agregar tablas de membresía/grants/invitación/unión
- agregar servicio de permisos y helpers
- conectar verificaciones de empresa/miembro/admin de instancia

## Fase C: Backend de invitación + unión

- crear/revocar invitaciones
- aceptar invitación -> solicitud pendiente
- aprobar/rechazar + reclamo de clave
- registro de actividad + eventos en vivo

## Fase D: UI + CLI

- pantallas de login/bootstrap en la nube
- aterrizaje de invitación
- acciones de aprobación de unión en la bandeja de entrada
- ajustes de instancia y permisos de miembros
- comando bootstrap del CLI y actualizaciones de incorporación

## Fase E: Endurecimiento

- cobertura completa de integración/e2e
- actualizaciones de docs (`SPEC-implementation`, `DEVELOPING`, `CLI`)
- limpieza de rutas solo-tablero heredadas

## 14. Puerta de verificación

Antes de entregar:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

Si algún comando se omite, registrar exactamente qué se omitió y por qué.

## 15. Criterios de terminado

1. El comportamiento coincide con las decisiones V1 bloqueadas en este documento y `doc/plan/humans-and-permissions.md`.
2. El modo nube requiere auth; el modo local no tiene UX de login.
3. El flujo unificado de invitación + aprobación pendiente funciona para humanos y agentes.
4. El sistema compartido de membresía principal + permisos está en vivo para usuarios y agentes.
5. El modo local sigue siendo solo-loopback y falla en caso contrario.
6. La bandeja de entrada muestra aprobaciones de unión accionables.
7. Todas las nuevas rutas de mutación tienen registro de actividad.
