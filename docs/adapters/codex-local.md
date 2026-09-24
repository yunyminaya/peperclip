---
title: Codex Local
summary: Configuración e instalación del adaptador local de Codex de OpenAI
---

El adaptador `codex_local` ejecuta el CLI de Codex de OpenAI localmente. Admite persistencia de sesión mediante encadenamiento de `previous_response_id` e inyección de habilidades a través del directorio global de habilidades de Codex.

## Requisitos previos

- CLI de Codex instalado (comando `codex` disponible)
- `OPENAI_API_KEY` configurada en el entorno o en la configuración del agente

## Campos de configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|----------|-------------|
| `cwd` | string | Sí | Directorio de trabajo del proceso del agente (ruta absoluta; se crea automáticamente si falta cuando los permisos lo permiten) |
| `model` | string | No | Modelo a usar |
| `promptTemplate` | string | No | Prompt usado en todas las ejecuciones |
| `env` | object | No | Variables de entorno (admite referencias a secretos) |
| `timeoutSec` | number | No | Tiempo de espera del proceso (0 = sin tiempo de espera) |
| `graceSec` | number | No | Período de gracia antes de forzar la terminación |
| `dangerouslyBypassApprovalsAndSandbox` | boolean | No | Omitir verificaciones de seguridad (solo desarrollo) |

## Persistencia de sesión

Codex usa `previous_response_id` para la continuidad de la sesión. El adaptador serializa y restaura esto entre latidos, permitiendo que el agente mantenga el contexto de la conversación.

## Inyección de habilidades

El adaptador crea enlaces simbólicos de las habilidades de Paperclip en el directorio global de habilidades de Codex (`~/.codex/skills`). Las habilidades existentes del usuario no se sobrescriben.

Cuando Paperclip se ejecuta dentro de una instancia de worktree administrada (`PAPERCLIP_IN_WORKTREE=true`), el adaptador usa en su lugar un `CODEX_HOME` aislado por worktree bajo la instancia de Paperclip para que las habilidades, sesiones, registros y demás estado de runtime de Codex no se filtren entre checkouts. Inicializa ese home aislado desde el home principal de Codex del usuario para la continuidad compartida de autenticación/configuración.

Para uso manual del CLI local fuera de las ejecuciones de latido (por ejemplo, ejecutar como `codexcoder` directamente), usa:

```sh
pnpm paperclipai agent local-cli codexcoder --company-id <company-id>
```

Esto instala las habilidades faltantes, crea una clave de API del agente e imprime las exportaciones de shell para ejecutar como ese agente.

## Resolución de instrucciones

Si `instructionsFilePath` está configurado, Paperclip lee ese archivo y lo antepone al prompt de stdin enviado a `codex exec` en cada ejecución.

Esto es independiente de cualquier descubrimiento de instrucciones a nivel de workspace que el propio Codex realice en el `cwd` de la ejecución. Paperclip no deshabilita los archivos de instrucciones de repo nativos de Codex, por lo que un `AGENTS.md` local del repo puede ser cargado por Codex además de las instrucciones del agente administradas por Paperclip.

## Prueba de entorno

La prueba de entorno verifica:

- El CLI de Codex está instalado y accesible
- El directorio de trabajo es absoluto y está disponible (se crea automáticamente si falta y está permitido)
- Señal de autenticación (presencia de `OPENAI_API_KEY`)
- Una prueba en vivo de saludo (`codex exec --json -` con el prompt `Respond with hello.`) para verificar que el CLI realmente puede ejecutarse
