import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginStream,
  usePluginToast,
  type PluginCommentAnnotationProps,
  type PluginCommentContextMenuItemProps,
  type PluginDetailTabProps,
  type PluginPageProps,
  type PluginProjectSidebarItemProps,
  type PluginSettingsPageProps,
  type PluginSidebarProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import {
  DEFAULT_CONFIG,
  JOB_KEYS,
  PAGE_ROUTE,
  PLUGIN_ID,
  SAFE_COMMANDS,
  SLOT_IDS,
  STREAM_CHANNELS,
  TOOL_NAMES,
  WEBHOOK_KEYS,
} from "../constants.js";
import { AsciiArtAnimation } from "./AsciiArtAnimation.js";

type CompanyRecord = { id: string; name: string; issuePrefix?: string | null; status?: string | null };
type ProjectRecord = { id: string; name: string; status?: string; path?: string | null };
type IssueRecord = { id: string; title: string; status: string; projectId?: string | null };
type GoalRecord = { id: string; title: string; status: string };
type AgentRecord = { id: string; name: string; status: string };
type HostIssueRecord = {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  createdAt?: string;
};
type HostHeartbeatRunRecord = {
  id: string;
  status: string;
  invocationSource?: string | null;
  triggerDetail?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  agentId?: string | null;
};
type HostLiveRunRecord = HostHeartbeatRunRecord & {
  agentName?: string | null;
  issueId?: string | null;
};

type OverviewData = {
  pluginId: string;
  version: string;
  capabilities: string[];
  config: Record<string, unknown>;
  runtimeLaunchers: Array<{ id: string; displayName: string; placementZone: string }>;
  recentRecords: Array<{ id: string; source: string; message: string; createdAt: string; level: string; data?: unknown }>;
  counts: {
    companies: number;
    projects: number;
    issues: number;
    goals: number;
    agents: number;
    entities: number;
  };
  lastJob: unknown;
  lastWebhook: unknown;
  lastProcessResult: unknown;
  streamChannels: Record<string, string>;
  safeCommands: Array<{ key: string; label: string; description: string }>;
  manifest: {
    jobs: Array<{ jobKey: string; displayName: string; schedule?: string }>;
    webhooks: Array<{ endpointKey: string; displayName: string }>;
    tools: Array<{ name: string; displayName: string; description: string }>;
  };
};

type EntityRecord = {
  id: string;
  entityType: string;
  title: string | null;
  status: string | null;
  scopeKind: string;
  scopeId: string | null;
  externalId: string | null;
  data: unknown;
};

type StateValueData = {
  scope: {
    scopeKind: string;
    scopeId?: string;
    namespace?: string;
    stateKey: string;
  };
  value: unknown;
};

type PluginConfigData = {
  showSidebarEntry?: boolean;
  showSidebarPanel?: boolean;
  showProjectSidebarItem?: boolean;
  showCommentAnnotation?: boolean;
  showCommentContextMenuItem?: boolean;
  enableWorkspaceDemos?: boolean;
  enableProcessDemos?: boolean;
};

type CommentContextData = {
  commentId: string;
  issueId: string;
  preview: string;
  length: number;
  copiedCount: number;
} | null;

type ProcessResult = {
  commandKey: string;
  cwd: string;
  code: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
};

const layoutStack: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  background: "var(--card, transparent)",
};

const subtleCardStyle: CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--border) 75%, transparent)",
  borderRadius: "10px",
  padding: "12px",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  marginBottom: "10px",
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "6px 12px",
  fontSize: "12px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "var(--foreground)",
  color: "var(--background)",
  borderColor: "var(--foreground)",
};

function toneButtonStyle(tone: "success" | "warn" | "info"): CSSProperties {
  if (tone === "success") {
    return {
      ...buttonStyle,
      background: "color-mix(in srgb, #16a34a 18%, transparent)",
      borderColor: "color-mix(in srgb, #16a34a 60%, var(--border))",
      color: "#86efac",
    };
  }
  if (tone === "warn") {
    return {
      ...buttonStyle,
      background: "color-mix(in srgb, #d97706 18%, transparent)",
      borderColor: "color-mix(in srgb, #d97706 60%, var(--border))",
      color: "#fcd34d",
    };
  }
  return {
    ...buttonStyle,
    background: "color-mix(in srgb, #2563eb 18%, transparent)",
    borderColor: "color-mix(in srgb, #2563eb 60%, var(--border))",
    color: "#93c5fd",
  };
}

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "8px 10px",
  background: "transparent",
  color: "inherit",
  fontSize: "12px",
};

const codeStyle: CSSProperties = {
  margin: 0,
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid var(--border)",
  background: "color-mix(in srgb, var(--muted, #888) 16%, transparent)",
  overflowX: "auto",
  fontSize: "11px",
  lineHeight: 1.45,
};

const widgetGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const widgetStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "14px",
  display: "grid",
  gap: "8px",
  background: "color-mix(in srgb, var(--card, transparent) 72%, transparent)",
};

const mutedTextStyle: CSSProperties = {
  fontSize: "12px",
  opacity: 0.72,
  lineHeight: 1.45,
};

function hostPath(companyPrefix: string | null | undefined, suffix: string): string {
  return companyPrefix ? `/${companyPrefix}${suffix}` : suffix;
}

function pluginPagePath(companyPrefix: string | null | undefined): string {
  return hostPath(companyPrefix, `/${PAGE_ROUTE}`);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getObjectString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const next = (value as Record<string, unknown>)[key];
  return typeof next === "string" ? next : null;
}

function getObjectNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") return null;
  const next = (value as Record<string, unknown>)[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
}

function isKitchenSinkDemoCompany(company: CompanyRecord): boolean {
  return company.name.startsWith("Kitchen Sink Demo");
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre style={codeStyle}>{JSON.stringify(value, null, 2)}</pre>;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={cardStyle}>
      <div style={sectionHeaderStyle}>
        <strong>{title}</strong>
        {action}
      </div>
      <div style={layoutStack}>{children}</div>
    </section>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        borderRadius: "999px",
        border: "1px solid var(--border)",
        padding: "2px 8px",
        fontSize: "11px",
      }}
    >
      {label}
    </span>
  );
}

function MiniWidget({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section style={widgetStyle}>
      {eyebrow ? <div style={{ fontSize: "11px", opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.06em" }}>{eyebrow}</div> : null}
      <strong>{title}</strong>
      <div style={layoutStack}>{children}</div>
    </section>
  );
}

function MiniList({
  items,
  render,
  empty,
}: {
  items: unknown[];
  render: (item: unknown, index: number) => ReactNode;
  empty: string;
}) {
  if (items.length === 0) return <div style={{ fontSize: "12px", opacity: 0.7 }}>{empty}</div>;
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      {items.map((item, index) => (
        <div key={index} style={subtleCardStyle}>
          {render(item, index)}
        </div>
      ))}
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <span style={{ fontSize: "11px", opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <div style={{ fontSize: "12px" }}>{value}</div>
    </div>
  );
}

function PaginatedDomainCard({
  title,
  items,
  totalCount,
  empty,
  onLoadMore,
  render,
}: {
  title: string;
  items: unknown[];
  totalCount: number | null;
  empty: string;
  onLoadMore: () => void;
  render: (item: unknown, index: number) => ReactNode;
}) {
  const hasMore = totalCount !== null ? items.length < totalCount : false;

  return (
    <div style={subtleCardStyle}>
      <div style={sectionHeaderStyle}>
        <strong>{title}</strong>
        {totalCount !== null ? <span style={mutedTextStyle}>{items.length} / {totalCount}</span> : null}
      </div>
      <MiniList items={items} empty={empty} render={render} />
      {hasMore ? (
        <div style={{ marginTop: "10px" }}>
          <button type="button" style={buttonStyle} onClick={onLoadMore}>
            Cargar 20 más
          </button>
        </div>
      ) : null}
    </div>
  );
}

function usePluginOverview(companyId: string | null) {
  return usePluginData<OverviewData>("overview", companyId ? { companyId } : {});
}

function usePluginConfigData() {
  return usePluginData<PluginConfigData>("plugin-config");
}

function hostFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  }).then(async (response) => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }
    return await response.json() as T;
  });
}

