/**
 * @fileoverview Ruta de servicio de archivos estáticos de UI de plugins
 *
 * Sirve bundles de UI de plugins desde el directorio dist/ui/ del plugin bajo el
 * namespace `/_plugins/:pluginId/ui/*`. Esto está especificado en PLUGIN_SPEC.md
 * §19.0.3 (Bundle Serving).
 *
 * Los bundles de UI de plugins son ESM preconstruidos que el host sirve como recursos estáticos.
 * El host importa dinámicamente el módulo de entrada de UI del plugin desde esta ruta,
 * resuelve la exportación nombrada declarada en `ui.slots[].exportName` y monta
 * en el slot de extensión.
 *
 * Seguridad:
 * - Se previene el path traversal resolviendo la ruta solicitada y verificando
 *   que permanece dentro del directorio de UI del plugin.
 * - Solo los plugins en estado 'ready' tienen su UI servida.
 * - Solo los plugins que declaran `entrypoints.ui` sirven bundles de UI.
 *
 * Encabezados de caché:
 * - Los archivos con patrones de hash de contenido en su nombre (p. ej. `index-a1b2c3d4.js`)
 *   reciben `Cache-Control: public, max-age=31536000, immutable`.
 * - Otros archivos reciben `Cache-Control: public, max-age=0, must-revalidate`
 *   con soporte de solicitudes condicionales basadas en ETag.
 *
 * @module server/routes/plugin-ui-static
 * @see doc/plugins/PLUGIN_SPEC.md §19.0.3 — Bundle Serving
 * @see doc/plugins/PLUGIN_SPEC.md §25.4.5 — Frontend Cache Invalidation
 */

import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { Db } from "@paperclipai/db";
import { pluginRegistryService } from "../services/plugin-registry.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Regex para detectar nombres de archivo con hash de contenido.
 *
 * Coincide con patrones como:
 * - `index-a1b2c3d4.js`
 * - `styles.abc123def.css`
 * - `chunk-ABCDEF01.mjs`
 *
 * La porción de hash debe tener al menos 8 caracteres hexadecimales para evitar falsos positivos.
 */
const CONTENT_HASH_PATTERN = /[.-][a-fA-F0-9]{8,}\.\w+$/;

/**
 * Encabezado Cache-Control para archivos con hash de contenido.
 * Estos archivos son inmutables por definición (el hash cambia cuando cambia el contenido).
 */
/** 1 año en segundos — estándar para recursos inmutables con hash de contenido. */
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60; // 31_536_000
const CACHE_CONTROL_IMMUTABLE = `public, max-age=${ONE_YEAR_SECONDS}, immutable`;

/**
 * Encabezado Cache-Control para archivos sin hash.
 * Estos archivos deben revalidarse en cada solicitud (basado en ETag).
 */
const CACHE_CONTROL_REVALIDATE = "public, max-age=0, must-revalidate";

/**
 * Tipos MIME para extensiones comunes de archivos de bundles de UI de plugins.
 */
const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

// ---------------------------------------------------------------------------
// Ayudante
// ---------------------------------------------------------------------------

/**
 * Resuelve el directorio de UI de un plugin desde su ubicación de paquete.
 *
 * El `packageName` del plugin se almacena en la BD. Resolvemos la ruta del paquete
 * desde el directorio local de plugins (DEFAULT_LOCAL_PLUGIN_DIR) buscando en
 * `node_modules`. Si el plugin se instaló desde una ruta local, la ruta
 * `entrypoints.ui` del manifiesto se resuelve relativa al directorio del paquete.
 *
 * @param localPluginDir - El directorio de instalación de plugins
 * @param packageName - El nombre del paquete npm
 * @param entrypointsUi - La ruta del entrypoint de UI del manifiesto (p. ej. "./dist/ui/")
 * @returns Ruta absoluta al directorio de UI, o null si no se encuentra
 */
