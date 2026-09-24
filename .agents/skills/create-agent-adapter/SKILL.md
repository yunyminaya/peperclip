---
name: create-agent-adapter
description: >
  Technical guide for creating a new Paperclip agent adapter. Use when building
  a new adapter package, adding support for a new AI coding tool (e.g. a new
  CLI agent, API-based agent, or custom process), or when modifying the adapter
  system. Covers the required interfaces, module structure, registration points,
  and conventions derived from the existing claude-local and codex-local adapters.
---

# Crear un adaptador de agente de Paperclip

Un adaptador conecta la capa de orquestación de Paperclip con un runtime de agente de IA específico (Claude Code, Codex CLI, un proceso personalizado, un endpoint HTTP, etc.). Cada adaptador es un paquete autocontenido que proporciona implementaciones para **tres consumidores**: el servidor, la UI y la CLI.

---

## 1. Descripción general de la arquitectura

```
packages/adapters/<name>/
  src/
    index.ts            # Shared metadata (type, label, models, agentConfigurationDoc)
    server/
      index.ts          # Server exports: execute, sessionCodec, parse helpers
      execute.ts        # Core execution logic (AdapterExecutionContext -> AdapterExecutionResult)
      parse.ts          # Stdout/result parsing for the agent's output format
    ui/
      index.ts          # UI exports: parseStdoutLine, buildConfig
      parse-stdout.ts   # Line-by-line stdout -> TranscriptEntry[] for the run viewer
      build-config.ts   # CreateConfigValues -> adapterConfig JSON for agent creation form
    cli/
      index.ts          # CLI exports: formatStdoutEvent
      format-event.ts   # Colored terminal output for `paperclipai run --watch`
  package.json
  tsconfig.json
```

Tres registros separados consumen los módulos de adaptador:

| Registro | Ubicación | Interfaz |
|----------|----------|-----------|
| Servidor | `server/src/adapters/registry.ts` | `ServerAdapterModule` |
| UI | `ui/src/adapters/registry.ts` | `UIAdapterModule` |
| CLI | `cli/src/adapters/registry.ts` | `CLIAdapterModule` |

---

## 2. Tipos compartidos (`@paperclipai/adapter-utils`)

Todas las interfaces de adaptador viven en `packages/adapter-utils/src/types.ts`. Importa desde `@paperclipai/adapter-utils` (tipos) o `@paperclipai/adapter-utils/server-utils` (utilidades de runtime).

### Interfaces principales

```ts
// The execute function signature — every adapter must implement this
interface AdapterExecutionContext {
  runId: string;
  agent: AdapterAgent;          // { id, companyId, name, adapterType, adapterConfig }
  runtime: AdapterRuntime;      // { sessionId, sessionParams, sessionDisplayId, taskKey }
  config: Record<string, unknown>;  // The agent's adapterConfig blob
  context: Record<string, unknown>; // Runtime context (taskId, wakeReason, approvalId, etc.)
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: AdapterInvocationMeta) => Promise<void>;
  authToken?: string;
}

interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  usage?: UsageSummary;           // { inputTokens, outputTokens, cachedInputTokens? }
  sessionId?: string | null;      // Legacy — prefer sessionParams
  sessionParams?: Record<string, unknown> | null;  // Opaque session state persisted between runs
  sessionDisplayId?: string | null;
  provider?: string | null;       // "anthropic", "openai", etc.
  model?: string | null;
  costUsd?: number | null;
  resultJson?: Record<string, unknown> | null;
  summary?: string | null;        // Human-readable summary of what the agent did
  clearSession?: boolean;         // true = tell Paperclip to forget the stored session
}

interface AdapterSessionCodec {
  deserialize(raw: unknown): Record<string, unknown> | null;
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null;
  getDisplayId?(params: Record<string, unknown> | null): string | null;
}
```

### Interfaces de módulo

```ts
// Server — registered in server/src/adapters/registry.ts
interface ServerAdapterModule {
  type: string;
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult>;
  sessionCodec?: AdapterSessionCodec;
  supportsLocalAgentJwt?: boolean;
  models?: { id: string; label: string }[];
  agentConfigurationDoc?: string;
}

// UI — registered in ui/src/adapters/registry.ts
interface UIAdapterModule {
  type: string;
  label: string;
  parseStdoutLine: (line: string, ts: string) => TranscriptEntry[];
  ConfigFields: ComponentType<AdapterConfigFieldsProps>;
  buildAdapterConfig: (values: CreateConfigValues) => Record<string, unknown>;
}

// CLI — registered in cli/src/adapters/registry.ts
interface CLIAdapterModule {
  type: string;
  formatStdoutEvent: (line: string, debug: boolean) => void;
}
```