function useSettingsConfig() {
  const [configJson, setConfigJson] = useState<Record<string, unknown>>({ ...DEFAULT_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    hostFetchJson<{ configJson?: Record<string, unknown> | null } | null>(`/api/plugins/${PLUGIN_ID}/config`)
      .then((result) => {
        if (cancelled) return;
        setConfigJson({ ...DEFAULT_CONFIG, ...(result?.configJson ?? {}) });
        setError(null);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(nextConfig: Record<string, unknown>) {
    setSaving(true);
    try {
      await hostFetchJson(`/api/plugins/${PLUGIN_ID}/config`, {
        method: "POST",
        body: JSON.stringify({ configJson: nextConfig }),
      });
      setConfigJson(nextConfig);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setSaving(false);
    }
  }

  return {
    configJson,
    setConfigJson,
    loading,
    saving,
    error,
    save,
  };
}

function CompactSurfaceSummary({ label, entityType }: { label: string; entityType?: string | null }) {
  const context = useHostContext();
  const companyId = context.companyId;
  const entityId = context.entityId;
  const resolvedEntityType = entityType ?? context.entityType ?? null;
  const entityQuery = usePluginData(
    "entity-context",
    companyId && entityId && resolvedEntityType
      ? { companyId, entityId, entityType: resolvedEntityType }
      : {},
  );
  const writeMetric = usePluginAction("write-metric");

  return (
    <div style={layoutStack}>
      <div style={rowStyle}>
        <strong>{label}</strong>
        {resolvedEntityType ? <Pill label={resolvedEntityType} /> : null}
      </div>
      <div style={mutedTextStyle}>
        Esta demo de superficie muestra el contexto del host para el punto de montaje actual. El botón de métrica registra un contador de demo para que puedas verificar el cableado de métricas del plugin desde una superficie contextual.
      </div>
      <JsonBlock value={context} />
      <button
        type="button"
        style={buttonStyle}
        onClick={() => {
          if (!companyId) return;
          void writeMetric({ name: "surface_click", value: 1, companyId }).catch(console.error);
        }}
      >
        Registrar métrica de demo
      </button>
      {entityQuery.data ? <JsonBlock value={entityQuery.data} /> : null}
    </div>
  );
}

function KitchenSinkPageWidgets({ context }: { context: PluginPageProps["context"] }) {
  const overview = usePluginOverview(context.companyId);
  const toast = usePluginToast();
  const emitDemoEvent = usePluginAction("emit-demo-event");
  const startProgressStream = usePluginAction("start-progress-stream");
  const writeMetric = usePluginAction("write-metric");
  const progressStream = usePluginStream<{ step?: number; message?: string }>(
    STREAM_CHANNELS.progress,
    { companyId: context.companyId ?? undefined },
  );
  const [quickActionStatus, setQuickActionStatus] = useState<{
    title: string;
    body: string;
    tone: "info" | "success" | "warn" | "error";
  } | null>(null);

  useEffect(() => {
    const latest = progressStream.events.at(-1);
    if (!latest) return;
    setQuickActionStatus({
      title: "Actualización del stream de progreso",
      body: latest.message ?? `Paso ${latest.step ?? "?"}`,
      tone: "info",
    });
  }, [progressStream.events]);

  return (
    <div style={widgetGridStyle}>
      <MiniWidget title="Resumen de runtime" eyebrow="Resumen">
        <div style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
          <div>Empresas: {overview.data?.counts.companies ?? 0}</div>
          <div>Proyectos: {overview.data?.counts.projects ?? 0}</div>
          <div>Issues: {overview.data?.counts.issues ?? 0}</div>
          <div>Agentes: {overview.data?.counts.agents ?? 0}</div>
        </div>
      </MiniWidget>

      <MiniWidget title="Acciones rápidas" eyebrow="Pruébalo">
        <div style={rowStyle}>
          <button
            type="button"
            style={toneButtonStyle("success")}
            onClick={() =>
              toast({
                title: "Toast de éxito de Kitchen Sink",
                body: "Esto lo renderiza el sistema de toasts del host desde la interfaz del plugin.",
                tone: "success",
              })}
          >
            Toast de éxito
          </button>
          <button
            type="button"
            style={toneButtonStyle("warn")}
            onClick={() =>
              toast({
                title: "Toast de advertencia de Kitchen Sink",
                body: "Usa este patrón para comentarios del plugin dirigidos al usuario.",
                tone: "warn",
              })}
          >
            Toast de advertencia
          </button>
          <button
            type="button"
            style={toneButtonStyle("info")}
            onClick={() =>
              toast({
                title: "Abrir panel",
                body: "Los toasts pueden enlazar de vuelta a páginas del host.",
                tone: "info",
                action: {
                  label: "Ir",
                  href: hostPath(context.companyPrefix, "/dashboard"),
                },
              })}
          >
            Toast de acción
          </button>
        </div>
        <div style={rowStyle}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              if (!context.companyId) return;
              void emitDemoEvent({ companyId: context.companyId, message: "Disparado desde la página de Kitchen Sink" })
                .then((next) => {
                  overview.refresh();
                  const message = getObjectString(next, "message") ?? "Evento de demo emitido";
                  setQuickActionStatus({
                    title: "Evento emitido",
                    body: message,
                    tone: "success",
                  });
                  toast({
                    title: "Evento emitido",
                    body: message,
                    tone: "success",
                  });
                })
                .catch((error) => {
                  const message = getErrorMessage(error);
                  setQuickActionStatus({
                    title: "Evento fallido",
                    body: message,
                    tone: "error",
                  });
                  toast({
                    title: "Evento fallido",
                    body: message,
                    tone: "error",
                  });
                });
            }}
          >
            Emitir evento
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              if (!context.companyId) return;
              void startProgressStream({ companyId: context.companyId, steps: 4 })
                .then(() => {
                  setQuickActionStatus({
                    title: "Stream iniciado",
                    body: "Mira las actualizaciones de progreso en vivo abajo.",
                    tone: "info",
                  });
                  toast({
                    title: "Stream de progreso iniciado",
                    body: "Las actualizaciones en vivo aparecerán en el panel de acciones rápidas.",
                    tone: "info",
                  });
                })
                .catch((error) => {
                  const message = getErrorMessage(error);
                  setQuickActionStatus({
                    title: "Stream fallido",
                    body: message,
                    tone: "error",
                  });
                  toast({
                    title: "Stream de progreso fallido",
                    body: message,
                    tone: "error",
                  });
                });
            }}
          >
            Iniciar stream
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              if (!context.companyId) return;
              void writeMetric({ companyId: context.companyId, name: "page_quick_action", value: 1 })
                .then((next) => {
                  overview.refresh();
                  const value = getObjectNumber(next, "value") ?? 1;
                  const body = `demo.page_quick_action registrado = ${value}`;
                  setQuickActionStatus({
                    title: "Métrica registrada",
                    body,
                    tone: "success",
                  });
                  toast({
                    title: "Métrica registrada",
                    body,
                    tone: "success",
                  });
                })
                .catch((error) => {
                  const message = getErrorMessage(error);
                  setQuickActionStatus({
                    title: "Métrica fallida",
                    body: message,
                    tone: "error",
                  });
                  toast({
                    title: "Métrica fallida",
                    body: message,
                    tone: "error",
                  });
                });
            }}
          >
            Escribir métrica
          </button>
        </div>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={mutedTextStyle}>
            Eventos de progreso recientes: {progressStream.events.length}
          </div>
          {quickActionStatus ? (
            <div
              style={{
                ...subtleCardStyle,
                borderColor:
                  quickActionStatus.tone === "error"
                    ? "color-mix(in srgb, #dc2626 45%, var(--border))"
                    : quickActionStatus.tone === "warn"
                      ? "color-mix(in srgb, #d97706 45%, var(--border))"
                      : quickActionStatus.tone === "success"
                        ? "color-mix(in srgb, #16a34a 45%, var(--border))"
                        : "color-mix(in srgb, #2563eb 45%, var(--border))",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 600 }}>{quickActionStatus.title}</div>
              <div style={mutedTextStyle}>{quickActionStatus.body}</div>
            </div>
          ) : null}
          {progressStream.events.length > 0 ? (
            <JsonBlock value={progressStream.events.slice(-3)} />
          ) : null}
        </div>
      </MiniWidget>

      <MiniWidget title="Mapa de superficies" eyebrow="Interfaz">
        <div style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
          <div>Enlace y panel de barra lateral</div>
          <div>Widget del panel</div>
          <div>Enlace de proyecto, pestaña, botón de barra de herramientas, lanzador</div>
          <div>Pestaña de issue, vista de tarea, botón de barra de herramientas, lanzador</div>
          <div>Anotación de comentario y acción de comentario</div>
        </div>
      </MiniWidget>

      <MiniWidget title="Cobertura del manifiesto" eyebrow="Worker">
        <div style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
          <div>Tareas: {overview.data?.manifest.jobs.length ?? 0}</div>
          <div>Webhooks: {overview.data?.manifest.webhooks.length ?? 0}</div>
          <div>Herramientas: {overview.data?.manifest.tools.length ?? 0}</div>
          <div>Lanzadores: {overview.data?.runtimeLaunchers.length ?? 0}</div>
        </div>
      </MiniWidget>

      <MiniWidget title="Último estado de runtime" eyebrow="Diagnósticos">
        <div style={mutedTextStyle}>
          Esto se actualiza a medida que usas las demos del worker.
        </div>
        <JsonBlock
          value={{
            lastJob: overview.data?.lastJob ?? null,
            lastWebhook: overview.data?.lastWebhook ?? null,
            lastProcessResult: overview.data?.lastProcessResult ?? null,
          }}
        />
      </MiniWidget>

    </div>
  );
}

