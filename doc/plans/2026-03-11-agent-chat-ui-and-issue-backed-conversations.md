# UI de chat de agentes y conversaciones respaldadas por issues

## Contexto

`PAP-475` hace dos preguntas relacionadas:

1. ¿Qué kit de UI debería usar Paperclip si agregamos una superficie de chat con un agente?
2. ¿Cómo debería encajar el chat en el producto sin romper el modelo actual céntrico en issues?

Esto no es solo una decisión de biblioteca de componentes. En Paperclip hoy:

- V1 dice explícitamente que la comunicación es `tasks + comments only`, sin un sistema de chat separado.
- Los issues ya llevan asignación, registro de auditoría, código de facturación, enlace a proyecto, enlace a objetivo y enlace activo a ejecución.
- El streaming de ejecuciones en vivo ya existe en las páginas de detalle de issues.
- Las sesiones de agentes ya persisten por `taskKey`, y hoy `taskKey` recurre a `issueId`.
- El adaptador de gateway de OpenClaw ya soporta una estrategia de clave de sesión con alcance de issue.

Eso significa que el camino útil más barato no es "agregar un segundo producto de mensajería dentro de Paperclip". Es "agregar una mejor UI conversacional sobre los primitivos de issues y ejecuciones que ya tenemos".

## Restricciones actuales del código base

### Objeto de trabajo durable

El objeto durable en Paperclip es el issue, no un hilo de chat.

- `IssueDetail` ya combina comentarios, ejecuciones enlazadas, ejecuciones en vivo y actividad en una línea de tiempo.
- `CommentThread` ya renderiza comentarios markdown y soporta flujos de respuesta/reasignación.
- `LiveRunWidget` ya renderiza salida streaming de asistente/herramientas/sistema para ejecuciones activas.

### Comportamiento de sesiones

La continuidad de sesiones ya tiene forma de tarea.

- `heartbeat.ts` deriva `taskKey` de `taskKey`, luego `taskId`, luego `issueId`.
- `agent_task_sessions` almacena el estado de sesión por empresa + agente + adaptador + clave de tarea.
- OpenClaw gateway soporta `sessionKeyStrategy=issue|fixed|run`, e `issue` ya coincide bien con el modelo mental de Paperclip.

Eso significa que "chatear con el CEO sobre este issue" se mapea naturalmente a una sesión durable por issue hoy sin inventar un segundo sistema de sesiones.

### Comportamiento de facturación

La facturación ya es consciente de issues.

- `cost_events` puede adjuntarse a `issueId`, `projectId`, `goalId` y `billingCode`.
- el contexto de latido ya propaga el enlace de issue a ejecuciones y rollups de costo.

Si el chat deja el modelo de issue, Paperclip necesitaría una segunda historia de facturación. Eso es evitable.

## Recomendación de kit de UI

## Recomendación: `assistant-ui`

Usar `assistant-ui` como capa de presentación del chat.

Por qué encaja en Paperclip:

- Es un kit real de UI de chat, no solo un hook.
- Es componible y alineado con primitivos estilo shadcn, lo que coincide bien con el stack actual de UI.
- Soporta explícitamente backends personalizados, lo que importa porque Paperclip habla con agentes a través de comentarios de issues, latidos y streams de ejecuciones en lugar de llamadas directas a proveedores.
- Nos da rápidamente affordances de chat pulidas: lista de mensajes, composer, texto streaming, adjuntos, affordances de hilos y renderizado orientado a markdown.

Por qué no hacer "el de Vercel" la opción principal:

- Vercel AI SDK es más fuerte hoy que el viejo encuadre "solo `useChat` sobre `/api/chat`". Su capa de transporte es flexible y puede soportar protocolos personalizados.
- Pero AI SDK aún se entiende mejor aquí como una capa de protocolo de transporte/tiempo de ejecución que como la mejor superficie de chat de usuario final para Paperclip.
- Paperclip no necesita que Vercel sea dueño del estado de mensajes, la persistencia o el contrato de backend. Paperclip ya tiene su propio modelo de issue, ejecución y sesión.

Así que la división limpia es:

- `assistant-ui` para primitivos de UI
- runtime/store de Paperclip para estado, persistencia y transporte
- uso opcional de AI SDK más tarde solo si queremos su protocolo de stream o abstracción de transporte de cliente

## Opciones de producto

### Opción A: Objeto de chat separado

Crear un nuevo modelo de chat/hilo de nivel superior no relacionado con issues.

Pros:

- modelo mental limpio si los usuarios quieren conversación libre
- fácil de ocultar de los tableros de issues

Contras:

- rompe la decisión actual de producto V1 de que la comunicación es céntrica en issues
- necesita nuevas reglas de persistencia, facturación, sesión, permisos, actividad y despertar
- crea un segundo objeto de "¿por qué existe esto?" junto a los issues
- hace de "retomar un chat viejo" un problema de recuperación separado