export function resolvePluginUiDir(
  localPluginDir: string,
  packageName: string,
  entrypointsUi: string,
  packagePath?: string | null,
): string | null {
  // Para instalaciones de ruta local, prefiere la ruta de paquete persistida.
  if (packagePath) {
    const resolvedPackagePath = path.resolve(packagePath);
    if (fs.existsSync(resolvedPackagePath)) {
      const uiDirFromPackagePath = path.resolve(resolvedPackagePath, entrypointsUi);
      if (
        uiDirFromPackagePath.startsWith(resolvedPackagePath)
        && fs.existsSync(uiDirFromPackagePath)
      ) {
        return uiDirFromPackagePath;
      }
    }
  }

  // Resuelve la raíz del paquete dentro del node_modules del directorio local de plugins.
  // Las instalaciones npm van a <localPluginDir>/node_modules/<packageName>/
  let packageRoot: string;
  if (packageName.startsWith("@")) {
    // Paquete con scope: @scope/name -> node_modules/@scope/name
    packageRoot = path.join(localPluginDir, "node_modules", ...packageName.split("/"));
  } else {
    packageRoot = path.join(localPluginDir, "node_modules", packageName);
  }

  // Si la ubicación estándar no existe, el plugin puede haberse instalado
  // desde una ruta local. Intenta verificar si el package.json es accesible en la
  // ruta calculada o si el paquete se encuentra en otro lugar.
  if (!fs.existsSync(packageRoot)) {
    // Para instalaciones de ruta local, el packageName puede ser un directorio que no
    // vive dentro de node_modules. Verifica si el paquete existe directamente en el
    // nivel de localPluginDir.
    const directPath = path.join(localPluginDir, packageName);
    if (fs.existsSync(directPath)) {
      packageRoot = directPath;
    } else {
      return null;
    }
  }

  // Resuelve el directorio de UI relativo a la raíz del paquete
  const uiDir = path.resolve(packageRoot, entrypointsUi);

  // Verifica que el directorio de UI resuelto existe y está realmente dentro del paquete
  if (!fs.existsSync(uiDir)) {
    return null;
  }

  return uiDir;
}

/**
 * Calcula un ETag desde el stat del archivo (tamaño + mtime).
 * Este es un enfoque liviano que evita leer el contenido del archivo.
 */
function computeETag(size: number, mtimeMs: number): string {
  const ETAG_VERSION = "v2";
  const hash = crypto
    .createHash("md5")
    .update(`${ETAG_VERSION}:${size}-${mtimeMs}`)
    .digest("hex")
    .slice(0, 16);
  return `"${hash}"`;
}

// ---------------------------------------------------------------------------
// Fábrica de rutas
// ---------------------------------------------------------------------------

/**
 * Opciones para la ruta estática de UI de plugins.
 */
export interface PluginUiStaticRouteOptions {
  /**
   * El directorio local de instalación de plugins.
   * Aquí es donde se instalan los plugins vía `npm install --prefix`.
   * Por defecto la ubicación estándar `~/.paperclip/plugins/`.
   */
  localPluginDir: string;
}

/**
 * Crea un router de Express que sirve archivos estáticos de UI de plugins.
 *
 * Esta ruta maneja solicitudes `GET /_plugins/:pluginId/ui/*` mediante:
 * 1. Buscar el plugin en el registro por ID o clave
 * 2. Verificar que el plugin está en estado 'ready' con UI declarada
 * 3. Resolver la ruta del archivo dentro del directorio dist/ui/ del plugin
 * 4. Servir el archivo con los encabezados de caché apropiados
 *
 * @param db - Conexión a la base de datos para búsquedas en el registro de plugins
 * @param options - Opciones de configuración
 * @returns Router de Express
 */
