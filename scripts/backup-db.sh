#!/usr/bin/env bash
set -euo pipefail

# Respalda la base de datos de Paperclip configurada en el directorio de respaldos configurado
# (predeterminado: ~/.paperclip/instances/<instance-id>/data/backups)
#
# Uso:
#   ./scripts/backup-db.sh
#   pnpm db:backup
#
# El postgres embebido debe estar en ejecución (inícialo con: pnpm dev)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"
exec pnpm paperclipai db:backup "$@"
