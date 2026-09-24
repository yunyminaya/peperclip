/**
 * @fileoverview Valida la configuración de una instancia de plugin contra
 * su JSON Schema.
 *
 * Usa Ajv para validar los valores de `configJson` contra el
 * `instanceConfigSchema` declarado en el manifiesto de un plugin. Esto
 * asegura que la configuración inválida se rechace en el límite de la API,
 * en lugar de descubrirse después al iniciar el worker.
 *
 * @module server/services/plugin-config-validator
 */

import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import type { JsonSchema } from "@paperclipai/shared";

export interface ConfigValidationResult {
  valid: boolean;
  errors?: { field: string; message: string }[];
}

/**
 * Valida un objeto de configuración contra un JSON Schema.
 *
 * @param configJson - Los valores de configuración a validar.
 * @param schema - El JSON Schema del `instanceConfigSchema` del manifiesto del plugin.
 * @returns Resultado de validación con errores de campo estructurados en caso de fallo.
 */
export function validateInstanceConfig(
  configJson: Record<string, unknown>,
  schema: JsonSchema,
): ConfigValidationResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AjvCtor = (Ajv as any).default ?? Ajv;
  const ajv = new AjvCtor({ allErrors: true });
  // ajv-formats v3 exporta por defecto un objeto FormatsPlugin; llamarlo como plugin.
  const applyFormats = (addFormats as any).default ?? addFormats;
  applyFormats(ajv);
  // Registra el formato secret-ref usado por los manifiestos de plugins para
  // marcar campos que contienen un UUID de secreto de Paperclip en lugar de
  // un valor en crudo. El formato es solo una pista de UI — la validación del
  // UUID ocurre en el manejador de secretos al momento de resolverlo.
  ajv.addFormat("secret-ref", { validate: () => true });
  const validate = ajv.compile(schema);
  const valid = validate(configJson);

  if (valid) {
    return { valid: true };
  }

  const errors = (validate.errors ?? []).map((err: ErrorObject) => ({
    field: err.instancePath || "/",
    message: err.message ?? "la validación falló",
  }));

  return { valid: false, errors };
}
