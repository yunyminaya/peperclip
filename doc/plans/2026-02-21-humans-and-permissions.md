# Plan de humanos y permisos

Estado: Borrador
Fecha: 2026-02-21
Responsable: Servidor + UI + Shared + DB

## Objetivo

Agregar usuarios humanos de primera clase y permisos preservando dos modos de despliegue:

- modo local confiable de un solo usuario sin fricción de login
- modo hospedado en la nube multi-usuario con autenticación y autorización obligatorias

## Por qué este plan

Las suposiciones actuales de V1 están centradas en un operador del tablero. Ahora necesitamos:

- colaboración multi-humana con permisos por usuario
- defaults seguros de despliegue en la nube (sin producción sin login por accidente)
- modo local que aún se sienta instantáneo (`npx paperclipai run` y listo)
- delegación de tareas de agente a humano, incluyendo una bandeja de entrada humana
- una cuenta de usuario con acceso a múltiples empresas en un despliegue
- admins de instancia que pueden gestionar el acceso a empresas en toda la instancia
- aprobaciones de unión expuestas como alertas accionables de la bandeja de entrada, no enterradas en páginas solo-admin
- una ruta simétrica de invitación-y-aprobación de incorporación para humanos y agentes
- un modelo compartido de membresía y permisos para humanos y agentes

## Restricciones de producto

1. Mantener el alcance de empresa estricto para cada nueva tabla, endpoint y verificación de permisos.
2. Preservar las invariantes existentes del plano de control:

- modelo de tarea con un solo asignado
- puertas de aprobación
- comportamiento de tope duro de presupuesto
- registro de actividad de mutaciones

3. Mantener el modo local fácil y confiable, pero prevenir una postura insegura en la nube.

## Modos de despliegue

## Modo A: `local_trusted`

Comportamiento:

- sin UI de login
- el navegador abre directamente en contexto del tablero
- la BD embebida y los defaults de almacenamiento local permanecen
- existe un actor humano implícito local para atribución
- el actor implícito local tiene autoridad efectiva de `instance_admin` para esa instancia
- los flujos completos de ajustes/invitación/aprobación/permisos permanecen disponibles en modo local (incluida la inscripción de agentes)

Guardas:

- el servidor hace bind a loopback por defecto
- fallar el arranque si el modo es `local_trusted` con bind no-loopback
- la UI muestra una insignia persistente "Local trusted mode"

## Modo B: `cloud_hosted`

Comportamiento:

- login requerido para todos los endpoints humanos
- Better Auth para auth humana
- método de autenticación inicial: email + contraseña
- la verificación de email no se requiere para el release inicial
- BD hospedada y despliegue remoto soportados
- sesiones multi-usuario y aplicación de roles/permisos

Guardas:

- fallar el arranque si falta el proveedor de auth/configuración de sesión
- fallar el arranque si se define un flag inseguro de bypass de auth
- el payload de health incluye el modo y la preparación de auth

## Elección de autenticación

- usar Better Auth para usuarios humanos
- comenzar solo con login de email/contraseña
- sin requisito de confirmación de email en V1
- mantener la implementación estructurada para que proveedores sociales/SSO puedan agregarse más tarde sin cambiar la semántica de membresía/permisos

## Modelo de auth y actor

Unificar los actores de solicitud en un solo modelo:

- `user` (humano autenticado)
- `agent` (API key)
- `local_board_implicit` (solo modo local confiable)

Reglas:

- en `cloud_hosted`, solo `user` y `agent` son actores válidos
- en `local_trusted`, las solicitudes de navegador/API no autenticadas se resuelven a `local_board_implicit`
- `local_board_implicit` está autorizado como principal admin de instancia para operaciones locales
- todas las acciones que mutan siguen escribiendo `activity_log` con tipo/id de actor

## Bootstrap del primer admin

Problema:

- los nuevos despliegues en la nube necesitan una ruta explícita y segura para el primer admin humano
- la app no puede asumir una cuenta de admin preexistente
- `local_trusted` no usa el flujo de bootstrap porque el admin implícito de la instancia local ya existe

Flujo de bootstrap:

1. Si no existe un usuario `instance_admin` para el despliegue, la instancia está en estado `bootstrap_pending`.
2. El comando CLI `pnpm paperclipai auth bootstrap-ceo` crea una URL de invitación de incorporación de CEO de un solo uso para esa instancia.
3. `pnpm paperclipai onboard` ejecuta esta verificación de bootstrap e imprime la URL de invitación automáticamente cuando hay `bootstrap_pending`.
4. Visitar la app mientras hay `bootstrap_pending` muestra una página de configuración bloqueante con el comando CLI exacto a ejecutar (`pnpm paperclipai onboard`).
5. Aceptar esa invitación de CEO crea el primer usuario admin y sale del modo bootstrap.

Reglas de seguridad:

- la invitación de bootstrap es de un solo uso, de vida corta y con hash de token almacenado en reposo
- solo una invitación de bootstrap activa a la vez por instancia (regenerar revoca el token previo)
- las acciones de bootstrap se auditan en `activity_log`

## Adiciones al modelo de datos

## Nuevas tablas

1. `users`

- registro de identidad para usuarios humanos (basado en email)
- campo opcional de rol a nivel de instancia (o tabla compañera) para derechos de admin

2. `company_memberships`

- `company_id`, `principal_type` (`user | agent`), `principal_id`
- estado (`pending | active | suspended`), metadatos de rol
- almacena el estado efectivo de acceso para humanos y agentes
- muchos-a-muchos: un principal puede pertenecer a múltiples empresas

3. `invites`

- `company_id`, `invite_type` (`company_join | bootstrap_ceo`), hash de token, expires_at, invited_by, revoked_at, accepted_at
- enlace de un solo uso para compartir (sin email de invitación pre-vinculado)
- `allowed_join_types` (`human | agent | both`) para enlaces `company_join`
- payload opcional de defaults por tipo de unión:
  - defaults humanos: permisos iniciales/rol de membresía
  - defaults de agente: rol/título/defaults de adaptador propuestos

4. `principal_permission_grants`

- `company_id`, `principal_type` (`user | agent`), `principal_id`, `permission_key`
- grants explícitos como `agents:create`
- incluye payload de alcance para límites de cadena de mando
- tabla normalizada (no blob JSON) para historial auditable de otorgar/revocar

5. `join_requests`

- `invite_id`, `company_id`, `request_type` (`human | agent`)
- `status` (`pending_approval | approved | rejected`)
- metadatos comunes de revisión:
  - `request_ip`
  - `approved_by_user_id`, `approved_at`, `rejected_by_user_id`, `rejected_at`
- campos de solicitud humana:
  - `requesting_user_id`, `request_email_snapshot`
- campos de solicitud de agente:
  - `agent_name`, `adapter_type`, `capabilities`, `created_agent_id` nullable hasta la aprobación
- cada invitación consumida crea exactamente un registro de solicitud de unión después de seleccionar el tipo de unión

6. Extensión de `issues`

- agregar `assignee_user_id` nullable
- preservar la invariante de un solo asignado con verificación XOR:
  - exactamente cero o uno de `assignee_agent_id` / `assignee_user_id`

## Compatibilidad

- los campos existentes `created_by_user_id` / `author_user_id` permanecen y se vuelven plenamente activos
- las API keys de agentes siguen siendo credenciales de auth; la membresía + grants siguen siendo la fuente de autorización

## Modelo de permisos (conjunto inicial)

Principio:

- humanos y agentes usan el mismo motor de evaluación de membresía + grants
- las verificaciones de permisos se resuelven contra `(company_id, principal_type, principal_id)` para ambos tipos de actor
- esto evita rutas de authz separadas y mantiene el comportamiento consistente

Capas de roles:

- `instance_admin`: admin de todo el despliegue, puede acceder/gestionar todas las empresas y el mapeo de acceso usuario-empresa
- `company_member`: solo permisos con alcance de empresa

Grants centrales:

1. `agents:create`
2. `users:invite`
3. `users:manage_permissions`
4. `tasks:assign`
5. `tasks:assign_scope` (delegación restringida a la organización)
6. `joins:approve` (aprobar/rechazar solicitudes de unión humanas y de agentes)

Reglas de comportamiento adicionales:

- los admins de instancia pueden promover/degradar admins de instancia y gestionar el acceso de usuarios entre empresas
- los usuarios de nivel tablero pueden gestionar grants de empresa dentro de las empresas que controlan
- los principales no-admin solo pueden actuar dentro de grants explícitos
- las verificaciones de asignación aplican a asignados tanto agentes como humanos

