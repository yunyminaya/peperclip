/**
 * PluginCapabilityValidator — aplica el modelo de capacidades tanto en
 * el momento de la instalación como en tiempo de ejecución.
 *
 * Cada plugin declara las capacidades que necesita en su manifiesto
 * (`manifest.capabilities`). Este servicio verifica esas declaraciones
 * contra un mapeo de operaciones → capacidades requeridas para que:
 *
 * 1. **Validación en la instalación** — `validateManifestCapabilities()`
 *    se asegura de que las funcionalidades declaradas (herramientas,
 *    trabajos, webhooks, slots de UI) tengan entradas de capacidad
 *    coincidentes, dando a los operadores retroalimentación clara
 *    antes de que se active un plugin.
 *
 * 2. **Control en tiempo de ejecución** — `checkOperation()` /
 *    `assertOperation()` se llaman en cada llamada del puente
 *    worker→host para aplicar el acceso de mínimo privilegio.
 *    Si un plugin intenta una operación que no declaró, la llamada
 *    se rechaza con un error 403.
 *
 * @see PLUGIN_SPEC.md §15 — Modelo de capacidades
 * @see host-client-factory.ts — control de capacidades en el SDK
 */
import type {
  PluginCapability,
  PaperclipPluginManifestV1,
  PluginUiSlotType,
  PluginLauncherPlacementZone,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Mapeos de requisitos de capacidades
// ---------------------------------------------------------------------------

/**
 * Mapea operaciones de alto nivel a las capacidades que requieren.
 *
 * Cuando el puente recibe una llamada de un worker de plugin, el host busca
 * la operación en este mapa y verifica las capacidades declaradas del plugin.
 * Si falta alguna capacidad requerida, la llamada se rechaza.
 *
 * @see PLUGIN_SPEC.md §15 — Modelo de capacidades
 */
const OPERATION_CAPABILITIES: Record<string, readonly PluginCapability[]> = {
  // Operaciones de lectura de datos
  "companies.list": ["companies.read"],
  "companies.get": ["companies.read"],
  "projects.list": ["projects.read"],
  "projects.get": ["projects.read"],
  "project.workspaces.list": ["project.workspaces.read"],
  "project.workspaces.get": ["project.workspaces.read"],
  "issues.list": ["issues.read"],
  "issues.get": ["issues.read"],
  "issue.comments.list": ["issue.comments.read"],
  "issue.comments.get": ["issue.comments.read"],
  "agents.list": ["agents.read"],
  "agents.get": ["agents.read"],
  "goals.list": ["goals.read"],
  "goals.get": ["goals.read"],
  "activity.list": ["activity.read"],
  "activity.get": ["activity.read"],
  "costs.list": ["costs.read"],
  "costs.get": ["costs.read"],

  // Operaciones de escritura de datos
  "issues.create": ["issues.create"],
  "issues.update": ["issues.update"],
  "issue.comments.create": ["issue.comments.create"],
  "activity.log": ["activity.log.write"],
  "metrics.write": ["metrics.write"],

  // Operaciones de estado de plugins
  "plugin.state.get": ["plugin.state.read"],
  "plugin.state.list": ["plugin.state.read"],
  "plugin.state.set": ["plugin.state.write"],
  "plugin.state.delete": ["plugin.state.write"],

  // Operaciones de runtime / integración
  "events.subscribe": ["events.subscribe"],
  "events.emit": ["events.emit"],
  "jobs.schedule": ["jobs.schedule"],
  "jobs.cancel": ["jobs.schedule"],
  "webhooks.receive": ["webhooks.receive"],
  "http.request": ["http.outbound"],
  "secrets.resolve": ["secrets.read-ref"],

  // Herramientas de agentes
  "agent.tools.register": ["agent.tools.register"],
  "agent.tools.execute": ["agent.tools.register"],
};

/**
 * Mapea tipos de slots de UI a la capacidad requerida para registrarlos.
 *
 * @see PLUGIN_SPEC.md §19 — Modelo de extensión de UI
 */
const UI_SLOT_CAPABILITIES: Record<PluginUiSlotType, PluginCapability> = {
  sidebar: "ui.sidebar.register",
  sidebarPanel: "ui.sidebar.register",
  projectSidebarItem: "ui.sidebar.register",
  page: "ui.page.register",
  detailTab: "ui.detailTab.register",
  taskDetailView: "ui.detailTab.register",
  dashboardWidget: "ui.dashboardWidget.register",
  globalToolbarButton: "ui.action.register",
  toolbarButton: "ui.action.register",
  contextMenuItem: "ui.action.register",
  commentAnnotation: "ui.commentAnnotation.register",
  commentContextMenuItem: "ui.action.register",
  settingsPage: "instance.settings.register",
};

/**
 * Las zonas de colocación de launchers se alinean con las superficies de UI
 * del host y por tanto heredan los mismos requisitos de capacidad que el
 * tipo de slot equivalente.
 */
const LAUNCHER_PLACEMENT_CAPABILITIES: Record<
  PluginLauncherPlacementZone,
  PluginCapability
> = {
  page: "ui.page.register",
  detailTab: "ui.detailTab.register",
  taskDetailView: "ui.detailTab.register",
  dashboardWidget: "ui.dashboardWidget.register",
  sidebar: "ui.sidebar.register",
  sidebarPanel: "ui.sidebar.register",
  projectSidebarItem: "ui.sidebar.register",
  globalToolbarButton: "ui.action.register",
  toolbarButton: "ui.action.register",
  contextMenuItem: "ui.action.register",
  commentAnnotation: "ui.commentAnnotation.register",
  commentContextMenuItem: "ui.action.register",
  settingsPage: "instance.settings.register",
};

/**
 * Mapea las declaraciones de funcionalidades del manifiesto a sus
 * capacidades requeridas.
 */
const FEATURE_CAPABILITIES: Record<string, PluginCapability> = {
  tools: "agent.tools.register",
  jobs: "jobs.schedule",
  webhooks: "webhooks.receive",
};

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

/**
 * Resultado de un chequeo de capacidad. Cuando `allowed` es false, `missing`
 * contiene las capacidades que el plugin no declara pero que la operación requiere.
 */
export interface CapabilityCheckResult {
  allowed: boolean;
  missing: PluginCapability[];
  operation?: string;
  pluginId?: string;
}

// ---------------------------------------------------------------------------
// Interfaz PluginCapabilityValidator
// ---------------------------------------------------------------------------

export interface PluginCapabilityValidator {
  /**
   * Verifica si un plugin tiene una capacidad específica.
   */
  hasCapability(
    manifest: PaperclipPluginManifestV1,
    capability: PluginCapability,
  ): boolean;

  /**
   * Verifica si un plugin tiene todas las capacidades especificadas.
   */
  hasAllCapabilities(
    manifest: PaperclipPluginManifestV1,
    capabilities: PluginCapability[],
  ): CapabilityCheckResult;

  /**
   * Verifica si un plugin tiene al menos una de las capacidades especificadas.
   */
  hasAnyCapability(
    manifest: PaperclipPluginManifestV1,
    capabilities: PluginCapability[],
  ): boolean;

  /**
   * Verifica si un plugin puede realizar la operación indicada.
   *
   * Las operaciones se mapean a las capacidades requeridas vía
   * OPERATION_CAPABILITIES. Las operaciones desconocidas se rechazan
   * por defecto.
   */
  checkOperation(
    manifest: PaperclipPluginManifestV1,
    operation: string,
  ): CapabilityCheckResult;

  /**
   * Asegura que un plugin puede realizar una operación.
   * Lanza un HttpError 403 si falla el chequeo de capacidad.
   */
  assertOperation(
    manifest: PaperclipPluginManifestV1,
    operation: string,
  ): void;

  /**
   * Asegura que un plugin tiene una capacidad específica.
   * Lanza un HttpError 403 si falta la capacidad.
   */
  assertCapability(
    manifest: PaperclipPluginManifestV1,
    capability: PluginCapability,
  ): void;

  /**
   * Verifica si un plugin puede registrar el tipo de slot de UI dado.
   */
  checkUiSlot(
    manifest: PaperclipPluginManifestV1,
    slotType: PluginUiSlotType,
  ): CapabilityCheckResult;

  /**
   * Valida que las capacidades declaradas de un manifiesto sean consistentes
   * con sus funcionalidades declaradas (herramientas, trabajos, webhooks,
   * slots de UI).
   *
   * Devuelve todas las capacidades faltantes en lugar de fallar con la primera.
   * Esto es útil para la validación en la instalación, para dar
   * retroalimentación completa.
   */
  validateManifestCapabilities(
    manifest: PaperclipPluginManifestV1,
  ): CapabilityCheckResult;

  /**
   * Obtiene las capacidades requeridas para una operación indicada.
   * Devuelve un arreglo vacío si la operación es desconocida.
   */
  getRequiredCapabilities(operation: string): readonly PluginCapability[];

  /**
   * Obtiene la capacidad requerida para un tipo de slot de UI.
   */
  getUiSlotCapability(slotType: PluginUiSlotType): PluginCapability;
}

// ---------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------

/**
 * Crea un PluginCapabilityValidator.
 *
 * Este servicio aplica los controles de capacidad para operaciones de
 * plugins. El host lo usa para verificar que las capacidades declaradas de
 * un plugin permiten la operación que intenta, tanto en la instalación
 * (validación del manifiesto) como en tiempo de ejecución (control de
 * llamadas del puente).
 *
 * Uso:
 * ```ts
 * const validator = pluginCapabilityValidator();
 *
 * // Tiempo de ejecución: controlar una llamada del puente
 * validator.assertOperation(plugin.manifestJson, "issues.create");
 *
 * // Instalación: validar la consistencia del manifiesto
 * const result = validator.validateManifestCapabilities(manifest);
 * if (!result.allowed) {
 *   throw badRequest("Faltan capacidades", result.missing);
 * }
 * ```
 */
export function pluginCapabilityValidator(): PluginCapabilityValidator {
  const log = logger.child({ service: "plugin-capability-validator" });

  // -----------------------------------------------------------------------
  // Utilidades internas
  // -----------------------------------------------------------------------

  function capabilitySet(manifest: PaperclipPluginManifestV1): Set<PluginCapability> {
    return new Set(manifest.capabilities);
  }

  function buildForbiddenMessage(
    manifest: PaperclipPluginManifestV1,
    operation: string,
    missing: PluginCapability[],
  ): string {
    return (
      `El plugin '${manifest.id}' no tiene permiso para realizar '${operation}'. ` +
      `Faltan las capacidades requeridas: ${missing.join(", ")}`
    );
  }

  // -----------------------------------------------------------------------
  // API pública
  // -----------------------------------------------------------------------

  return {
    hasCapability(manifest, capability) {
      return manifest.capabilities.includes(capability);
    },

    hasAllCapabilities(manifest, capabilities) {
      const declared = capabilitySet(manifest);
      const missing = capabilities.filter((cap) => !declared.has(cap));
      return {
        allowed: missing.length === 0,
        missing,
        pluginId: manifest.id,
      };
    },

    hasAnyCapability(manifest, capabilities) {
      const declared = capabilitySet(manifest);
      return capabilities.some((cap) => declared.has(cap));
    },

    checkOperation(manifest, operation) {
      const required = OPERATION_CAPABILITIES[operation];

      if (!required) {
        log.warn(
          { pluginId: manifest.id, operation },
          "chequeo de capacidad para operación desconocida – rechazando por defecto",
        );
        return {
          allowed: false,
          missing: [],
          operation,
          pluginId: manifest.id,
        };
      }

      const declared = capabilitySet(manifest);
      const missing = required.filter((cap) => !declared.has(cap));

      if (missing.length > 0) {
        log.debug(
          { pluginId: manifest.id, operation, missing },
          "chequeo de capacidad fallido",
        );
      }

      return {
        allowed: missing.length === 0,
        missing,
        operation,
        pluginId: manifest.id,
      };
    },

    assertOperation(manifest, operation) {
      const result = this.checkOperation(manifest, operation);
      if (!result.allowed) {
        const msg = result.missing.length > 0
          ? buildForbiddenMessage(manifest, operation, result.missing)
          : `El plugin '${manifest.id}' intentó una operación desconocida '${operation}'`;
        throw forbidden(msg);
      }
    },

    assertCapability(manifest, capability) {
      if (!this.hasCapability(manifest, capability)) {
        throw forbidden(
          `El plugin '${manifest.id}' no tiene la capacidad requerida '${capability}'`,
        );
      }
    },

    checkUiSlot(manifest, slotType) {
      const required = UI_SLOT_CAPABILITIES[slotType];
      if (!required) {
        return {
          allowed: false,
          missing: [],
          operation: `ui.${slotType}.register`,
          pluginId: manifest.id,
        };
      }

      const has = manifest.capabilities.includes(required);
      return {
        allowed: has,
        missing: has ? [] : [required],
        operation: `ui.${slotType}.register`,
        pluginId: manifest.id,
      };
    },

    validateManifestCapabilities(manifest) {
      const declared = capabilitySet(manifest);
      const allMissing: PluginCapability[] = [];

      // Revisar declaraciones de funcionalidades → capacidades requeridas
      for (const [feature, requiredCap] of Object.entries(FEATURE_CAPABILITIES)) {
        const featureValue = manifest[feature as keyof PaperclipPluginManifestV1];
        if (Array.isArray(featureValue) && featureValue.length > 0) {
          if (!declared.has(requiredCap)) {
            allMissing.push(requiredCap);
          }
        }
      }

      // Revisar slots de UI → capacidades requeridas
      const uiSlots = manifest.ui?.slots ?? [];
      if (uiSlots.length > 0) {
        for (const slot of uiSlots) {
          const requiredCap = UI_SLOT_CAPABILITIES[slot.type];
          if (requiredCap && !declared.has(requiredCap)) {
            if (!allMissing.includes(requiredCap)) {
              allMissing.push(requiredCap);
            }
          }
        }
      }

      // Revisar declaraciones de launchers → capacidades requeridas
      const launchers = [
        ...(manifest.launchers ?? []),
        ...(manifest.ui?.launchers ?? []),
      ];
      if (launchers.length > 0) {
        for (const launcher of launchers) {
          const requiredCap = LAUNCHER_PLACEMENT_CAPABILITIES[launcher.placementZone];
          if (requiredCap && !declared.has(requiredCap) && !allMissing.includes(requiredCap)) {
            allMissing.push(requiredCap);
          }
        }
      }

      return {
        allowed: allMissing.length === 0,
        missing: allMissing,
        pluginId: manifest.id,
      };
    },

    getRequiredCapabilities(operation) {
      return OPERATION_CAPABILITIES[operation] ?? [];
    },

    getUiSlotCapability(slotType) {
      return UI_SLOT_CAPABILITIES[slotType];
    },
  };
}
