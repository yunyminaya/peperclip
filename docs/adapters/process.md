---
title: Adaptador de procesos
summary: Adaptador genérico de procesos de shell
---

El adaptador `process` ejecuta comandos de shell arbitrarios. Úsalo para scripts simples, tareas únicas o agentes construidos sobre frameworks personalizados.

## Cuándo usarlo

- Ejecutar un script de Python que llame la API de Paperclip
- Ejecutar un ciclo de agente personalizado
- Cualquier runtime que se pueda invocar como un comando de shell

## Cuándo no usarlo

- Si necesitas persistencia de sesión entre ejecuciones (usa `claude_local` o `codex_local`)
- Si el agente necesita contexto conversacional entre latidos

## Configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|----------|-------------|
| `command` | string | Sí | Comando de shell a ejecutar |
| `cwd` | string | No | Directorio de trabajo |
| `env` | object | No | Variables de entorno |
| `timeoutSec` | number | No | Tiempo de espera del proceso |

## Cómo funciona

1. Paperclip inicia el comando configurado como un proceso hijo
2. Se inyectan las variables de entorno estándar de Paperclip (`PAPERCLIP_AGENT_ID`, `PAPERCLIP_API_KEY`, etc.)
3. El proceso se ejecuta hasta completarse
4. El código de salida determina el éxito o la falla

## Ejemplo

Un agente que ejecuta un script de Python:

```json
{
  "adapterType": "process",
  "adapterConfig": {
    "command": "python3 /path/to/agent.py",
    "cwd": "/path/to/workspace",
    "timeoutSec": 300
  }
}
```

El script puede usar las variables de entorno inyectadas para autenticarse con la API de Paperclip y realizar trabajo.
