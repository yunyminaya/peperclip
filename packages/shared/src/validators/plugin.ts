import { z } from "zod";
import {
  PLUGIN_STATUSES,
  PLUGIN_CATEGORIES,
  PLUGIN_CAPABILITIES,
  PLUGIN_UI_SLOT_TYPES,
  PLUGIN_UI_SLOT_ENTITY_TYPES,
  PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS,
  PLUGIN_LAUNCHER_PLACEMENT_ZONES,
  PLUGIN_LAUNCHER_ACTIONS,
  PLUGIN_LAUNCHER_BOUNDS,
  PLUGIN_LAUNCHER_RENDER_ENVIRONMENTS,
  PLUGIN_STATE_SCOPE_KINDS,
} from "../constants.js";

// ---------------------------------------------------------------------------
// Marcador de posición de JSON Schema – un validador permisivo para objetos JSON Schema
// ---------------------------------------------------------------------------

/**
 * Validador permisivo para objetos JSON Schema. Acepta cualquier `Record<string, unknown>`
 * que contenga al menos un `type`, `$ref` o palabra clave de composición (`oneOf`/`anyOf`/`allOf`).
 * También se aceptan objetos vacíos.
 *
 * Usado para validar los campos `instanceConfigSchema` y `parametersSchema` en el
 * manifiesto del plugin sin analizar JSON Schema por completo.
 *
 * @see PLUGIN_SPEC.md §10.1 — Manifest shape
 */
export const jsonSchemaSchema = z.record(z.unknown()).refine(
  (val) => {
    // Debe tener un campo "type" si no está vacío, o ser un objeto JSON Schema válido
    if (Object.keys(val).length === 0) return true;
    return typeof val.type === "string" || val.$ref !== undefined || val.oneOf !== undefined || val.anyOf !== undefined || val.allOf !== undefined;
  },
  { message: "Debe ser un objeto JSON Schema válido (requiere al menos 'type', '$ref' o una palabra clave de composición)" },
);

// ---------------------------------------------------------------------------
// Esquemas de subtipos del manifiesto
// ---------------------------------------------------------------------------

/**
 * Valida un {@link PluginJobDeclaration} — un trabajo programado declarado en el
 * manifiesto del plugin. Requiere `jobKey` y `displayName`; `description` y
 * `schedule` (expresión cron) son opcionales.
 *
 * @see PLUGIN_SPEC.md §17 — Scheduled Jobs
 */
/**
 * Valida que una expresión cron tenga exactamente 5 campos separados por espacios,
 * cada uno con solo caracteres cron válidos (dígitos, *, /, -, ,).
 *
 * Tokens válidos por campo: *, N, N-M, N/S, * /S, N-M/S y listas separadas por comas.
 */
const CRON_FIELD_PATTERN = /^(\*(?:\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:\/[0-9]+)?)(?:,(\*(?:\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:\/[0-9]+)?))*$/;

function isValidCronExpression(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed) return false;
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f) => CRON_FIELD_PATTERN.test(f));
}

export const pluginJobDeclarationSchema = z.object({
  jobKey: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  schedule: z.string().refine(
    (val) => isValidCronExpression(val),
    { message: "schedule debe ser una expresión cron válida de 5 campos (p. ej. '*/15 * * * *')" },
  ).optional(),
});

export type PluginJobDeclarationInput = z.infer<typeof pluginJobDeclarationSchema>;

/**
 * Valida un {@link PluginWebhookDeclaration} — un endpoint de webhook declarado
 * en el manifiesto del plugin. Requiere `endpointKey` y `displayName`.
 *
 * @see PLUGIN_SPEC.md §18 — Webhooks
 */
export const pluginWebhookDeclarationSchema = z.object({
  endpointKey: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
});

export type PluginWebhookDeclarationInput = z.infer<typeof pluginWebhookDeclarationSchema>;

/**
 * Valida un {@link PluginToolDeclaration} — una herramienta de agente aportada por el
 * plugin. Requiere `name`, `displayName`, `description` y un `parametersSchema` válido.
 * Requiere la capacidad `agent.tools.register`.
 *
 * @see PLUGIN_SPEC.md §11 — Agent Tools
 */
export const pluginToolDeclarationSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  parametersSchema: jsonSchemaSchema,
});

