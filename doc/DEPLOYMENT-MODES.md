# Modos de despliegue

Estado: Modelo canónico de modos de despliegue y autenticación  
Fecha: 2026-02-23

## 1. Propósito

Paperclip soporta dos modos de runtime:

1. `local_trusted`
2. `authenticated`

`authenticated` soporta dos políticas de exposición:

1. `private`
2. `public`

Esto mantiene una sola pila de autenticación autenticada mientras separa los valores por defecto de bajo fricción de red privada de los requisitos de endurecimiento con exposición a internet.

## 2. Modelo canónico

| Modo de runtime | Exposición | Autenticación humana | Uso principal |
|---|---|---|---|
| `local_trusted` | n/a | No requiere login | Flujo de máquina local de un solo operador |
| `authenticated` | `private` | Login requerido | Acceso en red privada (por ejemplo Tailscale/VPN/LAN) |
| `authenticated` | `public` | Login requerido | Despliegue en la nube/con exposición a internet |

## 3. Política de seguridad

## `local_trusted`

- binding de host solo loopback
- sin flujo de login humano
- optimizado para el arranque local más rápido

## `authenticated + private`

- login requerido
- manejo de URL de baja fricción (modo de URL base `auto`)
- política de confianza de host privado requerida

## `authenticated + public`

- login requerido
- URL pública explícita requerida
- chequeos de despliegue más estrictos y fallas en doctor

## 4. Contrato de UX de incorporación

La incorporación por defecto sigue siendo interactiva y sin flags:

```sh
pnpm paperclipai onboard
```

Comportamiento del prompt del servidor:

1. preguntar modo, por defecto `local_trusted`
2. texto de opción:
- `local_trusted`: "Más fácil para configuración local (sin login, solo localhost)"
- `authenticated`: "Login requerido; usar para red privada o hosting público"
3. si es `authenticated`, preguntar exposición:
- `private`: "Acceso en red privada (por ejemplo Tailscale), menor fricción de configuración"
- `public`: "Despliegue con exposición a internet, requisitos de seguridad más estrictos"
4. preguntar URL pública explícita solo para `authenticated + public`

`configure --section server` sigue el mismo comportamiento interactivo.

## 5. Contrato de UX de Doctor

El doctor por defecto sigue sin flags:

```sh
pnpm paperclipai doctor
```

Doctor lee el modo/exposición configurados y aplica chequeos conscientes del modo. Los flags opcionales de override son secundarios.

## 6. Contrato de integración de tablero/usuario

La identidad del tablero debe estar representada por un principal de usuario real en la BD para que las funciones basadas en usuario funcionen consistentemente.

Puntos de integración requeridos:

- fila de usuario real en `authUsers` para la identidad del Tablero
- entrada de `instance_user_roles` para la autoridad de admin del Tablero
- integración de `company_memberships` para asignación de tareas a nivel de usuario y acceso

Esto es requerido porque las rutas de asignación de usuario validan membresía activa para `assigneeUserId`.

## 7. Flujo de reclamo Local Trusted -> Authenticated

Al ejecutar en modo `authenticated`, si el único admin de la instancia es `local-board`, Paperclip emite una advertencia de arranque con una URL de reclamo única de alta entropía.

- Formato de URL: `/board-claim/<token>?code=<code>`
- uso previsto: un humano con sesión iniciada reclama la propiedad del tablero
- acción de reclamo:
  - promueve al usuario actual con sesión iniciada a `instance_admin`
  - degrada el rol de admin de `local-board`
  - asegura membresía de propietario activa para el usuario reclamante en las empresas existentes

Esto evita el bloqueo cuando un usuario migra de un uso local trusted de larga duración a modo autenticado.

## 8. Realidad actual del código (al 2026-02-23)

- los valores de runtime son `local_trusted | authenticated`
- `authenticated` usa sesiones de Better Auth y flujo de invitación bootstrap
- `local_trusted` asegura un principal de usuario de Tablero local real en `authUsers` con acceso de admin en `instance_user_roles`
- la creación de empresas asegura membresía del creador en `company_memberships` para que los flujos de asignación/acceso de usuario sigan consistentes

## 9. Política de nombres y compatibilidad

- el nombrado canónico es `local_trusted` y `authenticated` con exposición `private/public`
- sin capa de alias de compatibilidad a largo plazo para variantes de nombres descartadas

## 10. Relación con otros documentos

- plan de implementación: `doc/plans/deployment-auth-mode-consolidation.md`
- contrato V1: `doc/SPEC-implementation.md`
- flujos de trabajo de operador: `doc/DEVELOPING.md` y `doc/CLI.md`
