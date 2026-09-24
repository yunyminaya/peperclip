# Plan de consolidación de modo de despliegue/auth

Estado: Propuesta  
Responsable: Servidor + CLI + UI  
Fecha: 2026-02-23

## Objetivo

Mantener Paperclip de baja fricción mientras el modelo de modos es más simple y seguro:

1. `local_trusted` sigue siendo el default y la ruta más fácil.
2. un modo de tiempo de ejecución autenticado soporta tanto el uso local en red privada como el uso en la nube pública.
3. onboarding/configure/doctor siguen siendo principalmente interactivos y sin flags.
4. La identidad del tablero está representada por una fila real de usuario en la base de datos, con puntos explícitos de integración de rol/membresía.

## Restricciones de producto (de la revisión)

1. El flujo default de `onboard` es interactivo (sin flags requeridos).
2. la primera elección de modo por defecto es `local_trusted`, con copy UX claro.
3. el flujo autenticado da guía para exposición privada vs pública.
4. `doctor` también debería ser sin flags por defecto (leer la configuración y evaluar el modo/perfil seleccionado).
5. no agregar capas de alias de retrocompatibilidad para nombres de modos abandonados.
6. el plan debe cubrir explícitamente cómo se representan los usuarios/tablero en DB y cómo eso afecta la asignación de tareas y los permisos.

## Auditoría de implementación actual (al 2026-02-23)

## Tiempo de ejecución/auth

- Los modos de despliegue en tiempo de ejecución son actualmente `local_trusted | cloud_hosted` (`packages/shared/src/constants.ts`).
- El actor de `local_trusted` es actualmente sintético:
  - `req.actor = { type: "board", userId: "local-board", source: "local_implicit" }` (`server/src/middleware/auth.ts`).
  - esto no es una fila real de usuario de auth por defecto.
- `cloud_hosted` usa sesiones de Better Auth y filas `authUsers` (`server/src/auth/better-auth.ts`, `packages/db/src/schema/auth.ts`).

## Bootstrap/admin

- `cloud_hosted` requiere `BETTER_AUTH_SECRET` y reporta el estado de bootstrap desde `instance_user_roles` (`server/src/index.ts`, `server/src/routes/health.ts`).
- la aceptación de la invitación de bootstrap promueve al usuario autenticado a `instance_admin` (`server/src/routes/access.ts`, `server/src/services/access.ts`).

## Integración de membresía/asignación

- La asignación de tareas a usuarios requiere una entrada `company_memberships` activa para ese usuario (`server/src/services/issues.ts`).
- La identidad del tablero implícita local no es automáticamente un principal real de membresía; esto es una brecha para la semántica de "tablero como usuario asignable".

## Modelo de tiempo de ejecución propuesto

## Modos

1. `local_trusted`
- no se requiere login
- solo localhost/loopback
- optimizado para configuración local de un solo operador

2. `authenticated`
- login requerido para acciones humanas
- mismo stack de auth para despliegues privados y públicos

## Política de exposición (dentro de `authenticated`)

1. `private`
- despliegues de red privada (LAN, VPN, Tailscale)
- manejo de URL de baja fricción (`auto` base URL)
- política estricta de hosts permitidos para objetivos privados

2. `public`
- despliegues con cara a internet
- URL pública explícita requerida
- chequeos de despliegue más estrictos en doctor

Esto es un modo autenticado con dos políticas de seguridad, no dos sistemas de auth diferentes.

## Contrato UX

## Onboard (ruta principal: interactiva)

El comando default sigue siendo:

```sh
pnpm paperclipai onboard
```

Paso interactivo del servidor:

1. preguntar el modo con selección por defecto `local_trusted`
2. copy para las opciones:
- `local_trusted`: "Easiest for local setup (no login, localhost-only)"
- `authenticated`: "Login required; use for private network or public hosting"
3. si `authenticated`, preguntar la exposición:
- `private`: "Private network access (for example Tailscale), lower setup friction"
- `public`: "Internet-facing deployment, stricter security requirements"
4. solo si `authenticated + public`, pedir la URL pública explícita

Los flags son overrides opcionales para usuarios avanzados, no requeridos para la configuración normal.

## Configure

El comando default sigue siendo interactivo:

```sh
pnpm paperclipai configure --section server
```

Mismas preguntas y defaults de modo/exposición que onboarding.

## Doctor

El comando default sigue siendo sin flags:

```sh
pnpm paperclipai doctor
```

Doctor lee el modo/exposición configurado y aplica los chequeos relevantes.
Pueden existir flags opcionales para override/pruebas, pero no se requieren para el uso normal.

## Integración del modelo de datos Tablero/usuario (requerido)

## Requisito

El tablero debe ser un principal de usuario real en DB para que las funciones céntricas en el usuario (asignación de tareas, membresía, identidad de auditoría) funcionen de forma consistente.

