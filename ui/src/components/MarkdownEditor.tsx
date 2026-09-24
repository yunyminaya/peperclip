import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  CodeMirrorEditor,
  MDXEditor,
  codeBlockPlugin,
  codeMirrorPlugin,
  type CodeBlockEditorDescriptor,
  type MDXEditorMethods,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  type RealmPlugin,
} from "@mdxeditor/editor";
import { buildAgentMentionHref, buildProjectMentionHref } from "@paperclipai/shared";
import { AgentIcon } from "./AgentIconPicker";
import { applyMentionChipDecoration, clearMentionChipDecoration, parseMentionChipHref } from "../lib/mention-chips";
import { MentionAwareLinkNode, mentionAwareLinkNodeReplacement } from "../lib/mention-aware-link-node";
import { mentionDeletionPlugin } from "../lib/mention-deletion";
import { cn } from "../lib/utils";

/* ---- Tipos de mención ---- */

export interface MentionOption {
  id: string;
  name: string;
  kind?: "agent" | "project";
  agentId?: string;
  agentIcon?: string | null;
  projectId?: string;
  projectColor?: string | null;
}

/* ---- Props del editor ---- */

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  onBlur?: () => void;
  imageUploadHandler?: (file: File) => Promise<string>;
  bordered?: boolean;
  /** Lista de entidades mencionables. Habilita el autocompletado de menciones con @. */
  mentions?: MentionOption[];
  /** Se llama con Cmd/Ctrl+Enter. */
  onSubmit?: () => void;
}

export interface MarkdownEditorRef {
  focus: () => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSafeMarkdownLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return !/^(javascript|data|vbscript):/i.test(trimmed);
}

/* ---- Funciones auxiliares de detección de menciones ---- */

interface MentionState {
  query: string;
  top: number;
  left: number;
  /** Coordenadas relativas al viewport para posicionar el portal. */
  viewportTop: number;
  viewportLeft: number;
  textNode: Text;
  atPos: number;
  endPos: number;
}

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  txt: "Texto",
  md: "Markdown",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  ts: "TypeScript",
  tsx: "TypeScript (TSX)",
  json: "JSON",
  bash: "Bash",
  sh: "Shell",
  python: "Python",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  yaml: "YAML",
  yml: "YAML",
};

const FALLBACK_CODE_BLOCK_DESCRIPTOR: CodeBlockEditorDescriptor = {
  // Mantener esto por debajo de la prioridad del descriptor de codeMirrorPlugin para que los lenguajes conocidos
  // sigan usando la ruta de coincidencia estándar; esto captura bloques mal formados/desconocidos.
  priority: 0,
  match: () => true,
  Editor: CodeMirrorEditor,
};

function detectMention(container: HTMLElement): MentionState | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;
  if (!container.contains(textNode)) return null;

  const text = textNode.textContent ?? "";
  const offset = range.startOffset;

  // Recorrer hacia atrás desde el cursor para encontrar @
  let atPos = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1])) {
        atPos = i;
      }
      break;
    }
    if (/\s/.test(ch)) break;
  }

  if (atPos === -1) return null;

  const query = text.slice(atPos + 1, offset);

  // Obtener la posición relativa al contenedor
  const tempRange = document.createRange();
  tempRange.setStart(textNode, atPos);
  tempRange.setEnd(textNode, atPos + 1);
  const rect = tempRange.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return {
    query,
    top: rect.bottom - containerRect.top,
    left: rect.left - containerRect.left,
    viewportTop: rect.bottom,
    viewportLeft: rect.left,
    textNode: textNode as Text,
    atPos,
    endPos: offset,
  };
}

function mentionMarkdown(option: MentionOption): string {
  if (option.kind === "project" && option.projectId) {
    return `[@${option.name}](${buildProjectMentionHref(option.projectId, option.projectColor ?? null)}) `;
  }
  const agentId = option.agentId ?? option.id.replace(/^agent:/, "");
  return `[@${option.name}](${buildAgentMentionHref(agentId, option.agentIcon ?? null)}) `;
}