function KitchenSinkIssueCrudDemo({ context }: { context: PluginPageProps["context"] }) {
  const toast = usePluginToast();
  const [issues, setIssues] = useState<HostIssueRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { title: string; status: string }>>({});
  const [createTitle, setCreateTitle] = useState("Kitchen Sink demo issue");
  const [createDescription, setCreateDescription] = useState("Creado desde la página embebida de Kitchen Sink.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadIssues() {
    if (!context.companyId) return;
    setLoading(true);
    try {
      const result = await hostFetchJson<HostIssueRecord[]>(`/api/companies/${context.companyId}/issues`);
      const nextIssues = result.slice(0, 8);
      setIssues(nextIssues);
      setDrafts(
        Object.fromEntries(
          nextIssues.map((issue) => [issue.id, { title: issue.title, status: issue.status }]),
        ),
      );
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIssues();
  }, [context.companyId]);

  async function handleCreate() {
    if (!context.companyId || !createTitle.trim()) return;
    try {
      await hostFetchJson(`/api/companies/${context.companyId}/issues`, {
        method: "POST",
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDescription.trim() || undefined,
          status: "todo",
          priority: "medium",
        }),
      });
      toast({ title: "Issue creado", body: createTitle.trim(), tone: "success" });
      setCreateTitle("Issue de demo de Kitchen Sink");
      setCreateDescription("Creado desde la página embebida de Kitchen Sink.");
      await loadIssues();
    } catch (nextError) {
      toast({ title: "Error al crear el issue", body: getErrorMessage(nextError), tone: "error" });
    }
  }

  async function handleSave(issueId: string) {
    const draft = drafts[issueId];
    if (!draft) return;
    try {
      await hostFetchJson(`/api/issues/${issueId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title.trim(),
          status: draft.status,
        }),
      });
      toast({ title: "Issue actualizado", body: draft.title.trim(), tone: "success" });
      await loadIssues();
    } catch (nextError) {
      toast({ title: "Error al actualizar el issue", body: getErrorMessage(nextError), tone: "error" });
    }
  }

  async function handleDelete(issueId: string) {
    try {
      await hostFetchJson(`/api/issues/${issueId}`, { method: "DELETE" });
      toast({ title: "Issue eliminado", tone: "info" });
      await loadIssues();
    } catch (nextError) {
      toast({ title: "Error al eliminar el issue", body: getErrorMessage(nextError), tone: "error" });
    }
  }

  return (
    <Section title="CRUD de issues">
      <div style={mutedTextStyle}>
        Esta es una página React embebida normal dentro de Paperclip que llama directamente a la API del tablero. Crea, actualiza y elimina issues para la empresa actual.
      </div>
      {!context.companyId ? (
        <div style={mutedTextStyle}>Selecciona una empresa para usar las demos de issue.</div>
      ) : (
        <>
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto" }}>
            <input style={inputStyle} value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Título del issue" />
            <input style={inputStyle} value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder="Descripción del issue" />
            <button type="button" style={primaryButtonStyle} onClick={() => void handleCreate()}>
              Crear issue
            </button>
          </div>
          {loading ? <div style={mutedTextStyle}>Cargando issues…</div> : null}
          {error ? <div style={{ ...mutedTextStyle, color: "var(--destructive, #dc2626)" }}>{error}</div> : null}
          <div style={{ display: "grid", gap: "10px" }}>
            {issues.map((issue) => {
              const draft = drafts[issue.id] ?? { title: issue.title, status: issue.status };
              return (
                <div key={issue.id} style={subtleCardStyle}>
                  <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "minmax(0, 1.6fr) 140px auto auto" }}>
                    <input
                      style={inputStyle}
                      value={draft.title}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [issue.id]: { ...draft, title: event.target.value },
                        }))}
                    />
                    <select
                      style={inputStyle}
                      value={draft.status}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [issue.id]: { ...draft, status: event.target.value },
                        }))}
                    >
                      <option value="backlog">backlog</option>
                      <option value="todo">todo</option>
                      <option value="in_progress">in_progress</option>
                      <option value="in_review">in_review</option>
                      <option value="done">done</option>
                      <option value="blocked">blocked</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <button type="button" style={buttonStyle} onClick={() => void handleSave(issue.id)}>
                      Guardar
                    </button>
                    <button type="button" style={buttonStyle} onClick={() => void handleDelete(issue.id)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
            {!loading && issues.length === 0 ? <div style={mutedTextStyle}>Aún no hay issues para esta empresa.</div> : null}
          </div>
        </>
      )}
    </Section>
  );
}

function KitchenSinkCompanyCrudDemo({ context }: { context: PluginPageProps["context"] }) {
  const toast = usePluginToast();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { name: string; status: string }>>({});
  const [newCompanyName, setNewCompanyName] = useState(`Kitchen Sink Demo ${new Date().toLocaleTimeString()}`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCompanies() {
    setLoading(true);
    try {
      const result = await hostFetchJson<Array<CompanyRecord & { status?: string }>>("/api/companies");
      setCompanies(result);
      setDrafts(
        Object.fromEntries(
          result.map((company) => [company.id, { name: company.name, status: company.status ?? "active" }]),
        ),
      );
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
  }, []);

  async function handleCreate() {
    const trimmed = newCompanyName.trim();
    if (!trimmed) return;
    const name = trimmed.startsWith("Kitchen Sink Demo") ? trimmed : `Kitchen Sink Demo ${trimmed}`;
    try {
      await hostFetchJson("/api/companies", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: "Creado desde la página del plugin de ejemplo Kitchen Sink.",
        }),
      });
      toast({ title: "Empresa de demo creada", body: name, tone: "success" });
      setNewCompanyName(`Kitchen Sink Demo ${Date.now()}`);
      await loadCompanies();
    } catch (nextError) {
      toast({ title: "Error al crear la empresa", body: getErrorMessage(nextError), tone: "error" });
    }
  }

  async function handleSave(companyId: string) {
    const draft = drafts[companyId];
    if (!draft) return;
    try {
      await hostFetchJson(`/api/companies/${companyId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name.trim(),
          status: draft.status,
        }),
      });
      toast({ title: "Empresa actualizada", body: draft.name.trim(), tone: "success" });
      await loadCompanies();
    } catch (nextError) {
      toast({ title: "Error al actualizar la empresa", body: getErrorMessage(nextError), tone: "error" });
    }
  }

  async function handleDelete(company: CompanyRecord) {
    try {
      await hostFetchJson(`/api/companies/${company.id}`, { method: "DELETE" });
      toast({ title: "Empresa de demo eliminada", body: company.name, tone: "info" });
      await loadCompanies();
    } catch (nextError) {
      toast({ title: "Error al eliminar la empresa", body: getErrorMessage(nextError), tone: "error" });
    }
  }

  const currentCompany = companies.find((company) => company.id === context.companyId) ?? null;
  const demoCompanies = companies.filter(isKitchenSinkDemoCompany);

  return (
    <Section title="CRUD de empresas">
      <div style={mutedTextStyle}>
        El SDK del worker actualmente expone lecturas de empresa. Esta página muestra un patrón pragmático de app embebida para acciones más amplias del tablero llamando directamente a la API REST del host.
      </div>
      <div style={subtleCardStyle}>
        <div style={rowStyle}>
          <strong>Empresa actual</strong>
          {currentCompany ? <Pill label={currentCompany.issuePrefix ?? "sin-prefijo"} /> : null}
        </div>
        <div style={{ fontSize: "12px" }}>{currentCompany?.name ?? "No hay empresa actual seleccionada"}</div>
      </div>
      <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "minmax(0, 1fr) auto" }}>
        <input
          style={inputStyle}
          value={newCompanyName}
          onChange={(event) => setNewCompanyName(event.target.value)}
          placeholder="Empresa demo de Kitchen Sink"
        />
        <button type="button" style={primaryButtonStyle} onClick={() => void handleCreate()}>
          Crear empresa de demo
        </button>
      </div>
      {loading ? <div style={mutedTextStyle}>Cargando empresas…</div> : null}
      {error ? <div style={{ ...mutedTextStyle, color: "var(--destructive, #dc2626)" }}>{error}</div> : null}
      <div style={{ display: "grid", gap: "10px" }}>
        {demoCompanies.map((company) => {
          const draft = drafts[company.id] ?? { name: company.name, status: "active" };
          const isCurrent = company.id === context.companyId;
          return (
            <div key={company.id} style={subtleCardStyle}>
              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "minmax(0, 1.5fr) 120px auto auto" }}>
                <input
                  style={inputStyle}
                  value={draft.name}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [company.id]: { ...draft, name: event.target.value },
                    }))}
                />
                <select
                  style={inputStyle}
                  value={draft.status}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [company.id]: { ...draft, status: event.target.value },
                    }))}
                >
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="archived">archived</option>
                </select>
                <button type="button" style={buttonStyle} onClick={() => void handleSave(company.id)}>
                  Guardar
                </button>
                <button type="button" style={buttonStyle} onClick={() => void handleDelete(company)} disabled={isCurrent}>
                  Eliminar
                </button>
              </div>
              {isCurrent ? <div style={{ ...mutedTextStyle, marginTop: "8px" }}>La empresa actual no se puede eliminar desde esta demo.</div> : null}
            </div>
          );
        })}
        {!loading && demoCompanies.length === 0 ? (
          <div style={mutedTextStyle}>Aún no hay empresas de demo. Crea una arriba y gestónala desde esta página.</div>
        ) : null}
      </div>
    </Section>
  );
}

