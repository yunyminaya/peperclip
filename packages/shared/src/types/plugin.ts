import type {
  PluginStatus,
  PluginCategory,
  PluginCapability,
  PluginUiSlotType,
  PluginUiSlotEntityType,
  PluginStateScopeKind,
  PluginLauncherPlacementZone,
  PluginLauncherAction,
  PluginLauncherBounds,
  PluginLauncherRenderEnvironment,
} from "../constants.js";

// ---------------------------------------------------------------------------
// Marcador de posición de JSON Schema – los plugins declaran esquemas de config como JSON Schema
// ---------------------------------------------------------------------------

/**
 * Un objeto JSON Schema usado para esquemas de config de plugins y esquemas de parámetros de herramientas.
 * Los plugins los proveen como objetos JSON Schema compatibles simples.
 */
export type JsonSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Subtipos del manifiesto — declaraciones anidadas dentro de PaperclipPluginManifestV1
// ---------------------------------------------------------------------------

/**
 * Declara un trabajo programado que un plugin puede ejecutar.
 *
 * @see PLUGIN_SPEC.md §17 — Scheduled Jobs
 */
export interface PluginJobDeclaration {
  /** Identificador estable para este trabajo, único dentro del plugin. */
  jobKey: string;
  /** Nombre legible mostrado en la UI del operador. */
  displayName: string;
  /** Descripción opcional de lo que hace el trabajo. */
  description?: string;
  /** Expresión cron para la programación (p. ej. "star/15 star star star star" u "0 * * * *"). */
  schedule?: string;
}

/**
 * Declara un endpoint de webhook que el plugin puede recibir.
 * Ruta: `POST /api/plugins/:pluginId/webhooks/:endpointKey`
 *
 * @see PLUGIN_SPEC.md §18 — Webhooks
 */
export interface PluginWebhookDeclaration {
  /** Identificador estable para este endpoint, único dentro del plugin. */
  endpointKey: string;
  /** Nombre legible mostrado en la UI del operador. */
  displayName: string;
  /** Descripción opcional de lo que maneja este webhook. */
  description?: string;
}

/**
 * Declara una herramienta de agente aportada por el plugin. Las herramientas se agrupan
 * por ID de plugin en tiempo de ejecución (p. ej. `linear:search-issues`).
 *
 * Requiere la capacidad `agent.tools.register`.
 *
 * @see PLUGIN_SPEC.md §11 — Agent Tools
 */
export interface PluginToolDeclaration {
  /** Nombre de la herramienta, único dentro del plugin. Agrupado por ID de plugin en tiempo de ejecución. */
  name: string;
  /** Nombre legible mostrado a los agentes y en la UI. */
  displayName: string;
  /** Descripción provista al agente para que sepa cuándo usar esta herramienta. */
  description: string;
  /** JSON Schema que describe los parámetros de entrada de la herramienta. */
  parametersSchema: JsonSchema;
}

/**
 * Declara una ranura de extensión de UI que el plugin llena con un componente React.
 *
 * @see PLUGIN_SPEC.md §19 — UI Extension Model
 */
export interface PluginUiSlotDeclaration {
  /** El tipo de punto de montaje de UI (page, detailTab, taskDetailView, toolbarButton, etc.). */
  type: PluginUiSlotType;
  /** Identificador de ranura único dentro del plugin. */
  id: string;
  /** Nombre legible mostrado en la navegación o etiquetas de pestañas. */
  displayName: string;
  /** Qué nombre de exportación en el paquete de UI provee este componente. */
  exportName: string;
  /**
   * Objetivos de entidad para ranuras sensibles al contexto.
   * Requerido para `detailTab`, `taskDetailView` y `contextMenuItem`.
   */
  entityTypes?: PluginUiSlotEntityType[];
  /**
   * Segmento de ruta opcional con alcance de empresa para ranuras de página.
   * Ejemplo: `kitchensink` se convierte en `/:companyPrefix/kitchensink`.
   */
  routePath?: string;
  /**
   * Sugerencia de orden opcional dentro de una superficie de ranura. Los números menores aparecen primero.
   * Si se omite, usa el orden definido por el host.
   */
  order?: number;
}

/**
 * Describe la acción desencadenada por una superficie de lanzador de plugin.
 */
export interface PluginLauncherActionDeclaration {
  /** Qué tipo de comportamiento de lanzamiento debe realizar el host. */
  type: PluginLauncherAction;
  /**
   * Identificador o URL de destino estable. El significado depende de `type`
   * (por ejemplo una ruta, clave de pestaña, clave de acción o URL externa).
   */
  target: string;
  /** Parámetros arbitrarios opcionales pasados al destino. */
  params?: Record<string, unknown>;
}

/**
 * Metadatos de renderizado opcionales para el destino abierto por un lanzador.
 */
