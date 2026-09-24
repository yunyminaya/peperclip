---
title: Comandos de configuración
summary: Incorporación, arranque, diagnóstico y configuración
---

Comandos de configuración de la instancia y diagnósticos.

## `paperclipai run`

Arranque e inicio con un solo comando:

```sh
pnpm paperclipai run
```

Hace:

1. Incorpora automáticamente si falta la configuración
2. Ejecuta `paperclipai doctor` con la reparación activada
3. Inicia el servidor cuando pasan las comprobaciones

Elige una instancia específica:

```sh
pnpm paperclipai run --instance dev
```

## `paperclipai onboard`

Configuración inicial interactiva:

```sh
pnpm paperclipai onboard
```

Primer prompt:

1. `Quickstart` (recomendado): valores locales por defecto (base de datos embebida, sin proveedor LLM, almacenamiento en disco local, secretos por defecto)
2. `Advanced setup`: configuración interactiva completa

Inicia justo después de la incorporación:

```sh
pnpm paperclipai onboard --run
```

Valores por defecto no interactivos + inicio inmediato (abre el navegador al escuchar el servidor):

```sh
pnpm paperclipai onboard --yes
```

## `paperclipai doctor`

Comprobaciones de salud con reparación automática opcional:

```sh
pnpm paperclipai doctor
pnpm paperclipai doctor --repair
```

Valida:

- Configuración del servidor
- Conectividad de la base de datos
- Configuración del adaptador de secretos
- Configuración del almacenamiento
- Archivos de claves faltantes

## `paperclipai configure`

Actualiza las secciones de configuración:

```sh
pnpm paperclipai configure --section server
pnpm paperclipai configure --section secrets
pnpm paperclipai configure --section storage
```

## `paperclipai env`

Muestra la configuración de entorno resuelta:

```sh
pnpm paperclipai env
```

## `paperclipai allowed-hostname`

Permite un nombre de host privado para el modo authenticated/private:

```sh
pnpm paperclipai allowed-hostname my-tailscale-host
```

## Rutas de almacenamiento local

| Datos | Ruta por defecto |
|------|-------------|
| Configuración | `~/.paperclip/instances/default/config.json` |
| Base de datos | `~/.paperclip/instances/default/db` |
| Registros | `~/.paperclip/instances/default/logs` |
| Almacenamiento | `~/.paperclip/instances/default/data/storage` |
| Clave de secretos | `~/.paperclip/instances/default/secrets/master.key` |

Sobrescribe con:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm paperclipai run
```

O pasa `--data-dir` directamente en cualquier comando:

```sh
pnpm paperclipai run --data-dir ./tmp/paperclip-dev
pnpm paperclipai doctor --data-dir ./tmp/paperclip-dev
```