function KitchenSinkTopRow({ context }: { context: PluginPageProps["context"] }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "14px",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        alignItems: "stretch",
      }}
    >
      <Section title="Demo de app embebida">
        <div style={{ fontSize: "13px", lineHeight: 1.5 }}>
          Los plugins pueden hospedar su propia página React y comportarse como una página nativa de empresa. Kitchen Sink ahora usa esta ruta como app de demo práctica, y mantiene la consola de worker de nivel bajo abajo para el resto de la superficie del SDK.
        </div>
      </Section>
      <div style={{ display: "grid", gap: "14px" }}>
        <Section title="Ruta de página del plugin">
          <div style={mutedTextStyle}>
            La entrada de barra lateral de la empresa abre esta ruta directamente, así el plugin se siente como una página de empresa de primera clase en lugar de una subpágina de ajustes.
          </div>
          <a href={pluginPagePath(context.companyPrefix)} style={{ fontSize: "12px" }}>
            {pluginPagePath(context.companyPrefix)}
          </a>
        </Section>
        <Section title="Animación de Paperclip">
          <div style={mutedTextStyle}>
            Este es el mismo tratamiento ASCII de Paperclip usado en la incorporación, copiado al plugin de ejemplo para que el paquete siga siendo autocontenido.
          </div>
          <AsciiArtAnimation />
        </Section>
      </div>
    </div>
  );
}