export interface PluginLauncherRenderDeclaration {
  /** Contenedor de alto nivel que el lanzador espera que el host use. */
  environment: PluginLauncherRenderEnvironment;
  /** Sugerencia de tamaño opcional para la superficie de destino. */
  bounds?: PluginLauncherBounds;
}

/**
 * Instantánea serializable en tiempo de ejecución del entorno de lanzador/contenedor del host.
 */
export interface PluginLauncherRenderContextSnapshot {
  /** El entorno de lanzador/contenedor actual seleccionado por el host. */
  environment: PluginLauncherRenderEnvironment | null;
  /** ID del lanzador que abrió esta superficie, si hay. */
  launcherId: string | null;
  /** Sugerencia de límites actual aplicada por el host para el entorno, si hay. */
  bounds: PluginLauncherBounds | null;
}

/**
 * Declara una superficie de lanzador de plugin independiente de la implementación de ranura de bajo nivel
 * que la monta.
 */
export interface PluginLauncherDeclaration {
  /** Identificador estable para este lanzador, único dentro del plugin. */
  id: string;
  /** Etiqueta legible mostrada para el lanzador. */
  displayName: string;
  /** Descripción opcional para documentación orientada al operador o futuras prestaciones de UI. */
  description?: string;
  /** Dónde en la UI del host debe colocarse este lanzador. */
  placementZone: PluginLauncherPlacementZone;
  /** Nombre de exportación opcional en el paquete de UI cuando el lanzador tiene UI personalizada. */
  exportName?: string;
  /**
   * Orientación de entidad opcional para zonas de lanzador sensibles al contexto.
   * Reutiliza la misma unión de entidades que las ranuras de UI por consistencia.
   */
  entityTypes?: PluginUiSlotEntityType[];
  /** Sugerencia de orden opcional dentro de la zona de colocación. */
  order?: number;
  /** Qué debe ocurrir cuando se activa el lanzador. */
  action: PluginLauncherActionDeclaration;
  /** Sugerencias de renderizado/contenedor opcionales para el destino lanzado. */
  render?: PluginLauncherRenderDeclaration;
}

/**
 * Requisito mínimo de semver para el host Paperclip.
 *
 * El host debe rechazar la instalación cuando su versión en ejecución sea menor que el mínimo declarado.
 */
export type PluginMinimumHostVersion = string;

/**
 * Agrupa declaraciones de UI de plugin servidas desde la raíz del paquete de UI compartido
 * declarada en `entrypoints.ui`.
 */
export interface PluginUiDeclaration {
  /** Ranuras de extensión de UI que este plugin llena. */
  slots?: PluginUiSlotDeclaration[];
  /** Metadatos declarativos de lanzador para puntos de entrada de plugin montados por el host. */
  launchers?: PluginLauncherDeclaration[];
}

// ---------------------------------------------------------------------------
// Manifiesto de plugin V1
// ---------------------------------------------------------------------------

/**
 * La forma del manifiesto que todo paquete de plugin debe exportar.
 * Ver PLUGIN_SPEC.md §10.1 para la definición normativa.
 */
export interface PaperclipPluginManifestV1 {
  /** Identificador de plugin globalmente único (p. ej. `"acme.linear-sync"`). Debe ser alfanumérico en minúsculas con puntos, guiones o guiones bajos. */
  id: string;
  /** Versión de la API de plugins. Debe ser `1` para la especificación actual. */
  apiVersion: 1;
  /** Versión semver del paquete de plugin (p. ej. `"1.2.0"`). */
  version: string;
  /** Nombre legible (máx. 100 caracteres). */
  displayName: string;
  /** Descripción corta (máx. 500 caracteres). */
  description: string;
  /** Nombre del autor (máx. 200 caracteres). Puede incluir correo entre paréntesis angulares, p. ej. `"Jane Doe <jane@example.com>"`. */
  author: string;
  /** Una o más categorías que clasifican este plugin. */
  categories: PluginCategory[];
  /**
   * Versión mínima de host requerida (límite inferior semver).
   * Campo genérico preferido para manifiestos nuevos.
   */
  minimumHostVersion?: PluginMinimumHostVersion;
  /**
   * Alias heredado de `minimumHostVersion`.
   * Se conserva por compatibilidad hacia atrás con manifiestos y documentos existentes.
   */
  minimumPaperclipVersion?: PluginMinimumHostVersion;
  /** Capacidades que este plugin requiere del host. Se aplican en tiempo de ejecución. */
  capabilities: PluginCapability[];
  /** Rutas de puntos de entrada relativas a la raíz del paquete. */
  entrypoints: {
    /** Ruta al punto de entrada del worker (requerida). */
    worker: string;
    /** Ruta al directorio del paquete de UI (requerida cuando se declara `ui.slots`). */
    ui?: string;
  };
  /** JSON Schema para la configuración de instancia editable por el operador. */
  instanceConfigSchema?: JsonSchema;
  /** Trabajos programados que este plugin declara. Requiere la capacidad `jobs.schedule`. */
  jobs?: PluginJobDeclaration[];
  /** Endpoints de webhook que este plugin declara. Requiere la capacidad `webhooks.receive`. */
  webhooks?: PluginWebhookDeclaration[];
  /** Herramientas de agente que este plugin aporta. Requiere la capacidad `agent.tools.register`. */
  tools?: PluginToolDeclaration[];
  /**
   * Declaraciones de lanzador heredadas de nivel superior.
   * Prefiere `ui.launchers` para manifiestos nuevos.
   */
  launchers?: PluginLauncherDeclaration[];
  /** Declaraciones del paquete de UI. Requiere `entrypoints.ui` cuando se llena. */
  ui?: PluginUiDeclaration;
}

