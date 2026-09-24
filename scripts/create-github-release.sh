#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./release-lib.sh
. "$REPO_ROOT/scripts/release-lib.sh"

dry_run=false
version=""

usage() {
  cat <<'EOF'
Uso:
  ./scripts/create-github-release.sh <version> [--dry-run]

Ejemplos:
  ./scripts/create-github-release.sh 2026.318.0
  ./scripts/create-github-release.sh 2026.318.0 --dry-run

Notas:
  - Ejecuta esto después de subir el tag estable.
  - Resuelve el remoto de git automáticamente.
  - En GitHub Actions, se usa origin explícitamente.
  - Si la versión ya existe, este script actualiza su título y notas.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -n "$version" ]; then
        echo "Error: solo se puede proporcionar una versión." >&2
        exit 1
      fi
      version="$1"
      ;;
  esac
  shift
done

if [ -z "$version" ]; then
  usage
  exit 1
fi

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: la versión debe ser una versión de calendario estable como 2026.318.0." >&2
  exit 1
fi

tag="v$version"
notes_file="$REPO_ROOT/releases/${tag}.md"
if [ "${GITHUB_ACTIONS:-}" = "true" ] && [ -z "${PUBLISH_REMOTE:-}" ] && git_remote_exists origin; then
  PUBLISH_REMOTE=origin
fi
PUBLISH_REMOTE="$(resolve_release_remote)"
if ! command -v gh >/dev/null 2>&1; then
  echo "Error: se requiere la CLI gh para crear versiones de GitHub." >&2
  exit 1
fi

GITHUB_REPO="$(github_repo_from_remote "$PUBLISH_REMOTE" || true)"
if [ -z "$GITHUB_REPO" ]; then
  echo "Error: no se pudo determinar el repositorio de GitHub desde el remoto $PUBLISH_REMOTE." >&2
  exit 1
fi

if [ ! -f "$notes_file" ]; then
  echo "Error: archivo de notas de la versión no encontrado en $notes_file." >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" rev-parse "$tag" >/dev/null 2>&1; then
  echo "Error: el tag local de git $tag no existe." >&2
  exit 1
fi

if [ "$dry_run" = true ]; then
  echo "[dry-run] gh release create $tag -R $GITHUB_REPO --title $tag --notes-file $notes_file"
  exit 0
fi

if ! git -C "$REPO_ROOT" ls-remote --exit-code --tags "$PUBLISH_REMOTE" "refs/tags/$tag" >/dev/null 2>&1; then
  echo "Error: el tag remoto $tag no se encontró en $PUBLISH_REMOTE. Sube primero el commit y el tag de la versión." >&2
  exit 1
fi

if gh release view "$tag" -R "$GITHUB_REPO" >/dev/null 2>&1; then
  gh release edit "$tag" -R "$GITHUB_REPO" --title "$tag" --notes-file "$notes_file"
  echo "Versión de GitHub $tag actualizada"
else
  gh release create "$tag" -R "$GITHUB_REPO" --title "$tag" --notes-file "$notes_file"
  echo "Versión de GitHub $tag creada"
fi
