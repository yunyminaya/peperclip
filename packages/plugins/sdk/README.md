# `@paperclipai/plugin-sdk`

SDK oficial de TypeScript para autores de plugins de Paperclip.

- **SDK del worker:** `@paperclipai/plugin-sdk` — `definePlugin`, contexto, ciclo de vida
- **SDK de UI:** `@paperclipai/plugin-sdk/ui` — Hooks de React y props de slots
- **Pruebas:** `@paperclipai/plugin-sdk/testing` — arnés de host en memoria
- **Empaquetadores:** `@paperclipai/plugin-sdk/bundlers` — preajustes de esbuild/rollup
- **Servidor de desarrollo:** `@paperclipai/plugin-sdk/dev-server` — servidor de UI estático + recarga por SSE

Referencia: `doc/plugins/PLUGIN_SPEC.md`

## Superficie del paquete

| Importación | Propósito |
|--------|--------|
| `@paperclipai/plugin-sdk` | Entrada del worker: `definePlugin`, `runWorker`, tipos de contexto, ayudantes de protocolo |
| `@paperclipai/plugin-sdk/ui` | Entrada de UI: `usePluginData`, `usePluginAction`, `usePluginStream`, `useHostContext`, tipos de props de slot |
| `@paperclipai/plugin-sdk/ui/hooks` | Solo hooks |
| `@paperclipai/plugin-sdk/ui/types` | Tipos de UI e interfaces de props de slot |
| `@paperclipai/plugin-sdk/testing` | `createTestHarness` para pruebas unitarias/de integración |
| `@paperclipai/plugin-sdk/bundlers` | `createPluginBundlerPresets` para compilaciones de worker/manifiesto/UI |
| `@paperclipai/plugin-sdk/dev-server` | `startPluginDevServer`, `getUiBuildSnapshot` |
| `@paperclipai/plugin-sdk/protocol` | Tipos y ayudantes del protocolo JSON-RPC (avanzado) |
| `@paperclipai/plugin-sdk/types` | Contexto del worker y tipos de API (avanzado) |

## Puntos de entrada del manifiesto

En el manifiesto de tu plugin declaras:

- **`entrypoints.worker`** (obligatorio) — Ruta al bundle del worker (p. ej., `dist/worker.js`). El host lo carga y llama a `setup(ctx)`.
- **`entrypoints.ui`** (obligatorio si usas UI) — Ruta al directorio del bundle de UI. El host carga componentes desde aquí para slots y lanzadores.

## Instalación

```bash
pnpm add @paperclipai/plugin-sdk
```

## Advertencias del despliegue actual

El SDK es lo bastante estable para el desarrollo local y los ejemplos propios, pero el modelo de despliegue en tiempo de ejecución aún es incipiente.

- Tanto los workers de plugins como la UI de plugins deben tratarse hoy como código de confianza.
- Los bundles de UI de plugins se ejecutan como JavaScript del mismo origen dentro de la app principal de Paperclip. Pueden llamar a las API HTTP normales de Paperclip con la sesión del tablero, así que las capacidades del manifiesto no son una sandbox del frontend.
- Las instalaciones por ruta local y los plugins de ejemplo del repositorio son flujos de desarrollo. Suponen que la copia del código fuente del plugin existe en el disco.
- Para plugins desplegados, publica un paquete npm e instala ese paquete en la instancia de Paperclip en tiempo de ejecución.
- El runtime actual del host espera un sistema de archivos con escritura, `npm` disponible en tiempo de ejecución y acceso de red al registro de paquetes usado para la instalación de plugins.
- La instalación dinámica de plugins hoy es más adecuada para despliegues persistentes de un solo nodo. Los despliegues en la nube con múltiples instancias aún necesitan un modelo compartido de artefactos/distribución antes de que las instalaciones en tiempo de ejecución sean confiables entre nodos.
- El host aún no incluye un kit real de componentes React compartidos para plugins. Crea la UI de tu plugin con componentes React comunes y CSS.
- `ctx.assets` no forma parte del runtime soportado en esta compilación. No dependas aún de las API de subida/lectura de assets.

Si estás creando un plugin para que otros lo desplieguen, trata la instalación empaquetada en npm como la ruta soportada y las instalaciones de ejemplo locales del repositorio como una comodidad de desarrollo.

## Inicio rápido del worker

```ts
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.events.on("issue.created", async (event) => {
      ctx.logger.info("Issue created", { issueId: event.entityId });
    });

    ctx.data.register("health", async () => ({ status: "ok" }));
    ctx.actions.register("ping", async () => ({ pong: true }));

    ctx.tools.register("calculator", {
      displayName: "Calculator",
      description: "Basic math",
      parametersSchema: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } },
        required: ["a", "b"]
      }
    }, async (params) => {
      const { a, b } = params as { a: number; b: number };
      return { content: `Result: ${a + b}`, data: { result: a + b } };
    });
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
```

**Nota:** `runWorker(plugin, import.meta.url)` debe llamarse para que, cuando el host ejecute tu worker (p. ej., `node dist/worker.js`), el host RPC inicie y el proceso se mantenga vivo. Cuando el archivo se importa (p. ej., para pruebas), la comprobación del módulo principal evita que el host inicie.