// ---------------------------------------------------------------------------
// Registro de plugin – representa una fila en la tabla `plugins`
// ---------------------------------------------------------------------------

/**
 * Tipo de dominio para un plugin instalado según se persiste en la tabla `plugins`.
 * Ver PLUGIN_SPEC.md §21.3 para la definición del esquema.
 */
export interface PluginRecord {
  /** Clave primaria UUID. */
  id: string;
  /** Clave única derivada de `manifest.id`. Usada para búsquedas. */
  pluginKey: string;
  /** Nombre del paquete npm (p. ej. `"@acme/plugin-linear"`). */
  packageName: string;
  /** Versión semver instalada. */
  version: string;
  /** Versión de la API de plugins del manifiesto. */
  apiVersion: number;
  /** Categorías del plugin del manifiesto. */
  categories: PluginCategory[];
  /** Instantánea completa del manifiesto persistida al momento de instalar/actualizar. */
  manifestJson: PaperclipPluginManifestV1;
  /** Estado actual del ciclo de vida. */
  status: PluginStatus;
  /** Orden de carga determinista (null si aún no se asignó). */
  installOrder: number | null;
  /** Ruta de paquete resuelta para instalaciones de ruta local; usada para encontrar el punto de entrada del worker. */
  packagePath: string | null;
  /** Mensaje de error más reciente, o motivo de desactivación provisto por el operador. */
  lastError: string | null;
  /** Marca de tiempo de cuando se instaló el plugin por primera vez. */
  installedAt: Date;
  /** Marca de tiempo del cambio de estado o metadatos más reciente. */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Estado del plugin – representa una fila en la tabla `plugin_state`
// ---------------------------------------------------------------------------

/**
 * Tipo de dominio para una entrada clave-valor con alcance en la tabla `plugin_state`.
 * Los plugins leen y escriben estas entradas mediante `ctx.state` en el SDK.
 *
 * La clave compuesta de cinco partes `(pluginId, scopeKind, scopeId, namespace, stateKey)`
 * identifica de forma única una entrada de estado.
 *
 * @see PLUGIN_SPEC.md §21.3 — `plugin_state`
 */
export interface PluginStateRecord {
  /** Clave primaria UUID. */
  id: string;
  /** FK a `plugins.id`. */
  pluginId: string;
  /** Granularidad del alcance. */
  scopeKind: PluginStateScopeKind;
  /**
   * Identificador UUID o de texto para el objeto con alcance.
   * `null` para el alcance `instance` (sin entidad asociada).
   */
  scopeId: string | null;
  /**
   * Subespacio de nombres dentro del alcance para evitar colisiones de claves.
   * Por defecto `"default"` si el plugin no lo define explícitamente.
   */
  namespace: string;
  /** La clave de esta entrada de estado dentro del espacio de nombres. */
  stateKey: string;
  /** Valor JSON almacenado. Puede ser cualquier tipo serializable a JSON. */
  valueJson: unknown;
  /** Marca de tiempo de la escritura más reciente. */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Config del plugin – representa una fila en la tabla `plugin_config`
// ---------------------------------------------------------------------------

/**
 * Tipo de dominio para la configuración de instancia de un plugin según se persiste en la
 * tabla `plugin_config`.
 * Ver PLUGIN_SPEC.md §21.3 para la definición del esquema.
 */
export interface PluginConfig {
  /** Clave primaria UUID. */
  id: string;
  /** FK a `plugins.id`. Única — cada plugin tiene como máximo una fila de config. */
  pluginId: string;
  /** Valores de configuración provistos por el operador (validados contra `instanceConfigSchema`). */
  configJson: Record<string, unknown>;
  /** Error de validación de config más reciente, si hay. */
  lastError: string | null;
  /** Marca de tiempo de cuando se creó la fila de config. */
  createdAt: Date;
  /** Marca de tiempo de la actualización de config más reciente. */
  updatedAt: Date;
}

/**
 * Filtro de consulta para `ctx.entities.list`.
 */
export interface PluginEntityQuery {
  /** Filtro opcional por tipo de entidad (p. ej. 'project', 'issue'). */
  entityType?: string;
  /** Filtro opcional por identificador de sistema externo. */
  externalId?: string;
  /** Número máximo de registros a devolver. Por defecto 100. */
  limit?: number;
  /** Número de registros a omitir. Por defecto 0. */
  offset?: number;
}

// ---------------------------------------------------------------------------
// Entidad de plugin – representa una fila en la tabla `plugin_entities`
// ---------------------------------------------------------------------------

/**
 * Tipo de dominio para un mapeo de entidad externa según se persiste en la tabla `plugin_entities`.
 */
export interface PluginEntityRecord {
  /** Clave primaria UUID. */
  id: string;
  /** FK a `plugins.id`. */
  pluginId: string;
  /** Tipo de entidad definido por el plugin. */
  entityType: string;
  /** Alcance donde vive esta entidad. */
  scopeKind: PluginStateScopeKind;
  /** Identificador UUID o de texto para el objeto con alcance. */
  scopeId: string | null;
  /** Identificador externo en el sistema remoto. */
  externalId: string | null;
  /** Título legible. */
  title: string | null;
  /** Cadena de estado opcional. */
  status: string | null;
  /** Blob completo de datos de la entidad. */
  data: Record<string, unknown>;
  /** Marca de tiempo de creación ISO 8601. */
  createdAt: Date;
  /** Marca de tiempo de última actualización ISO 8601. */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Trabajo de plugin – representa una fila en la tabla `plugin_jobs`
// ---------------------------------------------------------------------------

/**
 * Tipo de dominio para un trabajo de plugin registrado según se persiste en la tabla `plugin_jobs`.
 */
export interface PluginJobRecord {
  /** Clave primaria UUID. */
  id: string;
  /** FK a `plugins.id`. */
  pluginId: string;
  /** Clave de trabajo que coincide con la declaración del manifiesto. */
  jobKey: string;
  /** Expresión cron para la programación. */
  schedule: string;
  /** Estado actual del trabajo. */
  status: "active" | "paused" | "failed";
  /** Última vez que se ejecutó el trabajo. */
  lastRunAt: Date | null;
  /** Próxima hora de ejecución programada. */
  nextRunAt: Date | null;
  /** Marca de tiempo de creación ISO 8601. */
  createdAt: Date;
  /** Marca de tiempo de última actualización ISO 8601. */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Ejecución de trabajo de plugin – representa una fila en la tabla `plugin_job_runs`
// ---------------------------------------------------------------------------

/**
 * Tipo de dominio para un registro de historial de ejecución de trabajo.
 */
export interface PluginJobRunRecord {
  /** Clave primaria UUID. */
  id: string;
  /** FK a `plugin_jobs.id`. */
  jobId: string;
  /** FK a `plugins.id`. */
  pluginId: string;
  /** Qué desencadenó esta ejecución. */
  trigger: "schedule" | "manual" | "retry";
  /** Estado actual de la ejecución. */
  status: "pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
  /** Duración de la ejecución en milisegundos. */
  durationMs: number | null;
  /** Mensaje de error si la ejecución falló. */
  error: string | null;
  /** Registros de la ejecución. */
  logs: string[];
  /** Marca de tiempo de inicio ISO 8601. */
  startedAt: Date | null;
  /** Marca de tiempo de fin ISO 8601. */
  finishedAt: Date | null;
  /** Marca de tiempo de creación ISO 8601. */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Entrega de webhook de plugin – representa una fila en la tabla `plugin_webhook_deliveries`
// ---------------------------------------------------------------------------

/**
 * Tipo de dominio para un registro de entrega de webhook entrante.
 */
export interface PluginWebhookDeliveryRecord {
  /** Clave primaria UUID. */
  id: string;
  /** FK a `plugins.id`. */
  pluginId: string;
  /** Clave de endpoint de webhook que coincide con el manifiesto. */
  webhookKey: string;
  /** Identificador externo en el sistema remoto. */
  externalId: string | null;
  /** Estado de la entrega. */
  status: "pending" | "success" | "failed";
  /** Duración del procesamiento en milisegundos. */
  durationMs: number | null;
  /** Mensaje de error si el procesamiento falló. */
  error: string | null;
  /** Payload del webhook. */
  payload: Record<string, unknown>;
  /** Encabezados del webhook. */
  headers: Record<string, string>;
  /** Marca de tiempo de inicio ISO 8601. */
  startedAt: Date | null;
  /** Marca de tiempo de fin ISO 8601. */
  finishedAt: Date | null;
  /** Marca de tiempo de creación ISO 8601. */
  createdAt: Date;
}
