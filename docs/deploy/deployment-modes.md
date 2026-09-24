---
title: Modos de despliegue
summary: "`local_trusted` frente a `authenticated` (private/public)"
---

Paperclip admite dos modos de ejecución con diferentes perfiles de seguridad.

## `local_trusted`

El modo por defecto. Optimizado para uso local de un solo operador.

- **Enlace de host**: solo loopback (localhost)
- **Autenticación**: no se requiere inicio de sesión
- **Caso de uso**: desarrollo local, experimentación en solitario
- **Identidad del panel**: usuario local del panel creado automáticamente

```sh
# Definir durante la incorporación
pnpm paperclipai onboard
# Choose "local_trusted"
```

## `authenticated`

Se requiere inicio de sesión. Admite dos políticas de exposición.

### `authenticated` + `private`

Para acceso en red privada (Tailscale, VPN, LAN).

- **Autenticación**: inicio de sesión requerido vía Better Auth
- **Manejo de URL**: modo automático de URL base (menor fricción)
- **Confianza de host**: se requiere política de confianza para hosts privados

```sh
pnpm paperclipai onboard
# Choose "authenticated" -> "private"
```

Permite nombres de host personalizados de Tailscale:

```sh
pnpm paperclipai allowed-hostname my-machine
```

### `authenticated` + `public`

Para despliegue expuesto a internet.

- **Autenticación**: inicio de sesión requerido
- **URL**: se requiere URL pública explícita
- **Seguridad**: comprobaciones de despliegue más estrictas en doctor

```sh
pnpm paperclipai onboard
# Choose "authenticated" -> "public"
```

## Flujo de reclamación del panel

Al migrar de `local_trusted` a `authenticated`, Paperclip emite una URL de reclamación de un solo uso al iniciar:

```
/board-claim/<token>?code=<code>
```

Un usuario con sesión iniciada visita esta URL para reclamar la propiedad del panel. Esto:

- Promueve al usuario actual a administrador de la instancia
- Degrada al administrador local del panel creado automáticamente
- Asegura la membresía activa de la empresa para el usuario reclamante

## Cambiar de modo

Actualiza el modo de despliegue:

```sh
pnpm paperclipai configure --section server
```

Sobrescritura en tiempo de ejecución vía variable de entorno:

```sh
PAPERCLIP_DEPLOYMENT_MODE=authenticated pnpm paperclipai run
```
