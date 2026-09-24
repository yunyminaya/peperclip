export const type = "codex_local";
export const label = "Codex (local)";
export const DEFAULT_CODEX_LOCAL_MODEL = "gpt-5.3-codex";
export const DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX = true;

export const models = [
  { id: "gpt-5.4", label: "gpt-5.4" },
  { id: DEFAULT_CODEX_LOCAL_MODEL, label: DEFAULT_CODEX_LOCAL_MODEL },
  { id: "gpt-5.3-codex-spark", label: "gpt-5.3-codex-spark" },
  { id: "gpt-5", label: "gpt-5" },
  { id: "o3", label: "o3" },
  { id: "o4-mini", label: "o4-mini" },
  { id: "gpt-5-mini", label: "gpt-5-mini" },
  { id: "gpt-5-nano", label: "gpt-5-nano" },
  { id: "o3-mini", label: "o3-mini" },
  { id: "codex-mini-latest", label: "Codex Mini" },
];

export const agentConfigurationDoc = `# codex_local agent configuration

Adapter: codex_local

Campos principales:
- cwd (string, optional): directorio de trabajo absoluto predeterminado para el proceso del agente (se crea si falta cuando es posible)
- instructionsFilePath (string, optional): ruta absoluta a un archivo markdown de instrucciones que se antepone al prompt de stdin en tiempo de ejecución
- model (string, optional): id del modelo de Codex
- modelReasoningEffort (string, optional): reemplazo del esfuerzo de razonamiento (minimal|low|medium|high) pasado vía -c model_reasoning_effort=...
- promptTemplate (string, optional): plantilla del prompt de ejecución
- search (boolean, optional): ejecutar codex con --search
- dangerouslyBypassApprovalsAndSandbox (boolean, optional): ejecutar con la flag de bypass
- command (string, optional): predeterminado "codex"
- extraArgs (string[], optional): argumentos CLI adicionales
- env (object, optional): variables de entorno KEY=VALUE
- workspaceStrategy (object, optional): estrategia del workspace de ejecución; actualmente admite { type: "git_worktree", baseRef?, branchTemplate?, worktreeParentDir? }
- workspaceRuntime (object, optional): intenciones del servicio de runtime del workspace; los servicios locales gestionados por el host se realizan antes de que inicie Codex y se exponen de vuelta vía context/env

Campos operativos:
- timeoutSec (number, optional): tiempo de espera de ejecución en segundos
- graceSec (number, optional): período de gracia SIGTERM en segundos

Notas:
- Los prompts se envían por stdin (Codex recibe el argumento de prompt "-").
- Si instructionsFilePath está configurado, Paperclip antepone el contenido de ese archivo al prompt de stdin en cada ejecución.
- Codex exec aplica automáticamente las instrucciones AGENTS.md del repositorio del workspace activo. Paperclip no puede suprimir esa detección en modo exec, así que los archivos AGENTS.md del repo pueden aplicarse aun cuando solo configuraste un instructionsFilePath explícito.
- Paperclip inyecta las habilidades locales deseadas en el directorio CODEX_HOME/skills/ efectivo en tiempo de ejecución para que Codex pueda descubrir "$paperclip" y habilidades relacionadas sin contaminar el directorio de trabajo del proyecto. En modo managed-home (predeterminado) esto es ~/.paperclip/instances/<id>/companies/<companyId>/codex-home/skills/; cuando CODEX_HOME se reemplaza explícitamente en la configuración del adaptador, se usa ese reemplazo.
- A menos que se reemplace explícitamente en la configuración del adaptador, Paperclip ejecuta Codex con un CODEX_HOME gestionado por empresa bajo la instancia activa de Paperclip e inicializa la autenticación/configuración desde el home compartido de Codex (la variable de entorno CODEX_HOME, cuando está definida, o ~/.codex).
- Algunas combinaciones de modelo/herramienta rechazan ciertos niveles de esfuerzo (por ejemplo minimal con búsqueda web habilitada).
- Cuando Paperclip realiza un workspace/runtime para una ejecución, inyecta las variables de entorno PAPERCLIP_WORKSPACE_* y PAPERCLIP_RUNTIME_* para las herramientas del lado del agente.
`;