## Diseño de alcance de cadena de mando

Enfoque inicial:

- representar el alcance de asignación como una regla de permiso sobre la jerarquía de la organización
- ejemplos:
  - `subtree:<agentId>` (puede asignar dentro de ese subárbol de gerente)
  - `exclude:<agentId>` (no puede asignar a roles protegidos, p. ej., CEO)

Aplicación:

- resolver la posición en la organización del asignado objetivo
- evaluar reglas de alcance permitir/denegar antes de la mutación de asignación
- devolver `403` para asignaciones fuera de alcance

## Flujo de invitación y registro

1. Un usuario autorizado crea un enlace para compartir de invitación `company_join` con defaults + expiración opcionales.
2. El sistema envía la URL de invitación que contiene un token de un solo uso.
3. La página de aterrizaje de la invitación presenta dos rutas: `Join as human` o `Join as agent` (sujeto a `allowed_join_types`).
4. El solicitante selecciona la ruta de unión y envía los datos requeridos.
5. El envío consume el token y crea una solicitud de unión `pending_approval` (aún sin acceso).
6. La solicitud de unión captura metadatos de revisión:

- humano: email autenticado
- ambos: IP de origen
- agente: metadatos propuestos del agente

7. El admin de empresa/admin de instancia revisa la solicitud y la aprueba o rechaza.
8. Al aprobar:

- humano: activar `company_membership` y aplicar grants de permisos
- agente: crear el registro del agente y habilitar el flujo de reclamo de API key

9. El enlace es de un solo uso y no puede reutilizarse.
10. El invitador/admin puede revocar la invitación antes de la aceptación.

Reglas de seguridad:

- almacenar el token de invitación hasheado en reposo
- token de un solo uso con expiración corta
- todos los eventos del ciclo de vida de la invitación registrados en `activity_log`
- los usuarios pendientes no pueden leer ni mutar datos de la empresa hasta ser aprobados

## Bandeja de entrada de aprobación de uniones

- las solicitudes de unión generan alertas de bandeja de entrada para aprobadores elegibles (`joins:approve` o rol admin)
- las alertas aparecen en ambos:
  - feed global/de la empresa de la bandeja de entrada
  - UI dedicada de aprobaciones pendientes
- cada alerta incluye acciones de aprobar/rechazar inline (sin cambio de contexto requerido)
- el payload de la alerta debe incluir:
  - email del solicitante cuando `request_type=human`
  - IP de origen
  - tipo de solicitud (`human | agent`)

## Bandeja de entrada humana y delegación de agente a humano

Comportamiento:

- los agentes pueden asignar tareas a humanos cuando la política lo permite
- los humanos ven las tareas asignadas en la vista de bandeja de entrada (incluso en modo local confiable)
- los comentarios y transiciones de estado siguen las mismas guardas del ciclo de vida de issues

## Ruta de unión de agentes (vía enlace de invitación unificado)

1. Un usuario autorizado comparte un enlace de invitación `company_join` (con `allowed_join_types` incluyendo `agent`).
2. El operador del agente abre el enlace, elige `Join as agent` y envía el payload de unión (nombre/rol/metadatos de adaptador).
3. El sistema crea una solicitud de unión de agente `pending_approval` y captura la IP de origen.
4. El aprobador ve la alerta en la bandeja de entrada y aprueba o rechaza.
5. Al aprobar, el servidor crea el registro del agente y emite una API key de vida larga.
6. La API key se muestra exactamente una vez vía flujo de reclamo seguro con instrucción explícita de "guardar ahora".

Política de tokens de vida larga:

- por defecto API keys revocables de vida larga (hash almacenado en reposo)
- mostrar la clave en texto plano solo una vez
- soportar revocación/regeneración inmediata desde la UI de admin
- opcionalmente agregar expiraciones/política de rotación más tarde sin cambiar el flujo de unión

Adiciones de API (propuestas):

