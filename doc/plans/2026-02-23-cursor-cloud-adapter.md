# Adaptador de agentes Cursor Cloud — Plan técnico

## Descripción general

Este documento define el diseño V1 para un adaptador Paperclip que se integra con
Cursor Background Agents vía la API REST de Cursor.

Referencias principales:

- https://docs.cursor.com/background-agent/api/overview
- https://docs.cursor.com/background-agent/api
- https://docs.cursor.com/background-agent/api/webhooks

A diferencia de `claude_local` y `codex_local`, este adaptador no es un subproceso local.
Es un adaptador de orquestación remota con:

1. lanzamiento/seguimiento por HTTP
2. actualizaciones de estado dirigidas por webhooks cuando es posible
3. fallback de polling para confiabilidad
4. eventos stdout sintetizados para la UI/CLI de Paperclip

## Decisiones clave V1

1. **Auth a la API de Cursor** usa `Authorization: Bearer <CURSOR_API_KEY>`.
2. **La URL de callback** debe ser públicamente alcanzable por las VMs de Cursor:
   - local: URL de Tailscale
   - prod: URL pública del servidor
3. **La auth de callback del agente a Paperclip** usa un flujo de intercambio bootstrap (sin Paperclip key de vida larga en el prompt).
4. **Los webhooks son V1**, el polling sigue siendo fallback.
5. **La entrega de habilidades** es bajo demanda desde endpoints de Paperclip, no inyección completa del SKILL.md en el prompt.

---

## Referencia de la API de Cursor (actual)

URL base: `https://api.cursor.com`

Header de autenticación:

- `Authorization: Bearer <CURSOR_API_KEY>`

Endpoints centrales:

| Endpoint | Método | Propósito |
|---|---|---|
| `/v0/agents` | POST | Lanzar agente |
| `/v0/agents/{id}` | GET | Estado del agente |
| `/v0/agents/{id}/conversation` | GET | Historial de conversación |
| `/v0/agents/{id}/followup` | POST | Prompt de seguimiento |
| `/v0/agents/{id}/stop` | POST | Detener/pausar el agente en ejecución |
| `/v0/models` | GET | Lista recomendada de modelos |
| `/v0/me` | GET | Metadatos de la API key |
| `/v0/repositories` | GET | Repos accesibles (estrictamente limitado por tasa) |

Política de manejo de estados para el adaptador:

- Tratar `CREATING` y `RUNNING` como no terminales.
- Tratar `FINISHED` como terminal de éxito.
- Tratar `ERROR` como terminal de falla.
- Tratar estados desconocidos no activos como falla terminal y preservar el estado sin formato en `resultJson`.

Hechos de webhooks relevantes para V1:

- Cursor emite webhooks `statusChange`.
- Los estados terminales de webhook incluyen `ERROR` y `FINISHED`.
- Las firmas de webhook usan HMAC SHA256 (`X-Webhook-Signature: sha256=...`).

Límites operativos:

- `/v0/repositories`: 1 req/usuario/min, 30 req/usuario/hora.
- MCP no soportado en Cursor background agents.

---

## Estructura del paquete

```
packages/adapters/cursor-cloud/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── api.ts
    ├── server/
    │   ├── index.ts
    │   ├── execute.ts
    │   ├── parse.ts
    │   ├── test.ts
    │   └── webhook.ts
    ├── ui/
    │   ├── index.ts
    │   ├── parse-stdout.ts
    │   └── build-config.ts
    └── cli/
        ├── index.ts
        └── format-event.ts
```

`package.json` usa cuatro exports estándar (`.`, `./server`, `./ui`, `./cli`).

---

## Cliente de API (`src/api.ts`)

`src/api.ts` es un wrapper tipado sobre los endpoints de Cursor.

```ts
interface CursorClientConfig {
  apiKey: string;
  baseUrl?: string; // default https://api.cursor.com
}

interface CursorAgent {
  id: string;
  name: string;
  status: "CREATING" | "RUNNING" | "FINISHED" | "ERROR" | string;
  source: { repository: string; ref: string };
  target: {
    branchName?: string;
    prUrl?: string;
    url?: string;
    autoCreatePr?: boolean;
    openAsCursorGithubApp?: boolean;
    skipReviewerRequest?: boolean;
  };
  summary?: string;
  createdAt: string;
}
```

Requisitos del cliente:

- enviar `Authorization: Bearer ...` en todas las solicitudes
- lanzar `CursorApiError` tipado con `status`, cuerpo parseado y contexto de solicitud
- preservar campos desconocidos sin formato para depuración en metadatos de error

---

## Contrato de configuración del adaptador (`src/index.ts`)

```ts
export const type = "cursor_cloud";
export const label = "Cursor Cloud Agent";
```

Campos de configuración V1:

- `repository` (requerido): URL del repo GitHub
- `ref` (opcional, por defecto `main`)
- `model` (opcional, permitir vacío = auto)
- `autoCreatePr` (opcional, por defecto `false`)
- `branchName` (opcional)
- `promptTemplate`
- `pollIntervalSec` (opcional, por defecto `10`)
- `timeoutSec` (opcional, por defecto `0`)
- `graceSec` (opcional, por defecto `20`)
- `paperclipPublicUrl` (override opcional; si no, env `PAPERCLIP_PUBLIC_URL`)
- `enableWebhooks` (opcional, por defecto `true`)
- `env.CURSOR_API_KEY` (requerido, preferido secret_ref)
- `env.CURSOR_WEBHOOK_SECRET` (requerido si `enableWebhooks=true`, mín 32)

Importante: no almacenar la clave de Cursor en el campo plano `apiKey` de nivel superior.
Usar `adapterConfig.env` para que el flujo existente de resolución de secretos soporte referencias de secretos.

---

## Callback de Paperclip + flujo de auth (V1)

Los agentes de Cursor corren de forma remota, así que no podemos inyectar env local como `PAPERCLIP_API_KEY`.

### URL pública

El adaptador debe resolver una URL base de callback en este orden:

1. `adapterConfig.paperclipPublicUrl`
2. `process.env.PAPERCLIP_PUBLIC_URL`

Si está vacía, fallar `testEnvironment` y la ejecución en tiempo de ejecución con un error claro.

### Intercambio bootstrap

Objetivo: evitar poner credenciales Paperclip de vida larga en el texto del prompt.

Flujo:

1. Antes del lanzamiento/seguimiento, Paperclip emite un token bootstrap de un solo uso vinculado a:
   - `agentId`
   - `companyId`
   - `runId`
   - TTL corto (por ejemplo 10 minutos)
2. El adaptador incluye solo:
   - `paperclipPublicUrl`
   - ruta del endpoint de intercambio
   - token bootstrap
3. El agente de Cursor llama:
   - `POST /api/agent-auth/exchange`
4. Paperclip valida el token bootstrap y devuelve un JWT bearer con alcance de ejecución.
5. El agente de Cursor usa el token bearer devuelto para todas las llamadas de API de Paperclip.

Esto mantiene las claves de vida larga fuera del prompt y soporta revocación limpia por TTL.

---

## Estrategia de entrega de habilidades (V1)

No incluir el contenido completo de SKILL.md en el prompt.

En su lugar:

1. El prompt incluye una instrucción compacta para obtener habilidades desde Paperclip.
2. Después del intercambio de auth, el agente obtiene:
   - `GET /api/skills/index`
   - `GET /api/skills/paperclip`
   - `GET /api/skills/paperclip-create-agent` cuando se necesite
3. El agente carga el contenido completo de la habilidad bajo demanda.

Beneficios:

- evita el bloat del prompt
- mantiene los documentos de habilidades centralmente actualizables
- se alinea con cómo los adaptadores locales exponen habilidades como procedimientos descubribles

---

## Flujo de ejecución (`src/server/execute.ts`)

### Paso 1: Resolver configuración y secretos

- parsear la configuración del adaptador vía `asString/asBoolean/asNumber/parseObject`
- resolver `env.CURSOR_API_KEY`
- resolver `paperclipPublicUrl`
- validar el secreto de webhook cuando los webhooks están habilitados

### Paso 2: Resolución de sesión

La identidad de sesión es el `agentId` de Cursor (almacenado en `sessionParams`).
Reutilizar solo cuando el repositorio coincide.

### Paso 3: Renderizar el prompt

Renderizar la plantilla como de costumbre, luego agregar un bloque de callback compacto:

- URL pública de Paperclip
- endpoint de intercambio bootstrap
- token bootstrap
- endpoint del índice de habilidades
- comportamiento requerido del header de ejecución

### Paso 4: Lanzamiento/seguimiento

