import { usePluginAction, usePluginData, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";

type HealthData = {
  status: "ok" | "degraded" | "error";
  checkedAt: string;
};

export function DashboardWidget(_props: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<HealthData>("health");
  const ping = usePluginAction("ping");

  if (loading) return <div>Cargando salud del plugin...</div>;
  if (error) return <div>Error del plugin: {error.message}</div>;

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <strong>Ejemplo de prueba de humo de autor\u00eda de plugin</strong>
      <div>Salud: {data?.status ?? "desconocido"}</div>
      <div>Revisado: {data?.checkedAt ?? "nunca"}</div>
      <button onClick={() => void ping()}>Ping al worker</button>
    </div>
  );
}