- `GET /companies/:companyId/inbox` (actor humano con alcance a sí mismo; incluye elementos de tareas + alertas de aprobación de unión pendientes cuando está autorizado)
- `POST /companies/:companyId/issues/:issueId/assign-user`
- `POST /companies/:companyId/invites`
- `GET /invites/:token` (payload de aterrizaje de invitación con `allowed_join_types`)
- `POST /invites/:token/accept` (el cuerpo incluye `requestType=human|agent` y metadatos de solicitud)
- `POST /invites/:inviteId/revoke`
- `GET /companies/:companyId/join-requests?status=pending_approval&requestType=human|agent`
- `POST /companies/:companyId/join-requests/:requestId/approve`
- `POST /companies/:companyId/join-requests/:requestId/reject`
- `POST /join-requests/:requestId/claim-api-key` (solo solicitudes de agente aprobadas)
- `GET /companies/:companyId/members` (devuelve principales humanos y agentes)
- `PATCH /companies/:companyId/members/:memberId/permissions`
- `POST /admin/users/:userId/promote-instance-admin`
- `POST /admin/users/:userId/demote-instance-admin`
- `PUT /admin/users/:userId/company-access` (definir las empresas accesibles para un usuario)
- `GET /admin/users/:userId/company-access`

## Política UX de modo local

- sin prompt de login ni configuración de cuenta requerida
- el usuario del tablero implícito local se auto-provisiona para atribución de auditoría
- el operador local aún puede usar ajustes de instancia y ajustes de empresa como admin efectivo de instancia
- la UI de invitación, aprobación de unión y gestión de permisos está disponible en modo local
- la incorporación de agentes se espera en modo local, incluyendo crear enlaces de invitación y aprobar solicitudes de unión
- el ingreso de red pública/no confiable está fuera de alcance para el modo local V1

## Agentes en la nube en este modelo

- los agentes en la nube siguen autenticándose a través de `agent_api_keys`
- las verificaciones de límite de misma-empresa siguen siendo obligatorias
- la capacidad del agente de asignar tareas humanas tiene control de permisos, no es implícita

## Superficie de ajustes de instancia

Este plan introduce preocupaciones a nivel de instancia (por ejemplo estado de bootstrap, admins de instancia, defaults de invitación y política de tokens). No hay hoy una superficie de UI dedicada.

Enfoque V1:

- agregar una página mínima de `Instance Settings` para admins de instancia
- exponer ajustes clave de instancia en API + CLI (`paperclipai configure` / `paperclipai onboard`)
- mostrar indicadores de estado de instancia de solo lectura en la UI principal hasta que exista la UX completa de ajustes

## Fases de implementación

## Fase 1: Modo y guardas

- agregar configuración de modo de despliegue explícito (`local_trusted | cloud_hosted`)
- aplicar verificaciones de seguridad de arranque y visibilidad de health
- implementar resolución de actor para el tablero implícito local
- mapear el actor del tablero implícito local al contexto de autorización admin-de-instancia
- agregar señal de estado de bootstrap en la superficie de health/config (`ready | bootstrap_pending`)
- agregar superficie mínima de API/CLI de ajustes de instancia e indicadores de UI de solo lectura

## Fase 2: Identidad humana y membresías

- agregar esquema + migraciones para usuarios/membresías/invitaciones
- conectar el middleware de auth para modo nube
- agregar búsqueda de membresía y verificaciones de acceso a empresa
- implementar el flujo de email/contraseña de Better Auth (sin verificación de email)
- implementar el comando de invitación de bootstrap del primer admin y la integración de onboarding
- implementar el flujo de aceptación de invitación de enlace de un solo uso con solicitudes de unión `pending_approval`

## Fase 3: Permisos y alcance de asignación

- agregar el modelo compartido de grants principales y helpers de aplicación
- agregar verificaciones de alcance de cadena de mando para APIs de asignación
- agregar pruebas de asignación prohibida (por ejemplo, no se puede asignar al CEO)
- agregar APIs de promoción/degradación de admin de instancia y gestión global de acceso a empresa
- agregar verificaciones de permiso `joins:approve` para aprobaciones de unión humanas y de agentes

## Fase 4: Flujo de invitación

- endpoints unificados de crear/aterrizar/aceptar/revocar invitación `company_join`
- endpoints de aprobar/rechazar solicitudes de unión con metadatos de revisión (email cuando aplique, IP)
- seguridad de token de un solo uso y semántica de revocación
- UI para gestión de invitaciones, aprobaciones de unión pendientes y permisos de membresía
- generación de alertas de bandeja de entrada para solicitudes de unión pendientes
- asegurar que la UX de invitación y aprobación esté habilitada tanto en `cloud_hosted` como en `local_trusted`

