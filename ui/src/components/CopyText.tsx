import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CopyTextProps {
  text: string;
  /** Qué se muestra. Por defecto: `text`. */
  children?: React.ReactNode;
  className?: string;
  /** Mensaje del tooltip que se muestra después de copiar. Por defecto: "¡Copiado!" */
  copiedLabel?: string;
}

export function CopyText({ text, children, className, copiedLabel = "¡Copiado!" }: CopyTextProps) {
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState(copiedLabel);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setLabel(copiedLabel);
    } catch {
      setLabel("No se pudo copiar");
    }
    clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 1500);
  }, [copiedLabel, text]);

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "cursor-copy hover:text-foreground transition-colors",
          className,
        )}
        onClick={handleClick}
      >
        {children ?? text}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 rounded-md bg-foreground text-background px-2 py-1 text-xs whitespace-nowrap transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}
