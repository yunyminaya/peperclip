Usa este checklist exacto.

1. Inicia Paperclip en modo auth.
```bash
cd <paperclip-repo-root>
pnpm dev --tailscale-auth
```
Luego verifica:
```bash
curl -sS http://127.0.0.1:3100/api/health | jq
```

2. Inicia un OpenClaw Docker limpio/stock.
```bash
OPENCLAW_RESET_STATE=1 OPENCLAW_BUILD=1 ./scripts/smoke/openclaw-docker-ui.sh
```
Abre la `Dashboard URL` impresa (incluye `#token=...`) en tu navegador.

3. En la UI de Paperclip, ve a `http://127.0.0.1:3100/CLA/company/settings`.

4. Usa el flujo de prompt de invitación de OpenClaw.
- En la sección Invites, haz clic en `Generate OpenClaw Invite Prompt`.
- Copia el prompt generado desde `OpenClaw Invite Prompt`.
- Pégalo en el chat principal de OpenClaw como un solo mensaje.
- Si se atasca, envía un seguimiento: `How is onboarding going? Continue setup now.`

Nota de seguridad/control:
- El prompt de invitación de OpenClaw se crea desde un endpoint controlado:
  - `POST /api/companies/{companyId}/openclaw/invite-prompt`
  - los usuarios del tablero con permiso de invitación pueden llamarlo
  - los llamadores agente están limitados al agente CEO de la empresa

5. Aprueba la solicitud de unión en la UI de Paperclip, luego confirma que el agente OpenClaw aparece en agentes de CLA.

6. Preflight del gateway (requerido antes de pruebas de tareas).
- Confirma que el agente creado usa `openclaw_gateway` (no `openclaw`).
- Confirma que la URL del gateway es `ws://...` o `wss://...`.
- Confirma que el token del gateway no es trivial (no vacío / no marcador de 1 carácter).
- La UI del adaptador OpenClaw Gateway no debe exponer `disableDeviceAuth` para incorporación normal.
- Confirma que el modo de emparejamiento es explícito:
  - valor por defecto requerido: autenticación de dispositivo habilitada (`adapterConfig.disableDeviceAuth` falso/ausente) con `adapterConfig.devicePrivateKeyPem` persistido
  - no confíes en `disableDeviceAuth` para incorporación normal
- Si puedes ejecutar chequeos de API con autenticación del tablero:
```bash
AGENT_ID="<newly-created-agent-id>"
curl -sS -H "Cookie: $PAPERCLIP_COOKIE" "http://127.0.0.1:3100/api/agents/$AGENT_ID" | jq '{adapterType,adapterConfig:{url:.adapterConfig.url,tokenLen:(.adapterConfig.headers["x-openclaw-token"] // .adapterConfig.headers["x-openclaw-auth"] // "" | length),disableDeviceAuth:(.adapterConfig.disableDeviceAuth // false),hasDeviceKey:(.adapterConfig.devicePrivateKeyPem // "" | length > 0)}}'
```
- Esperado: `adapterType=openclaw_gateway`, `tokenLen >= 16`, `hasDeviceKey=true` y `disableDeviceAuth=false`.

Nota de handshake de emparejamiento:
- Expectativa de ejecución limpia: la primera tarea debe tener éxito sin comandos manuales de emparejamiento.
- El adaptador intenta una aprobación de emparejamiento automática + reintento en el primer `pairing required` (cuando el token/contraseña de autenticación del gateway compartido es válido).
- Si el emparejamiento automático no puede completarse (por ejemplo discrepancia de token o sin solicitud pendiente), la primera ejecución del gateway aún puede retornar `pairing required`.
- Esta es una aprobación separada de la aprobación de invitación de Paperclip. Debes aprobar el dispositivo pendiente en el propio OpenClaw.
- Apruébalo en OpenClaw, luego reintenta la tarea.
- Para humo de docker local, puedes aprobar desde el host:
```bash
docker exec openclaw-docker-openclaw-gateway-1 sh -lc 'openclaw devices approve --latest --json --url "ws://127.0.0.1:18789" --token "$(node -p \"require(process.env.HOME+\\\"/.openclaw/openclaw.json\\\").gateway.auth.token\")"'
```
- Puedes inspeccionar dispositivos pendientes vs emparejados:
```bash
docker exec openclaw-docker-openclaw-gateway-1 sh -lc 'TOK="$(node -e \"const fs=require(\\\"fs\\\");const c=JSON.parse(fs.readFileSync(\\\"/home/node/.openclaw/openclaw.json\\\",\\\"utf8\\\"));process.stdout.write(c.gateway?.auth?.token||\\\"\\\");\")\"; openclaw devices list --json --url \"ws://127.0.0.1:18789\" --token \"$TOK\"'
```

7. Caso A (prueba manual de issue).
- Crea un issue asignado al agente OpenClaw.
- Pon instrucciones: "post comment `OPENCLAW_CASE_A_OK_<timestamp>` and mark done."
- Verifica en la UI: el estado del issue pasa a `done` y el comentario existe.

8. Caso B (prueba de herramienta de mensajes).
- Crea otro issue asignado a OpenClaw.
- Instrucciones: "send `OPENCLAW_CASE_B_OK_<timestamp>` to main webchat via message tool, then comment same marker on issue, then mark done."
- Verifica ambos:
  - comentario marcador en el issue
  - texto marcador aparece en el chat principal de OpenClaw

9. Caso C (prueba de memoria/habilidades de nueva sesión).
- En OpenClaw, inicia sesión `/new`.
- Pídele crear un nuevo issue de CLA en Paperclip con título único `OPENCLAW_CASE_C_CREATED_<timestamp>`.
- Verifica en la UI de Paperclip que el nuevo issue existe.

10. Observa los logs durante la prueba (opcional pero útil):
```bash
docker compose -f /tmp/openclaw-docker/docker-compose.yml -f /tmp/openclaw-docker/.paperclip-openclaw.override.yml logs -f openclaw-gateway
```

11. Criterios de aprobación esperados.
- Preflight: `openclaw_gateway` + token no marcador (`tokenLen >= 16`).
- Modo de emparejamiento: `devicePrivateKeyPem` estable configurado con autenticación de dispositivo habilitada (ruta por defecto).
- Caso A: `done` + comentario marcador.
- Caso B: `done` + comentario marcador + mensaje de chat principal visible.
- Caso C: tarea original terminada y nuevo issue creado desde sesión `/new`.

Si quieres, también puedo darte un solo comando de "modo observador" que ejecuta el harness de humo stock mientras observas los mismos pasos en vivo en la UI.
