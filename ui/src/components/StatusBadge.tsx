import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

/**
 * Etiquetas canónicas en español para los valores de estado.
 * Solo cambia el texto visible; el valor lógico (`status`) no se toca.
 */
const statusLabels: Record<string, string> = {
  // Estados de agente
  active: "Activo",
  running: "En ejecución",
  paused: "En pausa",
  idle: "Inactivo",
  archived: "Archivado",

  // Estados de objetivo
  planned: "Planificado",
  achieved: "Logrado",
  completed: "Completado",

  // Estados de ejecución
  failed: "Fallido",
  timed_out: "Tiempo agotado",
  succeeded: "Exitoso",
  error: "Error",
  terminated: "Finalizado",
  pending: "Pendiente",

  // Estados de aprobación
  pending_approval: "Pendiente de aprobación",
  revision_requested: "Revisión solicitada",
  approved: "Aprobado",
  rejected: "Rechazado",

  // Estados de issue / proyecto
  backlog: "Backlog",
  todo: "Por hacer",
  in_progress: "En curso",
  in_review: "En revisión",
  blocked: "Bloqueado",
  done: "Terminado",
  cancelled: "Cancelado",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
        statusBadge[status] ?? statusBadgeDefault
      )}
    >
      {statusLabels[status] ?? status.replace("_", " ")}
    </span>
  );
}
