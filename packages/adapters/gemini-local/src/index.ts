export const type = "gemini_local";
export const label = "Gemini CLI (local)";
export const DEFAULT_GEMINI_LOCAL_MODEL = "auto";

export const models = [
  { id: DEFAULT_GEMINI_LOCAL_MODEL, label: "Auto" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
];

export const agentConfigurationDoc = `# Configuración del agente gemini_local

Adaptador: gemini_local

Casos de uso:
- Quieres que Paperclip ejecute la CLI de Gemini localmente en la máquina anfitriona
- Quieres reanudar las sesiones de chat de Gemini entre latidos con --resume
- Quieres inyectar las habilidades de Paperclip localmente sin contaminar el entorno global

No usar cuando:
- Necesitas invocación externa tipo webhook (usa http u openclaw_gateway)
- Solo necesitas un script de una sola ejecución sin el ciclo de un agente de código con IA (usa process)
- La CLI de Gemini no está instalada en la máquina que ejecuta Paperclip

Campos principales:
- cwd (string, optional): directorio de trabajo absoluto predeterminado de reserva para el proceso del agente (se crea si falta cuando es posible)
- instructionsFilePath (string, optional): ruta absoluta a un archivo markdown de instrucciones que se antepone al prompt de la ejecución
- promptTemplate (string, optional): plantilla del prompt de la ejecución
- model (string, optional): id del modelo de Gemini. Predeterminado: auto.
- sandbox (boolean, optional): ejecutar en modo sandbox (predeterminado: false, pasa --sandbox=none)
- command (string, optional): valor predeterminado "gemini"
- extraArgs (string[], optional): argumentos adicionales de la CLI
- env (object, optional): variables de entorno CLAVE=VALOR

Campos operativos:
- timeoutSec (number, optional): tiempo máximo de ejecución en segundos
- graceSec (number, optional): período de gracia de SIGTERM en segundos

Notas:
- Las ejecuciones usan argumentos posicionales de prompt, no stdin.
- Las sesiones se reanudan con --resume cuando el cwd de la sesión guardada coincide con el cwd actual.
- Paperclip inyecta automáticamente las habilidades locales en \`~/.gemini/skills/\` mediante enlaces simbólicos, para que la CLI descubra las credenciales y las habilidades en su ubicación natural.
- La autenticación puede usar GEMINI_API_KEY / GOOGLE_API_KEY o el inicio de sesión local de la CLI de Gemini.
`;
