# Adaptador de la puerta de enlace de OpenClaw

Este documento describe cómo `@paperclipai/adapter-openclaw-gateway` invoca OpenClaw mediante el protocolo de puerta de enlace (Gateway).

## Transporte

Este adaptador siempre usa el transporte de puerta de enlace por WebSocket.

- La URL debe ser `ws://` o `wss://`
- El flujo de conexión sigue el protocolo de puerta de enlace:
1. recibe `connect.challenge`
2. envía `req connect` (payload de protocolo/cliente/autenticación/dispositivo)
3. envía `req agent`
4. espera la finalización mediante `req agent.wait`
5. transmite los frames `event agent` hacia los registros/analizador de transcripciones de Paperclip

## Modos de autenticación

Las credenciales de la puerta de enlace se pueden proporcionar de cualquiera de estas formas:

- `authToken` / `token` en la configuración del adaptador
- `headers.x-openclaw-token`
- `headers.x-openclaw-auth` (heredado)
- `password` (modo de contraseña compartida)

Cuando hay un token presente y falta el encabezado `authorization`, el adaptador deriva `Authorization: Bearer <token>`.

## Autenticación del dispositivo

Por defecto, el adaptador envía un payload `device` firmado en los parámetros de `connect`.

- establece `disableDeviceAuth=true` para omitir la firma del dispositivo
- establece `devicePrivateKeyPem` para fijar una clave de firma estable
- sin `devicePrivateKeyPem`, el adaptador genera un par de claves Ed25519 efímero por ejecución
- cuando `autoPairOnFirstConnect` está habilitado (por defecto), el adaptador maneja un `pairing required` inicial llamando a `device.pair.list` + `device.pair.approve` con la autenticación compartida, y luego reintenta una vez.

## Estrategia de sesión

El adaptador admite el mismo modelo de enrutamiento de sesiones que el modo HTTP de OpenClaw:

- `sessionKeyStrategy=issue|fixed|run`
- `sessionKey` se usa cuando la estrategia es `fixed`

La clave de sesión resuelta se envía como `agent.sessionKey`.

## Mapeo del payload

La solicitud del agente se construye como:

- campos requeridos:
  - `message` (texto de activación más el prefijo opcional de `payloadTemplate.message`/`payloadTemplate.text`)
  - `idempotencyKey` (el `runId` de Paperclip)
  - `sessionKey` (estrategia resuelta)
- agregados opcionales:
  - todos los campos de `payloadTemplate` combinados
  - `agentId` desde la configuración si está definido y aún no está en la plantilla

## Tiempos de espera

- `timeoutSec` controla el presupuesto de solicitud a nivel del adaptador
- `waitTimeoutMs` controla `agent.wait.timeoutMs`

Si `agent.wait` devuelve `timeout`, el adaptador devuelve `openclaw_gateway_wait_timeout`.

## Formato de registros

Los registros estructurados de eventos de la puerta de enlace usan:

- `[openclaw-gateway] ...` para los registros de ciclo de vida/sistema
- `[openclaw-gateway:event] run=<id> stream=<stream> data=<json>` para los frames `event agent`

Los analizadores de UI/CLI consumen estas líneas para mostrar las actualizaciones de la transcripción.
