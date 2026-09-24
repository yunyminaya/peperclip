#!/usr/bin/env bash
set -euo pipefail

# prepare-server-ui-dist.sh — Compila la UI y la copia en server/ui-dist.
# Esto mantiene los artefactos de publicación de @paperclipai/server autocontenidos para el servicio estático de la UI.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UI_DIST="$REPO_ROOT/ui/dist"
SERVER_UI_DIST="$REPO_ROOT/server/ui-dist"

echo "  -> Compilando @paperclipai/ui..."
pnpm --dir "$REPO_ROOT" --filter @paperclipai/ui build

if [ ! -f "$UI_DIST/index.html" ]; then
  echo "Error: no se encontró la salida de compilación de la UI en $UI_DIST/index.html"
  exit 1
fi

rm -rf "$SERVER_UI_DIST"
cp -r "$UI_DIST" "$SERVER_UI_DIST"
echo "  -> ui/dist copiado a server/ui-dist"
