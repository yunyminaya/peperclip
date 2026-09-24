import { useState, useRef, useEffect, useCallback } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";

/* ---- Texto de ayuda para los tooltips (?) ---- */
export const help: Record<string, string> = {
  name: "Nombre visible de este agente.",
  title: "Título del puesto mostrado en el organigrama.",
  role: "Rol organizacional. Determina la posición y las capacidades.",
  reportsTo: "El agente al que este reporta en la jerarquía de la organización.",
  capabilities: "Describe lo que este agente puede hacer. Se muestra en el organigrama y se usa para asignar tareas.",
  adapterType: "Cómo se ejecuta este agente: CLI local (Claude/Codex/OpenCode), OpenClaw Gateway, proceso generado o webhook HTTP genérico.",
  cwd: "Directorio de trabajo heredado en desuso como respaldo para adaptadores locales. Los agentes existentes pueden conservar este valor, pero las configuraciones nuevas deben usar espacios de trabajo de proyecto.",
  promptTemplate: "Se envía en cada latido. Mantenlo corto y dinámico. Úsalo para enmarcar la tarea actual, no para instrucciones estáticas extensas. Admite {{ agent.id }}, {{ agent.name }}, {{ agent.role }} y otras variables de plantilla.",
  model: "Reemplaza el modelo predeterminado usado por el adaptador.",
  thinkingEffort: "Controla la profundidad del razonamiento del modelo. Los valores admitidos varían según el adaptador/modelo.",
  chrome: "Activa la integración de Claude con Chrome pasando --chrome.",
  dangerouslySkipPermissions: "Ejecuta sin supervisión aprobando automáticamente los avisos de permisos del adaptador cuando sea compatible.",
  dangerouslyBypassSandbox: "Ejecuta Codex sin restricciones de sandbox. Requerido para acceso al sistema de archivos/red.",
  search: "Activa la capacidad de búsqueda web de Codex durante las ejecuciones.",
  workspaceStrategy: "Cómo Paperclip debe crear un espacio de trabajo de ejecución para este agente. Mantén project_primary para la ejecución normal con cwd, o usa git_worktree para checkouts aislados por issue.",
  workspaceBaseRef: "Ref base de git usada al crear una rama de worktree. Déjala en blanco para usar la ref del espacio de trabajo resuelta o HEAD.",
  workspaceBranchTemplate: "Plantilla para nombrar ramas derivadas. Admite {{issue.identifier}}, {{issue.title}}, {{agent.name}}, {{project.id}}, {{workspace.repoRef}} y {{slug}}.",
  worktreeParentDir: "Directorio donde se deben crear los worktrees derivados. Se admiten rutas absolutas, con prefijo ~ y relativas al repositorio.",
  runtimeServicesJson: "Definiciones opcionales de servicios de ejecución del espacio de trabajo. Úsalo para servidores de aplicaciones compartidos, workers u otros procesos complementarios de larga duración asociados al espacio de trabajo.",
  maxTurnsPerRun: "Número máximo de turnos del agente (llamadas a herramientas) por ejecución de latido.",
  command: "El comando a ejecutar (p. ej., node, python).",
  localCommand: "Reemplaza la ruta del comando CLI que el adaptador debe llamar (p. ej., /usr/local/bin/claude, codex, opencode).",
  args: "Argumentos de línea de comandos, separados por comas.",
  extraArgs: "Argumentos CLI adicionales para adaptadores locales, separados por comas.",
  envVars: "Variables de entorno inyectadas en el proceso del adaptador. Usa valores simples o referencias de secretos.",
  bootstrapPrompt: "Solo se envía cuando Paperclip inicia una sesión nueva. Úsalo para instrucciones estables de configuración que no deben repetirse en cada latido.",
  payloadTemplateJson: "JSON opcional que se fusiona con las cargas de solicitud del adaptador remoto antes de que Paperclip agregue sus campos estándar de activación y espacio de trabajo.",
  webhookUrl: "La URL que recibe solicitudes POST cuando se invoca al agente.",
  heartbeatInterval: "Ejecuta este agente automáticamente con un temporizador. Útil para tareas periódicas como buscar trabajo nuevo.",
  intervalSec: "Segundos entre invocaciones automáticas del latido.",
  timeoutSec: "Segundos máximos que puede durar una ejecución antes de terminarla. 0 significa sin límite de tiempo.",
  graceSec: "Segundos de espera tras enviar la interrupción antes de forzar la terminación del proceso.",
  wakeOnDemand: "Permite que este agente sea activado por asignaciones, llamadas a la API, acciones de la interfaz o sistemas automatizados.",
  cooldownSec: "Segundos mínimos entre ejecuciones consecutivas del latido.",
  maxConcurrentRuns: "Número máximo de ejecuciones de latido que pueden ejecutarse simultáneamente para este agente.",
  budgetMonthlyCents: "Límite de gasto mensual en centavos. 0 significa sin límite.",
};