function KitchenSinkStorageDemo({ context }: { context: PluginPageProps["context"] }) {
  const toast = usePluginToast();
  const stateKey = "revenue_clicker";
  const revenueState = usePluginData<StateValueData>(
    "state-value",
    context.companyId
      ? { scopeKind: "company", scopeId: context.companyId, stateKey }
      : {},
  );
  const writeScopedState = usePluginAction("write-scoped-state");
  const deleteScopedState = usePluginAction("delete-scoped-state");

  const currentValue = useMemo(() => {
    const raw = revenueState.data?.value;
    if (typeof raw === "number") return raw;
    const parsed = Number(raw ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [revenueState.data?.value]);

  async function adjust(delta: number) {
    if (!context.companyId) return;
    try {
      await writeScopedState({
        scopeKind: "company",
        scopeId: context.companyId,
        stateKey,
        value: currentValue + delta,
      });
      revenueState.refresh();
    } catch (nextError) {
      toast({ title: "Error al escribir en el almacenamiento", body: getErrorMessage(nextError), tone: "error" });
    }
  }

  async function reset() {
    if (!context.companyId) return;
    try {
      await deleteScopedState({
        scopeKind: "company",
        scopeId: context.companyId,
        stateKey,
      });
      toast({ title: "Contador de ingresos restablecido", tone: "info" });
      revenueState.refresh();
    } catch (nextError) {
      toast({ title: "Error al restablecer el almacenamiento", body: getErrorMessage(nextError), tone: "error" });
    }
  }

  return (
    <Section title="Almacenamiento del plugin">
      <div style={mutedTextStyle}>
        Este contador persiste en el almacenamiento del plugin con alcance de empresa. Un plugin de ingresos real podría almacenar contadores, cursores de sincronización o IDs externos en caché de la misma forma.
      </div>
      {!context.companyId ? (
        <div style={mutedTextStyle}>Selecciona una empresa para usar el almacenamiento del plugin con alcance de empresa.</div>
      ) : (
        <>
          <div style={{ display: "grid", gap: "4px" }}>
            <div style={{ fontSize: "26px", fontWeight: 700 }}>{currentValue}</div>
            <div style={mutedTextStyle}>Guardado en `company/{context.companyId}/{stateKey}`</div>
          </div>
          <div style={rowStyle}>
            {[-10, -1, 1, 10].map((delta) => (
              <button key={delta} type="button" style={buttonStyle} onClick={() => void adjust(delta)}>
                {delta > 0 ? `+${delta}` : delta}
              </button>
            ))}
            <button type="button" style={buttonStyle} onClick={() => void reset()}>
              Restablecer
            </button>
          </div>
          <JsonBlock value={revenueState.data ?? { scopeKind: "company", stateKey, value: 0 }} />
        </>
      )}
    </Section>
  );
}

function KitchenSinkHostIntegrationDemo({ context }: { context: PluginPageProps["context"] }) {
  const [liveRuns, setLiveRuns] = useState<HostLiveRunRecord[]>([]);
  const [recentRuns, setRecentRuns] = useState<HostHeartbeatRunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRuns() {
    if (!context.companyId) return;
    setLoading(true);
    try {
      const [nextLiveRuns, nextRecentRuns] = await Promise.all([
        hostFetchJson<HostLiveRunRecord[]>(`/api/companies/${context.companyId}/live-runs?minCount=5`),
        hostFetchJson<HostHeartbeatRunRecord[]>(`/api/companies/${context.companyId}/heartbeat-runs?limit=5`),
      ]);
      setLiveRuns(nextLiveRuns);
      setRecentRuns(nextRecentRuns);
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRuns();
  }, [context.companyId]);

  return (
    <Section title="Integraciones del host">
      <div style={mutedTextStyle}>
        Las páginas de plugin pueden sentirse como páginas nativas de Paperclip. Esta sección demuestra toasts del host, enrutamiento con alcance de empresa y lectura de datos de latido en vivo desde la página embebida.
      </div>
      <div style={subtleCardStyle}>
        <div style={rowStyle}>
          <strong>Ruta de empresa</strong>
          <Pill label={pluginPagePath(context.companyPrefix)} />
        </div>
        <div style={mutedTextStyle}>
          Esta página está montada como una ruta de empresa real en lugar de vivir solo bajo `/plugins/:pluginId`.
        </div>
      </div>
      {!context.companyId ? (
        <div style={mutedTextStyle}>Selecciona una empresa para leer los datos de ejecución.</div>
      ) : (
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div style={subtleCardStyle}>
            <div style={sectionHeaderStyle}>
              <strong>Ejecuciones en vivo</strong>
              <button type="button" style={buttonStyle} onClick={() => void loadRuns()}>
                Actualizar
              </button>
            </div>
            {loading ? <div style={mutedTextStyle}>Cargando datos de ejecución…</div> : null}
            {error ? <div style={{ ...mutedTextStyle, color: "var(--destructive, #dc2626)" }}>{error}</div> : null}
            <MiniList
              items={liveRuns}
              empty="No hay ejecuciones en vivo ahora."
              render={(item) => {
                const run = item as HostLiveRunRecord;
                return (
                  <div style={{ display: "grid", gap: "6px", fontSize: "12px" }}>
                    <div style={rowStyle}>
                      <strong>{run.status}</strong>
                      {run.agentName ? <Pill label={run.agentName} /> : null}
                    </div>
                    <div>{run.id}</div>
                    {run.agentId ? (
                      <a href={hostPath(context.companyPrefix, `/agents/${run.agentId}/runs/${run.id}`)}>
                        Abrir ejecución
                      </a>
                    ) : null}
                  </div>
                );
              }}
            />
          </div>
          <div style={subtleCardStyle}>
            <strong>Latidos recientes</strong>
            <MiniList
              items={recentRuns}
              empty="No hay ejecuciones de latido recientes."
              render={(item) => {
                const run = item as HostHeartbeatRunRecord;
                return (
                  <div style={{ display: "grid", gap: "6px", fontSize: "12px" }}>
                    <div style={rowStyle}>
                      <strong>{run.status}</strong>
                      {run.invocationSource ? <Pill label={run.invocationSource} /> : null}
                    </div>
                    <div>{run.id}</div>
                  </div>
                );
              }}
            />
          </div>
        </div>
      )}
    </Section>
  );
}

function KitchenSinkEmbeddedApp({ context }: { context: PluginPageProps["context"] }) {
  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <KitchenSinkTopRow context={context} />
      <KitchenSinkStorageDemo context={context} />
      <KitchenSinkIssueCrudDemo context={context} />
      <KitchenSinkCompanyCrudDemo context={context} />
      <KitchenSinkHostIntegrationDemo context={context} />
    </div>
  );
}

function KitchenSinkConsole({ context }: { context: { companyId: string | null; companyPrefix?: string | null; projectId?: string | null; entityId?: string | null; entityType?: string | null } }) {
  const companyId = context.companyId;
  const overview = usePluginOverview(companyId);
  const [companiesLimit, setCompaniesLimit] = useState(20);
  const [projectsLimit, setProjectsLimit] = useState(20);
  const [issuesLimit, setIssuesLimit] = useState(20);
  const [goalsLimit, setGoalsLimit] = useState(20);
  const companies = usePluginData<CompanyRecord[]>("companies", { limit: companiesLimit });
  const projects = usePluginData<ProjectRecord[]>("projects", companyId ? { companyId, limit: projectsLimit } : {});
  const issues = usePluginData<IssueRecord[]>("issues", companyId ? { companyId, limit: issuesLimit } : {});
  const goals = usePluginData<GoalRecord[]>("goals", companyId ? { companyId, limit: goalsLimit } : {});
  const agents = usePluginData<AgentRecord[]>("agents", companyId ? { companyId } : {});

  const [issueTitle, setIssueTitle] = useState("Kitchen Sink demo issue");
  const [goalTitle, setGoalTitle] = useState("Kitchen Sink demo goal");
  const [stateScopeKind, setStateScopeKind] = useState("instance");
  const [stateScopeId, setStateScopeId] = useState("");
  const [stateNamespace, setStateNamespace] = useState("");
  const [stateKey, setStateKey] = useState("demo");
  const [stateValue, setStateValue] = useState("{\"hello\":\"world\"}");
  const [entityType, setEntityType] = useState("demo-record");
  const [entityTitle, setEntityTitle] = useState("Kitchen Sink Entity");
  const [entityScopeKind, setEntityScopeKind] = useState("instance");
  const [entityScopeId, setEntityScopeId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [httpUrl, setHttpUrl] = useState<string>(DEFAULT_CONFIG.httpDemoUrl);
  const [secretRef, setSecretRef] = useState("");
  const [metricName, setMetricName] = useState("manual");
  const [metricValue, setMetricValue] = useState("1");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspacePath, setWorkspacePath] = useState<string>(DEFAULT_CONFIG.workspaceScratchFile);
  const [workspaceContent, setWorkspaceContent] = useState("Kitchen Sink wrote this file.");
  const [commandKey, setCommandKey] = useState<string>(SAFE_COMMANDS[0]?.key ?? "pwd");
  const [toolMessage, setToolMessage] = useState("Hello from the Kitchen Sink tool");
  const [toolOutput, setToolOutput] = useState<unknown>(null);
  const [jobOutput, setJobOutput] = useState<unknown>(null);
  const [webhookOutput, setWebhookOutput] = useState<unknown>(null);
  const [result, setResult] = useState<unknown>(null);

  const stateQuery = usePluginData<StateValueData>("state-value", {
    scopeKind: stateScopeKind,
    scopeId: stateScopeId || undefined,
    namespace: stateNamespace || undefined,
    stateKey,
  });
  const entityQuery = usePluginData<EntityRecord[]>("entities", {
    entityType,
    scopeKind: entityScopeKind,
    scopeId: entityScopeId || undefined,
    limit: 25,
  });
  const workspaceQuery = usePluginData<Array<{ id: string; name: string; path: string }>>(
    "workspaces",
    companyId && selectedProjectId ? { companyId, projectId: selectedProjectId } : {},
  );
  const progressStream = usePluginStream<{ step: number; total: number; message: string }>(
    STREAM_CHANNELS.progress,
    companyId ? { companyId } : undefined,
  );
  const agentStream = usePluginStream<{ eventType: string; message: string | null }>(
    STREAM_CHANNELS.agentChat,
    companyId ? { companyId } : undefined,
  );

  const emitDemoEvent = usePluginAction("emit-demo-event");
  const createIssue = usePluginAction("create-issue");
  const advanceIssueStatus = usePluginAction("advance-issue-status");
  const createGoal = usePluginAction("create-goal");
  const advanceGoalStatus = usePluginAction("advance-goal-status");
  const writeScopedState = usePluginAction("write-scoped-state");
  const deleteScopedState = usePluginAction("delete-scoped-state");
  const upsertEntity = usePluginAction("upsert-entity");
  const writeActivity = usePluginAction("write-activity");
  const writeMetric = usePluginAction("write-metric");
  const httpFetch = usePluginAction("http-fetch");
  const resolveSecret = usePluginAction("resolve-secret");
  const runProcess = usePluginAction("run-process");
  const readWorkspaceFile = usePluginAction("read-workspace-file");
  const writeWorkspaceScratch = usePluginAction("write-workspace-scratch");
  const startProgressStream = usePluginAction("start-progress-stream");
  const invokeAgent = usePluginAction("invoke-agent");
  const pauseAgent = usePluginAction("pause-agent");
  const resumeAgent = usePluginAction("resume-agent");
  const askAgent = usePluginAction("ask-agent");

  useEffect(() => {
    setProjectsLimit(20);
    setIssuesLimit(20);
    setGoalsLimit(20);
  }, [companyId]);

  useEffect(() => {
    if (!selectedProjectId && projects.data?.[0]?.id) setSelectedProjectId(projects.data[0].id);
  }, [projects.data, selectedProjectId]);

  useEffect(() => {
    if (!selectedIssueId && issues.data?.[0]?.id) setSelectedIssueId(issues.data[0].id);
  }, [issues.data, selectedIssueId]);

  useEffect(() => {
    if (!selectedGoalId && goals.data?.[0]?.id) setSelectedGoalId(goals.data[0].id);
  }, [goals.data, selectedGoalId]);

  useEffect(() => {
    if (!selectedAgentId && agents.data?.[0]?.id) setSelectedAgentId(agents.data[0].id);
  }, [agents.data, selectedAgentId]);

  useEffect(() => {
    if (!workspaceId && workspaceQuery.data?.[0]?.id) setWorkspaceId(workspaceQuery.data[0].id);
  }, [workspaceId, workspaceQuery.data]);

  const projectRef = selectedProjectId || context.projectId || "";

  async function refreshAll() {
    overview.refresh();
    projects.refresh();
    issues.refresh();
    goals.refresh();
    agents.refresh();
    stateQuery.refresh();
    entityQuery.refresh();
    workspaceQuery.refresh();
  }

  async function executeTool(name: string) {
    if (!companyId || !selectedAgentId || !projectRef) {
      setToolOutput({ error: "Selecciona primero una empresa, un proyecto y un agente." });
      return;
    }
    try {
      const toolName = `${PLUGIN_ID}:${name}`;
      const body =
        name === TOOL_NAMES.echo
          ? { message: toolMessage }
          : name === TOOL_NAMES.createIssue
            ? { title: issueTitle, description: "Creado a través de la demo del despachador de herramientas." }
            : {};
      const response = await hostFetchJson(`/api/plugins/tools/execute`, {
        method: "POST",
        body: JSON.stringify({
          tool: toolName,
          parameters: body,
          runContext: {
            agentId: selectedAgentId,
            runId: `kitchen-sink-${Date.now()}`,
            companyId,
            projectId: projectRef,
          },
        }),
      });
      setToolOutput(response);
      await refreshAll();
    } catch (error) {
      setToolOutput({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function fetchJobsAndTrigger() {
    try {
      const jobsResponse = await hostFetchJson<Array<{ id: string; jobKey: string }>>(`/api/plugins/${PLUGIN_ID}/jobs`);
      const job = jobsResponse.find((entry) => entry.jobKey === JOB_KEYS.heartbeat) ?? jobsResponse[0];
      if (!job) {
        setJobOutput({ error: "El host no devolvió tareas del plugin." });
        return;
      }
      const triggerResult = await hostFetchJson(`/api/plugins/${PLUGIN_ID}/jobs/${job.id}/trigger`, {
        method: "POST",
      });
      setJobOutput({ jobs: jobsResponse, triggerResult });
      overview.refresh();
    } catch (error) {
      setJobOutput({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function sendWebhook() {
    try {
      const response = await hostFetchJson(`/api/plugins/${PLUGIN_ID}/webhooks/${WEBHOOK_KEYS.demo}`, {
        method: "POST",
        body: JSON.stringify({
          source: "kitchen-sink-ui",
          sentAt: new Date().toISOString(),
        }),
      });
      setWebhookOutput(response);
      overview.refresh();
    } catch (error) {
      setWebhookOutput({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <Section
        title="Resumen"
        action={<button type="button" style={buttonStyle} onClick={() => refreshAll()}>Actualizar</button>}
      >
        <div style={rowStyle}>
          <Pill label={`Plugin: ${overview.data?.pluginId ?? PLUGIN_ID}`} />
          <Pill label={`Versión: ${overview.data?.version ?? "cargando"}`} />
          <Pill label={`Empresa: ${companyId ?? "ninguna"}`} />
          {context.entityType ? <Pill label={`Entidad: ${context.entityType}`} /> : null}
        </div>
        {overview.data ? (
          <>
            <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <StatusLine label="Empresas" value={overview.data.counts.companies} />
              <StatusLine label="Proyectos" value={overview.data.counts.projects} />
              <StatusLine label="Issues" value={overview.data.counts.issues} />
              <StatusLine label="Objetivos" value={overview.data.counts.goals} />
              <StatusLine label="Agentes" value={overview.data.counts.agents} />
              <StatusLine label="Entidades" value={overview.data.counts.entities} />
            </div>
            <JsonBlock value={overview.data.config} />
          </>
        ) : (
          <div style={{ fontSize: "12px", opacity: 0.7 }}>Cargando resumen…</div>
        )}
      </Section>

      <Section title="Superficies de interfaz">
        <div style={rowStyle}>
          <a href={pluginPagePath(context.companyPrefix)} style={{ fontSize: "12px" }}>Abrir página del plugin</a>
          {projectRef ? (
            <a
              href={hostPath(context.companyPrefix, `/projects/${projectRef}?tab=plugin:${PLUGIN_ID}:${SLOT_IDS.projectTab}`)}
              style={{ fontSize: "12px" }}
            >
              Abrir pestaña de proyecto
            </a>
          ) : null}
          {selectedIssueId ? (
            <a
              href={hostPath(context.companyPrefix, `/issues/${selectedIssueId}`)}
              style={{ fontSize: "12px" }}
            >
              Abrir issue seleccionado
            </a>
          ) : null}
        </div>
        <JsonBlock value={overview.data?.runtimeLaunchers ?? []} />
      </Section>

      <Section title="APIs de dominio de Paperclip">
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <PaginatedDomainCard
            title="Empresas"
            items={companies.data ?? []}
            totalCount={overview.data?.counts.companies ?? null}
            empty="Sin empresas."
            onLoadMore={() => setCompaniesLimit((current) => current + 20)}
            render={(item) => {
              const company = item as CompanyRecord;
              return <div>{company.name} <span style={{ opacity: 0.6 }}>({company.id.slice(0, 8)})</span></div>;
            }}
          />
          <PaginatedDomainCard
            title="Proyectos"
            items={projects.data ?? []}
            totalCount={overview.data?.counts.projects ?? null}
            empty="Sin proyectos."
            onLoadMore={() => setProjectsLimit((current) => current + 20)}
            render={(item) => {
              const project = item as ProjectRecord;
              return <div>{project.name} <span style={{ opacity: 0.6 }}>({project.status ?? "unknown"})</span></div>;
            }}
          />
          <PaginatedDomainCard
            title="Issues"
            items={issues.data ?? []}
            totalCount={overview.data?.counts.issues ?? null}
            empty="Sin issues."
            onLoadMore={() => setIssuesLimit((current) => current + 20)}
            render={(item) => {
              const issue = item as IssueRecord;
              return <div>{issue.title} <span style={{ opacity: 0.6 }}>({issue.status})</span></div>;
            }}
          />
          <PaginatedDomainCard
            title="Objetivos"
            items={goals.data ?? []}
            totalCount={overview.data?.counts.goals ?? null}
            empty="Sin objetivos."
            onLoadMore={() => setGoalsLimit((current) => current + 20)}
            render={(item) => {
              const goal = item as GoalRecord;
              return <div>{goal.title} <span style={{ opacity: 0.6 }}>({goal.status})</span></div>;
            }}
          />
        </div>
      </Section>

      <Section title="Acciones de issue + objetivo">
        <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId) return;
              void createIssue({ companyId, projectId: selectedProjectId || undefined, title: issueTitle })
                .then((next) => {
                  setResult(next);
                  return refreshAll();
                })
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Crear issue</strong>
            <input style={inputStyle} value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} />
            <button type="submit" style={primaryButtonStyle} disabled={!companyId}>Crear issue</button>
          </form>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId || !selectedIssueId) return;
              void advanceIssueStatus({ companyId, issueId: selectedIssueId, status: "in_review" })
                .then((next) => {
                  setResult(next);
                  return refreshAll();
                })
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Avanzar issue seleccionado</strong>
            <select style={inputStyle} value={selectedIssueId} onChange={(event) => setSelectedIssueId(event.target.value)}>
              {(issues.data ?? []).map((issue) => (
                <option key={issue.id} value={issue.id}>{issue.title}</option>
              ))}
            </select>
            <button type="submit" style={buttonStyle} disabled={!companyId || !selectedIssueId}>Mover a in_review</button>
          </form>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId) return;
              void createGoal({ companyId, title: goalTitle })
                .then((next) => {
                  setResult(next);
                  return refreshAll();
                })
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Crear objetivo</strong>
            <input style={inputStyle} value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} />
            <button type="submit" style={primaryButtonStyle} disabled={!companyId}>Crear objetivo</button>
          </form>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId || !selectedGoalId) return;
              void advanceGoalStatus({ companyId, goalId: selectedGoalId, status: "active" })
                .then((next) => {
                  setResult(next);
                  return refreshAll();
                })
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Avanzar objetivo seleccionado</strong>
            <select style={inputStyle} value={selectedGoalId} onChange={(event) => setSelectedGoalId(event.target.value)}>
              {(goals.data ?? []).map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.title}</option>
              ))}
            </select>
            <button type="submit" style={buttonStyle} disabled={!companyId || !selectedGoalId}>Mover a active</button>
          </form>
        </div>
      </Section>

      <Section title="Estado + Entidades">
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              void writeScopedState({
                scopeKind: stateScopeKind,
                scopeId: stateScopeId || undefined,
                namespace: stateNamespace || undefined,
                stateKey,
                value: stateValue,
              })
                .then((next) => {
                  setResult(next);
                  stateQuery.refresh();
                })
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Estado</strong>
            <input style={inputStyle} value={stateScopeKind} onChange={(event) => setStateScopeKind(event.target.value)} placeholder="scopeKind" />
            <input style={inputStyle} value={stateScopeId} onChange={(event) => setStateScopeId(event.target.value)} placeholder="scopeId (optional)" />
            <input style={inputStyle} value={stateNamespace} onChange={(event) => setStateNamespace(event.target.value)} placeholder="namespace (optional)" />
            <input style={inputStyle} value={stateKey} onChange={(event) => setStateKey(event.target.value)} placeholder="stateKey" />
            <textarea style={{ ...inputStyle, minHeight: "88px" }} value={stateValue} onChange={(event) => setStateValue(event.target.value)} />
            <div style={rowStyle}>
              <button type="submit" style={primaryButtonStyle}>Escribir estado</button>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  void deleteScopedState({
                    scopeKind: stateScopeKind,
                    scopeId: stateScopeId || undefined,
                    namespace: stateNamespace || undefined,
                    stateKey,
                  })
                    .then((next) => {
                      setResult(next);
                      stateQuery.refresh();
                    })
                    .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
                }}
              >
                Eliminar estado
              </button>
            </div>
            <JsonBlock value={stateQuery.data ?? { loading: true }} />
          </form>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              void upsertEntity({
                entityType,
                title: entityTitle,
                scopeKind: entityScopeKind,
                scopeId: entityScopeId || undefined,
                data: JSON.stringify({ createdAt: new Date().toISOString() }),
              })
                .then((next) => {
                  setResult(next);
                  entityQuery.refresh();
                  overview.refresh();
                })
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Entidades</strong>
            <input style={inputStyle} value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="entityType" />
            <input style={inputStyle} value={entityTitle} onChange={(event) => setEntityTitle(event.target.value)} placeholder="título" />
            <input style={inputStyle} value={entityScopeKind} onChange={(event) => setEntityScopeKind(event.target.value)} placeholder="scopeKind" />
            <input style={inputStyle} value={entityScopeId} onChange={(event) => setEntityScopeId(event.target.value)} placeholder="scopeId (optional)" />
            <button type="submit" style={primaryButtonStyle}>Registrar entidad</button>
            <JsonBlock value={entityQuery.data ?? []} />
          </form>
        </div>
      </Section>

      <Section title="Eventos + Streams">
        <div style={rowStyle}>
          <button
            type="button"
            style={primaryButtonStyle}
            onClick={() => {
              if (!companyId) return;
              void emitDemoEvent({ companyId, message: "Evento manual de Kitchen Sink" })
                .then((next) => {
                  setResult(next);
                  overview.refresh();
                })
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            Emitir evento de demo
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              if (!companyId) return;
              void startProgressStream({ companyId, steps: 5 })
                .then((next) => setResult(next))
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            Iniciar stream de progreso
          </button>
        </div>
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div style={subtleCardStyle}>
            <strong>Stream de progreso</strong>
            <JsonBlock value={progressStream.events.slice(-8)} />
          </div>
          <div style={subtleCardStyle}>
            <strong>Registros recientes</strong>
            <JsonBlock value={overview.data?.recentRecords ?? []} />
          </div>
        </div>
      </Section>

      <Section title="HTTP + Secretos + Actividad + Métricas">
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              void httpFetch({ url: httpUrl })
                .then((next) => setResult(next))
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>HTTP</strong>
            <input style={inputStyle} value={httpUrl} onChange={(event) => setHttpUrl(event.target.value)} />
            <button type="submit" style={buttonStyle}>Obtener URL</button>
          </form>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              void resolveSecret({ secretRef })
                .then((next) => setResult(next))
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Secretos</strong>
            <input style={inputStyle} value={secretRef} onChange={(event) => setSecretRef(event.target.value)} placeholder="MI_REFERENCIA_SECRETO" />
            <button type="submit" style={buttonStyle}>Resolver referencia de secreto</button>
          </form>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId) return;
              void writeActivity({ companyId, entityType: context.entityType ?? undefined, entityId: context.entityId ?? undefined })
                .then((next) => setResult(next))
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Actividad + Métricas</strong>
            <input style={inputStyle} value={metricName} onChange={(event) => setMetricName(event.target.value)} placeholder="nombre de la métrica" />
            <input style={inputStyle} value={metricValue} onChange={(event) => setMetricValue(event.target.value)} placeholder="valor de la métrica" />
            <div style={rowStyle}>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  if (!companyId) return;
                  void writeMetric({ companyId, name: metricName, value: Number(metricValue || "1") })
                    .then((next) => setResult(next))
                    .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
                }}
              >
                Escribir métrica
              </button>
              <button type="submit" style={buttonStyle} disabled={!companyId}>Escribir actividad</button>
            </div>
          </form>
        </div>
      </Section>

      <Section title="Workspace + Proceso">
        <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div style={layoutStack}>
            <strong>Seleccionar proyecto/workspace</strong>
            <select style={inputStyle} value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              <option value="">Seleccionar proyecto</option>
              {(projects.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <select style={inputStyle} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              <option value="">Seleccionar workspace</option>
              {(workspaceQuery.data ?? []).map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
            <JsonBlock value={workspaceQuery.data ?? []} />
          </div>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId || !selectedProjectId) return;
              void writeWorkspaceScratch({
                companyId,
                projectId: selectedProjectId,
                workspaceId: workspaceId || undefined,
                relativePath: workspacePath,
                content: workspaceContent,
              })
                .then((next) => setResult(next))
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Archivo de workspace</strong>
            <input style={inputStyle} value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} />
            <textarea style={{ ...inputStyle, minHeight: "88px" }} value={workspaceContent} onChange={(event) => setWorkspaceContent(event.target.value)} />
            <div style={rowStyle}>
              <button type="submit" style={buttonStyle} disabled={!companyId || !selectedProjectId}>Escribir archivo temporal</button>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  if (!companyId || !selectedProjectId) return;
                  void readWorkspaceFile({
                    companyId,
                    projectId: selectedProjectId,
                    workspaceId: workspaceId || undefined,
                    relativePath: workspacePath,
                  })
                    .then((next) => setResult(next))
                    .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
                }}
              >
                Leer archivo
              </button>
            </div>
          </form>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId || !selectedProjectId) return;
              void runProcess({
                companyId,
                projectId: selectedProjectId,
                workspaceId: workspaceId || undefined,
                commandKey,
              })
                .then((next) => {
                  setResult(next);
                  overview.refresh();
                })
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Demo de proceso seleccionado</strong>
            <select style={inputStyle} value={commandKey} onChange={(event) => setCommandKey(event.target.value)}>
              {SAFE_COMMANDS.map((command) => (
                <option key={command.key} value={command.key}>{command.label}</option>
              ))}
            </select>
            <button type="submit" style={buttonStyle} disabled={!companyId || !selectedProjectId}>Ejecutar comando</button>
            <JsonBlock value={overview.data?.lastProcessResult ?? { note: "Aún no hay ejecución de proceso." }} />
          </form>
        </div>
      </Section>

      <Section title="Agentes + Sesiones">
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId || !selectedAgentId) return;
              void invokeAgent({ companyId, agentId: selectedAgentId, prompt: "Demo de invocación de Kitchen Sink" })
                .then((next) => setResult(next))
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Controles de agente</strong>
            <select style={inputStyle} value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
              {(agents.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            <div style={rowStyle}>
              <button type="submit" style={primaryButtonStyle} disabled={!companyId || !selectedAgentId}>Invocar</button>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  if (!companyId || !selectedAgentId) return;
                  void pauseAgent({ companyId, agentId: selectedAgentId })
                    .then((next) => {
                      setResult(next);
                      agents.refresh();
                    })
                    .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
                }}
              >
                Pausar
              </button>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  if (!companyId || !selectedAgentId) return;
                  void resumeAgent({ companyId, agentId: selectedAgentId })
                    .then((next) => {
                      setResult(next);
                      agents.refresh();
                    })
                    .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
                }}
              >
                Reanudar
              </button>
            </div>
          </form>
          <form
            style={layoutStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!companyId || !selectedAgentId) return;
              void askAgent({ companyId, agentId: selectedAgentId, prompt: "Da un saludo corto del plugin Kitchen Sink." })
                .then((next) => setResult(next))
                .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }));
            }}
          >
            <strong>Stream de chat del agente</strong>
            <button type="submit" style={buttonStyle} disabled={!companyId || !selectedAgentId}>Iniciar demo de chat</button>
            <JsonBlock value={agentStream.events.slice(-12)} />
          </form>
        </div>
      </Section>

      <Section title="Tareas + Webhooks + Herramientas">
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div style={layoutStack}>
            <strong>Demo de tarea</strong>
            <button type="button" style={buttonStyle} onClick={() => void fetchJobsAndTrigger()}>Disparar tarea de demo</button>
            <JsonBlock value={jobOutput ?? overview.data?.lastJob ?? { note: "Aún no hay salida de tarea." }} />
          </div>
          <div style={layoutStack}>
            <strong>Demo de webhook</strong>
            <button type="button" style={buttonStyle} onClick={() => void sendWebhook()}>Enviar webhook de demo</button>
            <JsonBlock value={webhookOutput ?? overview.data?.lastWebhook ?? { note: "Aún no hay webhook." }} />
          </div>
          <div style={layoutStack}>
            <strong>Demo de despachador de herramientas</strong>
            <input style={inputStyle} value={toolMessage} onChange={(event) => setToolMessage(event.target.value)} />
            <div style={rowStyle}>
              <button type="button" style={buttonStyle} onClick={() => void executeTool(TOOL_NAMES.echo)}>Ejecutar herramienta de eco</button>
              <button type="button" style={buttonStyle} onClick={() => void executeTool(TOOL_NAMES.companySummary)}>Ejecutar herramienta de resumen</button>
              <button type="button" style={buttonStyle} onClick={() => void executeTool(TOOL_NAMES.createIssue)}>Ejecutar herramienta de crear issue</button>
            </div>
            <JsonBlock value={toolOutput ?? { note: "Aún no hay salida de herramienta." }} />
          </div>
        </div>
      </Section>

      <Section title="Último resultado">
        <JsonBlock value={result ?? { note: "Ejecuta una acción para ver los resultados aquí." }} />
      </Section>
    </div>
  );
}

