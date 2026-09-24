#!/usr/bin/env bash
set -euo pipefail

# build-npm.sh — Compila el paquete CLI paperclipai para publicarlo en npm.
#
# Usa esbuild para empaquetar todo el código del workspace en un solo archivo,
# manteniendo las dependencias externas de npm como dependencias normales del paquete.
#
# Uso:
#   ./scripts/build-npm.sh               # compilación completa
#   ./scripts/build-npm.sh --skip-checks  # omite la verificación de tokens prohibidos (CI sin lista de tokens)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$REPO_ROOT/cli"
DIST_DIR="$CLI_DIR/dist"

skip_checks=false
skip_typecheck=false
for arg in "$@"; do
  case "$arg" in
    --skip-checks) skip_checks=true ;;
    --skip-typecheck) skip_typecheck=true ;;
  esac
done

echo "==> Compilando paperclipai para npm"

# ── Paso 1: Verificación de tokens prohibidos ──────────────────────────────────
if [ "$skip_checks" = false ]; then
  echo "  [1/5] Ejecutando verificación de tokens prohibidos..."
  node "$REPO_ROOT/scripts/check-forbidden-tokens.mjs"
else
  echo "  [1/5] Omitiendo verificación de tokens prohibidos (--skip-checks)"
fi

# ── Paso 2: Verificación de tipos de TypeScript ────────────────────────────────
if [ "$skip_typecheck" = false ]; then
  echo "  [2/6] Verificando tipos..."
  cd "$REPO_ROOT"
  pnpm -r typecheck
else
  echo "  [2/6] Omitiendo verificación de tipos (--skip-typecheck)"
fi

# ── Paso 3: Empaquetar CLI con esbuild ────────────────────────────────────────
echo "  [3/6] Empaquetando CLI con esbuild..."
cd "$CLI_DIR"
rm -rf dist

node --input-type=module -e "
import esbuild from 'esbuild';
import config from './esbuild.config.mjs';
await esbuild.build(config);
"

chmod +x dist/index.js

# ── Paso 4: Validar la sintaxis del punto de entrada empaquetado ────────────────
echo "  [4/6] Verificando sintaxis del punto de entrada empaquetado..."
node --check "$DIST_DIR/index.js"

# ── Paso 5: Respaldar package.json de desarrollo, generar el publicable ───────
echo "  [5/6] Generando package.json publicable..."
cp "$CLI_DIR/package.json" "$CLI_DIR/package.dev.json"
node "$REPO_ROOT/scripts/generate-npm-package-json.mjs"

# Copia el README raíz para que npm muestre el README del repo en la página del paquete
cp "$REPO_ROOT/README.md" "$CLI_DIR/README.md"

# ── Paso 6: Resumen ───────────────────────────────────────────────────────────
BUNDLE_SIZE=$(wc -c < "$DIST_DIR/index.js" | xargs)
echo "  [6/6] Verificando la compilación..."
echo ""
echo "Compilación completa."
echo "  Paquete: cli/dist/index.js (${BUNDLE_SIZE} bytes)"
echo "  Mapa de fuentes: cli/dist/index.js.map"
echo ""
echo "Para previsualizar:   cd cli && npm pack --dry-run"
echo "Para publicar:        cd cli && npm publish --access public"
echo "Para restaurar:       mv cli/package.dev.json cli/package.json"
