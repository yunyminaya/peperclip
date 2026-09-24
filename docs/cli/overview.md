---
title: Resumen de la CLI
summary: Instalación y configuración de la CLI
---

La CLI de Paperclip gestiona la configuración de la instancia, los diagnósticos y las operaciones del plano de control.

## Uso

```sh
pnpm paperclipai --help
```

## Opciones globales

Todos los comandos admiten:

| Flag | Descripción |
|------|-------------|
| `--data-dir <path>` | Raíz de datos local de Paperclip (aisla de `~/.paperclip`) |
| `--api-base <url>` | URL base de la API |
| `--api-key <token>` | Token de autenticación de la API |
| `--context <path>` | Ruta del archivo de contexto |
| `--profile <name>` | Nombre del perfil de contexto |
| `--json` | Salida como JSON |

Los comandos con alcance de empresa también aceptan `--company-id <id>`.

Para instancias locales limpias, pasa `--data-dir` en el comando que ejecutes:

```sh
pnpm paperclipai run --data-dir ./tmp/paperclip-dev
```

## Perfiles de contexto

Guarda valores por defecto para no repetir las opciones:

```sh
# Establecer valores por defecto
pnpm paperclipai context set --api-base http://localhost:3100 --company-id <id>

# Ver el contexto actual
pnpm paperclipai context show

# Listar perfiles
pnpm paperclipai context list

# Cambiar de perfil
pnpm paperclipai context use default
```

Para evitar guardar secretos en el contexto, usa una variable de entorno:

```sh
pnpm paperclipai context set --api-key-env-var-name PAPERCLIP_API_KEY
export PAPERCLIP_API_KEY=...
```

El contexto se guarda en `~/.paperclip/context.json`.

## Categorías de comandos

La CLI tiene dos categorías:

1. **[Comandos de configuración](/cli/setup-commands)** — arranque de la instancia, diagnósticos, configuración
2. **[Comandos del plano de control](/cli/control-plane-commands)** — issues, agentes, aprobaciones, actividad