export function KitchenSinkPage({ context }: PluginPageProps) {
  return (
    <div style={layoutStack}>
      <KitchenSinkPageWidgets context={context} />
      <KitchenSinkEmbeddedApp context={context} />
      <KitchenSinkConsole context={context} />
    </div>
  );
}

export function KitchenSinkSettingsPage({ context }: PluginSettingsPageProps) {
  const { configJson, setConfigJson, loading, saving, error, save } = useSettingsConfig();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function setField(key: string, value: unknown) {
    setConfigJson((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await save(configJson);
    setSavedMessage("Guardado");
    window.setTimeout(() => setSavedMessage(null), 1500);
  }

  if (loading) {
    return <div style={{ fontSize: "12px", opacity: 0.7 }}>Cargando configuración del plugin…</div>;
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "18px" }}>
      <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "minmax(0, 1.8fr) minmax(220px, 1fr)" }}>
        <div style={{ display: "grid", gap: "8px" }}>
          <strong>Acerca de</strong>
          <div style={{ fontSize: "13px", lineHeight: 1.5 }}>
            Kitchen Sink demuestra la superficie actual de la API de plugins de Paperclip en un ejemplo local y confiable. Incluye intencionalmente mutaciones de dominio, manejo de eventos, streams, herramientas, tareas, webhooks y demos locales de workspace/proceso.
          </div>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            Contexto de empresa actual: {context.companyId ?? "none"}
          </div>
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          <strong>Peligro / Modelo de confianza</strong>
          <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
            Las demos de workspace y proceso se ejecutan como código local confiable. Mantén las demos de proceso apagadas a menos que quieras ejercitar explícitamente el comportamiento de procesos hijo locales.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        <strong>Ajustes</strong>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={configJson.showSidebarEntry !== false}
            onChange={(event) => setField("showSidebarEntry", event.target.checked)}
          />
          <span>Mostrar entrada de barra lateral</span>
        </label>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={configJson.showSidebarPanel !== false}
            onChange={(event) => setField("showSidebarPanel", event.target.checked)}
          />
          <span>Mostrar panel de barra lateral</span>
        </label>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={configJson.showProjectSidebarItem !== false}
            onChange={(event) => setField("showProjectSidebarItem", event.target.checked)}
          />
          <span>Mostrar elemento de barra lateral del proyecto</span>
        </label>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={configJson.showCommentAnnotation !== false}
            onChange={(event) => setField("showCommentAnnotation", event.target.checked)}
          />
          <span>Mostrar anotación de comentario</span>
        </label>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={configJson.showCommentContextMenuItem !== false}
            onChange={(event) => setField("showCommentContextMenuItem", event.target.checked)}
          />
          <span>Mostrar acción de contexto de comentario</span>
        </label>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={configJson.enableWorkspaceDemos !== false}
            onChange={(event) => setField("enableWorkspaceDemos", event.target.checked)}
          />
          <span>Habilitar demos de workspace</span>
        </label>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={configJson.enableProcessDemos === true}
            onChange={(event) => setField("enableProcessDemos", event.target.checked)}
          />
          <span>Habilitar demos seleccionadas de proceso</span>
        </label>
        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px" }}>URL de demo HTTP</span>
          <input
            style={inputStyle}
            value={String(configJson.httpDemoUrl ?? DEFAULT_CONFIG.httpDemoUrl)}
            onChange={(event) => setField("httpDemoUrl", event.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px" }}>Ejemplo de referencia de secreto</span>
          <input
            style={inputStyle}
            value={String(configJson.secretRefExample ?? "")}
            onChange={(event) => setField("secretRefExample", event.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px" }}>Archivo temporal del workspace</span>
          <input
            style={inputStyle}
            value={String(configJson.workspaceScratchFile ?? DEFAULT_CONFIG.workspaceScratchFile)}
            onChange={(event) => setField("workspaceScratchFile", event.target.value)}
          />
        </label>
      </div>

      {error ? <div style={{ color: "var(--destructive, #c00)", fontSize: "12px" }}>{error}</div> : null}

      <div style={rowStyle}>
        <button type="submit" style={primaryButtonStyle} disabled={saving}>
          {saving ? "Guardando…" : "Guardar ajustes"}
        </button>
        {savedMessage ? <span style={{ fontSize: "12px", opacity: 0.7 }}>{savedMessage}</span> : null}
      </div>
    </form>
  );
}

export function KitchenSinkDashboardWidget({ context }: PluginWidgetProps) {
  const overview = usePluginOverview(context.companyId);
  const writeMetric = usePluginAction("write-metric");

  return (
    <div style={layoutStack}>
      <div style={rowStyle}>
        <strong>Kitchen Sink</strong>
        <Pill label="dashboardWidget" />
      </div>
      <div style={{ fontSize: "12px", opacity: 0.7 }}>
        Demo de superficie de runtime del plugin para la empresa actual.
      </div>
      <div style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
        <div>Registros recientes: {overview.data?.recentRecords.length ?? 0}</div>
        <div>Proyectos: {overview.data?.counts.projects ?? 0}</div>
        <div>Issues: {overview.data?.counts.issues ?? 0}</div>
      </div>
      <div style={rowStyle}>
        <a href={pluginPagePath(context.companyPrefix)} style={{ fontSize: "12px" }}>Abrir página</a>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            if (!context.companyId) return;
            void writeMetric({ companyId: context.companyId, name: "dashboard_click", value: 1 }).catch(console.error);
          }}
        >
          Escribir métrica
        </button>
      </div>
    </div>
  );
}