### Ciclo de vida y contexto del worker

**Ciclo de vida (definePlugin):**

| Hook | Propósito |
|------|--------|
| `setup(ctx)` | **Obligatorio.** Se llama una vez al iniciar. Registra manejadores de eventos, trabajos, datos/acciones/herramientas, etc. |
| `onHealth?()` | Opcional. Devuelve `{ status, message?, details? }` para el panel de salud. |
| `onConfigChanged?(newConfig)` | Opcional. Aplica la nueva configuración sin reiniciar; si se omite, el host reinicia el worker. |
| `onShutdown?()` | Opcional. Limpia antes de la salida del proceso (ventana de tiempo limitada). |
| `onValidateConfig?(config)` | Opcional. Devuelve `{ ok, warnings?, errors? }` para la UI de ajustes / Probar conexión. |
| `onWebhook?(input)` | Opcional. Maneja `POST /api/plugins/:pluginId/webhooks/:endpointKey`; obligatorio si se declaran webhooks. |

**Contexto (`ctx`) en setup:** `config`, `events`, `jobs`, `launchers`, `http`, `secrets`, `activity`, `state`, `entities`, `projects`, `companies`, `issues`, `agents`, `goals`, `data`, `actions`, `streams`, `tools`, `metrics`, `logger`, `manifest`. Las API del host del lado del worker están controladas por capacidades; declara las capacidades en el manifiesto.

