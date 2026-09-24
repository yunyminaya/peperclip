/**
 * Manejador de secretos lado host para plugins — resuelve referencias de
 * secretos a través del sistema de proveedores de secretos de Paperclip.
 *
 * Cuando un worker de plugin llama `ctx.secrets.resolve(secretRef)`, la
 * solicitud JSON-RPC llega al host con `{ secretRef }`. Este módulo provee el
 * adaptador concreto `HostServices.secrets` que:
 *
 * 1. Parsea el string `secretRef` para identificar el secreto.
 * 2. Busca el registro del secreto y su última versión en la base de datos.
 * 3. Delega al `SecretProviderModule` configurado para descifrar /
 *    resolver el valor crudo.
 * 4. Devuelve el valor de texto plano resuelto al worker.
 *
 * ## Formato de referencia de secreto
 *
 * Un `secretRef` es un **UUID de secreto** — la clave primaria (`id`) de
 * una fila en la tabla `company_secrets`. Los operadores colocan estos UUIDs
 * en valores de configuración de plugins; los workers de plugins los
 * resuelven en tiempo de ejecución vía `ctx.secrets.resolve(secretId)`.
 *
 * ## Invariantes de seguridad
 *
 * - Los valores resueltos **nunca** se registran en logs, persisten ni se
 *   incluyen en mensajes de error (según PLUGIN_SPEC.md §22).
 * - El manejador está restringido por capacidades: solo los plugins con
 *   `secrets.read-ref` declarado en su manifiesto pueden llamarlo
 *   (cumplido por `host-client-factory`).
 * - El manejador host en sí no cachea valores resueltos. Cada llamada pasa
 *   por el proveedor de secretos para respetar la rotación.
 *
 * @see PLUGIN_SPEC.md §22 — Secrets
 * @see host-client-factory.ts — restricción por capacidades
 * @see services/secrets.ts — secretService usado por bindings de entorno de agente
 */

import { eq, and, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companySecrets, companySecretVersions, pluginConfig } from "@paperclipai/db";
import type { SecretProvider } from "@paperclipai/shared";
import { getSecretProvider } from "../secrets/provider-registry.js";
import { pluginRegistryService } from "./plugin-registry.js";

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Crea un error sanitizado que nunca filtra material de secretos.
 * Solo se incluye el identificador de referencia; nunca el valor resuelto.
 */
function secretNotFound(secretRef: string): Error {
  const err = new Error(`Secreto no encontrado: ${secretRef}`);
  err.name = "SecretNotFoundError";
  return err;
}

function secretVersionNotFound(secretRef: string): Error {
  const err = new Error(`No se encontró versión para el secreto: ${secretRef}`);
  err.name = "SecretVersionNotFoundError";
  return err;
}