---

## 2.1 Contrato de prueba de entorno del adaptador

Todo adaptador de servidor debe implementar `testEnvironment(...)`. Esto alimenta el botón "Test environment" de la UI del panel en la configuración del agente.

```ts
type AdapterEnvironmentCheckLevel = "info" | "warn" | "error";
type AdapterEnvironmentTestStatus = "pass" | "warn" | "fail";

interface AdapterEnvironmentCheck {
  code: string;
  level: AdapterEnvironmentCheckLevel;
  message: string;
  detail?: string | null;
  hint?: string | null;
}

interface AdapterEnvironmentTestResult {
  adapterType: string;
  status: AdapterEnvironmentTestStatus;
  checks: AdapterEnvironmentCheck[];
  testedAt: string; // ISO timestamp
}

interface AdapterEnvironmentTestContext {
  companyId: string;
  adapterType: string;
  config: Record<string, unknown>; // runtime-resolved adapterConfig
}
```

Lineamientos:

- Devuelve diagnósticos estructurados; nunca lances excepciones por hallazgos esperados.
- Usa `error` para una configuración de runtime inválida o inutilizable (cwd incorrecto, comando faltante, URL inválida).
- Usa `warn` para situaciones importantes que no bloquean.
- Usa `info` para verificaciones exitosas y contexto.

La política de severidad es crítica para el producto: las advertencias no son bloqueadores de guardado.
Ejemplo: para `claude_local`, una `ANTHROPIC_API_KEY` detectada debe ser `warn`, no `error`, porque Claude aún puede ejecutarse (simplemente usa autenticación con clave de API en lugar de autenticación por suscripción).

---

## 3. Paso a paso: crear un nuevo adaptador

### 3.1 Crea el paquete

```
packages/adapters/<name>/
  package.json
  tsconfig.json
  src/
    index.ts
    server/index.ts
    server/execute.ts
    server/parse.ts
    ui/index.ts
    ui/parse-stdout.ts
    ui/build-config.ts
    cli/index.ts
    cli/format-event.ts
```

**package.json** — debe usar la convención de cuatro exportaciones:

```json
{
  "name": "@paperclipai/adapter-<name>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./server": "./src/server/index.ts",
    "./ui": "./src/ui/index.ts",
    "./cli": "./src/cli/index.ts"
  },
  "dependencies": {
    "@paperclipai/adapter-utils": "workspace:*",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

### 3.2 `index.ts` raíz — metadatos del adaptador

Este archivo lo importan **los tres** consumidores (servidor, UI, CLI). Mantenlo sin dependencias (sin APIs de Node, sin React).

```ts
export const type = "my_agent";        // snake_case, globally unique
export const label = "My Agent (local)";

export const models = [
  { id: "model-a", label: "Model A" },
  { id: "model-b", label: "Model B" },
];

