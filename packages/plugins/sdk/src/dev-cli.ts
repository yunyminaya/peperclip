#!/usr/bin/env node
import path from "node:path";
import { startPluginDevServer } from "./dev-server.js";

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

/**
 * Punto de entrada CLI para el servidor local de vista previa de interfaz de plugin.
 *
 * Es intencionalmente mínimo y delega todo el comportamiento de servicio a
 * `startPluginDevServer` para que las pruebas y el uso programático compartan
 * una sola ruta.
 */
async function main() {
  const rootDir = parseArg("--root") ?? process.cwd();
  const uiDir = parseArg("--ui-dir") ?? "dist/ui";
  const host = parseArg("--host") ?? "127.0.0.1";
  const rawPort = parseArg("--port") ?? "4177";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Valor de --port inválido: ${rawPort}`);
  }

  const server = await startPluginDevServer({
    rootDir: path.resolve(rootDir),
    uiDir,
    host,
    port,
  });

  // eslint-disable-next-line no-console
  console.log(`Servidor dev de plugin de Paperclip escuchando en ${server.url}`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
