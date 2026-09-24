---
title: Resumen de adaptadores
summary: Qué son los adaptadores y cómo conectan los agentes a Paperclip
---

Los adaptadores son el puente entre la capa de orquestación de Paperclip y los runtimes de los agentes. Cada adaptador sabe cómo invocar un tipo específico de agente de IA y capturar sus resultados.

## Cómo funcionan los adaptadores

Cuando se dispara un latido, Paperclip:

1. Busca el `adapterType` y el `adapterConfig` del agente
2. Llama la función `execute()` del adaptador con el contexto de ejecución
3. El adaptador inicia o invoca el runtime del agente
4. El adaptador captura stdout, analiza los datos de uso/costo y devuelve un resultado estructurado

## Adaptadores integrados

| Adaptador | Clave de tipo | Descripción |
|---------|----------|-------------|
| [Claude Local](/adapters/claude-local) | `claude_local` | Ejecuta el CLI de Claude Code localmente |
| [Codex Local](/adapters/codex-local) | `codex_local` | Ejecuta el CLI de Codex de OpenAI localmente |
| [Gemini Local](/adapters/gemini-local) | `gemini_local` | Ejecuta el CLI de Gemini localmente |
| OpenCode Local | `opencode_local` | Ejecuta el CLI de OpenCode localmente (multi-proveedor `provider/model`) |
| OpenClaw | `openclaw` | Envía payloads de activación a un webhook de OpenClaw |
| [Adaptador de procesos](/adapters/process) | `process` | Ejecuta comandos de shell arbitrarios |
| [Adaptador HTTP](/adapters/http) | `http` | Envía webhooks a agentes externos |

## Arquitectura de los adaptadores

Cada adaptador es un paquete con tres módulos:

```
packages/adapters/<name>/
  src/
    index.ts            # Shared metadata (type, label, models)
    server/
      execute.ts        # Core execution logic
      parse.ts          # Output parsing
      test.ts           # Environment diagnostics
    ui/
      parse-stdout.ts   # Stdout -> transcript entries for run viewer
      build-config.ts   # Form values -> adapterConfig JSON
    cli/
      format-event.ts   # Terminal output for `paperclipai run --watch`
```

Tres registros consumen estos módulos:

| Registro | Qué hace |
|----------|-------------|
| **Servidor** | Ejecuta agentes, captura resultados |
| **UI** | Renderiza transcripciones de ejecuciones, provee formularios de configuración |
| **CLI** | Formatea la salida de terminal para monitoreo en vivo |

## Cómo elegir un adaptador

- **¿Necesitas un agente de programación?** Usa `claude_local`, `codex_local`, `gemini_local` o `opencode_local`
- **¿Necesitas ejecutar un script o comando?** Usa `process`
- **¿Necesitas llamar un servicio externo?** Usa `http`
- **¿Necesitas algo personalizado?** [Crea tu propio adaptador](/adapters/creating-an-adapter)