export const agentConfigurationDoc = `# my_agent agent configuration
...document all config fields here...
`;
```

**Exportaciones requeridas:**
- `type` — la clave del tipo de adaptador, almacenada en `agents.adapter_type`
- `label` — nombre legible para humanos para la UI
- `models` — opciones de modelos disponibles para el formulario de creación de agentes
- `agentConfigurationDoc` — Markdown que describe todos los campos de `adapterConfig` (usado por agentes LLM que configuran otros agentes)

**Escribir `agentConfigurationDoc` como lógica de ruteo:**

`agentConfigurationDoc` lo leen los agentes LLM (incluidos los agentes de Paperclip que crean otros agentes). Escríbelo como **lógica de ruteo**, no como texto de marketing. Incluye lineamientos concretos de "cuándo usarlo" y "cuándo no usarlo" para que un LLM pueda decidir si este adaptador es apropiado para una tarea dada.

```ts
export const agentConfigurationDoc = `# my_agent agent configuration

Adapter: my_agent

Use when:
- The agent needs to run MyAgent CLI locally on the host machine
- You need session persistence across runs (MyAgent supports thread resumption)
- The task requires MyAgent-specific tools (e.g. web search, code execution)

Don't use when:
- You need a simple one-shot script execution (use the "process" adapter instead)
- The agent doesn't need conversational context between runs (process adapter is simpler)
- MyAgent CLI is not installed on the host

Core fields:
- cwd (string, required): absolute working directory for the agent process
...
`;
```

Agregar casos negativos explícitos mejora la precisión de la selección de adaptadores. Un antipatrón concreto vale más que tres párrafos de descripción.

### 3.3 Módulo de servidor

#### `server/execute.ts` — el núcleo

Este es el archivo más importante. Recibe un `AdapterExecutionContext` y debe devolver un `AdapterExecutionResult`.

**Comportamiento requerido:**

1. **Lee la configuración** — extrae valores tipados de `ctx.config` usando utilidades (`asString`, `asNumber`, `asBoolean`, `asStringArray`, `parseObject` de `@paperclipai/adapter-utils/server-utils`)
2. **Construye el entorno** — llama a `buildPaperclipEnv(agent)` y luego agrega en capas `PAPERCLIP_RUN_ID`, variables de contexto (`PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`, `PAPERCLIP_APPROVAL_ID`, `PAPERCLIP_APPROVAL_STATUS`, `PAPERCLIP_LINKED_ISSUE_IDS`), anulaciones de entorno del usuario y el token de autenticación
3. **Resuelve la sesión** — verifica `runtime.sessionParams` / `runtime.sessionId` para una sesión existente; valida que sea compatible (p. ej., mismo cwd); decide si reanudar o empezar de cero
4. **Renderiza el prompt** — usa `renderTemplate(template, data)` con las variables de plantilla: `agentId`, `companyId`, `runId`, `company`, `agent`, `run`, `context`
5. **Llama a onMeta** — emite metadatos de invocación del adaptador antes de lanzar el proceso
6. **Lanza el proceso** — usa `runChildProcess()` para agentes basados en CLI o `fetch()` para agentes basados en HTTP
7. **Analiza la salida** — convierte el stdout del agente en datos estructurados (id de sesión, uso, resumen, errores)
8. **Maneja errores de sesión** — si la reanudación falla con "unknown session", reintenta con una sesión nueva y configura `clearSession: true`
9. **Devuelve AdapterExecutionResult** — completa todos los campos que admite el runtime del agente

**Variables de entorno que el servidor siempre inyecta:**

| Variable | Fuente |
|----------|--------|
| `PAPERCLIP_AGENT_ID` | `agent.id` |
| `PAPERCLIP_COMPANY_ID` | `agent.companyId` |
| `PAPERCLIP_API_URL` | URL propia del servidor |
| `PAPERCLIP_RUN_ID` | id de la ejecución actual |
| `PAPERCLIP_TASK_ID` | `context.taskId` o `context.issueId` |
| `PAPERCLIP_WAKE_REASON` | `context.wakeReason` |
| `PAPERCLIP_WAKE_COMMENT_ID` | `context.wakeCommentId` o `context.commentId` |
| `PAPERCLIP_APPROVAL_ID` | `context.approvalId` |
| `PAPERCLIP_APPROVAL_STATUS` | `context.approvalStatus` |
| `PAPERCLIP_LINKED_ISSUE_IDS` | `context.issueIds` (separados por comas) |
| `PAPERCLIP_API_KEY` | `authToken` (si no hay clave explícita en la configuración) |

#### `server/parse.ts` — analizador de salida

Analiza el formato de stdout del agente en datos estructurados. Debe manejar:

- **Identificación de sesión** — extrae el ID de sesión/hilo de los eventos de inicio
- **Seguimiento de uso** — extrae conteos de tokens (entrada, salida, en caché)
- **Seguimiento de costos** — extrae el costo si está disponible
- **Extracción de resumen** — extrae la respuesta de texto final del agente
- **Detección de errores** — identifica estados de error, extrae mensajes de error
- **Detección de sesión desconocida** — exporta una función `is<Agent>UnknownSessionError()` para la lógica de reintento

**Trata la salida del agente como no confiable.** El stdout que estás analizando proviene de un proceso impulsado por LLM que puede haber ejecutado llamadas arbitrarias a herramientas, obtenido contenido externo o haber sido influenciado por inyección de prompts en los archivos que leyó. Analiza de forma defensiva:
- Nunca `eval()` ni ejecutes dinámicamente nada de la salida
- Usa utilidades de extracción seguras (`asString`, `asNumber`, `parseJson`): devuelven valores de respaldo ante tipos inesperados
- Valida los IDs de sesión y otros datos estructurados antes de pasarlos
- Si la salida contiene URLs, rutas de archivos o comandos, no actúes sobre ellos en el adaptador: solo regístralos

#### `server/index.ts` — exportaciones del servidor

```ts
export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { parseMyAgentOutput, isMyAgentUnknownSessionError } from "./parse.js";