export const adapterLabels: Record<string, string> = {
  claude_local: "Claude (local)",
  codex_local: "Codex (local)",
  gemini_local: "Gemini CLI (local)",
  opencode_local: "OpenCode (local)",
  openclaw_gateway: "OpenClaw Gateway",
  cursor: "Cursor (local)",
  process: "Process",
  http: "HTTP",
};

export const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

/* ---- Componentes primitivos ---- */

export function HintIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          <HelpCircle className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      {children}
    </div>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint && <HintIcon text={hint} />}
      </div>
      <button
        data-slot="toggle"
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-green-600" : "bg-muted"
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

export function ToggleWithNumber({
  label,
  hint,
  checked,
  onCheckedChange,
  number,
  onNumberChange,
  numberLabel,
  numberHint,
  numberPrefix,
  showNumber,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  number: number;
  onNumberChange: (v: number) => void;
  numberLabel: string;
  numberHint?: string;
  numberPrefix?: string;
  showNumber: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          {hint && <HintIcon text={hint} />}
        </div>
        <button
          data-slot="toggle"
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0",
            checked ? "bg-green-600" : "bg-muted"
          )}
          onClick={() => onCheckedChange(!checked)}
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
              checked ? "translate-x-4.5" : "translate-x-0.5"
            )}
          />
        </button>
      </div>
      {showNumber && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {numberPrefix && <span>{numberPrefix}</span>}
          <input
            type="number"
            className="w-16 rounded-md border border-border px-2 py-0.5 bg-transparent outline-none text-xs font-mono text-center"
            value={number}
            onChange={(e) => onNumberChange(Number(e.target.value))}
          />
          <span>{numberLabel}</span>
          {numberHint && <HintIcon text={numberHint} />}
        </div>
      )}
    </div>
  );
}

export function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  bordered,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(bordered && "border-t border-border")}>
      <button
        className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/30 transition-colors"
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        {title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function AutoExpandTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      style={{ minHeight }}
    />
  );
}

/**
 * Campo de texto que maneja el estado interno de borrador.
 * Llama a `onCommit` al perder el foco (y opcionalmente en cada cambio si `immediate` está activado).
 */
export function DraftInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      {...props}
    />
  );
}

/**
 * Área de texto autoexpandible con estado de borrador y confirmación al perder el foco.
 */
export function DraftTextarea({
  value,
  onCommit,
  immediate,
  placeholder,
  minRows,
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  placeholder?: string;
  minRows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [draft, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      style={{ minHeight }}
    />
  );
}

/**
 * Campo numérico con estado de borrador y confirmación al perder el foco.
 */
export function DraftNumberInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: number;
  onCommit: (v: number) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type">) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      type="number"
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(Number(e.target.value) || 0);
      }}
      onBlur={() => {
        const num = Number(draft) || 0;
        if (num !== value) onCommit(num);
      }}
      {...props}
    />
  );
}

/**
 * Botón "Elegir" que abre un diálogo explicando que el usuario debe
 * escribir la ruta manualmente por limitaciones de seguridad del navegador.
 */
export function ChoosePathButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0"
        onClick={() => setOpen(true)}
      >
        Elegir
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Especifica la ruta manualmente</DialogTitle>
            <DialogDescription>
              La seguridad del navegador impide que las aplicaciones lean rutas locales completas mediante un selector de archivos.
              Copia la ruta absoluta y pégala en el campo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section className="space-y-1.5">
              <p className="font-medium">macOS (Finder)</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Busca la carpeta en Finder.</li>
                <li>Mantén <kbd>Option</kbd> y haz clic derecho en la carpeta.</li>
                <li>Click "Copy &lt;folder name&gt; as Pathname".</li>
                <li>Pega el resultado en el campo de ruta.</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                /Users/yourname/Documents/project
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">Windows (File Explorer)</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Busca la carpeta en el Explorador de archivos.</li>
                <li>Mantén <kbd>Shift</kbd> y haz clic derecho en la carpeta.</li>
                <li>Click "Copy as path".</li>
                <li>Pega el resultado en el campo de ruta.</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                C:\Users\yourname\Documents\project
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">Alternativa en terminal (macOS/Linux)</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Ejecuta <code>cd /path/to/folder</code>.</li>
                <li>Ejecuta <code>pwd</code>.</li>
                <li>Copia la salida y pégala en el campo de ruta.</li>
              </ol>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Etiqueta + campo en la misma línea (diseño en línea para campos compactos).
 */
export function InlineField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      <div className="w-24 ml-auto">{children}</div>
    </div>
  );
}
