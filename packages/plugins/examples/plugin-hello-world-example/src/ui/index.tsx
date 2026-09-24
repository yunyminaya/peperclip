import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";

const WIDGET_LABEL = "Widget de plugin hola mundo";

/**
 * Widget de panel de ejemplo que muestra la contribución de interfaz más pequeña posible.
 */
export function HelloWorldDashboardWidget({ context }: PluginWidgetProps) {
  return (
    <section aria-label={WIDGET_LABEL}>
      <strong>Hola mundo</strong>
      <div>Este widget fue agregado por @paperclipai/plugin-hello-world-example.</div>
      {/* Incluir el contexto del host para que los autores vean de dónde vienen los IDs con alcance. */}
      <div>Contexto de empresa: {context.companyId}</div>
    </section>
  );
}