// Session codec — required for session persistence
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) { /* raw DB JSON -> typed params or null */ },
  serialize(params) { /* typed params -> JSON for DB storage */ },
  getDisplayId(params) { /* -> human-readable session id string */ },
};
```

#### `server/test.ts` — diagnósticos de entorno

Implementa verificaciones previas al vuelo específicas del adaptador, usadas por el botón de prueba de la UI.

Expectativas mínimas:

1. Valida los primitivos de configuración requeridos (rutas, comandos, URLs, suposiciones de autenticación)
2. Devuelve objetos de verificación con valores `code` deterministas
3. Mapea la severidad de forma consistente (`info` / `warn` / `error`)
4. Calcula el estado final:
   - `fail` si hay algún `error`
   - `warn` si no hay errores y hay al menos una advertencia
   - `pass` en los demás casos

Esta operación debe ser ligera y sin efectos secundarios.

### 3.4 Módulo de UI

#### `ui/parse-stdout.ts` — analizador de transcripción

Convierte líneas individuales de stdout en `TranscriptEntry[]` para el visor de detalles de ejecución. Debe manejar el formato de salida en streaming del agente y producir entradas de estos tipos:

- `init` — inicialización de modelo/sesión
- `assistant` — respuestas de texto del agente
- `thinking` — pensamiento/razonamiento del agente (si es compatible)
- `tool_call` — invocaciones de herramientas con nombre y entrada
- `tool_result` — resultados de herramientas con contenido y marca de error
- `user` — mensajes del usuario en la conversación
- `result` — resultado final con estadísticas de uso
- `stdout` — respaldo para líneas no analizables

```ts
export function parseMyAgentStdoutLine(line: string, ts: string): TranscriptEntry[] {
  // Parse JSON line, map to appropriate TranscriptEntry kind(s)
  // Return [{ kind: "stdout", ts, text: line }] as fallback
}
```

#### `ui/build-config.ts` — constructor de configuración

Convierte los `CreateConfigValues` del formulario de la UI en el blob JSON de `adapterConfig` almacenado en el agente.

```ts
export function buildMyAgentConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.cwd) ac.cwd = v.cwd;
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  if (v.model) ac.model = v.model;
  ac.timeoutSec = 0;
  ac.graceSec = 15;
  // ... adapter-specific fields
  return ac;
}
```

#### Componente de campos de configuración de la UI

Crea `ui/src/adapters/<name>/config-fields.tsx` con un componente de React que implemente `AdapterConfigFieldsProps`. Esto renderiza los campos de formulario específicos del adaptador en el formulario de creación/edición de agentes.

Usa los primitivos compartidos de `ui/src/components/agent-config-primitives`:
- `Field` — contenedor de campo de formulario con etiqueta
- `ToggleField` — interruptor booleano con etiqueta y pista
- `DraftInput` — entrada de texto con comportamiento de borrador/confirmación
- `DraftNumberInput` — entrada numérica con comportamiento de borrador/confirmación
- `help` — texto de ayuda estándar para campos comunes

El componente debe admitir tanto el modo `create` (usando `values`/`set`) como el modo `edit` (usando `config`/`eff`/`mark`).

### 3.5 Módulo de CLI

#### `cli/format-event.ts` — formateador de terminal

Imprime de forma legible las líneas de stdout para `paperclipai run --watch`. Usa `picocolors` para colorear.

```ts
import pc from "picocolors";

export function printMyAgentStreamEvent(raw: string, debug: boolean): void {
  // Parse JSON line from agent stdout
  // Print colored output: blue for system, green for assistant, yellow for tools
  // In debug mode, print unrecognized lines in gray
}
```

---

## 4. Lista de verificación de registro

Después de crear el paquete del adaptador, regístralo en los tres consumidores:

### 4.1 Registro de servidor (`server/src/adapters/registry.ts`)

```ts
import { execute as myExecute, sessionCodec as mySessionCodec } from "@paperclipai/adapter-my-agent/server";
import { agentConfigurationDoc as myDoc, models as myModels } from "@paperclipai/adapter-my-agent";

const myAgentAdapter: ServerAdapterModule = {
  type: "my_agent",
  execute: myExecute,
  sessionCodec: mySessionCodec,
  models: myModels,
  supportsLocalAgentJwt: true,  // true if agent can use Paperclip API
  agentConfigurationDoc: myDoc,
};

