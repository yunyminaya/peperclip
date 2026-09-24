---
title: Crear un adaptador
summary: Guía para construir un adaptador personalizado
---

Construye un adaptador personalizado para conectar Paperclip con cualquier runtime de agente.

<Tip>
Si usas Claude Code, la habilidad `.agents/skills/create-agent-adapter` puede guiarte por todo el proceso de creación de un adaptador de forma interactiva. Solo pídele a Claude que cree un adaptador nuevo y te guiará paso a paso.
</Tip>

## Estructura del paquete

```
packages/adapters/<name>/
  package.json
  tsconfig.json
  src/
    index.ts            # Shared metadata
    server/
      index.ts          # Server exports
      execute.ts        # Core execution logic
      parse.ts          # Output parsing
      test.ts           # Environment diagnostics
    ui/
      index.ts          # UI exports
      parse-stdout.ts   # Transcript parser
      build-config.ts   # Config builder
    cli/
      index.ts          # CLI exports
      format-event.ts   # Terminal formatter
```

## Paso 1: Metadatos raíz

`src/index.ts` es importado por los tres consumidores. Mantenlo sin dependencias.

```ts
export const type = "my_agent";        // snake_case, globally unique
export const label = "My Agent (local)";
export const models = [
  { id: "model-a", label: "Model A" },
];
export const agentConfigurationDoc = `# my_agent configuration
Use when: ...
Don't use when: ...
Core fields: ...
`;
```

## Paso 2: Ejecución del servidor

`src/server/execute.ts` es el núcleo. Recibe un `AdapterExecutionContext` y devuelve un `AdapterExecutionResult`.

Responsabilidades clave:

1. Leer la configuración con helpers seguros (`asString`, `asNumber`, etc.)
2. Construir el entorno con `buildPaperclipEnv(agent)` más las vars de contexto
3. Resolver el estado de sesión desde `runtime.sessionParams`
4. Renderizar el prompt con `renderTemplate(template, data)`
5. Generar el proceso con `runChildProcess()` o llamar vía `fetch()`
6. Analizar la salida para uso, costos, estado de sesión, errores
7. Manejar errores de sesión desconocida (reintentar con sesión nueva, establecer `clearSession: true`)

## Paso 3: Prueba de entorno

`src/server/test.ts` valida la configuración del adaptador antes de ejecutarlo.

Devuelve diagnósticos estructurados:

- `error` para configuración inválida o inutilizable
- `warn` para problemas que no bloquean
- `info` para verificaciones exitosas

## Paso 4: Módulo de UI

- `parse-stdout.ts` — convierte líneas de stdout a `TranscriptEntry[]` para el visor de ejecuciones
- `build-config.ts` — convierte valores del formulario a JSON de `adapterConfig`
- Componente React de campos de configuración en `ui/src/adapters/<name>/config-fields.tsx`

## Paso 5: Módulo de CLI

`format-event.ts` — imprime de forma legible la salida estándar para `paperclipai run --watch` usando `picocolors`.

## Paso 6: Registrar

Agrega el adaptador a los tres registros:

1. `server/src/adapters/registry.ts`
2. `ui/src/adapters/registry.ts`
3. `cli/src/adapters/registry.ts`

## Inyección de habilidades

Haz que las habilidades de Paperclip sean detectables para tu runtime de agente sin escribir en el directorio de trabajo del agente:

1. **Mejor: tmpdir + flag** — crear tmpdir, enlazar habilidades con enlaces simbólicos, pasar vía flag de CLI, limpiar después
2. **Aceptable: directorio de configuración global** — crear enlace simbólico al directorio global de plugins del runtime
3. **Aceptable: variable de entorno** — apuntar una variable de entorno de ruta de habilidades al directorio `skills/` del repo
4. **Último recurso: inyección en el prompt** — incluir el contenido de las habilidades en la plantilla del prompt

## Seguridad

- Trata la salida del agente como no confiable (analiza con cautela, nunca la ejecutes)
- Inyecta secretos vía variables de entorno, no en prompts
- Configura controles de acceso a la red si el runtime los admite
- Aplica siempre el tiempo de espera y el período de gracia
