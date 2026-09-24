#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_REF="${1:-HEAD}"

usage() {
  cat <<'EOF'
Uso:
  ./scripts/clean-onboard-ref.sh [git-ref]

Ejemplos:
  ./scripts/clean-onboard-ref.sh
  ./scripts/clean-onboard-ref.sh HEAD
  ./scripts/clean-onboard-ref.sh v0.2.7

Variables de entorno:
  KEEP_TEMP=1                 Conserva el directorio temporal y el worktree separado para depuración
  PC_TEST_ROOT=/tmp/custom    Directorio temporal base a usar
  PC_DATA=/tmp/data           Directorio de datos de Paperclip a usar
  PAPERCLIP_HOST=127.0.0.1    Host pasado al servidor incorporado
  PAPERCLIP_PORT=3232         Puerto pasado al servidor incorporado

Notas:
  - Usa por defecto la referencia actual con commit (HEAD), no los cambios locales sin commit.
  - Crea un HOME temporal aislado, caché de npm, directorio de datos y worktree de git separado.
EOF
}

if [ $# -gt 1 ]; then
  usage
  exit 1
fi

if [ $# -eq 1 ] && [[ "$1" =~ ^(-h|--help)$ ]]; then
  usage
  exit 0
fi

TARGET_COMMIT="$(git -C "$REPO_ROOT" rev-parse --verify "${TARGET_REF}^{commit}")"

export KEEP_TEMP="${KEEP_TEMP:-0}"
export PC_TEST_ROOT="${PC_TEST_ROOT:-$(mktemp -d /tmp/paperclip-clean-ref.XXXXXX)}"
export PC_HOME="${PC_HOME:-$PC_TEST_ROOT/home}"
export PC_CACHE="${PC_CACHE:-$PC_TEST_ROOT/npm-cache}"
export PC_DATA="${PC_DATA:-$PC_TEST_ROOT/paperclip-data}"
export PC_REPO="${PC_REPO:-$PC_TEST_ROOT/repo}"
export PAPERCLIP_HOST="${PAPERCLIP_HOST:-127.0.0.1}"
export PAPERCLIP_PORT="${PAPERCLIP_PORT:-3100}"
export PAPERCLIP_OPEN_ON_LISTEN="${PAPERCLIP_OPEN_ON_LISTEN:-false}"

cleanup() {
  if [ "$KEEP_TEMP" = "1" ]; then
    return
  fi

  git -C "$REPO_ROOT" worktree remove --force "$PC_REPO" >/dev/null 2>&1 || true
  rm -rf "$PC_TEST_ROOT"
}

trap cleanup EXIT

mkdir -p "$PC_HOME" "$PC_CACHE" "$PC_DATA"

echo "TARGET_REF: $TARGET_REF"
echo "TARGET_COMMIT: $TARGET_COMMIT"
echo "PC_TEST_ROOT: $PC_TEST_ROOT"
echo "PC_HOME: $PC_HOME"
echo "PC_DATA: $PC_DATA"
echo "PC_REPO: $PC_REPO"
echo "PAPERCLIP_HOST: $PAPERCLIP_HOST"
echo "PAPERCLIP_PORT: $PAPERCLIP_PORT"

git -C "$REPO_ROOT" worktree add --detach "$PC_REPO" "$TARGET_COMMIT"

cd "$PC_REPO"
pnpm install

env \
  HOME="$PC_HOME" \
  npm_config_cache="$PC_CACHE" \
  npm_config_userconfig="$PC_HOME/.npmrc" \
  HOST="$PAPERCLIP_HOST" \
  PORT="$PAPERCLIP_PORT" \
  PAPERCLIP_OPEN_ON_LISTEN="$PAPERCLIP_OPEN_ON_LISTEN" \
  pnpm paperclipai onboard --yes --data-dir "$PC_DATA"