## Comportamiento objetivo

1. `local_trusted`
- sembrar/asegurar una fila determinista de usuario del tablero local en `authUsers` durante la configuración/arranque.
- el middleware de actor usa ese id de usuario real en lugar de la identidad solo-sintética.
- asegurar:
  - `instance_user_roles` incluye `instance_admin` para este usuario.
  - la membresía de empresa puede crearse/mantenerse para este usuario donde se necesite.

2. `authenticated`
- el registro de Better Auth crea la fila de usuario.
- el flujo de bootstrap/admin promueve a ese usuario real a `instance_admin`.
- el primer flujo de creación de empresa debería asegurar que la membresía del creador esté activa.

## Por qué esto importa

- la validación de `assigneeUserId` verifica la membresía de empresa.
- sin una ruta real de usuario del tablero + membresía, asignar tareas al usuario del tablero es inconsistente.

## Contrato de configuración (objetivo)

- `server.mode`: `local_trusted | authenticated`
- `server.exposure`: `private | public` (requerido cuando el modo es `authenticated`)
- `auth.baseUrlMode`: `auto | explicit`
- `auth.publicBaseUrl`: requerido cuando `authenticated + public`

Sin alias de compatibilidad para variantes de nomenclatura descartadas.

## Sin capa de retrocompatibilidad

Este cambio es un corte limpio:

- eliminar el uso de la vieja terminología dividida en código y prompts.
- el esquema de configuración usa solo los campos/valores canónicos de arriba.
- las instancias de dev existentes pueden re-ejecutar onboarding o actualizar la configuración una vez.

## Fases de implementación

## Fase 1: Esquema compartido + superficie de configuración

- `packages/shared/src/constants.ts`: definir constantes canónicas de modo/exposición.
- `packages/shared/src/config-schema.ts`: agregar campos de modo/exposición/URL de auth.
- `server/src/config.ts` y tipos de configuración del CLI: consumir solo campos canónicos.

## Fase 2: UX interactiva del CLI

- `cli/src/prompts/server.ts`: implementar el prompt de modo con default y el copy de guía de exposición autenticada.
- `cli/src/commands/onboard.ts`: mantener el flujo interactivo primero; solo overrides opcionales.
- `cli/src/commands/configure.ts`: mismo comportamiento para la sección de servidor.
- `cli/src/commands/doctor.ts`: chequeos conscientes del modo desde la configuración, flujo default sin flags.

## Fase 3: Política de tiempo de ejecución/auth

- `server/src/index.ts`: aplicar restricciones de arranque específicas del modo.
- `server/src/auth/better-auth.ts`: implementar el comportamiento de URL base `auto` vs `explicit`.
- helper de confianza de host/origen para `authenticated + private`.

## Fase 4: Integración del principal Tablero

- agregar paso de asegurar-usuario-tablero en arranque/configuración:
  - fila real de usuario del tablero local
  - fila de rol admin de instancia
- asegurar que la ruta de creación de la primera empresa otorga membresía al creador.
- eliminar suposiciones solo-sintéticas donde rompen la semántica de asignación/membresía de usuario.

## Fase 5: UI + docs

- actualizar etiquetas/texto de ayuda de UI sobre el modo y la guía de exposición.
- actualizar docs:
  - `doc/DEPLOYMENT-MODES.md`
  - `doc/DEVELOPING.md`
  - `doc/CLI.md`
  - `doc/SPEC-implementation.md`

## Plan de pruebas

- pruebas de esquema de configuración para campos canónicos de modo/exposición/auth.
- pruebas de prompts del CLI para selecciones interactivas por defecto y copy.
- pruebas de doctor por modo/exposición.
- pruebas de tiempo de ejecución:
  - authenticated/private funciona sin URL explícita
  - authenticated/public requiere URL explícita
  - la política de host privado rechaza hosts no confiables
- Pruebas del principal Tablero:
  - el usuario del tablero de local_trusted existe como usuario real en DB
  - el tablero puede tener tareas asignadas vía `assigneeUserId` después de la configuración de membresía
  - comportamiento de membresía del creador para flujos autenticados

## Criterios de aceptación

1. `pnpm paperclipai onboard` es interactivo primero y por defecto es `local_trusted`.
2. el modo autenticado es un modo de tiempo de ejecución con guía de exposición `private/public`.
3. `pnpm paperclipai doctor` funciona sin flags con chequeos conscientes del modo.
4. sin alias de compatibilidad extra para variantes de nomenclatura descartadas.
5. La identidad del tablero está representada por puntos reales de integración de usuario/rol/membresía en DB, permitiendo un comportamiento consistente de asignación de tareas y permisos.

## Puerta de verificación

Antes del merge:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```
