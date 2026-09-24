/**
 * Bus pub/sub en memoria para streams SSE de plugins.
 *
 * Los workers emiten eventos de stream vía notificaciones JSON-RPC. El bus
 * distribuye cada evento a todos los clientes SSE conectados que coincidan
 * con la tupla (pluginId, channel, companyId).
 *
 * @see PLUGIN_SPEC.md §19.8 — Streaming en tiempo real
 */

/** Tipos de evento SSE válidos para streams de plugins. */
export type StreamEventType = "message" | "open" | "close" | "error";

export type StreamSubscriber = (event: unknown, eventType: StreamEventType) => void;

/**
 * Clave compuesta para suscripciones de stream: pluginId:channel:companyId
 */
function streamKey(pluginId: string, channel: string, companyId: string): string {
  return `${pluginId}:${channel}:${companyId}`;
}

export interface PluginStreamBus {
  /**
   * Suscribe a eventos de stream para un (pluginId, channel, companyId)
   * específico. Devuelve una función para desuscribirse.
   */
  subscribe(
    pluginId: string,
    channel: string,
    companyId: string,
    listener: StreamSubscriber,
  ): () => void;

  /**
   * Publica un evento a todos los suscriptores de (pluginId, channel,
   * companyId). Lo llama el worker manager cuando recibe una notificación
   * de stream.
   */
  publish(
    pluginId: string,
    channel: string,
    companyId: string,
    event: unknown,
    eventType?: StreamEventType,
  ): void;
}

/**
 * Crea una nueva instancia de PluginStreamBus.
 */
export function createPluginStreamBus(): PluginStreamBus {
  const subscribers = new Map<string, Set<StreamSubscriber>>();

  return {
    subscribe(pluginId, channel, companyId, listener) {
      const key = streamKey(pluginId, channel, companyId);
      let set = subscribers.get(key);
      if (!set) {
        set = new Set();
        subscribers.set(key, set);
      }
      set.add(listener);

      return () => {
        set!.delete(listener);
        if (set!.size === 0) {
          subscribers.delete(key);
        }
      };
    },

    publish(pluginId, channel, companyId, event, eventType: StreamEventType = "message") {
      const key = streamKey(pluginId, channel, companyId);
      const set = subscribers.get(key);
      if (!set) return;
      for (const listener of set) {
        listener(event, eventType);
      }
    },
  };
}
