/**
 * PluginManifestValidator — validación de esquema para archivos de
 * manifiesto de plugins.
 *
 * Usa el esquema Zod compartido (`pluginManifestV1Schema`) para validar
 * payloads de manifiesto. Provee tanto una variante segura `parse()`
 * (devuelve una unión de resultado) como `parseOrThrow()` que lanza para
 * propagar el error HTTP al momento de la instalación.
 *
 * @see PLUGIN_SPEC.md §10 — Manifiesto de plugin
 * @see packages/shared/src/validators/plugin.ts — Definición del esquema Zod
 */
import { pluginManifestV1Schema } from "@paperclipai/shared";
import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import { PLUGIN_API_VERSION } from "@paperclipai/shared";
import { badRequest } from "../errors.js";

// ---------------------------------------------------------------------------
// Supported manifest API versions
// ---------------------------------------------------------------------------

/**
 * El conjunto de versiones de la API de plugin que este host puede aceptar.
 * Cuando se introduce una nueva versión de la API, agréguela aquí. Las
 * versiones viejas deberían retenerse hasta que el host deje de
 * soportarlas.
 */
const SUPPORTED_VERSIONS = [PLUGIN_API_VERSION] as const;

// ---------------------------------------------------------------------------
// Tipos de resultado de parse
// ---------------------------------------------------------------------------

/**
 * Resultado de parse exitoso.
 */
export interface ManifestParseSuccess {
  success: true;
  manifest: PaperclipPluginManifestV1;
}

/**
 * Resultado de parse fallido. `errors` es una descripción legible por
 * humanos de lo que salió mal; `details` es la lista cruda de errores Zod
 * para inspección programática.
 */
export interface ManifestParseFailure {
  success: false;
  errors: string;
  details: Array<{ path: (string | number)[]; message: string }>;
}

/** Unión de resultados de parse. */
export type ManifestParseResult = ManifestParseSuccess | ManifestParseFailure;

// ---------------------------------------------------------------------------
// Interfaz PluginManifestValidator
// ---------------------------------------------------------------------------

/**
 * Servicio para parsear y validar manifiestos de plugins.
 *
 * @see PLUGIN_SPEC.md §10 — Manifiesto de plugin
 */
export interface PluginManifestValidator {
  /**
   * Intenta parsear `input` como un manifiesto de plugin.
   *
   * Devuelve un {@link ManifestParseSuccess} cuando la entrada pasa todas
   * las reglas de validación, o un {@link ManifestParseFailure} con
   * mensajes de error legibles por humanos cuando no.
   *
   * Esta es la variante "segura" — nunca lanza.
   */
  parse(input: unknown): ManifestParseResult;

  /**
   * Parsea `input` como un manifiesto de plugin, lanzando un HttpError 400
   * en fallo.
   *
   * Use esto al momento de la instalación cuando un manifiesto inválido debe
   * aparecer como un error HTTP para el llamador.
   *
   * @throws {HttpError} 400 Bad Request si el manifiesto es inválido.
   */
  parseOrThrow(input: unknown): PaperclipPluginManifestV1;

  /**
   * Devuelve la lista de versiones de la API de plugin soportadas por este
   * host.
   *
   * Los llamadores pueden usar esto para presentar el rango de versiones
   * soportadas a los operadores o para decidir si un plugin candidato puede
   * instalarse.
   */
  getSupportedVersions(): readonly number[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Crea un {@link PluginManifestValidator}.
 *
 * Uso:
 * ```ts
 * const validator = pluginManifestValidator();
 *
 * // Parse seguro — inspecciona el resultado
 * const result = validator.parse(rawManifest);
 * if (!result.success) {
 *   console.error(result.errors);
 *   return;
 * }
 * const manifest = result.manifest;
 *
 * // Parse que lanza — usa al momento de la instalación
 * const manifest = validator.parseOrThrow(rawManifest);
 *
 * // Comprueba las versiones soportadas
 * const versions = validator.getSupportedVersions(); // [1]
 * ```
 */
export function pluginManifestValidator(): PluginManifestValidator {
  return {
    parse(input: unknown): ManifestParseResult {
      const result = pluginManifestV1Schema.safeParse(input);

      if (result.success) {
        return {
          success: true,
          manifest: result.data as PaperclipPluginManifestV1,
        };
      }

      const details = result.error.errors.map((issue) => ({
        path: issue.path,
        message: issue.message,
      }));

      const errors = details
        .map(({ path, message }) =>
          path.length > 0 ? `${path.join(".")}: ${message}` : message,
        )
        .join("; ");

      return {
        success: false,
        errors,
        details,
      };
    },

    parseOrThrow(input: unknown): PaperclipPluginManifestV1 {
      const result = this.parse(input);

      if (!result.success) {
        throw badRequest(`Manifiesto de plugin inválido: ${result.errors}`, result.details);
      }

      return result.manifest;
    },

    getSupportedVersions(): readonly number[] {
      return SUPPORTED_VERSIONS;
    },
  };
}