export function KitchenSinkSidebarLink({ context }: PluginSidebarProps) {
  const config = usePluginConfigData();
  if (config.data && config.data.showSidebarEntry === false) return null;
  const href = pluginPagePath(context.companyPrefix);
  const isActive = typeof window !== "undefined" && window.location.pathname === href;
  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={[
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
        isActive
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
      ].join(" ")}
    >
      <span className="relative shrink-0">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <path d="M13 16.5h7" />
          <path d="M16.5 13v7" />
        </svg>
      </span>
      <span className="flex-1 truncate">
        Kitchen Sink
      </span>
    </a>
  );
}

export function KitchenSinkSidebarPanel() {
  const context = useHostContext();
  const config = usePluginConfigData();
  const overview = usePluginOverview(context.companyId);
  if (config.data && config.data.showSidebarPanel === false) return null;
  return (
    <div style={{ ...layoutStack, ...subtleCardStyle, fontSize: "12px" }}>
      <strong>Panel de Kitchen Sink</strong>
      <div>Registros recientes del plugin: {overview.data?.recentRecords.length ?? 0}</div>
      <a href={pluginPagePath(context.companyPrefix)}>Abrir página del plugin</a>
    </div>
  );
}

export function KitchenSinkProjectSidebarItem({ context }: PluginProjectSidebarItemProps) {
  const config = usePluginConfigData();
  if (config.data && config.data.showProjectSidebarItem === false) return null;
  return (
    <a
      href={hostPath(context.companyPrefix, `/projects/${context.entityId}?tab=plugin:${PLUGIN_ID}:${SLOT_IDS.projectTab}`)}
      style={{ fontSize: "12px", textDecoration: "none" }}
    >
      Kitchen Sink
    </a>
  );
}