// Add to the adaptersByType map
const adaptersByType = new Map<string, ServerAdapterModule>(
  [..., myAgentAdapter].map((a) => [a.type, a]),
);
```

### 4.2 Registro de UI (`ui/src/adapters/registry.ts`)

```ts
import { myAgentUIAdapter } from "./my-agent";

const adaptersByType = new Map<string, UIAdapterModule>(
  [..., myAgentUIAdapter].map((a) => [a.type, a]),
);
```

Con `ui/src/adapters/my-agent/index.ts`:

```ts
import type { UIAdapterModule } from "../types";
import { parseMyAgentStdoutLine } from "@paperclipai/adapter-my-agent/ui";
import { MyAgentConfigFields } from "./config-fields";
import { buildMyAgentConfig } from "@paperclipai/adapter-my-agent/ui";

export const myAgentUIAdapter: UIAdapterModule = {
  type: "my_agent",
  label: "My Agent",
  parseStdoutLine: parseMyAgentStdoutLine,
  ConfigFields: MyAgentConfigFields,
  buildAdapterConfig: buildMyAgentConfig,
};
```

### 4.3 Registro de CLI (`cli/src/adapters/registry.ts`)

```ts
import { printMyAgentStreamEvent } from "@paperclipai/adapter-my-agent/cli";

const myAgentCLIAdapter: CLIAdapterModule = {
  type: "my_agent",
  formatStdoutEvent: printMyAgentStreamEvent,
};

// Add to the adaptersByType map
```

---

## 5. Gestión de sesiones — diseño para ejecuciones largas

Las sesiones permiten a los agentes mantener el contexto de conversación entre ejecuciones. El sistema está **basado en codecs**: cada adaptador define cómo serializar/deserializar su estado de sesión.

**Diseña para ejecuciones largas desde el principio.** Trata la reutilización de sesiones como el primitivo predeterminado, no como una optimización para agregar después. Un agente que trabaja en un issue puede ser despertado docenas de veces: para la asignación inicial, devoluciones de aprobación, reasignaciones, empujones manuales. Cada activación debe reanudar la conversación existente para que el agente conserve el contexto completo de lo que ya hizo, qué archivos leyó y qué decisiones tomó. Empezar de cero cada vez desperdicia tokens releyendo los mismos archivos y arriesga decisiones contradictorias.

**Conceptos clave:**
- `sessionParams` es un `Record<string, unknown>` opaco almacenado en la base de datos por tarea
- El `sessionCodec.serialize()` del adaptador convierte los datos del resultado de ejecución en parámetros almacenables
- `sessionCodec.deserialize()` convierte los parámetros almacenados de vuelta para la siguiente ejecución
- `sessionCodec.getDisplayId()` extrae un ID de sesión legible para humanos para la UI
- **reanudación consciente del cwd**: si la sesión se creó en un cwd distinto al de la configuración actual, omite la reanudación (evita la contaminación de sesiones entre proyectos)
- **reintento ante sesión desconocida**: si la reanudación falla con un error de "session not found", reintenta con una sesión nueva y devuelve `clearSession: true` para que Paperclip borre la sesión obsoleta

Si el runtime del agente admite alguna forma de compactación de contexto o compresión de conversación (p. ej., la gestión automática de contexto de Claude Code o el encadenamiento `previous_response_id` de Codex), apóyate en ella. Los adaptadores que admiten la reanudación de sesiones obtienen la compactación gratis: el runtime del agente maneja internamente la gestión de la ventana de contexto entre reanudaciones.

**Patrón** (de claude-local y codex-local):

```ts
const canResumeSession =
  runtimeSessionId.length > 0 &&
  (runtimeSessionCwd.length === 0 || path.resolve(runtimeSessionCwd) === path.resolve(cwd));
const sessionId = canResumeSession ? runtimeSessionId : null;

// ... run attempt ...

