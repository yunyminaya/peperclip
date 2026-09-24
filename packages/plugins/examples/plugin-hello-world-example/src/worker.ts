import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const PLUGIN_NAME = "hello-world-example";
const HEALTH_MESSAGE = "Plugin de ejemplo Hola Mundo listo";

/**
 * Hooks de ciclo de vida del worker para el plugin de referencia Hola Mundo.
 * Se mantiene intencionalmente pequeño para que los nuevos autores copien la forma rápidamente.
 */
const plugin = definePlugin({
  /**
   * Llamado cuando el host inicia el worker del plugin.
   */
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_NAME}: configuración del plugin completa`);
  },

  /**
   * Llamado por el endpoint de sonda de salud del host.
   */
  async onHealth() {
    return { status: "ok", message: HEALTH_MESSAGE };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