export type PluginToolDeclarationInput = z.infer<typeof pluginToolDeclarationSchema>;

/**
 * Valida un {@link PluginUiSlotDeclaration} — una ranura de extensión de UI que el plugin
 * llena con un componente React. Incluye chequeos `superRefine` para requisitos
 * específicos de ranura, como `entityTypes` para ranuras sensibles al contexto.
 *
 * @see PLUGIN_SPEC.md §19 — UI Extension Model
 */
export const pluginUiSlotDeclarationSchema = z.object({
  type: z.enum(PLUGIN_UI_SLOT_TYPES),
  id: z.string().min(1),
  displayName: z.string().min(1),
  exportName: z.string().min(1),
  entityTypes: z.array(z.enum(PLUGIN_UI_SLOT_ENTITY_TYPES)).optional(),
  routePath: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: "routePath debe ser un slug de un solo segmento en minúsculas (letras, números, guiones)",
  }).optional(),
  order: z.number().int().optional(),
}).superRefine((value, ctx) => {
  // las ranuras sensibles al contexto requieren orientación de entidad explícita.
  const entityScopedTypes = ["detailTab", "taskDetailView", "contextMenuItem", "commentAnnotation", "commentContextMenuItem", "projectSidebarItem"];
  if (
    entityScopedTypes.includes(value.type)
    && (!value.entityTypes || value.entityTypes.length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `los slots ${value.type} requieren al menos un entityType`,
      path: ["entityTypes"],
    });
  }
  // projectSidebarItem solo tiene sentido para entityType "project".
  if (value.type === "projectSidebarItem" && value.entityTypes && !value.entityTypes.includes("project")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los slots projectSidebarItem requieren que entityTypes incluya \"project\"",
      path: ["entityTypes"],
    });
  }
  // commentAnnotation solo tiene sentido para entityType "comment".
  if (value.type === "commentAnnotation" && value.entityTypes && !value.entityTypes.includes("comment")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los slots commentAnnotation requieren que entityTypes incluya \"comment\"",
      path: ["entityTypes"],
    });
  }
  // commentContextMenuItem solo tiene sentido para entityType "comment".
  if (value.type === "commentContextMenuItem" && value.entityTypes && !value.entityTypes.includes("comment")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los slots commentContextMenuItem requieren que entityTypes incluya \"comment\"",
      path: ["entityTypes"],
    });
  }
  if (value.routePath && value.type !== "page") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "routePath solo es compatible con slots page",
      path: ["routePath"],
    });
  }
  if (value.routePath && PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS.includes(value.routePath as (typeof PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS)[number])) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `routePath "${value.routePath}" está reservado por el host`,
      path: ["routePath"],
    });
  }
});

export type PluginUiSlotDeclarationInput = z.infer<typeof pluginUiSlotDeclarationSchema>;

const entityScopedLauncherPlacementZones = [
  "detailTab",
  "taskDetailView",
  "contextMenuItem",
  "commentAnnotation",
  "commentContextMenuItem",
  "projectSidebarItem",
] as const;

const launcherBoundsByEnvironment: Record<
  (typeof PLUGIN_LAUNCHER_RENDER_ENVIRONMENTS)[number],
  readonly (typeof PLUGIN_LAUNCHER_BOUNDS)[number][]
> = {
  hostInline: ["inline", "compact", "default"],
  hostOverlay: ["compact", "default", "wide", "full"],
  hostRoute: ["default", "wide", "full"],
  external: [],
  iframe: ["compact", "default", "wide", "full"],
};

/**
 * Valida el payload de acción para un lanzador de plugin declarativo.
 */
export const pluginLauncherActionDeclarationSchema = z.object({
  type: z.enum(PLUGIN_LAUNCHER_ACTIONS),
  target: z.string().min(1),
  params: z.record(z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (value.type === "performAction" && value.target.includes("/")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los lanzadores performAction deben apuntar a una clave de acción, no a una ruta o URL",
      path: ["target"],
    });
  }

  if (value.type === "navigate" && /^https?:\/\//.test(value.target)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los lanzadores navigate deben apuntar a una ruta del host, no a una URL absoluta",
      path: ["target"],
    });
  }
});