// If resume failed with unknown session, retry fresh
if (sessionId && !proc.timedOut && exitCode !== 0 && isUnknownSessionError(output)) {
  const retry = await runAttempt(null);
  return toResult(retry, { clearSessionOnMissingSession: true });
}
```

---

## 6. Utilidades de server-utils

Importa desde `@paperclipai/adapter-utils/server-utils`:

| Utilidad | Propósito |
|--------|---------|
| `asString(val, fallback)` | Extracción segura de cadenas |
| `asNumber(val, fallback)` | Extracción segura de números |
| `asBoolean(val, fallback)` | Extracción segura de booleanos |
| `asStringArray(val)` | Extracción segura de arreglos de cadenas |
| `parseObject(val)` | Extracción segura de `Record<string, unknown>` |
| `parseJson(str)` | `JSON.parse` seguro que devuelve `Record` o null |
| `renderTemplate(tmpl, data)` | Renderizado de plantillas `{{path.to.value}}` |
| `buildPaperclipEnv(agent)` | Variables de entorno `PAPERCLIP_*` estándar |
| `redactEnvForLogs(env)` | Enmascara claves sensibles para onMeta |
| `ensureAbsoluteDirectory(cwd)` | Valida que el cwd exista y sea absoluto |
| `ensureCommandResolvable(cmd, cwd, env)` | Valida que el comando esté en PATH |
| `ensurePathInEnv(env)` | Garantiza que PATH exista en el entorno |
| `runChildProcess(runId, cmd, args, opts)` | Lanza un proceso hijo con timeout, registro y captura |

---

## 7. Convenciones y patrones

### Nomenclatura
- Tipo de adaptador: `snake_case` (p. ej., `claude_local`, `codex_local`)
- Nombre del paquete: `@paperclipai/adapter-<kebab-name>`
- Directorio del paquete: `packages/adapters/<kebab-name>/`

### Análisis de configuración
- Nunca confíes directamente en los valores de `config`: usa siempre `asString`, `asNumber`, etc.
- Proporciona valores predeterminados sensatos para cada campo opcional
- Documenta todos los campos en `agentConfigurationDoc`

### Plantillas de prompts
- Admite `promptTemplate` para cada ejecución
- Usa `renderTemplate()` con el conjunto estándar de variables
- Prompt predeterminado: `"You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work."`

### Manejo de errores
- Diferencia timeout de error de proceso y de falla de análisis
- Completa siempre `errorMessage` en caso de falla
- Incluye stdout/stderr sin procesar en `resultJson` cuando el análisis falla
- Maneja el caso de que la CLI del agente no esté instalada (comando no encontrado)

### Registro (logging)
- Llama a `onLog("stdout", ...)` y `onLog("stderr", ...)` para toda la salida del proceso: esto alimenta el visor de ejecución en tiempo real
- Llama a `onMeta(...)` antes de lanzar el proceso para registrar los detalles de la invocación
- Usa `redactEnvForLogs()` al incluir el entorno en meta

### Inyección de habilidades de Paperclip

Paperclip incluye habilidades compartidas (en el directorio `skills/` de nivel superior del repositorio) que los agentes necesitan en runtime, como la habilidad de API `paperclip` y la habilidad de flujo de trabajo `paperclip-create-agent`. Cada adaptador es responsable de hacer que estas habilidades sean descubribles por su runtime de agente **sin contaminar el directorio de trabajo del agente**.

**La restricción:** nunca copies ni crees enlaces simbólicos de habilidades en el `cwd` del agente. El cwd es la copia de trabajo (checkout) del proyecto del usuario: escribir `.claude/skills/` u otros archivos en él contaminaría el repositorio con componentes internos de Paperclip, rompería el estado de git y podría filtrarse en los commits.

**El patrón:** crea una ubicación limpia y aislada para las habilidades e indícale al runtime del agente que busque ahí.

**Cómo lo hace claude-local:**

1. En tiempo de ejecución, crea un tmpdir nuevo: `mkdtemp("paperclip-skills-")`
2. Dentro de él, crea `.claude/skills/` (la estructura de directorios que Claude Code espera)
3. Crea un enlace simbólico de cada directorio de habilidad del `skills/` del repositorio en el `.claude/skills/` del tmpdir
4. Pasa el tmpdir a Claude Code mediante `--add-dir <tmpdir>`: esto hace que Claude Code descubra las habilidades como si estuvieran registradas en ese directorio, sin tocar el cwd real del agente
5. Limpia el tmpdir en un bloque `finally` después de que la ejecución se complete

```ts
// From claude-local execute.ts
async function buildSkillsDir(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-skills-"));
  const target = path.join(tmp, ".claude", "skills");
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(PAPERCLIP_SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await fs.symlink(
        path.join(PAPERCLIP_SKILLS_DIR, entry.name),
        path.join(target, entry.name),
      );
    }
  }
  return tmp;
}