## Fase 5: Bandeja de entrada humana + actualizaciones de asignación de tareas

- extender el modelo de asignado de issues para usuarios humanos
- API y UI de bandeja de entrada para:
  - asignaciones de tareas
  - alertas de aprobación de unión pendientes con acciones inline de aprobar/rechazar
- flujo de asignación de agente a humano con verificaciones de política

## Fase 6: Auto-unión de agente y reclamo de token

- agregar la ruta de unión de agente en la página de aterrizaje de invitación unificada
- capturar solicitudes de unión de agentes y flujo de aprobación del admin
- crear el flujo de reclamo de API key de un solo uso después de la aprobación (mostrar una vez)

## Criterios de aceptación

1. `local_trusted` arranca sin login y muestra la UI del tablero de inmediato.
2. `local_trusted` no expone UX opcional de login humano en V1.
3. El actor implícito local de `local_trusted` puede gestionar ajustes de instancia, enlaces de invitación, aprobaciones de unión y grants de permisos.
4. `cloud_hosted` no puede arrancar sin auth configurado.
5. Ninguna solicitud en `cloud_hosted` puede mutar datos sin un actor autenticado.
6. Si no existe un admin inicial, la app muestra instrucciones de bootstrap con el comando CLI.
7. `pnpm paperclipai onboard` emite una URL de invitación de incorporación de CEO cuando el bootstrap está pendiente.
8. Un enlace `company_join` soporta la incorporación humana y de agente vía selección de tipo de unión en la página de aterrizaje de la invitación.
9. La entrega de invitaciones en V1 es solo copiar-enlace (sin entrega de email integrada).
10. La aceptación del enlace para compartir crea una solicitud de unión pendiente; no otorga acceso inmediato.
11. Las solicitudes de unión pendientes aparecen como alertas de bandeja de entrada con acciones inline de aprobar/rechazar.
12. La vista de revisión del admin incluye metadatos de unión antes de la decisión (email humano cuando aplique, IP de origen y metadatos de agente para solicitudes de agente).
13. Solo las solicitudes de unión aprobadas desbloquean acceso:

- humano: membresía activa de empresa + grants de permisos
- agente: creación de agente + elegibilidad de reclamo de API key

14. La inscripción de agentes sigue el mismo flujo enlace -> aprobación pendiente -> aprobar.
15. Los agentes aprobados pueden reclamar una API key de vida larga exactamente una vez, con semántica de mostrar-en-texto-plano-una-vez.
16. Las API keys de agentes son indefinidas por defecto en V1 y revocables/regenerables por admins.
17. El ingreso público/no confiable para `local_trusted` no está soportado en V1 (servidor local solo-loopback).
18. Un usuario puede tener membresías en múltiples empresas.
19. Los admins de instancia pueden promover a otro usuario a admin de instancia.
20. Los admins de instancia pueden gestionar a qué empresas puede acceder cada usuario.
21. Los permisos pueden otorgarse/revocarse por principal miembro (humano o agente) a través de un sistema de grants compartido.
22. El alcance de asignación previene asignaciones fuera de jerarquía o de roles protegidos.
23. Los agentes pueden asignar tareas a humanos solo cuando está permitido.
24. Los humanos pueden ver tareas asignadas en la bandeja de entrada y actuar sobre ellas según permisos.
25. Todas las nuevas mutaciones tienen alcance de empresa y se registran en `activity_log`.

## Decisiones V1 (bloqueadas)

1. `local_trusted` no soportará UX de login en V1; solo actor del tablero implícito local.
2. Los permisos usan una tabla compartida normalizada: `principal_permission_grants` con grants con alcance.
3. La entrega de invitaciones es solo copiar-enlace en V1 (sin envío de email integrado).
4. La creación de invitación de bootstrap debería requerir solo acceso shell local (solo ruta CLI, sin endpoint HTTP de bootstrap).
5. La revisión de aprobación muestra solo la IP de origen; sin búsqueda GeoIP/país en V1.
6. La vida de la API key de agente es indefinida por defecto en V1, con controles explícitos de revocación/regeneración.
7. El modo local mantiene capacidades completas de admin/ajustes/invitación a través del actor implícito local admin-de-instancia.
8. El ingreso público/no confiable para el modo local está fuera de alcance para V1; sin `--dangerous-agent-ingress` en V1.