Veredicto: no recomendado para V1.

### Opción B: Cada chat es un issue

Tratar el chat como un modo de UI sobre un issue. El issue sigue siendo el registro durable.

Pros:

- coincide con la spec actual de producto
- facturación, ejecuciones, comentarios, aprobaciones y actividad ya funcionan
- las sesiones ya se reanudan sobre la identidad del issue
- funciona con todos los adaptadores, incluyendo OpenClaw, sin nueva auth de agente ni una segunda superficie de API

Contras:

- algunos chats no son realmente "tareas" en sentido de tablero
- las conversaciones de incorporación y revisión pueden desordenar las listas normales de issues

Veredicto: mejor base V1.

### Opción C: Híbrido con issues de conversación ocultos

Respaldar cada conversación con un issue, pero permitir un modo de issue con sabor a conversación que se oculta de los tableros de ejecución por defecto a menos que se promueva.

Pros:

- preserva el backend céntrico en issues
- da una UX más limpia al chat de incorporación/revisión
- preserva la continuidad de facturación y sesiones

Contras:

- requiere reglas extra de UI y posiblemente una pequeña adición de esquema o filtrado
- puede convertirse en un segundo sistema disfrazado si no se mantiene estrecho

Veredicto: probablemente la forma correcta del producto después de un MVP básico respaldado por issues.

## Modelo de producto recomendado

### Decisión de producto de la Fase 1

Para la primera implementación, el chat debería estar respaldado por issues.

Más específicamente:

- el tablero abre una superficie de chat para un issue
- enviar un mensaje es una mutación de comentario en ese issue
- el agente asignado se despierta a través del flujo existente de comentarios de issues
- la salida streaming viene del stream de ejecución en vivo existente para ese issue
- la salida durable del asistente sigue siendo comentarios e historial de ejecuciones, no un almacén extra de transcripciones

Esto mantiene honesto a Paperclip sobre lo que es:

- el plano de control sigue siendo céntrico en issues
- el chat es una mejor forma de interactuar con el trabajo de issues, no un nuevo producto de colaboración

### Conversaciones de incorporación y CEO

Para incorporación, revisiones semanales y "chatear con el CEO", usar un issue de conversación en lugar de una pestaña global de chat.

Forma sugerida:

- crear un issue iniciado por el tablero asignado al CEO
- marcarlo como de sabor a conversación en el tratamiento de UI
- opcionalmente ocultarlo de los tableros normales de issues por defecto más tarde
- mantener todo el enlace de costo/ejecución/sesión en ese issue

Esto resuelve varias preocupaciones a la vez:

- no se necesita una API key separada ni cableado directo al proveedor
- se usa el mismo adaptador del CEO
- las conversaciones viejas se recuperan a través del historial normal de issues
- el CEO aún puede crear o actualizar issues hijos reales desde la conversación

## Modelo de sesión

### V1

Usar una sesión de conversación durable por issue.

Eso ya coincide con el comportamiento actual:

- las sesiones de tareas del adaptador persisten contra `taskKey`
- `taskKey` ya recurre a `issueId`
- OpenClaw ya soporta una clave de sesión con alcance de issue

Esto significa que "reanudar la conversación con el CEO más tarde" funciona reabriendo el mismo issue y despertando al mismo agente sobre el mismo issue.

### Qué no agregar aún

No agregar multi-hilo-por-issue de chat en el primer pase.

Si Paperclip más tarde necesita varios hilos paralelos en un issue, entonces agregar una identidad explícita de conversación y derivar:

- `taskKey = issue:<issueId>:conversation:<conversationId>`
- OpenClaw `sessionKey = paperclip:conversation:<conversationId>`

Hasta que ese requerimiento se vuelva real, un issue == una conversación durable es la regla más simple y mejor.

## Modelo de facturación

El chat no debería inventar un pipeline separado de facturación.

Todo el costo del chat debería seguir acumulándose a través del issue:

- `cost_events.issueId`
- rollups de proyecto y objetivo a través de las relaciones existentes
- `billingCode` del issue cuando esté presente

Si una conversación es lo suficientemente importante para existir, es lo suficientemente importante para tener un rastro durable de auditoría y costo respaldado por un issue.

Esta es otra razón por la que el chat libre efímero no debería ser el default.

## Arquitectura de UI

### Stack recomendado

1. Mantener a Paperclip como fuente de verdad para el historial de mensajes y el estado de ejecuciones.
2. Agregar `assistant-ui` como la capa de renderizado/composer.
3. Construir un adaptador de runtime de Paperclip que mapee:
   - comentarios de issues -> mensajes usuario/asistente
   - deltas de ejecución en vivo -> mensajes streaming del asistente
   - adjuntos de issues -> adjuntos del chat
4. Mantener el renderizado markdown actual y el soporte de bloques de código donde sea posible.

### Flujo de interacción

