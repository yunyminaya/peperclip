# Incorporación y plan de pruebas de la puerta de enlace de OpenClaw

## Alcance
Este plan ahora es **solo puerta de enlace**. Paperclip admite OpenClaw únicamente a través de `openclaw_gateway`.

- Ruta eliminada: adaptador `openclaw` heredado (`/v1/responses`, `/hooks/*`, cambio entre transporte SSE/webhook)
- Ruta admitida: `openclaw_gateway` por WebSocket (`ws://` o `wss://`)

## Requisitos
1. La imagen de prueba de OpenClaw debe estar limpia/sin cambios en cada ejecución.
2. La incorporación debe funcionar a partir de un prompt principal pegado en OpenClaw (se permite un ping de seguimiento opcional).
3. La autenticación del dispositivo permanece habilitada por defecto; el emparejamiento se conserva mediante `adapterConfig.devicePrivateKeyPem`.
4. El flujo de invitación/acceso debe ser seguro:
- el endpoint del prompt de invitación está protegido por permisos del panel
- el agente CEO puede invocar el endpoint del prompt de invitación para su propia empresa
5. Los criterios de aprobación de E2E deben incluir los 3 casos funcionales de tareas.

## Flujo de producto actual
1. El panel/CEO abre los ajustes de la empresa.
2. Hace clic en `Generate OpenClaw Invite Prompt`.
3. Pega el prompt generado en el chat de OpenClaw.
4. OpenClaw envía la aceptación de la invitación con:
- `adapterType: "openclaw_gateway"`
- `agentDefaultsPayload.url: ws://... | wss://...`
- `agentDefaultsPayload.headers["x-openclaw-token"]`
5. El panel aprueba la solicitud de ingreso.
6. OpenClaw reclama la clave API e instala/usa la habilidad de Paperclip.
7. La primera ejecución de tarea puede requerir una aprobación de emparejamiento; después de la aprobación, el emparejamiento persiste mediante la clave del dispositivo almacenada.

## Contrato técnico (puerta de enlace)
Mínimo de `agentDefaultsPayload`:
```json
{
  "url": "ws://127.0.0.1:18789",
  "headers": { "x-openclaw-token": "<gateway-token>" }
}
```

Campos recomendados:
```json
{
  "paperclipApiUrl": "http://host.docker.internal:3100",
  "waitTimeoutMs": 120000,
  "sessionKeyStrategy": "issue",
  "role": "operator",
  "scopes": ["operator.admin"]
}
```

Valores de seguridad/emparejamiento por defecto:
- `disableDeviceAuth`: por defecto false
- `devicePrivateKeyPem`: se genera durante el ingreso si falta

## Flujo de trabajo de automatización de Codex

### 0) Restablecer y arrancar
```bash
OPENCLAW_DOCKER_DIR=/tmp/openclaw-docker
if [ -d "$OPENCLAW_DOCKER_DIR" ]; then
  docker compose -f "$OPENCLAW_DOCKER_DIR/docker-compose.yml" down --remove-orphans || true
fi

docker image rm openclaw:local || true
OPENCLAW_RESET_STATE=1 OPENCLAW_BUILD=1 ./scripts/smoke/openclaw-docker-ui.sh
```

### 1) Iniciar Paperclip
```bash
pnpm dev --tailscale-auth
curl -fsS http://127.0.0.1:3100/api/health
```

### 2) Invitación + ingreso + aprobación
- crea el prompt de invitación mediante `POST /api/companies/:companyId/openclaw/invite-prompt`
- pega el prompt en OpenClaw
- aprueba la solicitud de ingreso
- verifica el agente creado:
  - `adapterType == openclaw_gateway`
  - el encabezado del token existe y su longitud es >= 16
  - `devicePrivateKeyPem` existe

### 3) Estabilización del emparejamiento
- si la primera ejecución devuelve `pairing required`, aprueba el dispositivo pendiente en OpenClaw
- vuelve a ejecutar la tarea y confirma el éxito
- verifica que las ejecuciones posteriores no requieran volver a emparejar para el mismo agente

### 4) Aserciones E2E funcionales
1. La tarea asignada a OpenClaw se completa y se cierra.
2. La tarea que pide a OpenClaw enviar un mensaje del chat principal web tiene éxito (mensaje visible en el chat principal).
3. En la sesión `/new` de OpenClaw, OpenClaw todavía puede crear una tarea de Paperclip.

## Lista de verificación de humo manual
Usa [doc/OPENCLAW_ONBOARDING.md](../../../../doc/OPENCLAW_ONBOARDING.md) como la guía de ejecución del operador.

## Puertas de regresión
Requerido antes de fusionar:
```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```

Si la suite completa es demasiado pesada localmente, ejecuta al menos:
```bash
pnpm --filter @paperclipai/server test:run -- openclaw-gateway
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/ui typecheck
pnpm --filter paperclipai typecheck
```