**Agentes:** `ctx.agents.invoke(agentId, companyId, opts)` para invocación única. `ctx.agents.sessions` para chat bidireccional: `create`, `list`, `sendMessage` (con callback `onEvent` de streaming), `close`. Consulta la [guía de autoría de plugins](../../doc/plugins/PLUGIN_AUTHORING_GUIDE.md#agent-sessions-two-way-chat) para más detalles.

**Trabajos:** decláralos en `manifest.jobs` con `jobKey`, `displayName`, `schedule` (cron). Registra el manejador con `ctx.jobs.register(jobKey, fn)`. **Webhooks:** decláralos en `manifest.webhooks` con `endpointKey`; manéjalos en `onWebhook(input)`. **Estado:** `ctx.state.get/set/delete(scopeKey)`; tipos de alcance: `instance`, `company`, `project`, `project_workspace`, `agent`, `issue`, `goal`, `run`.

## Eventos

Suscríbete en `setup` con `ctx.events.on(name, handler)` o `ctx.events.on(name, filter, handler)`. Emite eventos con alcance de plugin con `ctx.events.emit(name, companyId, payload)` (requiere `events.emit`).

**Eventos centrales del dominio (suscríbete con `events.subscribe`):**

| Evento | Entidad típica |
|-------|-----------------|
| `company.created`, `company.updated` | company |
| `project.created`, `project.updated` | project |
| `project.workspace_created`, `project.workspace_updated`, `project.workspace_deleted` | project_workspace |
| `issue.created`, `issue.updated`, `issue.comment.created` | issue |
| `agent.created`, `agent.updated`, `agent.status_changed` | agent |
| `agent.run.started`, `agent.run.finished`, `agent.run.failed`, `agent.run.cancelled` | run |
| `goal.created`, `goal.updated` | goal |
| `approval.created`, `approval.decided` | approval |
| `cost_event.created` | cost |
| `activity.logged` | activity |

**De plugin a plugin:** suscríbete a `plugin.<pluginId>.<eventName>` (p. ej., `plugin.acme.linear.sync-done`). Emite con `ctx.events.emit("sync-done", companyId, payload)`; el host le asigna el espacio de nombres automáticamente.

**Filtro (opcional):** pasa un segundo argumento a `on()`: `{ projectId?, companyId?, agentId? }` para que el host solo entregue los eventos coincidentes.

**Contexto de empresa:** los eventos aún llevan `companyId` para datos con alcance de empresa, pero la instalación y activación de plugins son a nivel de instancia en el runtime actual.

## Trabajos programados (recurrentes)

Los plugins pueden declarar **trabajos programados** que el host ejecuta según un cronograma cron. Úsalo para tareas recurrentes como sincronizaciones, informes de resumen o limpieza.

1. **Capacidad:** agrega `jobs.schedule` a `manifest.capabilities`.
2. **Declara los trabajos** en `manifest.jobs`: cada entrada tiene `jobKey`, `displayName`, `description` opcional y `schedule` (una expresión cron de 5 campos).
3. **Registra un manejador** en `setup()` con `ctx.jobs.register(jobKey, async (job) => { ... })`.

**Formato cron** (5 campos: minuto, hora, día del mes, mes, día de la semana):

| Campo        | Valores   | Ejemplo |
|-------------|----------|---------|
| minute      | 0–59     | `0`, `*/15` |
| hour        | 0–23     | `2`, `*` |
| day of month | 1–31   | `1`, `*` |
| month       | 1–12     | `*` |
| day of week | 0–6 (dom=0) | `*`, `1-5` |

Ejemplos: `"0 * * * *"` = cada hora en el minuto 0; `"*/5 * * * *"` = cada 5 minutos; `"0 2 * * *"` = todos los días a las 2:00.

**Contexto del manejador del trabajo** (`PluginJobContext`):

| Campo        | Tipo     | Descripción |
|-------------|----------|-------------|
| `jobKey`    | string   | Coincide con la declaración del manifiesto. |
| `runId`     | string   | UUID de esta ejecución. |
| `trigger`   | `"schedule" \| "manual" \| "retry"` | Qué causó esta ejecución. |
| `scheduledAt` | string | Hora ISO 8601 en que se programó la ejecución. |

Las ejecuciones pueden dispararse por el **cronograma**, **manualmente** desde la UI/API o como **reintento** (cuando un operador vuelve a ejecutar un trabajo tras un fallo). Vuelve a lanzar la excepción desde el manejador para marcar la ejecución como fallida; el host registra el fallo. El host no reintenta automáticamente: los operadores pueden disparar otra ejecución manualmente desde la UI o la API.

Ejemplo:

**Manifiesto** — incluye `jobs.schedule` y declara el trabajo:

```ts
// In your manifest (e.g. manifest.ts):
const manifest = {
  // ...
  capabilities: ["jobs.schedule", "plugin.state.write"],
  jobs: [
    {
      jobKey: "heartbeat",
      displayName: "Heartbeat",
      description: "Runs every 5 minutes",
      schedule: "*/5 * * * *",
    },
  ],
  // ...
};
```

**Worker** — registra el manejador en `setup()`:

```ts
ctx.jobs.register("heartbeat", async (job) => {
  ctx.logger.info("Heartbeat run", { runId: job.runId, trigger: job.trigger });
  await ctx.state.set({ scopeKind: "instance", stateKey: "last-heartbeat" }, new Date().toISOString());
});
```

## Slots y lanzadores de UI

Los slots son puntos de montaje para componentes React de plugins. Los lanzadores son puntos de entrada renderizados por el host (botones, elementos de menú) que abren la UI del plugin. Declara los slots en `manifest.ui.slots` con `type`, `id`, `displayName`, `exportName`; para slots sensibles al contexto agrega `entityTypes`. Declara los lanzadores en `manifest.ui.launchers` (o en el heredado `manifest.launchers`).

### Tipos de slot / zonas de colocación de lanzadores

El mismo conjunto de valores se usa como **tipos de slot** (dónde se monta un componente) y **zonas de colocación de lanzadores** (dónde puede aparecer un lanzador). Jerarquía:

| Tipo de slot / zona de colocación | Alcance | Tipos de entidad (cuando depende del contexto) |
|----------------------------|-------|---------------------------------------|
| `page` | Global | — |
| `sidebar` | Global | — |
| `sidebarPanel` | Global | — |
| `settingsPage` | Global | — |
| `dashboardWidget` | Global | — |
| `globalToolbarButton` | Global | — |
| `detailTab` | Entidad | `project`, `issue`, `agent`, `goal`, `run` |
| `taskDetailView` | Entidad | (contexto de tarea/issue) |
| `commentAnnotation` | Entidad | `comment` |
| `commentContextMenuItem` | Entidad | `comment` |
| `projectSidebarItem` | Entidad | `project` |
| `toolbarButton` | Entidad | varía según la superficie del host |
| `contextMenuItem` | Entidad | varía según la superficie del host |

**Alcance** describe si el slot requiere una entidad para renderizarse. Los slots **globales** se renderizan sin una entidad específica, pero aún reciben el `companyId` activo a través de `PluginHostContext`; úsalo para limitar las consultas de datos a la empresa actual. Los slots de **entidad** además requieren `entityId` y `entityType` (p. ej., una pestaña de detalle en un issue específico).

**Tipos de entidad** (para `entityTypes` en slots): `project` \| `issue` \| `agent` \| `goal` \| `run` \| `comment`. Lista completa: importa `PLUGIN_UI_SLOT_TYPES` y `PLUGIN_UI_SLOT_ENTITY_TYPES` desde `@paperclipai/plugin-sdk`.

### Descripciones de los componentes de slot

#### `page`

Una extensión de página completa montada en `/plugins/:pluginId` (global) o `/:company/plugins/:pluginId` (ruta con contexto de empresa). Úsala para experiencias de plugin ricas e independientes, como paneles, asistentes de configuración o flujos de varios pasos. Recibe `PluginPageProps` con `context.companyId` establecido en la empresa activa. Requiere la capacidad `ui.page.register`.

#### `sidebar`

Agrega una entrada estilo navegación al área de navegación principal de la barra lateral de la empresa, renderizada junto a los elementos centrales de navegación (Dashboard, Issues, Goals, etc.). Úsala para enlaces ligeros siempre visibles o indicadores de estado que se sientan nativos de la barra lateral. Recibe `PluginSidebarProps` con `context.companyId` establecido en la empresa activa. Requiere la capacidad `ui.sidebar.register`.

#### `sidebarPanel`

Renderiza contenido en línea más rico en un área de panel dedicada debajo de las secciones de navegación de la barra lateral de la empresa. Úsala para mini-widgets, tarjetas de resumen, paneles de acciones rápidas o vistas de estado de un vistazo que necesiten más espacio vertical que un enlace de navegación. Recibe `context.companyId` establecido en la empresa activa mediante `useHostContext()`. Requiere la capacidad `ui.sidebar.register`.

#### `settingsPage`

Reemplaza el formulario de ajustes autogenerado de JSON Schema con un componente React personalizado. Úsala cuando el formulario predeterminado sea insuficiente; por ejemplo, cuando tu plugin necesite configuración de varios pasos, flujos OAuth, botones de "Test Connection" o controles de entrada ricos. Recibe `PluginSettingsPageProps` con `context.companyId` establecido en la empresa activa. El componente es responsable de leer y escribir la configuración a través del puente (mediante `usePluginData` y `usePluginAction`).

#### `dashboardWidget`

Una tarjeta o sección renderizada en el panel principal. Úsala para métricas de un vistazo, indicadores de estado o vistas de resumen que muestran datos del plugin junto a la información central de Paperclip. Recibe `PluginWidgetProps` con `context.companyId` establecido en la empresa activa. Requiere la capacidad `ui.dashboardWidget.register`.

#### `detailTab`

Una pestaña adicional en la página de detalle de un proyecto, issue, agente, objetivo o ejecución. Se renderiza cuando el usuario navega a la vista de detalle de esa entidad. Recibe `PluginDetailTabProps` con `context.companyId` establecido en la empresa activa y `context.entityId` / `context.entityType` garantizados como no nulos, para que puedas limitar de inmediato las consultas de datos a la entidad relevante. Especifica a qué tipos de entidad aplica la pestaña mediante el arreglo `entityTypes` en la declaración del slot del manifiesto. Requiere la capacidad `ui.detailTab.register`.

#### `taskDetailView`

Un slot especializado renderizado en el contexto de la vista de detalle de una tarea o issue. Similar a `detailTab`, pero diseñado para contenido en línea dentro del diseño de detalle de la tarea en lugar de una pestaña separada. Recibe `context.companyId`, `context.entityId` y `context.entityType` como `detailTab`. Requiere la capacidad `ui.detailTab.register`.

#### `projectSidebarItem`

Un enlace o componente pequeño renderizado **una vez por proyecto** bajo la fila de ese proyecto en la lista Projects de la barra lateral. Úsalo para agregar entradas de navegación con alcance de proyecto (p. ej., "Files", "Linear Sync") que enlacen en profundidad a una pestaña de detalle del plugin: `/:company/projects/:projectRef?tab=plugin:<key>:<slotId>`. Recibe `PluginProjectSidebarItemProps` con `context.companyId` establecido en la empresa activa, `context.entityId` establecido en el id del proyecto y `context.entityType` establecido en `"project"`. Usa el campo opcional `order` en el slot del manifiesto para controlar la posición de orden. Requiere la capacidad `ui.sidebar.register`.

#### `globalToolbarButton`

Un botón renderizado en la barra superior global (barra de breadcrumb) que aparece en todas las páginas. Úsalo para acciones a nivel de empresa que no están limitadas a una entidad específica; por ejemplo, un disparador de búsqueda universal, un indicador de estado de sincronización global o una acción flotante que aplica a todo el espacio de trabajo. Recibe solo `context.companyId` y `context.companyPrefix`; no hay contexto de entidad disponible. Requiere la capacidad `ui.action.register`.

#### `toolbarButton`

Un botón renderizado en la barra de herramientas de una página de entidad (p. ej., detalle de proyecto, detalle de issue). Úsalo para acciones contextuales de corta duración limitadas a la entidad actual, como disparar una sincronización de proyecto, abrir un selector o ejecutar un comando rápido en esa entidad. El componente puede abrir internamente un modal propio del plugin para confirmaciones o formularios compactos. Recibe `context.companyId`, `context.entityId` y `context.entityType`; declara `entityTypes` en el manifiesto para controlar en qué páginas de entidad aparece el botón. Requiere la capacidad `ui.action.register`.

#### `contextMenuItem`

Una entrada agregada a un menú contextual de clic derecho o desbordamiento en una superficie del host. Úsala para acciones secundarias que aplican a la entidad bajo el cursor (p. ej., "Copy to Linear", "Re-run analysis"). Recibe `context.companyId` establecido en la empresa activa; el contexto de entidad varía según la superficie del host. Requiere la capacidad `ui.action.register`.

#### `commentAnnotation`

Una región de anotación por comentario renderizada debajo de cada comentario individual en la línea de tiempo del detalle del issue. Úsala para enriquecer comentarios con enlaces de archivos analizados, insignias de sentimiento, acciones en línea o cualquier metadato por comentario. Recibe `PluginCommentAnnotationProps` con `context.entityId` establecido en el UUID del comentario, `context.entityType` establecido en `"comment"`, `context.parentEntityId` establecido en el UUID del issue padre, `context.projectId` establecido en el proyecto del issue (si lo hay) y `context.companyPrefix` establecido en el slug de la empresa activa. Requiere la capacidad `ui.commentAnnotation.register`.

#### `commentContextMenuItem`

Un elemento de menú contextual por comentario renderizado en el menú desplegable "more" (⋮) de cada comentario en la línea de tiempo del detalle del issue. Úsalo para agregar acciones por comentario como "Create sub-issue from comment", "Translate", "Flag for review" o acciones personalizadas del plugin. Recibe `PluginCommentContextMenuItemProps` con `context.entityId` establecido en el UUID del comentario, `context.entityType` establecido en `"comment"`, `context.parentEntityId` establecido en el UUID del issue padre, `context.projectId` establecido en el proyecto del issue (si lo hay) y `context.companyPrefix` establecido en el slug de la empresa activa. Los plugins pueden abrir drawers, modales o popovers limitados a ese comentario. El botón ⋮ del menú solo aparece en comentarios donde al menos un plugin renderiza contenido visible. Requiere la capacidad `ui.action.register`.

### Acciones de lanzadores y opciones de renderizado

| Acción del lanzador | Descripción |
|-----------------|-------------|
| `navigate` | Navega a una ruta (plugin o host). |
| `openModal` | Abre un modal. |
| `openDrawer` | Abre un drawer. |
| `openPopover` | Abre un popover. |
| `performAction` | Ejecuta una acción (p. ej., llama al plugin). |
| `deepLink` | Enlace profundo al plugin o a una URL externa. |

| Opción de renderizado | Valores | Descripción |
|---------------|--------|-------------|
| `environment` | `hostInline`, `hostOverlay`, `hostRoute`, `external`, `iframe` | Contenedor que el lanzador espera tras la activación. |
| `bounds` | `inline`, `compact`, `default`, `wide`, `full` | Sugerencia de tamaño para overlays/drawers. |

### Capacidades

Decláralas en `manifest.capabilities`. Agrupadas por alcance:

| Alcance | Capacidad |
|-------|------------|
| **Empresa** | `companies.read` |
| | `projects.read` |
| | `project.workspaces.read` |
| | `issues.read` |
| | `issue.comments.read` |
| | `agents.read` |
| | `goals.read` |
| | `goals.create` |
| | `goals.update` |
| | `activity.read` |
| | `costs.read` |
| | `issues.create` |
| | `issues.update` |
| | `issue.comments.create` |
| | `activity.log.write` |
| | `metrics.write` |
| **Instancia** | `instance.settings.register` |
| | `plugin.state.read` |
| | `plugin.state.write` |
| **Runtime** | `events.subscribe` |
| | `events.emit` |
| | `jobs.schedule` |
| | `webhooks.receive` |
| | `http.outbound` |
| | `secrets.read-ref` |
| **Agente** | `agent.tools.register` |
| | `agents.invoke` |
| | `agent.sessions.create` |
| | `agent.sessions.list` |
| | `agent.sessions.send` |
| | `agent.sessions.close` |
| **UI** | `ui.sidebar.register` |
| | `ui.page.register` |
| | `ui.detailTab.register` |
| | `ui.dashboardWidget.register` |
| | `ui.commentAnnotation.register` |
| | `ui.action.register` |

Lista completa en código: importa `PLUGIN_CAPABILITIES` desde `@paperclipai/plugin-sdk`.

## Inicio rápido de la UI

```tsx
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";

export function DashboardWidget() {
  const { data } = usePluginData<{ status: string }>("health");
  const ping = usePluginAction("ping");
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <strong>Health</strong>
      <div>{data?.status ?? "unknown"}</div>
      <button onClick={() => void ping()}>Ping</button>
    </div>
  );
}
```

### Referencia de hooks

#### `usePluginData<T>(key, params?)`

Obtiene datos del manejador `getData` registrado del worker. Vuelve a consultar cuando `params` cambia. Devuelve `{ data, loading, error, refresh }`.

```tsx
import { usePluginData } from "@paperclipai/plugin-sdk/ui";

interface SyncStatus {
  lastSyncAt: string;
  syncedCount: number;
  healthy: boolean;
}

export function SyncStatusWidget({ context }: PluginWidgetProps) {
  const { data, loading, error, refresh } = usePluginData<SyncStatus>("sync-status", {
    companyId: context.companyId,
  });

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <p>Status: {data!.healthy ? "Healthy" : "Unhealthy"}</p>
      <p>Synced {data!.syncedCount} items</p>
      <p>Last sync: {data!.lastSyncAt}</p>
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

#### `usePluginAction(key)`

Devuelve una función asíncrona que llama al manejador `performAction` del worker. Lanza `PluginBridgeError` en caso de fallo.

```tsx
import { useState } from "react";
import { usePluginAction, type PluginBridgeError } from "@paperclipai/plugin-sdk/ui";

export function ResyncButton({ context }: PluginWidgetProps) {
  const resync = usePluginAction("resync");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await resync({ companyId: context.companyId });
    } catch (err) {
      setError((err as PluginBridgeError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={busy}>
        {busy ? "Syncing..." : "Resync Now"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
```

#### `useHostContext()`

Lee el contexto activo de empresa, proyecto, entidad y usuario. Úsalo para limitar consultas de datos y acciones.

```tsx
import { useHostContext, usePluginData } from "@paperclipai/plugin-sdk/ui";
import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";

export function IssueLinearLink({ context }: PluginDetailTabProps) {
  const { companyId, entityId, entityType } = context;
  const { data } = usePluginData<{ url: string }>("linear-link", {
    companyId,
    issueId: entityId,
  });

  if (!data?.url) return <p>No linked Linear issue.</p>;
  return <a href={data.url} target="_blank" rel="noopener">View in Linear</a>;
}
```

#### `usePluginStream<T>(channel, options?)`

Se suscribe a un flujo de eventos en tiempo real enviado por el worker del plugin vía SSE. El worker envía eventos con `ctx.streams.emit(channel, event)` y el hook los recibe a medida que llegan. Devuelve `{ events, lastEvent, connecting, connected, error, close }`.

```tsx
import { usePluginStream } from "@paperclipai/plugin-sdk/ui";

interface ChatToken {
  text: string;
}

export function ChatMessages({ context }: PluginWidgetProps) {
  const { events, connected, close } = usePluginStream<ChatToken>("chat-stream", {
    companyId: context.companyId ?? undefined,
  });

  return (
    <div>
      {events.map((e, i) => <span key={i}>{e.text}</span>)}
      {connected && <span className="pulse" />}
      <button onClick={close}>Stop</button>
    </div>
  );
}
```

La conexión SSE apunta a `GET /api/plugins/:pluginId/bridge/stream/:channel?companyId=...`. El puente del host gestiona el ciclo de vida del EventSource; `close()` termina la conexión.

### Nota sobre la autoría de UI

El host actual **aún no** ofrece a los plugins una biblioteca real de componentes compartidos. Usa componentes React normales, tu propio CSS o tus propios primitivos de diseño pequeños dentro del paquete del plugin.

### Props de los componentes de slot

Cada tipo de slot recibe un objeto de props tipado con `context: PluginHostContext`. Importa desde `@paperclipai/plugin-sdk/ui`.

| Tipo de slot | Interfaz de props | extras de `context` |
|-----------|----------------|------------------|
| `page` | `PluginPageProps` | — |
| `sidebar` | `PluginSidebarProps` | — |
| `settingsPage` | `PluginSettingsPageProps` | — |
| `dashboardWidget` | `PluginWidgetProps` | — |
| `globalToolbarButton` | `PluginGlobalToolbarButtonProps` | — |
| `detailTab` | `PluginDetailTabProps` | `entityId: string`, `entityType: string` |
| `toolbarButton` | `PluginToolbarButtonProps` | `entityId: string`, `entityType: string` |
| `commentAnnotation` | `PluginCommentAnnotationProps` | `entityId: string`, `entityType: "comment"`, `parentEntityId: string`, `projectId`, `companyPrefix` |
| `commentContextMenuItem` | `PluginCommentContextMenuItemProps` | `entityId: string`, `entityType: "comment"`, `parentEntityId: string`, `projectId`, `companyPrefix` |
| `projectSidebarItem` | `PluginProjectSidebarItemProps` | `entityId: string`, `entityType: "project"` |

Ejemplo de pestaña de detalle con contexto de entidad:

```tsx
import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";

export function AgentMetricsTab({ context }: PluginDetailTabProps) {
  const { data, loading } = usePluginData<Record<string, string>>("agent-metrics", {
    agentId: context.entityId,
    companyId: context.companyId,
  });

  if (loading) return <div>Loading…</div>;
  if (!data) return <p>No metrics available.</p>;

  return (
    <dl>
      {Object.entries(data).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

## Superficies de lanzadores y modales

V1 no proporciona un slot `modal` dedicado. Los plugins pueden:

- declarar puntos de montaje de UI concretos en `ui.slots`
- declarar puntos de entrada renderizados por el host en `ui.launchers`

Las zonas de colocación de lanzadores soportadas actualmente reflejan las principales superficies del host, como `projectSidebarItem`, `globalToolbarButton`, `toolbarButton`, `detailTab`, `settingsPage` y `contextMenuItem`. Los plugins aún pueden abrir su propio modal local desde esos puntos de entrada cuando sea necesario.

Ejemplo de lanzador declarativo:

```json
{
  "ui": {
    "launchers": [
      {
        "id": "sync-project",
        "displayName": "Sync",
        "placementZone": "toolbarButton",
        "entityTypes": ["project"],
        "action": {
          "type": "openDrawer",
          "target": "sync-project"
        },
        "render": {
          "environment": "hostOverlay",
          "bounds": "wide"
        }
      }
    ]
  }
}
```

El host devuelve los metadatos de lanzadores desde `GET /api/plugins/ui-contributions` junto con las declaraciones de slots.

Cuando un lanzador abre un overlay o página propiedad del host, `useHostContext()`,
`usePluginData()` y `usePluginAction()` reciben el
`renderEnvironment` actual a través del puente. Úsalo para adaptar la UI de modal compacta frente a
diseños de página completa sin agregar análisis de rutas personalizado en el plugin.

## Elemento de la barra lateral del proyecto

Los plugins pueden agregar un enlace bajo cada proyecto en la barra lateral mediante el slot `projectSidebarItem`. Este es el patrón de lanzador basado en slots recomendado para flujos de trabajo con alcance de proyecto, porque puede enlazar en profundidad a una pestaña de plugin más rica. El componente se renderiza una vez por proyecto con el id de ese proyecto en `context.entityId`. Declara el slot y la capacidad en tu manifiesto:

```json
{
  "ui": {
    "slots": [
      {
        "type": "projectSidebarItem",
        "id": "files",
        "displayName": "Files",
        "exportName": "FilesLink",
        "entityTypes": ["project"]
      }
    ]
  },
  "capabilities": ["ui.sidebar.register", "ui.detailTab.register"]
}
```

Componente React mínimo que enlaza a la pestaña de plugin del proyecto (consulta las pestañas de detalle de proyecto en la especificación):

```tsx
import type { PluginProjectSidebarItemProps } from "@paperclipai/plugin-sdk/ui";

export function FilesLink({ context }: PluginProjectSidebarItemProps) {
  const projectId = context.entityId;
  const prefix = context.companyPrefix ? `/${context.companyPrefix}` : "";
  const projectRef = projectId; // or resolve from host; entityId is project id
  return (
    <a href={`${prefix}/projects/${projectRef}?tab=plugin:your-plugin:files`}>
      Files
    </a>
  );
}
```

Usa `order` opcional en el slot para ordenar entre otros elementos de la barra lateral del proyecto. Consulta §19.5.1 en la especificación del plugin y las pestañas de detalle de proyecto del plugin (§19.3) para el flujo completo.

## Lanzador de barra de herramientas con un modal local

Hay dos tipos de slot de barra de herramientas disponibles según dónde deba aparecer el botón:

- **`globalToolbarButton`** — se renderiza en la barra superior en todas las páginas, con alcance de empresa. Sin contexto de entidad. Úsalo para acciones a nivel de espacio de trabajo.
- **`toolbarButton`** — se renderiza en las páginas de detalle de entidad (proyecto, issue, etc.). Recibe `entityId` y `entityType`. Declara `entityTypes` para controlar en qué páginas aparece el botón.

Para acciones de corta duración, monta el tipo de slot adecuado y abre un modal propio del plugin dentro del componente. Usa `useHostContext()` para limitar la acción a la empresa o entidad actual.

Ejemplo con alcance de proyecto (aparece solo en páginas de detalle de proyecto):

```json
{
  "ui": {
    "slots": [
      {
        "type": "toolbarButton",
        "id": "sync-toolbar-button",
        "displayName": "Sync",
        "exportName": "SyncToolbarButton",
        "entityTypes": ["project"]
      }
    ]
  },
  "capabilities": ["ui.action.register"]
}
```

```tsx
import { useState } from "react";
import {
  useHostContext,
  usePluginAction,
} from "@paperclipai/plugin-sdk/ui";

export function SyncToolbarButton() {
  const context = useHostContext();
  const syncProject = usePluginAction("sync-project");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function confirm() {
    if (!context.projectId) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await syncProject({ projectId: context.projectId });
      setOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Sync
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-background p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold">Sync this project?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Queue a sync for <code>{context.projectId}</code>.
            </p>
            {errorMessage ? (
              <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" onClick={() => void confirm()} disabled={submitting}>
                {submitting ? "Running…" : "Run sync"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
```

Prefiere pestañas y páginas enlazables para los flujos principales. Reserva los modales propios del plugin para confirmaciones, selectores y editores compactos.

## Transmisión en tiempo real (`ctx.streams`)

Los plugins pueden enviar eventos en tiempo real desde el worker a la UI usando eventos enviados por el servidor (SSE). Esto es útil para transmitir tokens de LLM, progreso de sincronización en vivo o cualquier dato basado en push.

### Lado del worker

En `setup()`, usa `ctx.streams` para abrir un canal, emitir eventos y cerrar cuando termines:

```ts
const plugin = definePlugin({
  async setup(ctx) {
    ctx.actions.register("chat", async (params) => {
      const companyId = params.companyId as string;
      ctx.streams.open("chat-stream", companyId);

      for await (const token of streamFromLLM(params.prompt as string)) {
        ctx.streams.emit("chat-stream", { text: token });
      }

      ctx.streams.close("chat-stream");
      return { ok: true };
    });
  },
});
```

**API:**

| Método | Descripción |
|--------|-------------|
| `ctx.streams.open(channel, companyId)` | Abre un canal de transmisión con nombre y lo asocia a una empresa. Envía una notificación `streams.open` al host. |
| `ctx.streams.emit(channel, event)` | Envía un evento al canal. El `companyId` se resuelve automáticamente desde la llamada `open()` previa. |
| `ctx.streams.close(channel)` | Cierra el canal y limpia el mapeo de empresa. Envía una notificación `streams.close`. |

Las notificaciones de transmisión son mensajes JSON-RPC de tipo «disparar y olvidar» (sin campo `id`). Se envían mediante `notifyHost()` de forma síncrona durante la ejecución del manejador.

### Lado de la UI

Usa el hook `usePluginStream` (consulta la [referencia de hooks](#usepluginstreamtchannel-options) más arriba) para suscribirte a eventos desde la UI.

### Arquitectura del lado del host

El host mantiene un `PluginStreamBus` en memoria que distribuye las notificaciones del worker a los clientes SSE conectados:

1. El worker emite la notificación `streams.emit` vía stdout
2. El host (`plugin-worker-manager`) recibe la notificación y la publica en `PluginStreamBus`
3. El endpoint SSE (`GET /api/plugins/:pluginId/bridge/stream/:channel?companyId=...`) se suscribe al bus y escribe los eventos en la respuesta

El bus se indexa por `pluginId:channel:companyId`, así que múltiples clientes de UI pueden suscribirse a la misma transmisión de forma independiente.

### Transmisión de respuestas del agente a la UI

`ctx.streams` y `ctx.agents.sessions` son complementarios. El worker se sitúa entre ambos, retransmitiendo eventos del agente al navegador en tiempo real:

```
UI ──usePluginAction──▶ Worker ──sessions.sendMessage──▶ Agent
UI ◀──usePluginStream── Worker ◀──onEvent callback────── Agent
```

El agente no sabe nada de transmisiones: el worker decide qué retransmitir. Codifica el ID del agente en el nombre del canal para limitar las transmisiones por agente.

**Worker:**

```ts
ctx.actions.register("ask-agent", async (params) => {
  const { agentId, companyId, prompt } = params as {
    agentId: string; companyId: string; prompt: string;
  };

  const channel = `agent:${agentId}`;
  ctx.streams.open(channel, companyId);

  const session = await ctx.agents.sessions.create(agentId, companyId);

  await ctx.agents.sessions.sendMessage(session.sessionId, companyId, {
    prompt,
    onEvent: (event) => {
      ctx.streams.emit(channel, {
        type: event.eventType,       // "chunk" | "done" | "error"
        text: event.message ?? "",
      });
    },
  });

  ctx.streams.close(channel);
  return { sessionId: session.sessionId };
});
```

**UI:**

```tsx
import { useState } from "react";
import { usePluginAction, usePluginStream } from "@paperclipai/plugin-sdk/ui";

interface AgentEvent {
  type: "chunk" | "done" | "error";
  text: string;
}

export function AgentChat({ agentId, companyId }: { agentId: string; companyId: string }) {
  const askAgent = usePluginAction("ask-agent");
  const { events, connected, close } = usePluginStream<AgentEvent>(`agent:${agentId}`, { companyId });
  const [prompt, setPrompt] = useState("");

  async function send() {
    setPrompt("");
    await askAgent({ agentId, companyId, prompt });
  }

  return (
    <div>
      <div>{events.filter(e => e.type === "chunk").map((e, i) => <span key={i}>{e.text}</span>)}</div>
      <input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button onClick={send}>Send</button>
      {connected && <button onClick={close}>Stop</button>}
    </div>
  );
}
```

## Sesiones de agente (chat bidireccional)

Los plugins pueden mantener sesiones conversacionales de múltiples turnos con agentes:

```ts
// Create a session
const session = await ctx.agents.sessions.create(agentId, companyId);

// Send a message and stream the response
await ctx.agents.sessions.sendMessage(session.sessionId, companyId, {
  prompt: "Help me triage this issue",
  onEvent: (event) => {
    if (event.eventType === "chunk") console.log(event.message);
    if (event.eventType === "done") console.log("Stream complete");
  },
});

// List active sessions
const sessions = await ctx.agents.sessions.list(agentId, companyId);

// Close when done
await ctx.agents.sessions.close(session.sessionId, companyId);
```

Requiere las capacidades: `agent.sessions.create`, `agent.sessions.list`, `agent.sessions.send`, `agent.sessions.close`.

Tipos exportados: `AgentSession`, `AgentSessionEvent`, `AgentSessionSendResult`, `PluginAgentSessionsClient`.

## Utilidades de pruebas

```ts
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import plugin from "../src/worker.js";
import manifest from "../src/manifest.js";

const harness = createTestHarness({ manifest });
await plugin.definition.setup(harness.ctx);
await harness.emit("issue.created", { issueId: "iss_1" }, { entityId: "iss_1", entityType: "issue" });
```

## Preajustes de empaquetadores

```ts
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });
// presets.esbuild.worker / presets.esbuild.manifest / presets.esbuild.ui
// presets.rollup.worker / presets.rollup.manifest / presets.rollup.ui
```

## Servidor de desarrollo local (eventos de hot-reload)

```bash
paperclip-plugin-dev-server --root . --ui-dir dist/ui --port 4177
```

O programáticamente:

```ts
import { startPluginDevServer } from "@paperclipai/plugin-sdk/dev-server";
const server = await startPluginDevServer({ rootDir: process.cwd() });
```

Endpoints del servidor de desarrollo:
- `GET /__paperclip__/health` devuelve `{ ok, rootDir, uiDir }`
- `GET /__paperclip__/events` transmite eventos SSE de `reload` cuando cambia la compilación de la UI
