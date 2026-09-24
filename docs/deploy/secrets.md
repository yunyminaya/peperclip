---
title: Gestión de secretos
summary: Clave maestra, cifrado y modo estricto
---

Paperclip cifra los secretos en reposo usando una clave maestra local. Las variables de entorno del agente que contienen valores sensibles (claves de API, tokens) se almacenan como referencias cifradas de secretos.

## Proveedor por defecto: `local_encrypted`

Los secretos se cifran con una clave maestra local almacenada en:

```
~/.paperclip/instances/default/secrets/master.key
```

Esta clave se crea automáticamente durante la incorporación. La clave nunca sale de tu máquina.

## Configuración

### Configuración con la CLI

La incorporación escribe la configuración de secretos por defecto:

```sh
pnpm paperclipai onboard
```

Actualiza los ajustes de secretos:

```sh
pnpm paperclipai configure --section secrets
```

Valida la configuración de secretos:

```sh
pnpm paperclipai doctor
```

### Sobrescrituras de entorno

| Variable | Descripción |
|----------|-------------|
| `PAPERCLIP_SECRETS_MASTER_KEY` | Clave de 32 bytes como base64, hex o cadena cruda |
| `PAPERCLIP_SECRETS_MASTER_KEY_FILE` | Ruta personalizada del archivo de clave |
| `PAPERCLIP_SECRETS_STRICT_MODE` | Define en `true` para forzar referencias de secretos |

## Modo estricto

Cuando el modo estricto está habilitado, las claves de entorno sensibles (que coincidan con `*_API_KEY`, `*_TOKEN`, `*_SECRET`) deben usar referencias de secretos en lugar de valores planos en línea.

```sh
PAPERCLIP_SECRETS_STRICT_MODE=true
```

Recomendado para cualquier despliegue más allá del modo local de confianza.

## Migrar secretos en línea

Si tienes agentes existentes con claves de API en línea en su configuración, mígralos a referencias cifradas de secretos:

```sh
pnpm secrets:migrate-inline-env         # simulación
pnpm secrets:migrate-inline-env --apply # aplicar la migración
```

## Referencias de secretos en la configuración del agente

Las variables de entorno del agente usan referencias de secretos:

```json
{
  "env": {
    "ANTHROPIC_API_KEY": {
      "type": "secret_ref",
      "secretId": "8f884973-c29b-44e4-8ea3-6413437f8081",
      "version": "latest"
    }
  }
}
```

El servidor las resuelve y descifra en tiempo de ejecución, inyectando el valor real en el entorno del proceso del agente.
