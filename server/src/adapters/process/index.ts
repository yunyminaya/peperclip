import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const processAdapter: ServerAdapterModule = {
  type: "process",
  execute,
  testEnvironment,
  models: [],
  agentConfigurationDoc: `# Configuración del agente process

Adaptador: process

Campos principales:
- command (string, required): comando a ejecutar
- args (string[] | string, optional): argumentos del comando
- cwd (string, optional): directorio de trabajo absoluto
- env (object, optional): variables de entorno KEY=VALUE

Campos operativos:
- timeoutSec (number, optional): tiempo de espera de la ejecución en segundos
- graceSec (number, optional): período de gracia SIGTERM en segundos
`,
};
