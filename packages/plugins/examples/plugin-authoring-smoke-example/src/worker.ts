import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.events.on("issue.created", async (event) => {
      const issueId = event.entityId ?? "unknown";
      await ctx.state.set({ scopeKind: "issue", scopeId: issueId, stateKey: "seen" }, true);
      ctx.logger.info("issue.created observado", { issueId });
    });

    ctx.data.register("health", async () => {
      return { status: "ok", checkedAt: new Date().toISOString() };
    });

    ctx.actions.register("ping", async () => {
      ctx.logger.info("Acci\u00f3n de ping invocada");
      return { pong: true, at: new Date().toISOString() };
    });
  },

  async onHealth() {
    return { status: "ok", message: "El worker del plugin est\u00e1 en ejecuci\u00f3n" };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
