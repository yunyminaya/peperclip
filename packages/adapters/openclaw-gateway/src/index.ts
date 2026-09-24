export const type = "openclaw_gateway";
export const label = "OpenClaw Gateway";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# Configuración del agente openclaw_gateway

Adaptador: openclaw_gateway

Casos de uso:
- Quieres que Paperclip invoque a OpenClaw mediante el protocolo WebSocket del gateway.
- Quieres la semántica nativa de autenticación/conexión del gateway en lugar de HTTP /v1/responses o /hooks/*.

No usar cuando:
- Solo expones los endpoints HTTP de OpenClaw.
- Tu despliegue no permite acceso WebSocket saliente desde el servidor de Paperclip.

Campos principales:
- url (string, required): URL WebSocket del gateway de OpenClaw (ws:// o wss://)
- headers (object, optional): encabezados de handshake; admite x-openclaw-token / x-openclaw-auth
- authToken (string, optional): anulación del token compartido del gateway
- password (string, optional): contraseña compartida del gateway, si está configurada

Campos de identidad de conexión del gateway:
- clientId (string, optional): id de cliente del gateway (predeterminado: gateway-client)
- clientMode (string, optional): modo de cliente del gateway (predeterminado: backend)
- clientVersion (string, optional): cadena de versión del cliente
- role (string, optional): rol del gateway (predeterminado: operator)
- scopes (string[] | comma string, optional): ámbitos del gateway (predeterminado: ["operator.admin"])
- disableDeviceAuth (boolean, optional): deshabilita el payload firmado del dispositivo en los parámetros de conexión (predeterminado: false)

Campos de comportamiento de la solicitud:
- payloadTemplate (object, optional): campos adicionales fusionados en los parámetros del agente del gateway
- workspaceRuntime (object, optional): intenciones deseadas de servicios en tiempo de ejecución; Paperclip las reenvía en un bloque estandarizado paperclip.workspaceRuntime para entornos de ejecución remotos
- timeoutSec (number, optional): tiempo máximo del adaptador en segundos (predeterminado: 120)
- waitTimeoutMs (number, optional): anulación del tiempo de espera de agent.wait (predeterminado: timeoutSec * 1000)
- autoPairOnFirstConnect (boolean, optional): al recibir por primera vez "pairing required", intenta device.pair.list/device.pair.approve con la autenticación compartida y reintenta una vez (predeterminado: true)
- paperclipApiUrl (string, optional): URL base absoluta de Paperclip anunciada en el texto de activación

Campos de enrutamiento de sesión:
- sessionKeyStrategy (string, optional): issue (predeterminado), fixed o run
- sessionKey (string, optional): clave de sesión fija cuando strategy=fixed (predeterminado: paperclip)

Adiciones estándar del payload de salida:
- paperclip (object): contexto estandarizado de Paperclip agregado a cada solicitud del agente del gateway
- paperclip.workspace (object, optional): espacio de trabajo de ejecución resuelto para esta ejecución
- paperclip.workspaces (array, optional): pistas adicionales de espacios de trabajo que Paperclip expuso a la ejecución
- paperclip.workspaceRuntime (object, optional): configuración normalizada de intenciones de servicios en tiempo de ejecución para el espacio de trabajo

Metadatos de resultado estándar admitidos:
- meta.runtimeServices (array, optional): informes normalizados de servicios en tiempo de ejecución gestionados por el adaptador
- meta.previewUrl (string, optional): forma abreviada de URL de vista previa única
- meta.previewUrls (string[], optional): forma abreviada de múltiples URL de vista previa
`;
