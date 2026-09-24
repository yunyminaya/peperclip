export const type = "cursor";
export const label = "Cursor CLI (local)";
export const DEFAULT_CURSOR_LOCAL_MODEL = "auto";

const CURSOR_FALLBACK_MODEL_IDS = [
  "auto",
  "composer-1.5",
  "composer-1",
  "gpt-5.3-codex-low",
  "gpt-5.3-codex-low-fast",
  "gpt-5.3-codex",
  "gpt-5.3-codex-fast",
  "gpt-5.3-codex-high",
  "gpt-5.3-codex-high-fast",
  "gpt-5.3-codex-xhigh",
  "gpt-5.3-codex-xhigh-fast",
  "gpt-5.3-codex-spark-preview",
  "gpt-5.2",
  "gpt-5.2-codex-low",
  "gpt-5.2-codex-low-fast",
  "gpt-5.2-codex",
  "gpt-5.2-codex-fast",
  "gpt-5.2-codex-high",
  "gpt-5.2-codex-high-fast",
  "gpt-5.2-codex-xhigh",
  "gpt-5.2-codex-xhigh-fast",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-max-high",
  "gpt-5.2-high",
  "gpt-5.1-high",
  "gpt-5.1-codex-mini",
  "opus-4.6-thinking",
  "opus-4.6",
  "opus-4.5",
  "opus-4.5-thinking",
  "sonnet-4.6",
  "sonnet-4.6-thinking",
  "sonnet-4.5",
  "sonnet-4.5-thinking",
  "gemini-3.1-pro",
  "gemini-3-pro",
  "gemini-3-flash",
  "grok",
  "kimi-k2.5",
];

export const models = CURSOR_FALLBACK_MODEL_IDS.map((id) => ({ id, label: id }));

export const agentConfigurationDoc = `# cursor agent configuration

Adapter: cursor

Úsalo cuando:
- Quieres que Paperclip ejecute el Cursor Agent CLI localmente como runtime del agente
- Quieres reanudación de sesión de chat de Cursor entre latidos vía --resume
- Quieres salida de stream estructurada en los registros de ejecución vía --output-format stream-json

No lo uses cuando:
- Necesitas invocación externa estilo webhook (usa openclaw_gateway o http)
- Solo necesitas comandos shell de una sola vez (usa process)
- El Cursor Agent CLI no está instalado en la máquina

Campos principales:
- cwd (string, optional): directorio de trabajo absoluto predeterminado para el proceso del agente (se crea si falta cuando es posible)
- instructionsFilePath (string, optional): ruta absoluta a un archivo markdown de instrucciones que se antepone al prompt de ejecución
- promptTemplate (string, optional): plantilla del prompt de ejecución
- model (string, optional): id del modelo de Cursor (por ejemplo auto o gpt-5.3-codex)
- mode (string, optional): modo de ejecución de Cursor pasado como --mode (plan|ask). Déjalo sin definir para ejecuciones autónomas normales.
- command (string, optional): predeterminado "agent"
- extraArgs (string[], optional): argumentos CLI adicionales
- env (object, optional): variables de entorno KEY=VALUE

Campos operativos:
- timeoutSec (number, optional): tiempo de espera de ejecución en segundos
- graceSec (number, optional): período de gracia SIGTERM en segundos

Notas:
- Las ejecuciones se hacen con: agent -p --output-format stream-json ...
- Los prompts se envían a Cursor vía stdin.
- Las sesiones se reanudan con --resume cuando el cwd de la sesión guardada coincide con el cwd actual.
- Paperclip auto-inyecta habilidades locales en "~/.cursor/skills" cuando faltan, para que Cursor pueda descubrir "$paperclip" y habilidades relacionadas en ejecuciones locales.
- Paperclip agrega --yolo automáticamente a menos que --trust/--yolo/-f ya esté presente en extraArgs.
`;