// In execute(): pass --add-dir to Claude Code
const skillsDir = await buildSkillsDir();
args.push("--add-dir", skillsDir);
// ... run process ...
// In finally: fs.rm(skillsDir, { recursive: true, force: true })
```

**Cómo lo hace codex-local:**

Codex tiene un directorio global personal de habilidades (`$CODEX_HOME/skills` o `~/.codex/skills`). El adaptador crea enlaces simbólicos de las habilidades de Paperclip ahí si aún no existen. Esto es aceptable porque es el directorio de configuración propio de la herramienta de agente, no el proyecto del usuario.

```ts
// From codex-local execute.ts
async function ensureCodexSkillsInjected(onLog) {
  const skillsHome = path.join(codexHomeDir(), "skills");
  await fs.mkdir(skillsHome, { recursive: true });
  for (const entry of entries) {
    const target = path.join(skillsHome, entry.name);
    const existing = await fs.lstat(target).catch(() => null);
    if (existing) continue;  // Don't overwrite user's own skills
    await fs.symlink(source, target);
  }
}
```

**Para un nuevo adaptador:** averigua cómo tu runtime de agente descubre habilidades/plugins y luego elige la ruta de inyección más limpia:

1. **Mejor: tmpdir + flag** (como claude-local): si el runtime admite una flag de "directorio adicional", crea un tmpdir, crea enlaces simbólicos de las habilidades, pasa la flag y limpia después. Cero efectos secundarios.
2. **Aceptable: directorio de configuración global** (como codex-local): si el runtime tiene un directorio global de habilidades/plugins separado del proyecto, crea enlaces simbólicos ahí. Omite las entradas existentes para evitar sobrescribir las personalizaciones del usuario.
3. **Aceptable: variable de entorno**: si el runtime lee una ruta de habilidades/plugins desde una variable de entorno, apúntala directamente al directorio `skills/` del repositorio.
4. **Último recurso: inyección de prompt**: si el runtime no tiene sistema de plugins, incluye el contenido de la habilidad en la plantilla del prompt. Esto usa tokens pero evita por completo los efectos secundarios en el sistema de archivos.

**Las habilidades como procedimientos cargados, no como relleno del prompt.** Las habilidades de Paperclip (como `paperclip` y `paperclip-create-agent`) están diseñadas como procedimientos bajo demanda: el agente ve los metadatos de la habilidad (nombre + descripción) en su contexto, pero solo carga el contenido completo del SKILL.md cuando decide invocar una habilidad. Esto mantiene pequeño el prompt base. Al escribir `agentConfigurationDoc` o plantillas de prompt para tu adaptador, no incluyas el contenido de las habilidades en línea: deja que el descubrimiento de habilidades del runtime del agente haga el trabajo. Las descripciones en el frontmatter de cada SKILL.md actúan como lógica de ruteo: le dicen al agente cuándo cargar la habilidad completa, no qué contiene.

**Invocación explícita vs. difusa de habilidades.** Para flujos de trabajo de producción donde la confiabilidad importa (p. ej., un agente que siempre debe llamar a la API de Paperclip para reportar su estado), usa instrucciones explícitas en la plantilla del prompt: "Use the paperclip skill to report your progress." El ruteo difuso (dejar que el modelo decida según la coincidencia de descripciones) está bien para tareas exploratorias, pero no es confiable para procedimientos obligatorios.

---

## 8. Consideraciones de seguridad

Los adaptadores se encuentran en el límite entre la capa de orquestación de Paperclip y la ejecución arbitraria de agentes. Esta es una superficie de alto riesgo.

### Trata la salida del agente como no confiable

El proceso del agente ejecuta código impulsado por LLM que lee archivos externos, obtiene URLs y ejecuta herramientas. Su salida puede estar influenciada por inyección de prompts del contenido que procesa. La capa de análisis del adaptador es un límite de confianza: valida todo, no ejecutes nada.

### Inyección de secretos por entorno, no por prompts

Nunca pongas secretos (claves de API, tokens) en plantillas de prompt o campos de configuración que pasen por el LLM. En su lugar, inyéctalos como variables de entorno que las herramientas del agente puedan leer directamente:

- `PAPERCLIP_API_KEY` la inyecta el servidor en el entorno del proceso, no en el prompt
- Los secretos proporcionados por el usuario en `config.env` se pasan como variables de entorno, enmascarados en los registros de `onMeta`
- La utilidad `redactEnvForLogs()` enmascara automáticamente cualquier clave que coincida con `/(key|token|secret|password|authorization|cookie)/i`

Esto sigue el patrón de "inyección sidecar": el modelo nunca ve el valor real del secreto, pero las herramientas que invoca pueden leerlo del entorno.

### Acceso a la red

Si tu runtime de agente admite controles de acceso a la red (sandboxing, listas de permitidos), configúralos en el adaptador:

- Prefiere listas de permitidos mínimas sobre el acceso abierto a internet. Un agente que solo necesita llamar a la API de Paperclip y a GitHub no debe tener acceso a hosts arbitrarios.
- Habilidades + red = riesgo amplificado. Una habilidad que enseña al agente a hacer solicitudes HTTP combinada con acceso irrestricto a la red crea una ruta de exfiltración. Restringe una u otra.
- Si el runtime admite políticas en capas (valores predeterminados a nivel de organización + anulaciones por solicitud), conecta la política a nivel de organización en la configuración del adaptador y deja que la configuración por agente la restrinja aún más.

### Aislamiento de procesos

- Los adaptadores basados en CLI heredan los permisos de usuario del servidor. La configuración de `cwd` y `env` determina a qué puede acceder el proceso del agente en el sistema de archivos.
- Las flags `dangerouslySkipPermissions` / `dangerouslyBypassApprovalsAndSandbox` existen por conveniencia de desarrollo, pero deben documentarse como peligrosas en `agentConfigurationDoc`. Los despliegues de producción no deben usarlas.
- El timeout y el período de gracia (`timeoutSec`, `graceSec`) son rieles de seguridad: aplícalos siempre. Un proceso de agente descontrolado sin timeout puede consumir recursos ilimitados.

---

## 9. Referencia de tipos de TranscriptEntry

El visor de ejecución de la UI muestra estos tipos de entrada:

| Tipo | Campos | Uso |
|------|--------|-------|
| `init` | `model`, `sessionId` | Inicialización del agente |
| `assistant` | `text` | Respuesta de texto del agente |
| `thinking` | `text` | Pensamiento/razonamiento del agente |
| `user` | `text` | Mensaje del usuario |
| `tool_call` | `name`, `input` | Invocación de herramienta |
| `tool_result` | `toolUseId`, `content`, `isError` | Resultado de herramienta |
| `result` | `text`, `inputTokens`, `outputTokens`, `cachedTokens`, `costUsd`, `subtype`, `isError`, `errors` | Resultado final con uso |
| `stderr` | `text` | Salida de stderr |
| `system` | `text` | Mensajes de sistema |
| `stdout` | `text` | Respaldo de stdout sin procesar |

---

## 10. Pruebas

Crea pruebas en `server/src/__tests__/<adapter-name>-adapter.test.ts`. Prueba:

1. **Análisis de salida** — alimenta stdout de muestra a tu analizador y verifica la salida estructurada
2. **Detección de sesión desconocida** — verifica la función `is<Agent>UnknownSessionError`
3. **Construcción de configuración** — verifica que `buildConfig` produzca el adapterConfig correcto a partir de los valores del formulario
4. **Codec de sesión** — verifica los viajes de ida y vuelta de serializar/deserializar

---

## 11. Lista de verificación mínima del adaptador

- [ ] `packages/adapters/<name>/package.json` con cuatro exportaciones (`.`, `./server`, `./ui`, `./cli`)
- [ ] `index.ts` raíz con `type`, `label`, `models`, `agentConfigurationDoc`
- [ ] `server/execute.ts` que implementa `AdapterExecutionContext -> AdapterExecutionResult`
- [ ] `server/test.ts` que implementa `AdapterEnvironmentTestContext -> AdapterEnvironmentTestResult`
- [ ] `server/parse.ts` con analizador de salida y detector de sesión desconocida
- [ ] `server/index.ts` que exporta `execute`, `testEnvironment`, `sessionCodec` y utilidades de análisis
- [ ] `ui/parse-stdout.ts` con `StdoutLineParser` para el visor de ejecución
- [ ] `ui/build-config.ts` con constructor `CreateConfigValues -> adapterConfig`
- [ ] `ui/src/adapters/<name>/config-fields.tsx` componente de React para el formulario de agente
- [ ] `ui/src/adapters/<name>/index.ts` que ensambla el `UIAdapterModule`
- [ ] `cli/format-event.ts` con formateador de terminal
- [ ] `cli/index.ts` que exporta el formateador
- [ ] Registrado en `server/src/adapters/registry.ts`
- [ ] Registrado en `ui/src/adapters/registry.ts`
- [ ] Registrado en `cli/src/adapters/registry.ts`
- [ ] Agregado al workspace en el `pnpm-workspace.yaml` raíz (si el glob aún no lo cubre)
- [ ] Pruebas de análisis, codec de sesión y construcción de configuración