- al reanudar: `POST /followup`
- si no: `POST /agents`
- incluir el objeto webhook cuando está habilitado:
  - `url: <paperclipPublicUrl>/api/adapters/cursor-cloud/webhooks`
  - `secret: CURSOR_WEBHOOK_SECRET`

### Paso 5: Progreso + completitud

Usar estrategia híbrida:

- los eventos de webhook son la señal primaria de estado
- el polling es fallback y fuente de transcripción (`/conversation`)

Emitir eventos sintéticos a stdout (`init`, `status`, `assistant`, `user`, `result`).

Lógica de completitud:

- éxito: `status === FINISHED`
- falla: `status === ERROR` o terminal desconocido
- timeout: detener el agente, marcar timedOut

### Paso 6: Mapeo de resultado

`AdapterExecutionResult`:

- `exitCode: 0` en éxito, `1` en falla terminal
- `errorMessage` poblado en falla/timeout
- `sessionParams: { agentId, repository }`
- `provider: "cursor"`
- `usage` y `costUsd`: no disponible/null
- `resultJson`: incluir estado sin formato/objetivo/instantánea de conversación

También asegurar que el evento `result` se emita a stdout antes de retornar.

---

## Manejo de webhooks (`src/server/webhook.ts` + ruta del servidor)

Agregar un endpoint del servidor para recibir entregas de webhooks de Cursor.

Responsabilidades:

1. Verificar la firma HMAC desde `X-Webhook-Signature`.
2. Deduplicar por `X-Webhook-ID`.
3. Validar el tipo de evento (`statusChange`).
4. Enrutar por `agentId` de Cursor al contexto de ejecución activa de Paperclip.
5. Agregar entradas `heartbeat_run_events` para auditoría/depuración.
6. Actualizar la señal de ejecución en memoria para que el loop de ejecución pueda atajar rápidamente.

Seguridad:

- rechazar firma inválida (`401`)
- rechazar payload malformado (`400`)
- siempre retornar rápido después de persistir (`2xx`)

---

## Prueba de entorno (`src/server/test.ts`)

Verificaciones:

1. `CURSOR_API_KEY` presente
2. validez de la clave vía `GET /v0/me`
3. repositorio configurado y forma de URL válida
4. el modelo existe (si se define) vía `/v0/models`
5. `paperclipPublicUrl` presente y con forma alcanzable válida
6. secreto de webhook presente/con longitud válida cuando los webhooks están habilitados

La verificación de acceso al repositorio vía `/v0/repositories` debería ser opcional debido a los límites de tasa estrictos.
Usar una verificación de nivel de advertencia solo cuando se define una opción explícita `verifyRepositoryAccess`.

---

## UI + CLI

### Parser de UI (`src/ui/parse-stdout.ts`)

Manejar tipos de evento:

- `init`
- `status`
- `assistant`
- `user`
- `result`
- fallback `stdout`

En resultados de falla, establecer `isError=true` e incluir el texto del error.

### Constructor de configuración (`src/ui/build-config.ts`)

- mapear `CreateConfigValues.url -> repository`
- preservar la forma de binding de env (`plain`/`secret_ref`)
- incluir defaults (`pollIntervalSec`, `timeoutSec`, `graceSec`, `enableWebhooks`)

### Campos del adaptador (`ui/src/adapters/cursor-cloud/config-fields.tsx`)

Agregar controles para:

- repository
- ref
- model
- autoCreatePr
- branchName
- intervalo de polling
- timeout/grace
- override de URL pública de Paperclip
- habilitar webhooks
- bindings de env para `CURSOR_API_KEY` y `CURSOR_WEBHOOK_SECRET`

### Formateador del CLI (`src/cli/format-event.ts`)

Formatear eventos sintéticos de forma similar a los adaptadores locales.
Resaltar claramente las fallas terminales.

---

## Registro del servidor y sincronización del contrato entre capas

### Registro del adaptador

- `server/src/adapters/registry.ts`
- `ui/src/adapters/registry.ts`
- `cli/src/adapters/registry.ts`

### Actualizaciones de contrato compartido (requeridas)

- agregar `cursor_cloud` a `packages/shared/src/constants.ts` (`AGENT_ADAPTER_TYPES`)
- asegurar que los validadores lo acepten (`packages/shared/src/validators/agent.ts`)
- actualizar etiquetas/maps de UI donde se enumeran nombres de adaptadores, incluyendo:
  - `ui/src/components/agent-config-primitives.tsx`
  - `ui/src/components/AgentProperties.tsx`
  - `ui/src/pages/Agents.tsx`