export function pluginUiStaticRoutes(db: Db, options: PluginUiStaticRouteOptions) {
  const router = Router();
  const registry = pluginRegistryService(db);
  const log = logger.child({ service: "plugin-ui-static" });

  /**
   * GET /_plugins/:pluginId/ui/*
   *
   * Sirve un archivo estático desde el directorio de bundle de UI de un plugin.
   *
   * El parámetro :pluginId acepta:
   * - UUID de base de datos
   * - Clave de plugin (p. ej. "acme.linear")
   *
   * El comodín captura la ruta relativa del archivo dentro del directorio de UI.
   *
   * Estrategia de caché:
   * - Nombres de archivo con hash de contenido → inmutables, max-age de 1 año
   * - Otros archivos → must-revalidate con ETag
   */
  router.get("/_plugins/:pluginId/ui/*filePath", async (req, res) => {
    const { pluginId } = req.params;

    // Extrae la ruta relativa del archivo desde el comodín nombrado.
    // En Express 5 con path-to-regexp v8, los comodines nombrados pueden devolver
    // un arreglo de segmentos de ruta o una sola cadena.
    const rawParam = req.params.filePath;
    const rawFilePath = Array.isArray(rawParam)
      ? rawParam.join("/")
      : rawParam as string | undefined;

    if (!rawFilePath || rawFilePath.length === 0) {
      res.status(400).json({ error: "Se requiere la ruta del archivo" });
      return;
    }

    // Paso 1: Busca el plugin
    let plugin = null;
    try {
      plugin = await registry.getById(pluginId);
    } catch (error) {
      const maybeCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (maybeCode !== "22P02") {
        throw error;
      }
    }
    if (!plugin) {
      plugin = await registry.getByKey(pluginId);
    }

    if (!plugin) {
      res.status(404).json({ error: "Plugin no encontrado" });
      return;
    }

    // Paso 2: Verifica que el plugin está listo y tiene UI declarada
    if (plugin.status !== "ready") {
      res.status(403).json({
        error: `La UI del plugin no está disponible (estado: ${plugin.status})`,
      });
      return;
    }

    const manifest = plugin.manifestJson;
    if (!manifest?.entrypoints?.ui) {
      res.status(404).json({ error: "El plugin no declara un bundle de UI" });
      return;
    }

    // Paso 2b: Verifica devUiUrl en la configuración del plugin — proxy al servidor de desarrollo local
    // cuando un autor de plugin ha configurado una URL de servidor de desarrollo para hot-reload.
    // Ver PLUGIN_SPEC.md §27.2 — Local Development Workflow
    try {
      const configRow = await registry.getConfig(plugin.id);
      const devUiUrl =
        configRow &&
        typeof configRow === "object" &&
        "configJson" in configRow &&
        (configRow as { configJson: Record<string, unknown> }).configJson?.devUiUrl;

      if (typeof devUiUrl === "string" && devUiUrl.length > 0) {
        // El proxy de desarrollo solo está disponible en modo desarrollo
        if (process.env.NODE_ENV === "production") {
          log.warn(
            { pluginId: plugin.id },
            "plugin-ui-static: devUiUrl ignored in production",
          );
          // Recurre al servicio de archivos estáticos de abajo
        } else {
          // Protege contra rawFilePath que anula la URL base vía protocolo
          // scheme (p. ej. "https://evil.com/x") o rutas relativas al protocolo
          // (p. ej. "//evil.com/x") que hacen que `new URL(path, base)`
          // ignore la base por completo.
          // Normaliza el percent-encoding para que los slashes codificados (%2F) no puedan evadir
          // las verificaciones de protocolo/ruta de abajo.
          let decodedPath: string;
          try {
            decodedPath = decodeURIComponent(rawFilePath);
          } catch {
            res.status(400).json({ error: "Ruta de archivo no válida" });
            return;
          }
          if (
            decodedPath.includes("://") ||
            decodedPath.startsWith("//") ||
            decodedPath.startsWith("\\\\")
          ) {
            res.status(400).json({ error: "Ruta de archivo no válida" });
            return;
          }

          // Haz proxy de la solicitud al servidor de desarrollo
          const targetUrl = new URL(rawFilePath, devUiUrl.endsWith("/") ? devUiUrl : devUiUrl + "/");

          // Protección SSRF: solo permite objetivos http/https y localhost para el proxy de desarrollo
          if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
            res.status(400).json({ error: "devUiUrl debe usar el protocolo http o https" });
            return;
          }

          // El proxy de desarrollo está restringido solo a direcciones loopback.
          // Valida el hostname del targetUrl *construido* (no la base) para
          // detectar cualquier anulación basada en ruta que haya evadido las verificaciones de arriba.
          const devHost = targetUrl.hostname;
          const isLoopback =
            devHost === "localhost" ||
            devHost === "127.0.0.1" ||
            devHost === "::1" ||
            devHost === "[::1]";
          if (!isLoopback) {
            log.warn(
              { pluginId: plugin.id, devUiUrl, host: devHost },
              "plugin-ui-static: devUiUrl must target localhost, rejecting proxy",
            );
            res.status(400).json({ error: "devUiUrl debe apuntar a localhost" });
            return;
          }

          log.debug(
            { pluginId: plugin.id, devUiUrl, targetUrl: targetUrl.href },
            "plugin-ui-static: proxying to devUiUrl",
          );

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10_000);
            try {
              const upstream = await fetch(targetUrl.href, { signal: controller.signal });
              if (!upstream.ok) {
                res.status(upstream.status).json({
                error: `El servidor de desarrollo devolvió ${upstream.status}`,
                });
                return;
              }

              const contentType = upstream.headers.get("content-type");
              if (contentType) res.set("Content-Type", contentType);
              res.set("Cache-Control", "no-cache, no-store, must-revalidate");

              const body = await upstream.arrayBuffer();
              res.send(Buffer.from(body));
              return;
            } finally {
              clearTimeout(timeout);
            }
          } catch (proxyErr) {
            log.warn(
              {
                pluginId: plugin.id,
                devUiUrl,
                err: proxyErr instanceof Error ? proxyErr.message : String(proxyErr),
              },
              "plugin-ui-static: failed to proxy to devUiUrl, falling back to static",
            );
            // Recurre al servicio estático de abajo
          }
        }
      }
    } catch {
      // El fallo de búsqueda de configuración no es fatal — recurre al servicio estático
    }

    // Paso 3: Resuelve el directorio de UI del plugin
    const uiDir = resolvePluginUiDir(
      options.localPluginDir,
      plugin.packageName,
      manifest.entrypoints.ui,
      plugin.packagePath,
    );

    if (!uiDir) {
      log.warn(
        { pluginId: plugin.id, pluginKey: plugin.pluginKey, packageName: plugin.packageName },
        "plugin-ui-static: UI directory not found on disk",
      );
      res.status(404).json({ error: "Directorio de UI del plugin no encontrado" });
      return;
    }

    // Paso 4: Resuelve la ruta del archivo solicitada y previene traversal (incluyendo symlinks)
    const resolvedFilePath = path.resolve(uiDir, rawFilePath);

    // Paso 5: Verifica que el archivo existe y es un archivo regular
    let fileStat: fs.Stats;
    try {
      fileStat = fs.statSync(resolvedFilePath);
    } catch {
      res.status(404).json({ error: "Archivo no encontrado" });
      return;
    }

    // Seguridad: resuelve symlinks vía realpathSync y verifica contención.
    // Esto previene traversal basado en symlinks que startsWith basado en cadenas no detecta.
    let realFilePath: string;
    let realUiDir: string;
    try {
      realFilePath = fs.realpathSync(resolvedFilePath);
      realUiDir = fs.realpathSync(uiDir);
    } catch {
      res.status(404).json({ error: "Archivo no encontrado" });
      return;
    }

    const relative = path.relative(realUiDir, realFilePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }

    if (!fileStat.isFile()) {
      res.status(404).json({ error: "Archivo no encontrado" });
      return;
    }

    // Paso 6: Determina la estrategia de caché basada en el nombre de archivo
    const basename = path.basename(resolvedFilePath);
    const isContentHashed = CONTENT_HASH_PATTERN.test(basename);

    // Paso 7: Establece los encabezados de caché
    if (isContentHashed) {
      res.set("Cache-Control", CACHE_CONTROL_IMMUTABLE);
    } else {
      res.set("Cache-Control", CACHE_CONTROL_REVALIDATE);

      // Calcula y establece ETag para soporte de solicitudes condicionales
      const etag = computeETag(fileStat.size, fileStat.mtimeMs);
      res.set("ETag", etag);

      // Verifica If-None-Match para 304 Not Modified
      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch === etag) {
        res.status(304).end();
        return;
      }
    }

    // Paso 8: Establece Content-Type
    const ext = path.extname(resolvedFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext];
    if (contentType) {
      res.set("Content-Type", contentType);
    }

    // Paso 9: Establece encabezados CORS (la UI del plugin puede cargarse desde un origen diferente en dev)
    res.set("Access-Control-Allow-Origin", "*");

    // Paso 10: Envía el archivo
    // La fuente del plugin puede vivir en Git worktrees (p. ej. ".worktrees/...").
    // `send` por defecto usa dotfiles:"ignore", que trata los directorios con punto como
    // no encontrados. Ya aplicamos seguridad de traversal arriba, así que permite rutas con punto.
    res.sendFile(resolvedFilePath, { dotfiles: "allow" }, (err) => {
      if (err) {
        log.error(
          { err, pluginId: plugin.id, filePath: resolvedFilePath },
          "plugin-ui-static: error sending file",
        );
        // Solo envía el error si los encabezados aún no se han enviado
        if (!res.headersSent) {
          res.status(500).json({ error: "No se pudo servir el archivo" });
        }
      }
    });
  });

  return router;
}
