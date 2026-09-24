#!/usr/bin/env node
/**
 * generate-npm-package-json.mjs
 *
 * Lee el package.json de desarrollo (que tiene referencias workspace:*) y produce
 * un package.json publicable en cli/ con:
 *   - dependencias workspace:* eliminadas
 *   - todas las dependencias externas de los paquetes del workspace integradas
 *   - metadatos adecuados para npm
 *
 * Lee de cli/package.dev.json si existe (la compilación ya se ejecutó),
 * de lo contrario desde cli/package.json.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function readPkg(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath, "package.json"), "utf8"));
}

// Lee todos los paquetes del workspace que se EMPAQUETAN en la CLI.
// Nota: "server" está excluido — se publica por separado como dependencia.
const workspacePaths = [
  "cli",
  "packages/db",
  "packages/shared",
  "packages/adapter-utils",
  "packages/adapters/claude-local",
  "packages/adapters/codex-local",
  "packages/adapters/opencode-local",
  "packages/adapters/openclaw-gateway",
];

// Paquetes del workspace que NO se empaquetan y deben seguir como dependencias de npm.
// Estos se publican por separado y se resuelven en tiempo de ejecución.
const externalWorkspacePackages = new Set([
  "@paperclipai/server",
]);

// Recopila todas las dependencias externas de todos los paquetes del workspace
const allDeps = {};
const allOptionalDeps = {};

for (const pkgPath of workspacePaths) {
  const pkg = readPkg(pkgPath);
  const deps = pkg.dependencies || {};
  const optDeps = pkg.optionalDependencies || {};

  for (const [name, version] of Object.entries(deps)) {
    if (name.startsWith("@paperclipai/") && !externalWorkspacePackages.has(name)) continue;
    // Para paquetes externos del workspace, lee su versión directamente
    if (externalWorkspacePackages.has(name)) {
      const pkgDirMap = { "@paperclipai/server": "server" };
      const wsPkg = readPkg(pkgDirMap[name]);
      allDeps[name] = wsPkg.version;
      continue;
    }
    // Conserva la versión más específica (fijada) en caso de conflicto
    if (!allDeps[name] || !version.startsWith("^")) {
      allDeps[name] = version;
    }
  }

  for (const [name, version] of Object.entries(optDeps)) {
    allOptionalDeps[name] = version;
  }
}

// Ordena alfabéticamente
const sortedDeps = Object.fromEntries(Object.entries(allDeps).sort(([a], [b]) => a.localeCompare(b)));
const sortedOptDeps = Object.fromEntries(
  Object.entries(allOptionalDeps).sort(([a], [b]) => a.localeCompare(b)),
);

// Lee los metadatos del paquete de la CLI — prefiere el respaldo de desarrollo si existe
const devPkgPath = resolve(repoRoot, "cli/package.dev.json");
const cliPkg = existsSync(devPkgPath)
  ? JSON.parse(readFileSync(devPkgPath, "utf8"))
  : readPkg("cli");

// Compila el package.json publicable
const publishPkg = {
  name: cliPkg.name,
  version: cliPkg.version,
  description: cliPkg.description,
  type: cliPkg.type,
  bin: cliPkg.bin,
  keywords: cliPkg.keywords,
  license: cliPkg.license,
  repository: cliPkg.repository,
  homepage: cliPkg.homepage,
  bugs: cliPkg.bugs,
  files: cliPkg.files,
  engines: { node: ">=20" },
  dependencies: sortedDeps,
};

if (Object.keys(sortedOptDeps).length > 0) {
  publishPkg.optionalDependencies = sortedOptDeps;
}

const output = JSON.stringify(publishPkg, null, 2) + "\n";
const outPath = resolve(repoRoot, "cli/package.json");
writeFileSync(outPath, output);

console.log(`  ✓  package.json publicable generado (${Object.keys(sortedDeps).length} deps)`);
console.log(`     Versión: ${cliPkg.version}`);