export type PluginLauncherActionDeclarationInput =
  z.infer<typeof pluginLauncherActionDeclarationSchema>;

/**
 * Valida sugerencias de renderizado opcionales para un destino de lanzador de plugin.
 */
export const pluginLauncherRenderDeclarationSchema = z.object({
  environment: z.enum(PLUGIN_LAUNCHER_RENDER_ENVIRONMENTS),
  bounds: z.enum(PLUGIN_LAUNCHER_BOUNDS).optional(),
}).superRefine((value, ctx) => {
  if (!value.bounds) {
    return;
  }

  const supportedBounds = launcherBoundsByEnvironment[value.environment];
  if (!supportedBounds.includes(value.bounds)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `bounds "${value.bounds}" no es compatible con el entorno de renderizado "${value.environment}"`,
      path: ["bounds"],
    });
  }
});

export type PluginLauncherRenderDeclarationInput =
  z.infer<typeof pluginLauncherRenderDeclarationSchema>;

/**
 * Valida metadatos de lanzador declarativos en un manifiesto de plugin.
 */
export const pluginLauncherDeclarationSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  placementZone: z.enum(PLUGIN_LAUNCHER_PLACEMENT_ZONES),
  exportName: z.string().min(1).optional(),
  entityTypes: z.array(z.enum(PLUGIN_UI_SLOT_ENTITY_TYPES)).optional(),
  order: z.number().int().optional(),
  action: pluginLauncherActionDeclarationSchema,
  render: pluginLauncherRenderDeclarationSchema.optional(),
}).superRefine((value, ctx) => {
  if (
    entityScopedLauncherPlacementZones.some((zone) => zone === value.placementZone)
    && (!value.entityTypes || value.entityTypes.length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `los lanzadores ${value.placementZone} requieren al menos un entityType`,
      path: ["entityTypes"],
    });
  }

  if (
    value.placementZone === "projectSidebarItem"
    && value.entityTypes
    && !value.entityTypes.includes("project")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los lanzadores projectSidebarItem requieren que entityTypes incluya \"project\"",
      path: ["entityTypes"],
    });
  }

  if (value.action.type === "performAction" && value.render) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los lanzadores performAction no pueden declarar sugerencias de renderizado",
      path: ["render"],
    });
  }

  if (
    ["openModal", "openDrawer", "openPopover"].includes(value.action.type)
    && !value.render
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `los lanzadores ${value.action.type} requieren metadatos de renderizado`,
      path: ["render"],
    });
  }

  if (value.action.type === "openModal" && value.render?.environment === "hostInline") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los lanzadores openModal no pueden usar el entorno de renderizado hostInline",
      path: ["render", "environment"],
    });
  }

  if (
    value.action.type === "openDrawer"
    && value.render
    && !["hostOverlay", "iframe"].includes(value.render.environment)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los lanzadores openDrawer deben usar los entornos de renderizado hostOverlay o iframe",
      path: ["render", "environment"],
    });
  }

  if (value.action.type === "openPopover" && value.render?.environment === "hostRoute") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "los lanzadores openPopover no pueden usar el entorno de renderizado hostRoute",
      path: ["render", "environment"],
    });
  }
});

export type PluginLauncherDeclarationInput = z.infer<typeof pluginLauncherDeclarationSchema>;

// ---------------------------------------------------------------------------
// Esquema del manifiesto de plugin V1
// ---------------------------------------------------------------------------

