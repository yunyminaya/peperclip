# Autenticación de agentes — Implementación JWT del adaptador local P0

## Alcance

- Adaptadores en alcance: `claude_local`, `codex_local`.
- Objetivo: autenticación de cero configuración para adaptadores locales preservando claves estáticas para todas las demás rutas de llamada.
- Fuera de alcance para P0: UX de rotación, lista de revocación por dispositivo e incorporación vía CLI.

## 1) Formato de token y configuración

- Usar JWT HS256 con claims:
  - `sub` (id del agente)
  - `company_id`
  - `adapter_type`
  - `run_id`
  - `iat`
  - `exp`
  - opcional `jti` (id de token de ejecución)
- Nuevos ajustes/variables de entorno:
  - `PAPERCLIP_AGENT_JWT_SECRET`
  - `PAPERCLIP_AGENT_JWT_TTL_SECONDS` (por defecto: `172800`)
  - `PAPERCLIP_AGENT_JWT_ISSUER` (por defecto: `paperclip`)
  - `PAPERCLIP_AGENT_JWT_AUDIENCE` (por defecto: `paperclip-api`)

## 2) Ruta de autenticación dual en `actorMiddleware`

1. Mantener sin cambios la ruta existente de búsqueda de claves en DB (`agent_api_keys` búsqueda de hash).
2. Si ninguna clave de DB coincide, agregar verificación JWT en `server/src/middleware/auth.ts`.
3. En caso de éxito del JWT:
   - establecer `req.actor = { type: "agent", agentId, companyId }`.
   - opcionalmente protegerse contra agentes terminados.
4. Continuar el fallback del tablero para solicitudes sin autenticación válida.

## 3) Capacidad de adaptador opt-in

1. Extender `ServerAdapterModule` (probablemente `packages/adapter-utils/src/types.ts`) con un flag de capacidad:
   - `supportsLocalAgentJwt?: true`.
2. Habilitarlo en:
   - `server/src/adapters/registry.ts` para `claude_local` y `codex_local`.
3. Dejar sin definir los adaptadores `process`/`http` para P0.
4. En `server/src/services/heartbeat.ts`, cuando el adaptador soporta JWT:
   - emitir un JWT por ejecución de latido antes de ejecutar.
   - incluir el token en el contexto de ejecución del adaptador.

## 4) Comportamiento de inyección de env local

1. En:
   - `packages/adapters/claude-local/src/server/execute.ts`
   - `packages/adapters/codex-local/src/server/execute.ts`

   inyectar `PAPERCLIP_API_KEY` desde el token del contexto.

- Preservar el comportamiento existente para variables de entorno explícitas definidas por el usuario en `adapterConfig.env`:
  - si el usuario ya define `PAPERCLIP_API_KEY`, no sobrescribirla.
- Continuar inyectando:
  - `PAPERCLIP_AGENT_ID`
  - `PAPERCLIP_COMPANY_ID`
  - `PAPERCLIP_API_URL`

## 5) Actualizaciones de documentación

- Actualizar los documentos orientados al operador para eliminar la expectativa de configuración manual de claves para adaptadores locales:
  - `skills/paperclip/SKILL.md`
  - la salida/ejemplos de ayuda de `cli/src/commands/heartbeat-run.ts` si mencionan configuración manual de la API key.

## 6) Criterios de aceptación P0

- Los adaptadores locales se autentican sin configuración manual de `PAPERCLIP_API_KEY`.
- Las claves estáticas existentes (`agent_api_keys`) siguen funcionando sin cambios.
- La autenticación sigue con alcance de empresa (`req.actor.companyId` usado por las verificaciones existentes).
- Los errores de generación y verificación de JWT se registran como eventos estructurados que no filtran información.
- El alcance sigue siendo solo local (`claude_local`, `codex_local`) mientras el modelo de capacidades del adaptador es genérico.
