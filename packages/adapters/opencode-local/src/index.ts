export const type = "opencode_local";
export const label = "OpenCode (local)";

export const models: Array<{ id: string; label: string }> = [];

export const agentConfigurationDoc = `# Configuración del agente opencode_local

Adaptador: opencode_local

Casos de uso:
- Quieres que Paperclip ejecute OpenCode localmente como el runtime del agente
- Quieres el enrutamiento proveedor/modelo en formato OpenCode (proveedor/modelo)
- Quieres reanudar las sesiones de OpenCode entre latidos con --session

No usar cuando:
- Necesitas invocación externa tipo webhook (usa openclaw_gateway o http)
- Solo necesitas comandos shell de una sola ejecución (usa process)
- La CLI de OpenCode no está instalada en la máquina

Campos principales:
- cwd (string, optional): directorio de trabajo absoluto predeterminado de reserva para el proceso del agente (se crea si falta cuando es posible)
- instructionsFilePath (string, optional): ruta absoluta a un archivo markdown de instrucciones que se antepone al prompt de la ejecución
- model (string, required): id del modelo de OpenCode en formato proveedor/modelo (por ejemplo anthropic/claude-sonnet-4-5)
- variant (string, optional): variante del modelo específica del proveedor (por ejemplo minimal|low|medium|high|max)
- dangerouslySkipPermissions (boolean, optional): inyecta una configuración de OpenCode en tiempo de ejecución que permite \`external_directory\` sin solicitudes interactivas; predeterminado true para ejecuciones desatendidas de Paperclip
- promptTemplate (string, optional): plantilla del prompt de la ejecución
- command (string, optional): valor predeterminado "opencode"
- extraArgs (string[], optional): argumentos adicionales de la CLI
- env (object, optional): variables de entorno CLAVE=VALOR

Campos operativos:
- timeoutSec (number, optional): tiempo máximo de ejecución en segundos
- graceSec (number, optional): período de gracia de SIGTERM en segundos

Notas:
- OpenCode admite múltiples proveedores y modelos. Usa \
  \`opencode models\` para listar las opciones disponibles en formato proveedor/modelo.
- Paperclip requiere un valor explícito de \`model\` para los agentes \`opencode_local\`.
- Las ejecuciones se realizan con: opencode run --format json ...
- Las sesiones se reanudan con --session cuando el cwd de la sesión guardada coincide con el cwd actual.
- El adaptador establece OPENCODE_DISABLE_PROJECT_CONFIG=true para evitar que OpenCode \
  escriba un archivo de configuración opencode.json en el directorio de trabajo del proyecto. La selección del modelo \
  se pasa con el flag --model de la CLI.
- Cuando \`dangerouslySkipPermissions\` está habilitado, Paperclip inyecta una configuración temporal \
  en tiempo de ejecución con \`permission.external_directory=allow\` para que las ejecuciones headless no \
  se detengan en solicitudes de aprobación.
`;