/**
 * Esquema Zod para {@link PaperclipPluginManifestV1} — el validador completo en
 * tiempo de ejecución para manifiestos de plugin leídos al momento de instalar.
 *
 * Restricciones por campo (ver PLUGIN_SPEC.md §10.1 para las reglas normativas):
 *
 * | Field                    | Type       | Constraints                                  |
 * |--------------------------|------------|----------------------------------------------|
 * | `id`                     | string     | `^[a-z0-9][a-z0-9._-]*$`                    |
 * | `apiVersion`             | literal 1  | debe ser igual a `PLUGIN_API_VERSION`        |
 * | `version`                | string     | semver (`\d+\.\d+\.\d+`)                    |
 * | `displayName`            | string     | 1–100 caracteres                             |
 * | `description`            | string     | 1–500 caracteres                             |
 * | `author`                 | string     | 1–200 caracteres                             |
 * | `categories`             | enum[]     | al menos uno; valores de PLUGIN_CATEGORIES   |
 * | `minimumHostVersion`     | string?    | límite inferior semver, sin `v` inicial      |
 * | `minimumPaperclipVersion`| string?    | alias heredado de `minimumHostVersion`       |
 * | `capabilities`           | enum[]     | al menos uno; valores de PLUGIN_CAPABILITIES |
 * | `entrypoints.worker`     | string     | mín. 1 carácter                              |
 * | `entrypoints.ui`         | string?    | requerido cuando se declara `ui.slots`       |
 *
 * Reglas entre campos aplicadas mediante `superRefine`:
 * - `entrypoints.ui` requerido cuando se declara `ui.slots`
 * - capacidad `agent.tools.register` requerida cuando se declara `tools`
 * - capacidad `jobs.schedule` requerida cuando se declara `jobs`
 * - capacidad `webhooks.receive` requerida cuando se declara `webhooks`
 * - los valores duplicados de `jobs[].jobKey` se rechazan
 * - los valores duplicados de `webhooks[].endpointKey` se rechazan
 * - los valores duplicados de `tools[].name` se rechazan
 * - los valores duplicados de `ui.slots[].id` se rechazan
 *
 * @see PLUGIN_SPEC.md §10.1 — Manifest shape
 * @see {@link PaperclipPluginManifestV1} — el tipo TypeScript inferido
 */