export function KitchenSinkProjectTab({ context }: PluginDetailTabProps) {
  return <CompactSurfaceSummary label="Pestaña de detalle del proyecto" entityType="project" />;
}

export function KitchenSinkIssueTab({ context }: PluginDetailTabProps) {
  return <CompactSurfaceSummary label="Pestaña de detalle del issue" entityType="issue" />;
}

export function KitchenSinkTaskDetailView() {
  return <CompactSurfaceSummary label="Vista de detalle de la tarea" entityType="issue" />;
}

export function KitchenSinkToolbarButton() {
  const context = useHostContext();
  const startProgress = usePluginAction("start-progress-stream");
  return (
    <button
      type="button"
      style={buttonStyle}
      onClick={() => {
        if (!context.companyId) return;
        void startProgress({ companyId: context.companyId, steps: 3 }).catch(console.error);
      }}
    >
      Acción de Kitchen Sink
    </button>
  );
}

export function KitchenSinkContextMenuItem() {
  const context = useHostContext();
  const writeActivity = usePluginAction("write-activity");
  return (
    <button
      type="button"
      style={buttonStyle}
      onClick={() => {
        if (!context.companyId) return;
        void writeActivity({
          companyId: context.companyId,
          entityType: context.entityType ?? undefined,
          entityId: context.entityId ?? undefined,
          message: "Acción de contexto de Kitchen Sink activada",
        }).catch(console.error);
      }}
    >
      Contexto de Kitchen Sink
    </button>
  );
}

export function KitchenSinkCommentAnnotation({ context }: PluginCommentAnnotationProps) {
  const config = usePluginConfigData();
  const data = usePluginData<CommentContextData>(
    "comment-context",
    context.companyId
      ? { companyId: context.companyId, issueId: context.parentEntityId, commentId: context.entityId }
      : {},
  );
  if (config.data && config.data.showCommentAnnotation === false) return null;
  if (!data.data) return null;
  return (
    <div style={{ ...subtleCardStyle, fontSize: "11px" }}>
      <strong>Kitchen Sink</strong>
      <div>Longitud del comentario: {data.data.length}</div>
      <div>Conteo de copias: {data.data.copiedCount}</div>
      <div style={{ opacity: 0.75 }}>{data.data.preview}</div>
    </div>
  );
}

export function KitchenSinkCommentContextMenuItem({ context }: PluginCommentContextMenuItemProps) {
  const config = usePluginConfigData();
  const copyCommentContext = usePluginAction("copy-comment-context");
  const [status, setStatus] = useState<string | null>(null);
  if (config.data && config.data.showCommentContextMenuItem === false) return null;
  return (
    <div style={rowStyle}>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => {
          if (!context.companyId) return;
          void copyCommentContext({
            companyId: context.companyId,
            issueId: context.parentEntityId,
            commentId: context.entityId,
          })
            .then(() => setStatus("Copiado"))
            .catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
        }}
      >
        Copiar a Kitchen Sink
      </button>
      {status ? <span style={{ fontSize: "11px", opacity: 0.7 }}>{status}</span> : null}
    </div>
  );
}

export function KitchenSinkLauncherModal() {
  const context = useHostContext();
  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <strong>Modal de lanzador de Kitchen Sink</strong>
      <div style={{ fontSize: "12px", opacity: 0.7 }}>
        Este export existe para que la infraestructura de lanzador tenga un objetivo de modal concreto.
      </div>
      <JsonBlock value={context.renderEnvironment ?? { note: "Sin metadatos de entorno de render." }} />
    </div>
  );
}