/** Reemplaza `@<query>` en la cadena de markdown con el token de mención seleccionado. */
function applyMention(markdown: string, query: string, option: MentionOption): string {
  const search = `@${query}`;
  const replacement = mentionMarkdown(option);
  const idx = markdown.lastIndexOf(search);
  if (idx === -1) return markdown;
  return markdown.slice(0, idx) + replacement + markdown.slice(idx + search.length);
}

/* ---- Componente ---- */

export const MarkdownEditor = forwardRef<MarkdownEditorRef, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  contentClassName,
  onBlur,
  imageUploadHandler,
  bordered = true,
  mentions,
  onSubmit,
}: MarkdownEditorProps, forwardedRef) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ref = useRef<MDXEditorMethods>(null);
  const latestValueRef = useRef(value);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  // Ref estable para imageUploadHandler para que los plugins no se recreen en cada render
  const imageUploadHandlerRef = useRef(imageUploadHandler);
  imageUploadHandlerRef.current = imageUploadHandler;

  // Estado de mención (ref sincronizado para que los callbacks siempre vean el valor más reciente)
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const mentionStateRef = useRef<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionActive = mentionState !== null && mentions && mentions.length > 0;
  const mentionOptionByKey = useMemo(() => {
    const map = new Map<string, MentionOption>();
    for (const mention of mentions ?? []) {
      if (mention.kind === "agent") {
        const agentId = mention.agentId ?? mention.id.replace(/^agent:/, "");
        map.set(`agent:${agentId}`, mention);
      }
      if (mention.kind === "project" && mention.projectId) {
        map.set(`project:${mention.projectId}`, mention);
      }
    }
    return map;
  }, [mentions]);

  const filteredMentions = useMemo(() => {
    if (!mentionState || !mentions) return [];
    const q = mentionState.query.toLowerCase();
    return mentions.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionState?.query, mentions]);

  useImperativeHandle(forwardedRef, () => ({
    focus: () => {
      ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
    },
  }), []);

  // Si se debe incluir el plugin de imágenes (el booleano es estable entre renders
  // mientras la presencia del handler no cambie)
  const hasImageUpload = Boolean(imageUploadHandler);

  const plugins = useMemo<RealmPlugin[]>(() => {
    const imageHandler = hasImageUpload
      ? async (file: File) => {
          const handler = imageUploadHandlerRef.current;
          if (!handler) throw new Error("No image upload handler");
          try {
            const src = await handler(file);
            setUploadError(null);
            // Después de que MDXEditor inserte la imagen, asegurar que le sigan dos saltos de línea
            // para que el cursor no quede pegado a la imagen.
            setTimeout(() => {
              const current = latestValueRef.current;
              const escapedSrc = escapeRegExp(src);
              const updated = current.replace(
                new RegExp(`(!\\[[^\\]]*\\]\\(${escapedSrc}\\))(?!\\n\\n)`, "g"),
                "$1\n\n",
              );
              if (updated !== current) {
                latestValueRef.current = updated;
                ref.current?.setMarkdown(updated);
                onChange(updated);
                requestAnimationFrame(() => {
                  ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
                });
              }
            }, 100);
            return src;
          } catch (err) {
            const message = err instanceof Error ? err.message : "No se pudo subir la imagen";
            setUploadError(message);
            throw err;
          }
        }
      : undefined;
    const all: RealmPlugin[] = [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      tablePlugin(),
      linkPlugin({ validateUrl: isSafeMarkdownLinkUrl }),
      linkDialogPlugin(),
      mentionDeletionPlugin(),
      thematicBreakPlugin(),
      codeBlockPlugin({
        defaultCodeBlockLanguage: "txt",
        codeBlockEditorDescriptors: [FALLBACK_CODE_BLOCK_DESCRIPTOR],
      }),
      codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
      markdownShortcutPlugin(),
    ];
    if (imageHandler) {
      all.push(imagePlugin({ imageUploadHandler: imageHandler }));
    }
    return all;
  }, [hasImageUpload]);

  useEffect(() => {
    if (value !== latestValueRef.current) {
      ref.current?.setMarkdown(value);
      latestValueRef.current = value;
    }
  }, [value]);

  const decorateProjectMentions = useCallback(() => {
    const editable = containerRef.current?.querySelector('[contenteditable="true"]');
    if (!editable) return;
    const links = editable.querySelectorAll("a");
    for (const node of links) {
      const link = node as HTMLAnchorElement;
      const parsed = parseMentionChipHref(link.getAttribute("href") ?? "");
      if (!parsed) {
        clearMentionChipDecoration(link);
        continue;
      }

      if (parsed.kind === "project") {
        const option = mentionOptionByKey.get(`project:${parsed.projectId}`);
        applyMentionChipDecoration(link, {
          ...parsed,
          color: parsed.color ?? option?.projectColor ?? null,
        });
        continue;
      }

      const option = mentionOptionByKey.get(`agent:${parsed.agentId}`);
      applyMentionChipDecoration(link, {
        ...parsed,
        icon: parsed.icon ?? option?.agentIcon ?? null,
      });
    }
  }, [mentionOptionByKey]);

  // Detección de menciones: escuchar cambios de selección y eventos de entrada
  const checkMention = useCallback(() => {
    if (!mentions || mentions.length === 0 || !containerRef.current) {
      mentionStateRef.current = null;
      setMentionState(null);
      return;
    }
    const result = detectMention(containerRef.current);
    mentionStateRef.current = result;
    if (result) {
      setMentionState(result);
      setMentionIndex(0);
    } else {
      setMentionState(null);
    }
  }, [mentions]);

  useEffect(() => {
    if (!mentions || mentions.length === 0) return;

    const el = containerRef.current;
    // Escuchar eventos de entrada en el contenedor para que la detección de menciones
    // también se dispare al escribir (p. ej. espacio para descartar).
    const onInput = () => requestAnimationFrame(checkMention);

    document.addEventListener("selectionchange", checkMention);
    el?.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("selectionchange", checkMention);
      el?.removeEventListener("input", onInput, true);
    };
  }, [checkMention, mentions]);

  useEffect(() => {
    const editable = containerRef.current?.querySelector('[contenteditable="true"]');
    if (!editable) return;
    decorateProjectMentions();
    const observer = new MutationObserver(() => {
      decorateProjectMentions();
    });
    observer.observe(editable, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [decorateProjectMentions, value]);

  const selectMention = useCallback(
    (option: MentionOption) => {
      // Leer desde el ref para evitar problemas de cierre obsoleto (selectionchange puede
      // actualizar el estado entre el último render y la ejecución de este callback).
      const state = mentionStateRef.current;
      if (!state) return;
      const current = latestValueRef.current;
      const next = applyMention(current, state.query, option);
      if (next !== current) {
        latestValueRef.current = next;
        ref.current?.setMarkdown(next);
        onChange(next);
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const editable = containerRef.current?.querySelector('[contenteditable="true"]');
          if (!(editable instanceof HTMLElement)) return;
          decorateProjectMentions();
          editable.focus();

          const mentionHref = option.kind === "project" && option.projectId
            ? buildProjectMentionHref(option.projectId, option.projectColor ?? null)
            : buildAgentMentionHref(
                option.agentId ?? option.id.replace(/^agent:/, ""),
                option.agentIcon ?? null,
              );
          const matchingMentions = Array.from(editable.querySelectorAll("a"))
            .filter((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
            .filter((link) => {
              const href = link.getAttribute("href") ?? "";
              return href === mentionHref && link.textContent === `@${option.name}`;
            });
          const containerRect = containerRef.current?.getBoundingClientRect();
          const target = matchingMentions.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            const leftA = containerRect ? rectA.left - containerRect.left : rectA.left;
            const topA = containerRect ? rectA.top - containerRect.top : rectA.top;
            const leftB = containerRect ? rectB.left - containerRect.left : rectB.left;
            const topB = containerRect ? rectB.top - containerRect.top : rectB.top;
            const distA = Math.hypot(leftA - state.left, topA - state.top);
            const distB = Math.hypot(leftB - state.left, topB - state.top);
            return distA - distB;
          })[0] ?? null;
          if (!target) return;

          const selection = window.getSelection();
          if (!selection) return;
          const range = document.createRange();
          const nextSibling = target.nextSibling;
          if (nextSibling?.nodeType === Node.TEXT_NODE) {
            const text = nextSibling.textContent ?? "";
            if (text.startsWith(" ")) {
              range.setStart(nextSibling, 1);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
              return;
            }
          }

          range.setStartAfter(target);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        });
      });

      mentionStateRef.current = null;
      setMentionState(null);
    },
    [decorateProjectMentions, onChange],
  );

  function hasFilePayload(evt: DragEvent<HTMLDivElement>) {
    return Array.from(evt.dataTransfer?.types ?? []).includes("Files");
  }

  const canDropImage = Boolean(imageUploadHandler);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative paperclip-mdxeditor-scope",
        bordered ? "rounded-md border border-border bg-transparent" : "bg-transparent",
        isDragOver && "ring-1 ring-primary/60 bg-accent/20",
        className,
      )}
      onKeyDownCapture={(e) => {
        // Cmd/Ctrl+Enter para enviar
        if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          onSubmit();
          return;
        }

        // Manejo de teclado para menciones
        if (mentionActive) {
          // Espacio descarta el popup (dejar que el carácter se escriba normalmente)
          if (e.key === " ") {
            mentionStateRef.current = null;
            setMentionState(null);
            return;
          }
          // Escape siempre descarta
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            mentionStateRef.current = null;
            setMentionState(null);
            return;
          }
          // Flechas / Enter / Tab solo cuando hay resultados filtrados
          if (filteredMentions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              e.stopPropagation();
              setMentionIndex((prev) => Math.min(prev + 1, filteredMentions.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              setMentionIndex((prev) => Math.max(prev - 1, 0));
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              selectMention(filteredMentions[mentionIndex]);
              return;
            }
          }
        }
      }}
      onDragEnter={(evt) => {
        if (!canDropImage || !hasFilePayload(evt)) return;
        dragDepthRef.current += 1;
        setIsDragOver(true);
      }}
      onDragOver={(evt) => {
        if (!canDropImage || !hasFilePayload(evt)) return;
        evt.preventDefault();
        evt.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        if (!canDropImage) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragOver(false);
      }}
      onDrop={() => {
        dragDepthRef.current = 0;
        setIsDragOver(false);
      }}
    >
      <MDXEditor
        ref={ref}
        markdown={value}
        placeholder={placeholder}
        onChange={(next) => {
          latestValueRef.current = next;
          onChange(next);
        }}
        onBlur={() => onBlur?.()}
        className={cn("paperclip-mdxeditor", !bordered && "paperclip-mdxeditor--borderless")}
        contentEditableClassName={cn(
          "paperclip-mdxeditor-content focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:list-item",
          contentClassName,
        )}
        additionalLexicalNodes={[MentionAwareLinkNode, mentionAwareLinkNodeReplacement]}
        plugins={plugins}
      />

      {/* Desplegable de menciones — renderizado vía portal para que no lo recorten los contenedores con overflow */}
      {mentionActive && filteredMentions.length > 0 &&
        createPortal(
          <div
            className="fixed z-[9999] min-w-[180px] max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover shadow-md"
            style={{ top: mentionState.viewportTop + 4, left: mentionState.viewportLeft }}
          >
            {filteredMentions.map((option, i) => (
              <button
                key={option.id}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-accent/50 transition-colors",
                  i === mentionIndex && "bg-accent",
                )}
                onMouseDown={(e) => {
                  e.preventDefault(); // evitar el blur
                  selectMention(option);
                }}
                onMouseEnter={() => setMentionIndex(i)}
              >
                {option.kind === "project" && option.projectId ? (
                  <span
                    className="inline-flex h-2 w-2 rounded-full border border-border/50"
                    style={{ backgroundColor: option.projectColor ?? "#64748b" }}
                  />
                ) : (
                  <AgentIcon
                    icon={option.agentIcon}
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                <span>{option.name}</span>
                {option.kind === "project" && option.projectId && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                    Proyecto
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}

      {isDragOver && canDropImage && (
        <div
          className={cn(
            "pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded-md border border-dashed border-primary/80 bg-primary/10 text-xs font-medium text-primary",
            !bordered && "inset-0 rounded-sm",
          )}
        >
          Suelta la imagen para subirla
        </div>
      )}
      {uploadError && (
        <p className="px-3 pb-2 text-xs text-destructive">{uploadError}</p>
      )}
    </div>
  );
});
