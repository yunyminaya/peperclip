#!/usr/bin/env bash
#
# Termina todos los procesos locales del servidor de desarrollo de Paperclip (en todos los worktrees).
#
# Uso:
#   scripts/kill-dev.sh        # termina todos los procesos de desarrollo de paperclip
#   scripts/kill-dev.sh --dry  # muestra lo que se terminaría sin hacerlo
#

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry" || "${1:-}" == "--dry-run" || "${1:-}" == "-n" ]]; then
  DRY_RUN=true
fi

# Recopila los PID de los procesos de node ejecutados desde cualquier directorio de paperclip.
# Coincide con rutas como /Users/*/paperclip/... o /Users/*/paperclip-*/...
# Excluye procesos relacionados con postgres.
pids=()
lines=()

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  # omite procesos de postgres
  [[ "$line" == *postgres* ]] && continue
  pid=$(echo "$line" | awk '{print $2}')
  pids+=("$pid")
  lines+=("$line")
done < <(ps aux | grep -E '/paperclip(-[^/]+)?/' | grep node | grep -v grep || true)

if [[ ${#pids[@]} -eq 0 ]]; then
  echo "No se encontraron procesos de desarrollo de Paperclip."
  exit 0
fi

echo "Se encontraron ${#pids[@]} proceso(s) de desarrollo de Paperclip:"
echo ""

for i in "${!pids[@]}"; do
  line="${lines[$i]}"
  pid=$(echo "$line" | awk '{print $2}')
  start=$(echo "$line" | awk '{print $9}')
  cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
  # Acorta el comando para que sea legible
  cmd=$(echo "$cmd" | sed "s|$HOME/||g")
  printf "  PID %-7s  iniciado %-10s  %s\n" "$pid" "$start" "$cmd"
done

echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo "Simulación: vuelve a ejecutar sin --dry para terminar estos procesos."
  exit 0
fi

echo "Enviando SIGTERM..."
for pid in "${pids[@]}"; do
  kill "$pid" 2>/dev/null && echo "  $pid terminado" || echo "  $pid ya no existe"
done

# Da un momento a los procesos para salir y luego envía SIGKILL a los que queden
sleep 2
for pid in "${pids[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    echo "  $pid sigue activo, enviando SIGKILL..."
    kill -9 "$pid" 2>/dev/null || true
  fi
done

echo "Listo."
