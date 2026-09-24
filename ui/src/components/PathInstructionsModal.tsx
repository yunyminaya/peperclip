import { useState } from "react";
import { Apple, Monitor, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Platform = "mac" | "windows" | "linux";

const platforms: { id: Platform; label: string; icon: typeof Apple }[] = [
  { id: "mac", label: "macOS", icon: Apple },
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "linux", label: "Linux", icon: Terminal },
];

const instructions: Record<Platform, { steps: string[]; tip?: string }> = {
  mac: {
    steps: [
      "Abre Finder y navega hasta la carpeta.",
      "Haz clic derecho (o clic con Control) en la carpeta.",
      "Mantén presionada la tecla Opción (⌥): \"Copy\" cambia a \"Copy as Pathname\".",
      "Haz clic en \"Copy as Pathname\" y luego pega aquí.",
    ],
    tip: "También puedes abrir Terminal, escribir cd, arrastrar la carpeta a la ventana de la terminal y presionar Enter. Luego escribe pwd para ver la ruta completa.",
  },
  windows: {
    steps: [
      "Abre el Explorador de archivos y navega hasta la carpeta.",
      "Haz clic en la barra de direcciones de arriba: aparecerá la ruta completa.",
      "Copia la ruta y pégala aquí.",
    ],
    tip: "También puedes mantener presionada Mayús, hacer clic derecho en la carpeta y seleccionar \"Copy as path\".",
  },
  linux: {
    steps: [
      "Abre una terminal y navega al directorio con cd.",
      "Ejecuta pwd para mostrar la ruta completa.",
      "Copia la salida y pégala aquí.",
    ],
    tip: "En la mayoría de los gestores de archivos, Ctrl+L muestra la ruta completa en la barra de direcciones.",
  },
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
}

interface PathInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PathInstructionsModal({
  open,
  onOpenChange,
}: PathInstructionsModalProps) {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);

  const current = instructions[platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Cómo obtener una ruta completa</DialogTitle>
          <DialogDescription>
            Pega la ruta absoluta (p. ej.{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/Users/you/project</code>
            ) en el campo de entrada.
          </DialogDescription>
        </DialogHeader>

        {/* Pestañas de plataforma */}
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
                platform === p.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
              onClick={() => setPlatform(p.id)}
            >
              <p.icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          ))}
        </div>

        {/* Pasos */}
        <ol className="space-y-2 text-sm">
          {current.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">
                {i + 1}.
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {current.tip && (
          <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
            {current.tip}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pequeño botón "Elegir" que abre el PathInstructionsModal.
 * Reemplazo directo de los antiguos botones showDirectoryPicker.
 */
export function ChoosePathButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        Elegir
      </button>
      <PathInstructionsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