function invalidSecretRef(secretRef: string): Error {
  const err = new Error(`Referencia de secreto inválida: ${secretRef}`);
  err.name = "InvalidSecretRefError";
  return err;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Regex UUID v4 para validar el formato de secretRef. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comprueba si un secretRef parece un UUID válido.
 */
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Recolecta las rutas de propiedades (claves separadas por puntos) cuyo nodo
 * de schema declara `format: "secret-ref"`. Solo se recorren `properties` de
 * nivel superior y anidadas — esto refleja las formas de objetos
 * planos/anidados que renderiza `JsonSchemaForm`.
 */
function collectSecretRefPaths(
  schema: Record<string, unknown> | null | undefined,
): Set<string> {
  const paths = new Set<string>();
  if (!schema || typeof schema !== "object") return paths;

  function walk(node: Record<string, unknown>, prefix: string): void {
    const props = node.properties as Record<string, Record<string, unknown>> | undefined;
    if (!props || typeof props !== "object") return;
    for (const [key, propSchema] of Object.entries(props)) {
      if (!propSchema || typeof propSchema !== "object") continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (propSchema.format === "secret-ref") {
        paths.add(path);
      }
      // Recurre en schemas de objetos anidados
      if (propSchema.type === "object") {
        walk(propSchema, path);
      }
    }
  }

  walk(schema, "");
  return paths;
}

/**
 * Extrae los UUIDs de referencias de secretos desde el configJson de un
 * plugin, limitados solo a los campos anotados con `format: "secret-ref"` en
 * el schema.
 *
 * Cuando no se provee schema, vuelve a recolectar todos los strings con
 * forma de UUID (retrocompatible para plugins sin
 * instanceConfigSchema declarado).
 */
export function extractSecretRefsFromConfig(
  configJson: unknown,
  schema?: Record<string, unknown> | null,
): Set<string> {
  const refs = new Set<string>();
  if (configJson == null || typeof configJson !== "object") return refs;

  const secretPaths = collectSecretRefPaths(schema);

  // Si el schema declara rutas secret-ref, extrae solo esos valores.
  if (secretPaths.size > 0) {
    for (const dotPath of secretPaths) {
      const keys = dotPath.split(".");
      let current: unknown = configJson;
      for (const k of keys) {
        if (current == null || typeof current !== "object") { current = undefined; break; }
        current = (current as Record<string, unknown>)[k];
      }
      if (typeof current === "string" && isUuid(current)) {
        refs.add(current);
      }
    }
    return refs;
  }

  // Fallback: sin schema o sin anotaciones secret-ref — recolecta todos los UUIDs.
  // Esto preserva la retrocompatibilidad para plugins que omiten
  // instanceConfigSchema.
  function walkAll(value: unknown): void {
    if (typeof value === "string") {
      if (isUuid(value)) refs.add(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walkAll(item);
    } else if (value !== null && typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) walkAll(v);
    }
  }

  walkAll(configJson);
  return refs;
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

/**
 * Forma de entrada para el manejador `secrets.resolve`.
 *
 * Coincide con `WorkerToHostMethods["secrets.resolve"][0]` de `protocol.ts`.
 */
export interface PluginSecretsResolveParams {
  /** El string de referencia del secreto (un UUID de secreto). */
  secretRef: string;
}

/**
 * Opciones para crear el manejador de secretos de plugins.
 */
export interface PluginSecretsHandlerOptions {
  /** Conexión de base de datos. */
  db: Db;
  /**
   * El ID del plugin que usa este manejador.
   * Usado solo para contexto de logging; nunca incluido en payloads de error
   * que llegan al worker del plugin.
   */
  pluginId: string;
}

/**
 * El adaptador `HostServices.secrets` para la fábrica host-client del plugin.
 */
export interface PluginSecretsService {
  /**
   * Resuelve una referencia de secreto a su valor actual de texto plano.
   *
   * @param params - Contiene el `secretRef` (UUID del secreto)
   * @returns El valor del secreto resuelto
   * @throws {Error} Si el secreto no se encuentra, no tiene versiones, o
   *   el proveedor falla al resolver
   */
  resolve(params: PluginSecretsResolveParams): Promise<string>;
}

/**
 * Crea un adaptador `HostServices.secrets` para un plugin específico.
 *
 * El servicio devuelto busca secretos por UUID, obtiene el material de la
 * última versión y delega al `SecretProviderModule` apropiado para el
 * descifrado.
 *
 * @example
 * ```ts
 * const secretsHandler = createPluginSecretsHandler({ db, pluginId });
 * const handlers = createHostClientHandlers({
 *   pluginId,
 *   capabilities: manifest.capabilities,
 *   services: {
 *     secrets: secretsHandler,
 *     // ...
 *   },
 * });
 * ```
 *
 * @param options - Conexión de base de datos e identidad del plugin
 * @returns Un `PluginSecretsService` apto para `HostServices.secrets`
 */
/** Limitador de tasa simple de ventana deslizante para intentos de resolución de secretos. */
function createRateLimiter(maxAttempts: number, windowMs: number) {
  const attempts = new Map<string, number[]>();

  return {
    check(key: string): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;
      const existing = (attempts.get(key) ?? []).filter((ts) => ts > windowStart);
      if (existing.length >= maxAttempts) return false;
      existing.push(now);
      attempts.set(key, existing);
      return true;
    },
  };
}

export function createPluginSecretsHandler(
  options: PluginSecretsHandlerOptions,
): PluginSecretsService {
  const { db, pluginId } = options;
  const registry = pluginRegistryService(db);

  // Límite de tasa: máximo 30 intentos de resolución por plugin por minuto
  const rateLimiter = createRateLimiter(30, 60_000);

  let cachedAllowedRefs: Set<string> | null = null;
  let cachedAllowedRefsExpiry = 0;
  const CONFIG_CACHE_TTL_MS = 30_000; // 30 seconds, matches event bus TTL

  return {
    async resolve(params: PluginSecretsResolveParams): Promise<string> {
      const { secretRef } = params;

      // ---------------------------------------------------------------
      // 0. Límite de tasa — evita enumeración de UUIDs por fuerza bruta
      // ---------------------------------------------------------------
      if (!rateLimiter.check(pluginId)) {
        const err = new Error("Límite de tasa excedido para resolución de secretos");
        err.name = "RateLimitExceededError";
        throw err;
      }

      // ---------------------------------------------------------------
      // 1. Validar el formato de la referencia
      // ---------------------------------------------------------------
      if (!secretRef || typeof secretRef !== "string" || secretRef.trim().length === 0) {
        throw invalidSecretRef(secretRef ?? "<vacío>");
      }

      const trimmedRef = secretRef.trim();

      if (!isUuid(trimmedRef)) {
        throw invalidSecretRef(trimmedRef);
      }

      // ---------------------------------------------------------------
      // 1b. Chequeo de alcance — solo permitir secretos referenciados en
      // la configuración de este plugin
      // ---------------------------------------------------------------
      const now = Date.now();
      if (!cachedAllowedRefs || now > cachedAllowedRefsExpiry) {
        const [configRow, plugin] = await Promise.all([
          db
            .select()
            .from(pluginConfig)
            .where(eq(pluginConfig.pluginId, pluginId))
            .then((rows) => rows[0] ?? null),
          registry.getById(pluginId),
        ]);

        const schema = (plugin?.manifestJson as unknown as Record<string, unknown> | null)
          ?.instanceConfigSchema as Record<string, unknown> | undefined;
        cachedAllowedRefs = extractSecretRefsFromConfig(configRow?.configJson, schema);
        cachedAllowedRefsExpiry = now + CONFIG_CACHE_TTL_MS;
      }

      if (!cachedAllowedRefs.has(trimmedRef)) {
        // Devuelve "no encontrado" para evitar filtrar si el secreto existe
        throw secretNotFound(trimmedRef);
      }

      // ---------------------------------------------------------------
      // 2. Busca el registro del secreto por UUID
      // ---------------------------------------------------------------
      const secret = await db
        .select()
        .from(companySecrets)
        .where(eq(companySecrets.id, trimmedRef))
        .then((rows) => rows[0] ?? null);

      if (!secret) {
        throw secretNotFound(trimmedRef);
      }

      // ---------------------------------------------------------------
      // 3. Obtiene el material de la última versión
      // ---------------------------------------------------------------
      const versionRow = await db
        .select()
        .from(companySecretVersions)
        .where(
          and(
            eq(companySecretVersions.secretId, secret.id),
            eq(companySecretVersions.version, secret.latestVersion),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!versionRow) {
        throw secretVersionNotFound(trimmedRef);
      }

      // ---------------------------------------------------------------
      // 4. Resuelve a través del proveedor de secretos apropiado
      // ---------------------------------------------------------------
      const provider = getSecretProvider(secret.provider as SecretProvider);
      const resolved = await provider.resolveVersion({
        material: versionRow.material as Record<string, unknown>,
        externalRef: secret.externalRef,
      });

      return resolved;
    },
  };
}