- considerar soporte del asistente de incorporación para la selección de adaptador (`ui/src/components/OnboardingWizard.tsx`)

Sin estas actualizaciones, los flujos de crear/editar rechazarán el nuevo adaptador aunque exista el código del paquete.

---

## Semántica de cancelación

Los adaptadores HTTP de polling largo deben soportar la cancelación de ejecuciones.

Requisito V1:

- registrar un manejador de cancelación por invocación de adaptador en ejecución
- `cancelRun` debería invocar ese manejador (abortar loop de fetch/polling + llamada opcional de stop a Cursor)

Los mapas actuales de cancelación solo-proceso son insuficientes por sí solos para Cursor.

---

## Comparación con `claude_local`

| Aspecto | `claude_local` | `cursor_cloud` |
|---|---|---|
| Modelo de ejecución | subproceso local | API remota |
| Actualizaciones | stdout stream-json | webhook + polling + stdout sintetizado |
| Id de sesión | id de sesión de Claude | id de agente de Cursor |
| Entrega de habilidades | inyección de dir local de habilidades | fetch autenticado desde endpoints de habilidades de Paperclip |
| Auth de Paperclip | variable de entorno JWT de ejecución local inyectada | intercambio de token bootstrap -> JWT de ejecución |
| Cancelación | señales del SO | abortar polling + endpoint de stop de Cursor |
| Uso/costo | rico | no expuesto por la API de Cursor |

---

## Limitaciones V1

1. Cursor no expone uso de tokens/costo en las respuestas de la API.
2. El stream de conversación es solo texto (`user_message`/`assistant_message`).
3. La granularidad de llamadas de herramientas/MCP no está disponible.
4. Los webhooks actualmente entregan eventos de cambio de estado, no deltas completos de transcripción.

---

## Mejoras futuras

1. Reducir aún más la frecuencia de polling cuando la confiabilidad del webhook es alta.
2. Adjuntar payloads de imagen desde el contexto de Paperclip.
3. Agregar exposición más rica de metadatos de PR en la UI de Paperclip.
4. Agregar UI de replay de webhooks para depuración.

---

## Lista de verificación de implementación

### Paquete del adaptador

- [ ] exports de `packages/adapters/cursor-cloud/package.json` conectados
- [ ] `packages/adapters/cursor-cloud/tsconfig.json`
- [ ] `src/index.ts` metadatos + documento de configuración
- [ ] `src/api.ts` cliente con auth bearer + errores tipados
- [ ] `src/server/execute.ts` orquestación híbrida webhook/polling
- [ ] `src/server/parse.ts` parser de stream + detección de no-encontrado
- [ ] `src/server/test.ts` diagnósticos de entorno
- [ ] `src/server/webhook.ts` verificación de firma + helpers de payload
- [ ] `src/server/index.ts` exports + codec de sesión
- [ ] `src/ui/parse-stdout.ts`
- [ ] `src/ui/build-config.ts`
- [ ] `src/ui/index.ts`
- [ ] `src/cli/format-event.ts`
- [ ] `src/cli/index.ts`

### Integración de la app

- [ ] registrar el adaptador en los registros de servidor/ui/cli
- [ ] agregar `cursor_cloud` a las constantes/validadores de adaptadores compartidos
- [ ] agregar etiquetas del adaptador en superficies de UI
- [ ] agregar la ruta de webhook de Cursor en el servidor (`/api/adapters/cursor-cloud/webhooks`)
- [ ] agregar la ruta de intercambio de auth (`/api/agent-auth/exchange`)
- [ ] agregar rutas de servicio de habilidades (`/api/skills/index`, `/api/skills/:name`)
- [ ] agregar hook de cancelación genérico para adaptadores no-subproceso

### Pruebas

- [ ] auth/mapeo de errores del cliente de API
- [ ] mapeo de estados terminales (`FINISHED`, `ERROR`, terminal desconocido)
- [ ] round-trip del codec de sesión
- [ ] manejo de bindings de env del constructor de configuración
- [ ] verificación de firma de webhook + dedupe
- [ ] ruta feliz del intercambio bootstrap + token expirado/inválido

### Verificación

- [ ] `pnpm -r typecheck`
- [ ] `pnpm test:run`
- [ ] `pnpm build`
