import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const httpAdapter: ServerAdapterModule = {
  type: "http",
  execute,
  testEnvironment,
  models: [],
  agentConfigurationDoc: `# Configuración del agente http

Adaptador: http

Campos principales:
- url (string, required): endpoint a invocar
- method (string, optional): método HTTP, POST por defecto
- headers (object, optional): encabezados de la solicitud
- payloadTemplate (object, optional): plantilla de payload JSON
- timeoutSec (number, optional): tiempo de espera de la solicitud en segundos
`,
};