export const pluginManifestV1Schema = z.object({
  id: z.string().min(1).regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "El id del plugin debe empezar con un alfanumérico en minúsculas y contener solo letras minúsculas, dígitos, puntos, guiones o guiones bajos",
  ),
  apiVersion: z.literal(1),
  version: z.string().min(1).regex(
    /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
    "La versión debe seguir semver (p. ej. 1.0.0 o 1.0.0-beta.1)",
  ),
  displayName: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  author: z.string().min(1).max(200),
  categories: z.array(z.enum(PLUGIN_CATEGORIES)).min(1),
  minimumHostVersion: z.string().regex(
    /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
    "minimumHostVersion debe seguir semver (p. ej. 1.0.0)",
  ).optional(),
  minimumPaperclipVersion: z.string().regex(
    /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
    "minimumPaperclipVersion debe seguir semver (p. ej. 1.0.0)",
  ).optional(),
  capabilities: z.array(z.enum(PLUGIN_CAPABILITIES)).min(1),
  entrypoints: z.object({
    worker: z.string().min(1),
    ui: z.string().min(1).optional(),
  }),
  instanceConfigSchema: jsonSchemaSchema.optional(),
  jobs: z.array(pluginJobDeclarationSchema).optional(),
  webhooks: z.array(pluginWebhookDeclarationSchema).optional(),
  tools: z.array(pluginToolDeclarationSchema).optional(),
  launchers: z.array(pluginLauncherDeclarationSchema).optional(),
  ui: z.object({
    slots: z.array(pluginUiSlotDeclarationSchema).min(1).optional(),
    launchers: z.array(pluginLauncherDeclarationSchema).optional(),
  }).optional(),
}).superRefine((manifest, ctx) => {
  // ── Consistencia entrypoint ↔ ranura de UI ──────────────────────────────
  // Los plugins que declaran ranuras de UI también deben declarar un entrypoint de UI para que el
  // host sepa de dónde cargar el paquete (PLUGIN_SPEC.md §10.1).
  const hasUiSlots = (manifest.ui?.slots?.length ?? 0) > 0;
  const hasUiLaunchers = (manifest.ui?.launchers?.length ?? 0) > 0;
  if ((hasUiSlots || hasUiLaunchers) && !manifest.entrypoints.ui) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "entrypoints.ui es obligatorio cuando se declaran ui.slots o ui.launchers",
      path: ["entrypoints", "ui"],
    });
  }

  if (
    manifest.minimumHostVersion
    && manifest.minimumPaperclipVersion
    && manifest.minimumHostVersion !== manifest.minimumPaperclipVersion
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minimumHostVersion y minimumPaperclipVersion deben coincidir cuando ambos se declaran",
      path: ["minimumHostVersion"],
    });
  }

  // ── Consistencia capacidad ↔ declaración de función ───────────────────────
  // El host aplica las capacidades al instalar y en tiempo de ejecución. Un plugin debe
  // declarar por adelantado cada capacidad que necesite; tener en silencio más funciones
  // que capacidades causaría rechazos en tiempo de ejecución.

  // tools requiere agent.tools.register (PLUGIN_SPEC.md §11)
  if (manifest.tools && manifest.tools.length > 0) {
    if (!manifest.capabilities.includes("agent.tools.register")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La capacidad 'agent.tools.register' es obligatoria cuando se declaran tools",
        path: ["capabilities"],
      });
    }
  }

  // jobs requiere jobs.schedule (PLUGIN_SPEC.md §17)
  if (manifest.jobs && manifest.jobs.length > 0) {
    if (!manifest.capabilities.includes("jobs.schedule")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La capacidad 'jobs.schedule' es obligatoria cuando se declaran jobs",
        path: ["capabilities"],
      });
    }
  }

  // webhooks requiere webhooks.receive (PLUGIN_SPEC.md §18)
  if (manifest.webhooks && manifest.webhooks.length > 0) {
    if (!manifest.capabilities.includes("webhooks.receive")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La capacidad 'webhooks.receive' es obligatoria cuando se declaran webhooks",
        path: ["capabilities"],
      });
    }
  }

  // ── Chequeos de unicidad ────────────────────────────────────────────────
  // Las claves duplicadas dentro del propio manifiesto de un plugin siempre son un error. El host
  // no sabría qué declaración prevalece, así que rechazamos temprano.

  // las claves de trabajo deben ser únicas dentro del plugin (usadas como identificadores en la BD)
  if (manifest.jobs) {
    const jobKeys = manifest.jobs.map((j) => j.jobKey);
    const duplicates = jobKeys.filter((key, i) => jobKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Claves de trabajo duplicadas: ${[...new Set(duplicates)].join(", ")}`,
        path: ["jobs"],
      });
    }
  }

  // las claves de endpoint de webhook deben ser únicas dentro del plugin (usadas en rutas)
  if (manifest.webhooks) {
    const endpointKeys = manifest.webhooks.map((w) => w.endpointKey);
    const duplicates = endpointKeys.filter((key, i) => endpointKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Claves de endpoint de webhook duplicadas: ${[...new Set(duplicates)].join(", ")}`,
        path: ["webhooks"],
      });
    }
  }

  // los nombres de herramienta deben ser únicos dentro del plugin (agrupados en tiempo de ejecución)
  if (manifest.tools) {
    const toolNames = manifest.tools.map((t) => t.name);
    const duplicates = toolNames.filter((name, i) => toolNames.indexOf(name) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Nombres de herramienta duplicados: ${[...new Set(duplicates)].join(", ")}`,
        path: ["tools"],
      });
    }
  }

  // los ids de ranura de UI deben ser únicos dentro del plugin (agrupados en tiempo de ejecución)
  if (manifest.ui) {
    if (manifest.ui.slots) {
      const slotIds = manifest.ui.slots.map((s) => s.id);
      const duplicates = slotIds.filter((id, i) => slotIds.indexOf(id) !== i);
      if (duplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `IDs de ranura de UI duplicados: ${[...new Set(duplicates)].join(", ")}`,
          path: ["ui", "slots"],
        });
      }
    }
  }

  // los ids de lanzador deben ser únicos dentro del plugin
  const allLaunchers = [
    ...(manifest.launchers ?? []),
    ...(manifest.ui?.launchers ?? []),
  ];
  if (allLaunchers.length > 0) {
    const launcherIds = allLaunchers.map((launcher) => launcher.id);
    const duplicates = launcherIds.filter((id, i) => launcherIds.indexOf(id) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `IDs de lanzador duplicados: ${[...new Set(duplicates)].join(", ")}`,
        path: manifest.ui?.launchers ? ["ui", "launchers"] : ["launchers"],
      });
    }
  }
});

export type PluginManifestV1Input = z.infer<typeof pluginManifestV1Schema>;

// ---------------------------------------------------------------------------
// Solicitud de instalación / registro de plugin
// ---------------------------------------------------------------------------

/**
 * Esquema para instalar (registrar) un plugin.
 * El servidor recibe el packageName y resuelve el manifiesto desde el
 * paquete instalado.
 */
export const installPluginSchema = z.object({
  packageName: z.string().min(1),
  version: z.string().min(1).optional(),
  /** Definido por el cargador para instalaciones de ruta local para poder resolver el worker. */
  packagePath: z.string().min(1).optional(),
});

export type InstallPlugin = z.infer<typeof installPluginSchema>;

// ---------------------------------------------------------------------------
// Esquemas de config del plugin (configuración de instancia)
// ---------------------------------------------------------------------------

/**
 * Esquema para crear o actualizar la configuración de instancia de un plugin.
 * configJson se valida de forma permisiva aquí; la validación en tiempo de ejecución contra
 * el instanceConfigSchema del plugin se hace en la capa de servicio.
 */
export const upsertPluginConfigSchema = z.object({
  configJson: z.record(z.unknown()),
});

export type UpsertPluginConfig = z.infer<typeof upsertPluginConfigSchema>;

/**
 * Esquema para actualizar parcialmente la configuración de instancia de un plugin.
 * Permite una fusión parcial de valores de config.
 */
export const patchPluginConfigSchema = z.object({
  configJson: z.record(z.unknown()),
});

export type PatchPluginConfig = z.infer<typeof patchPluginConfigSchema>;

// ---------------------------------------------------------------------------
// Actualización de estado del plugin
// ---------------------------------------------------------------------------

/**
 * Esquema para actualizar el estado del ciclo de vida de un plugin. Usado por el gestor
 * del ciclo de vida para persistir transiciones de estado.
 *
 * @see {@link PLUGIN_STATUSES} para los valores de estado válidos
 */
export const updatePluginStatusSchema = z.object({
  status: z.enum(PLUGIN_STATUSES),
  lastError: z.string().nullable().optional(),
});

export type UpdatePluginStatus = z.infer<typeof updatePluginStatusSchema>;

// ---------------------------------------------------------------------------
// Desinstalación del plugin
// ---------------------------------------------------------------------------

/** Esquema para la solicitud de desinstalación. `removeData` controla borrado duro vs suave. */
export const uninstallPluginSchema = z.object({
  removeData: z.boolean().optional().default(false),
});

export type UninstallPlugin = z.infer<typeof uninstallPluginSchema>;

// ---------------------------------------------------------------------------
// Esquemas de estado del plugin (almacenamiento clave-valor)
// ---------------------------------------------------------------------------

/**
 * Esquema para una clave de alcance de estado de plugin — identifica la ubicación exacta donde
 * se almacena el estado. Usado por los métodos del SDK `ctx.state.get()`, `ctx.state.set()` y
 * `ctx.state.delete()`.
 *
 * @see PLUGIN_SPEC.md §21.3 `plugin_state`
 */
export const pluginStateScopeKeySchema = z.object({
  scopeKind: z.enum(PLUGIN_STATE_SCOPE_KINDS),
  scopeId: z.string().min(1).optional(),
  namespace: z.string().min(1).optional(),
  stateKey: z.string().min(1),
});

export type PluginStateScopeKey = z.infer<typeof pluginStateScopeKeySchema>;

/**
 * Esquema para definir un valor de estado de plugin.
 */
export const setPluginStateSchema = z.object({
  scopeKind: z.enum(PLUGIN_STATE_SCOPE_KINDS),
  scopeId: z.string().min(1).optional(),
  namespace: z.string().min(1).optional(),
  stateKey: z.string().min(1),
  /** Valor serializable a JSON para almacenar. */
  value: z.unknown(),
});

export type SetPluginState = z.infer<typeof setPluginStateSchema>;

/**
 * Esquema para consultar entradas de estado de plugin. Todos los campos son opcionales para permitir
 * consultas de listado flexibles (p. ej. todo el estado de un plugin dentro de un alcance).
 */
export const listPluginStateSchema = z.object({
  scopeKind: z.enum(PLUGIN_STATE_SCOPE_KINDS).optional(),
  scopeId: z.string().min(1).optional(),
  namespace: z.string().min(1).optional(),
});

export type ListPluginState = z.infer<typeof listPluginStateSchema>;
