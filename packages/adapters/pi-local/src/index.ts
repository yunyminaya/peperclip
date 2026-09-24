export const type = "pi_local";
export const label = "Pi (local)";

export const models: Array<{ id: string; label: string }> = [];

export const agentConfigurationDoc = `# Configuración del agente pi_local

Adaptador: pi_local

Casos de uso:
- Quieres que Paperclip ejecute Pi (el agente de código con IA) localmente como el runtime del agente
- Quieres el enrutamiento proveedor/modelo en formato Pi (--provider <name> --model <id>)
- Quieres reanudar las sesiones de Pi entre latidos con --session
- Necesitas el conjunto de herramientas de Pi (read, bash, edit, write, grep, find, ls)

No usar cuando:
- Necesitas invocación externa tipo webhook (usa openclaw_gateway o http)
- Solo necesitas comandos shell de una sola ejecución (usa process)
- La CLI de Pi no está instalada en la máquina

Campos principales:
- cwd (string, optional): directorio de trabajo absoluto predeterminado de reserva para el proceso del agente (se crea si falta cuando es posible)
- instructionsFilePath (string, optional): ruta absoluta a un archivo markdown de instrucciones que se agrega al system prompt con --append-system-prompt
- promptTemplate (string, optional): plantilla del prompt de usuario pasada con el flag -p
- model (string, required): id del modelo de Pi en formato proveedor/modelo (por ejemplo xai/grok-4)
- thinking (string, optional): nivel de thinking (off, minimal, low, medium, high, xhigh)
- command (string, optional): valor predeterminado "pi"
- env (object, optional): variables de entorno CLAVE=VALOR

Campos operativos:
- timeoutSec (number, optional): tiempo máximo de ejecución en segundos
- graceSec (number, optional): período de gracia de SIGTERM en segundos

Notas:
- Pi admite múltiples proveedores y modelos. Usa \`pi --list-models\` para listar las opciones disponibles.
- Paperclip requiere un valor explícito de \`model\` para los agentes \`pi_local\`.
- Las sesiones se guardan en ~/.pi/paperclips/ y se reanudan con --session.
- Todas las herramientas (read, bash, edit, write, grep, find, ls) están habilitadas de forma predeterminada.
- Las instrucciones del agente se agregan al system prompt de Pi con --append-system-prompt, mientras que la tarea del usuario se envía con -p.
`;
