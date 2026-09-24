import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { AGENT_ICON_NAMES } from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { listServerAdapters } from "../adapters/index.js";
import { agentService } from "../services/agents.js";

function hasCreatePermission(agent: { role: string; permissions: Record<string, unknown> | null | undefined }) {
  if (!agent.permissions || typeof agent.permissions !== "object") return false;
  return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
}

export function llmRoutes(db: Db) {
  const router = Router();
  const agentsSvc = agentService(db);

  async function assertCanRead(req: Request) {
    if (req.actor.type === "board") return;
    if (req.actor.type !== "agent" || !req.actor.agentId) {
      throw forbidden("Se requiere autenticación de board o de agente permitido");
    }
    const actorAgent = await agentsSvc.getById(req.actor.agentId);
    if (!actorAgent || !hasCreatePermission(actorAgent)) {
      throw forbidden("Falta el permiso para leer el reflejo de configuración de agentes");
    }
  }

  router.get("/llms/agent-configuration.txt", async (req, res) => {
    await assertCanRead(req);
    const adapters = listServerAdapters().sort((a, b) => a.type.localeCompare(b.type));
    const lines = [
      "# Índice de configuración de agentes de Paperclip",
      "",
      "Adaptadores instalados:",
      ...adapters.map((adapter) => `- ${adapter.type}: /llms/agent-configuration/${adapter.type}.txt`),
      "",
      "Endpoints de API relacionados:",
      "- GET /api/companies/:companyId/agent-configurations",
      "- GET /api/agents/:id/configuration",
      "- POST /api/companies/:companyId/agent-hires",
      "",
      "Referencias de identidad de agentes:",
      "- GET /llms/agent-icons.txt",
      "",
      "Notas:",
      "- Los valores sensibles se redactan en las APIs de lectura de configuración.",
      "- Las nuevas contrataciones pueden crearse en estado pending_approval según los ajustes de la empresa.",
      "",
    ];
    res.type("text/plain").send(lines.join("\n"));
  });

  router.get("/llms/agent-icons.txt", async (req, res) => {
    await assertCanRead(req);
    const lines = [
      "# Nombres de íconos de agentes de Paperclip",
      "",
      "Establece el campo `icon` en los payloads de hire/create a uno de:",
      ...AGENT_ICON_NAMES.map((name) => `- ${name}`),
      "",
      "Ejemplo:",
      '{ "name": "SearchOps", "role": "researcher", "icon": "search" }',
      "",
    ];
    res.type("text/plain").send(lines.join("\n"));
  });

  router.get("/llms/agent-configuration/:adapterType.txt", async (req, res) => {
    await assertCanRead(req);
    const adapterType = req.params.adapterType as string;
    const adapter = listServerAdapters().find((entry) => entry.type === adapterType);
    if (!adapter) {
      res.status(404).type("text/plain").send(`Tipo de adaptador desconocido: ${adapterType}`);
      return;
    }
    res
      .type("text/plain")
      .send(
        adapter.agentConfigurationDoc ??
          `# Configuración de agentes ${adapterType}\n\nNo hay documentación específica del adaptador registrada.`,
      );
  });

  return router;
}
