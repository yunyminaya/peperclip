---
title: Desarrollo local
summary: Configura Paperclip para desarrollo local
---

Ejecuta Paperclip localmente sin dependencias externas.

## Prerrequisitos

- Node.js 20+
- pnpm 9+

## Iniciar el servidor de desarrollo

```sh
pnpm install
pnpm dev
```

Esto inicia:

- **Servidor API** en `http://localhost:3100`
- **UI** servida por el servidor API en modo middleware de desarrollo (mismo origen)

No se requieren Docker ni base de datos externa. Paperclip usa PostgreSQL embebido automáticamente.

## Arranque con un solo comando

Para una primera instalación:

```sh
pnpm paperclipai run
```

Esto hace:

1. Incorpora automáticamente si falta la configuración
2. Ejecuta `paperclipai doctor` con la reparación activada
3. Inicia el servidor cuando pasan las comprobaciones

## Modo de desarrollo Tailscale/Auth privada

Para ejecutar en modo `authenticated/private` para acceso en red:

```sh
pnpm dev --tailscale-auth
```

Esto enlaza el servidor a `0.0.0.0` para acceso en red privada.

Alias:

```sh
pnpm dev --authenticated-private
```

Permite nombres de host privados adicionales:

```sh
pnpm paperclipai allowed-hostname dotta-macbook-pro
```

Para la configuración completa y la resolución de problemas, consulta [Acceso privado con Tailscale](/deploy/tailscale-private-access).

## Comprobaciones de salud

```sh
curl http://localhost:3100/api/health
# -> {"status":"ok"}

curl http://localhost:3100/api/companies
# -> []
```

## Restablecer datos de desarrollo

Para borrar los datos locales y empezar de cero:

```sh
rm -rf ~/.paperclip/instances/default/db
pnpm dev
```

## Ubicaciones de datos

| Datos | Ruta |
|------|------|
| Configuración | `~/.paperclip/instances/default/config.json` |
| Base de datos | `~/.paperclip/instances/default/db` |
| Almacenamiento | `~/.paperclip/instances/default/data/storage` |
| Clave de secretos | `~/.paperclip/instances/default/secrets/master.key` |
| Registros | `~/.paperclip/instances/default/logs` |

Sobrescribe con variables de entorno:

```sh
PAPERCLIP_HOME=/custom/path PAPERCLIP_INSTANCE_ID=dev pnpm paperclipai run
```
