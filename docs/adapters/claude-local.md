---
title: Claude Local
summary: Configuración e instalación del adaptador local de Claude Code
---

El adaptador `claude_local` ejecuta el CLI de Claude Code de Anthropic localmente. Admite persistencia de sesión, inyección de habilidades y análisis estructurado de la salida.

## Requisitos previos

- CLI de Claude Code instalado (comando `claude` disponible)
- `ANTHROPIC_API_KEY` configurada en el entorno o en la configuración del agente

## Campos de configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|----------|-------------|
| `cwd` | string | Sí | Directorio de trabajo del proceso del agente (ruta absoluta; se crea automáticamente si falta cuando los permisos lo permiten) |
| `model` | string | No | Modelo de Claude a usar (p. ej., `claude-opus-4-6`) |
| `promptTemplate` | string | No | Prompt usado en todas las ejecuciones |
| `env` | object | No | Variables de entorno (admite referencias a secretos) |
| `timeoutSec` | number | No | Tiempo de espera del proceso (0 = sin tiempo de espera) |
| `graceSec` | number | No | Período de gracia antes de forzar la terminación |
| `maxTurnsPerRun` | number | No | Máximo de turnos agénticos por latido (por defecto `300`) |
| `dangerouslySkipPermissions` | boolean | No | Omitir avisos de permisos (solo desarrollo) |

## Plantillas de prompts

Las plantillas admiten sustitución de `{{variable}}`:

| Variable | Valor |
|----------|-------|
| `{{agentId}}` | ID del agente |
| `{{companyId}}` | ID de la empresa |
| `{{runId}}` | ID de la ejecución actual |
| `{{agent.name}}` | Nombre del agente |
| `{{company.name}}` | Nombre de la empresa |

## Persistencia de sesión

El adaptador conserva los ID de sesión de Claude Code entre latidos. En la siguiente activación, reanuda la conversación existente para que el agente conserve el contexto completo.

La reanudación de sesión depende del directorio de trabajo: si el directorio de trabajo del agente cambió desde la última ejecución, se inicia una sesión nueva.

Si la reanudación falla con un error de sesión desconocida, el adaptador reintenta automáticamente con una sesión nueva.

## Inyección de habilidades

El adaptador crea un directorio temporal con enlaces simbólicos a las habilidades de Paperclip y lo pasa mediante `--add-dir`. Esto hace que las habilidades sean detectables sin contaminar el directorio de trabajo del agente.

Para uso manual del CLI local fuera de las ejecuciones de latido (por ejemplo, ejecutar como `claudecoder` directamente), usa:

```sh
pnpm paperclipai agent local-cli claudecoder --company-id <company-id>
```

Esto instala las habilidades de Paperclip en `~/.claude/skills`, crea una clave de API del agente e imprime las exportaciones de shell para ejecutar como ese agente.

## Prueba de entorno

Usa el botón "Probar entorno" en la UI para validar la configuración del adaptador. Verifica:

- El CLI de Claude está instalado y accesible
- El directorio de trabajo es absoluto y está disponible (se crea automáticamente si falta y está permitido)
- Pistas de clave de API o modo de autenticación (`ANTHROPIC_API_KEY` vs inicio de sesión por suscripción)
- Una prueba en vivo de saludo (`claude --print - --output-format stream-json --verbose` con el prompt `Respond with hello.`) para verificar que el CLI esté listo
