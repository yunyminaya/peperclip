# Autenticación e incorporación de agentes

## Problema

Los agentes necesitan API keys para autenticarse con Paperclip. El enfoque actual
(generar la clave en la app, configurarla manualmente como variable de entorno) es
laborioso y no escala. Los distintos tipos de adaptador tienen modelos de confianza
diferentes, y queremos soportar un espectro desde "local cero configuración" hasta
"auto-registro dirigido por el agente".

## Principios de diseño

1. **Iguala la complejidad de la autenticación al límite de confianza.** Un adaptador CLI local
   no debería requerir la misma ceremonia que un agente remoto basado en webhooks.
2. **Los agentes deberían poder incorporarse solos.** Los humanos no deberían tener que
   copiar y pegar credenciales en entornos de agentes cuando el agente es capaz de
   hacerlo.
3. **Puertas de aprobación por defecto.** El auto-registro debe requerir aprobación
   explícita (por un usuario o un agente autorizado) antes de que el nuevo agente pueda actuar
   dentro de una empresa.

---

## Niveles de autenticación

### Nivel 1: Adaptador local (claude-local, codex-local)

**Modelo de confianza:** El proceso del adaptador corre en la misma máquina que el
servidor Paperclip (o es invocado directamente por él). No hay un límite de red significativo.

**Enfoque:** Paperclip genera un token y lo pasa directamente al proceso del agente
como parámetro/variable de entorno al momento de la invocación. No se requiere configuración manual.

**Formato del token:** JWT de vida corta emitido por invocación de latido (o por
sesión). El servidor emite el token, lo pasa en la llamada del adaptador y
lo acepta de vuelta en las solicitudes de API.

**Consideraciones de vida del token:**

- Los agentes de codificación pueden correr por horas, así que los tokens no pueden expirar demasiado rápido.
- Los tokens de vida infinita son indeseables incluso en contextos locales.
- Usar JWT con una expiración generosa (p. ej. 48h) y ventanas de solapamiento para que un
  latido que comienza cerca de la expiración aún se complete.
- El servidor no necesita almacenar estos tokens -- solo valida la firma del JWT.

**Estado:** Parcialmente implementado. El adaptador local ya pasa
`PAPERCLIP_API_URL`, `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID`. Necesitamos
agregar un `PAPERCLIP_API_KEY` (JWT) al conjunto de variables de entorno inyectadas.

### Nivel 2: Intercambio de claves dirigido por CLI

**Modelo de confianza:** Un desarrollador está configurando un agente remoto o semi-remoto y
tiene acceso shell a él.

**Enfoque:** Similar a `claude setup-token` -- el desarrollador ejecuta un comando del CLI de Paperclip
que abre una URL del navegador para confirmación, luego recibe un token que
se almacena automáticamente en la configuración del agente.

```
paperclip auth login
# Opens browser -> user confirms -> token stored at ~/.paperclip/credentials
```

**Formato del token:** API key de vida larga (almacenada con hash en el servidor).

**Estado:** Futuro. No necesario hasta que tengamos adaptadores remotos que no sean
gestionados por el propio servidor Paperclip.

### Nivel 3: Auto-registro del agente (enlace de invitación)

**Modelo de confianza:** El agente es un sistema externo autónomo (p. ej. un agente OpenClaw,
una instancia de SWE-agent). No hay un humano en el loop durante la configuración. El
agente recibe una URL de incorporación y negocia su propio registro.

**Enfoque:**

1. Un admin de la empresa (usuario o agente) genera una **URL de invitación** desde Paperclip.
2. La URL de invitación se entrega al agente objetivo (vía un mensaje, una descripción
   de tarea, un payload de webhook, etc.).
3. El agente obtiene la URL, que devuelve un **documento de incorporación**
   que contiene:
   - Identidad y contexto de la empresa
   - El SKILL.md de Paperclip (o un enlace a él)
   - Qué información necesita Paperclip del agente (p. ej. URL de webhook, tipo de adaptador,
     capacidades, nombre/rol preferido)
   - Un endpoint de registro al que POSTear la respuesta
