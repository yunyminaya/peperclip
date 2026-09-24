export const type = "claude_local";
export const label = "Claude Code (local)";

export const models = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-6", label: "Claude Haiku 4.6" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export const agentConfigurationDoc = `# claude_local agent configuration

Adapter: claude_local

Campos principales:
- cwd (string, optional): directorio de trabajo absoluto predeterminado para el proceso del agente (se crea si falta cuando es posible)
- instructionsFilePath (string, optional): ruta absoluta a un archivo markdown de instrucciones que se inyecta en tiempo de ejecución
- model (string, optional): id del modelo de Claude
- effort (string, optional): esfuerzo de razonamiento pasado vía --effort (low|medium|high)
- chrome (boolean, optional): pasar --chrome al ejecutar Claude
- promptTemplate (string, optional): plantilla del prompt de ejecución
- maxTurnsPerRun (number, optional): máximo de turnos para una ejecución
- dangerouslySkipPermissions (boolean, optional): pasar --dangerously-skip-permissions a claude
- command (string, optional): predeterminado "claude"
- extraArgs (string[], optional): argumentos CLI adicionales
- env (object, optional): variables de entorno KEY=VALUE
- workspaceStrategy (object, optional): estrategia del workspace de ejecución; actualmente admite { type: "git_worktree", baseRef?, branchTemplate?, worktreeParentDir? }
- workspaceRuntime (object, optional): intenciones del servicio de runtime del workspace; los servicios locales gestionados por el host se realizan antes de que inicie Claude y se exponen de vuelta vía context/env

Campos operativos:
- timeoutSec (number, optional): tiempo de espera de ejecución en segundos
- graceSec (number, optional): período de gracia SIGTERM en segundos

Notas:
- Cuando Paperclip realiza un workspace/runtime para una ejecución, inyecta las variables de entorno PAPERCLIP_WORKSPACE_* y PAPERCLIP_RUNTIME_* para las herramientas del lado del agente.
`;