1. El tablero abre el detalle del issue en modo "Chat".
2. El historial de comentarios existente se mapea a mensajes de chat.
3. Cuando el tablero envía un mensaje:
   - `POST /api/issues/{id}/comments`
   - opcionalmente interrumpir la ejecución activa si la UX quiere "enviar y reemplazar la respuesta actual"
4. La lógica existente de despertar por comentario de issue despierta al asignado.
5. Los datos existentes `/issues/{id}/live-runs` y `/issues/{id}/active-run` alimentan el streaming.
6. Cuando la ejecución se completa, el estado durable permanece en comentarios/ejecuciones/actividad como hoy.

### Por qué esto encaja con el código actual

Paperclip ya tiene la mayoría de las piezas del backend:

- comentarios de issues
- línea de tiempo de ejecuciones
- streaming de registros y eventos de ejecución
- renderizado markdown
- soporte de adjuntos
- despertares de asignados en comentarios

La pieza que falta es mayormente la presentación y la capa de mapeo, no un nuevo dominio de backend.

## Alcance de agentes

No lanzar esto como "chat con cada agente".

Comenzar más estrecho:

- chat de incorporación con el CEO
- chat de flujo/revisión con el CEO
- quizás roles ejecutivos seleccionados más tarde

Razones:

- evita que la función se convierta en un segundo producto de bandeja de entrada/chat
- limita las preguntas de permisos y UX al inicio
- coincide con la demanda de producto declarada

Si el chat directo con otros agentes se vuelve útil más tarde, el mismo patrón respaldado por issues puede expandirse limpiamente.

## Fases de entrega recomendadas

### Fase 1: UI de chat sobre issues existentes

- agregar un modo de presentación de chat al detalle de issue
- usar `assistant-ui`
- mapear comentarios + ejecuciones en vivo a la superficie de chat
- sin cambio de esquema
- sin nueva superficie de API

Este es el paso de mayor apalancamiento porque prueba si la UX es realmente útil antes de la expansión del modelo de producto.

### Fase 2: Issues de sabor a conversación para el chat del CEO

- agregar una clasificación ligera de conversación
- soportar la creación de issues de conversación del CEO desde puntos de entrada de incorporación y flujo de trabajo
- opcionalmente ocultarlos de las vistas normales de backlog/tablero por defecto

La implementación más pequeña podría ser una etiqueta o un flag de metadatos de issue. Si se vuelve lo suficientemente importante, entonces promoverlo a un subtipo de issue de primera clase más tarde.

### Fase 3: Promoción y división de hilos solo si se necesita

Solo si más tarde vemos una necesidad real:

- permitir promover una conversación a un issue formal de tarea
- permitir varios hilos por issue con identidad de conversación explícita

Esto debería ser impulsado por la demanda, no diseñado por adelantado.

## Recomendación clara

Si la pregunta es "¿qué deberíamos usar?", la respuesta es:

- usar `assistant-ui` para la UI del chat
- no tratar los hooks crudos de UI de Vercel AI SDK como la respuesta principal del producto
- mantener el chat respaldado por issues en V1
- usar el modelo actual de comentarios de issues + ejecución + sesión + facturación en lugar de inventar un subsistema paralelo de chat

Si la pregunta es "¿cómo deberíamos pensar el chat en Paperclip?", la respuesta es:

- el chat es un modo de interactuar con el trabajo de agentes respaldado por issues
- no un silo separado de producto
- no una excusa para dejar de rastrear trabajo, costo e historial de sesiones de vuelta al issue

## Notas de implementación

### Objetivo inmediato de implementación

La primera construcción más defendible es:

- agregar una pestaña de chat o un layout enfocado en chat en el detalle de issue
- respaldarlo con el agente actualmente asignado en ese issue
- usar primitivos de `assistant-ui` sobre comentarios existentes y eventos de ejecución en vivo

### Diferir esto hasta que se pruebe necesario

- objetos globales de chat standalone
- multi-hilo de chat dentro de un issue
- chat con cada agente de la organización
- una segunda capa de persistencia para el historial de mensajes
- seguimiento de costo separado para chats

## Referencias

- Modelo de comunicación V1: `doc/SPEC-implementation.md`
- UI actual de issue/comentario/ejecución: `ui/src/pages/IssueDetail.tsx`, `ui/src/components/CommentThread.tsx`, `ui/src/components/LiveRunWidget.tsx`
- Persistencia de sesión y derivación de clave de tarea: `server/src/services/heartbeat.ts`, `packages/db/src/schema/agent_task_sessions.ts`
- Enrutamiento de sesión de OpenClaw: `packages/adapters/openclaw-gateway/README.md`
- docs de assistant-ui: <https://www.assistant-ui.com/docs>
- repo de assistant-ui: <https://github.com/assistant-ui/assistant-ui>
- docs de transporte de AI SDK: <https://ai-sdk.dev/docs/ai-sdk-ui/transport>