4. El agente responde con su configuración (p. ej. "esta es mi URL de webhook,
   este es mi nombre, estas son mis capacidades").
5. Paperclip almacena el registro pendiente.
6. Un aprobador (usuario o agente autorizado) revisa y aprueba al nuevo
   empleado. La aprobación incluye asignar el gerente del agente (cadena de mando)
   y cualquier rol/permisos iniciales.
7. Al aprobar, Paperclip provisiona las credenciales del agente y envía el
   primer latido.

**Formato del token:** Paperclip emite una API key (o JWT) al aprobar, entregada
al agente vía su canal de comunicación declarado.

**Inspiración:**

- [Allium self-registration](https://agents.allium.so/skills/skill.md) --
  el agente recolecta credenciales, consulta por confirmación, almacena la clave automáticamente.
- [Allium x402](https://agents.allium.so/skills/x402-skill.md) -- configuración
  de credenciales de múltiples pasos dirigida enteramente por el agente.
- [OpenClaw webhooks](https://docs.openclaw.ai/automation/webhook) -- sistemas externos
  disparan acciones del agente vía endpoints de webhook autenticados.

---

## Auto-registro: protocolo de negociación de incorporación

La respuesta de la URL de invitación debería ser un documento estructurado (JSON o markdown)
legible para humanos y parseable por máquinas:

```
GET /api/invite/{inviteToken}
```

Respuesta:

```json
{
  "company": {
    "id": "...",
    "name": "Acme Corp"
  },
  "onboarding": {
    "instructions": "You are being invited to join Acme Corp as an employee agent...",
    "skillUrl": "https://app.paperclip.ing/skills/paperclip/SKILL.md",
    "requiredFields": {
      "name": "Your display name",
      "adapterType": "How Paperclip should send you heartbeats",
      "webhookUrl": "If adapter is webhook-based, your endpoint URL",
      "capabilities": "What you can do (free text or structured)"
    },
    "registrationEndpoint": "POST /api/invite/{inviteToken}/register"
  }
}
```

El agente responde con POST:

```json
{
  "name": "CodingBot",
  "adapterType": "webhook",
  "webhookUrl": "https://my-agent.example.com/hooks/agent",
  "webhookAuthToken": "Bearer ...",
  "capabilities": ["code-review", "implementation", "testing"]
}
```

Esto entra en un estado `pending_approval` hasta que alguien lo aprueba.

---

## OpenClaw como primera integración externa

OpenClaw es el objetivo ideal para el Nivel 3 porque:

- Ya tiene soporte de webhooks (`POST /hooks/agent`) para recibir tareas.
- La configuración del webhook (URL, token de autenticación, clave de sesión) es exactamente lo que necesitamos que el
  agente nos diga durante la incorporación.
- Los agentes OpenClaw pueden leer una URL, parsear instrucciones y hacer llamadas HTTP.

**Flujo de trabajo:**

1. Generar un enlace de invitación de Paperclip para la empresa.
2. Enviar el enlace de invitación a un agente OpenClaw (vía su canal de mensajería
   existente).
3. El agente OpenClaw obtiene la invitación, lee el documento de incorporación y
   responde con su configuración de webhook.
4. Un miembro de la empresa de Paperclip aprueba al nuevo agente.
5. Paperclip comienza a enviar latidos al endpoint de webhook de OpenClaw.

---

## Modelo de aprobación

Todo auto-registro requiere aprobación. Esto no es negociable por seguridad.

- **Por defecto:** Un usuario humano en la empresa debe aprobar.
- **Delegada:** Un agente de nivel gerente con permiso `approve_agents` puede
  aprobar (útil para escalar).
- **Auto-aprobación (opt-in):** Las empresas pueden configurar auto-aprobación para enlaces de invitación
  que fueron generados con un nivel de confianza específico (p. ej. "confío en cualquiera
  con este enlace"). Aun así, el enlace de invitación en sí es un secreto.

Al aprobar, el aprobador define:

- `reportsTo` -- a quién reporta el nuevo agente en la cadena de mando
- `role` -- el rol del agente dentro de la empresa
- `budget` -- asignación inicial de presupuesto

---

## Prioridades de implementación

| Prioridad | Elemento                              | Notas                                                                                            |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| **P0**   | Inyección JWT del adaptador local       | Desbloquea autenticación local de cero configuración. Emitir un JWT por latido, pasarlo como `PAPERCLIP_API_KEY`.          |
| **P1**   | Enlace de invitación + endpoint de incorporación | `POST /api/companies/:id/invites`, `GET /api/invite/:token`, `POST /api/invite/:token/register`. |
| **P1**   | Flujo de aprobación                     | UI + API para revisar y aprobar registros de agentes pendientes.                                |
| **P2**   | Integración OpenClaw              | Primera incorporación real de un agente externo vía enlace de invitación.                                            |
| **P3**   | Flujo de autenticación CLI                     | `paperclipai auth login` para agentes remotos gestionados por desarrolladores.                                      |

## Plan de implementación P0

Ver [`doc/plans/agent-authentication-implementation.md`](./agent-authentication-implementation.md) para el plan de ejecución JWT local P0.

---

## Preguntas abiertas

- **Rotación de la clave de firma JWT:** ¿Cómo rotamos la clave de firma sin
  invalidar latidos en curso?
- **Expiración de enlaces de invitación:** ¿Deberían los enlaces de invitación ser de un solo uso o multiuso? ¿Con límite de tiempo?
- **Negociación de adaptadores:** ¿Debería el documento de incorporación soportar tipos de adaptador arbitrarios, o deberíamos enumerar adaptadores soportados y que el agente elija uno?
- **Renovación de credenciales:** Para agentes externos de vida larga, ¿cómo manejamos la rotación de API keys sin tiempo de inactividad?
