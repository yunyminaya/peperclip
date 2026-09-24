# Plan del servicio de memoria de Paperclip

## Objetivo

Definir un servicio de memoria de Paperclip y una API de superficie que pueda estar sobre múltiples backends de memoria, preservando los requisitos del plano de control de Paperclip:

- alcance de empresa
- auditabilidad
- procedencia de vuelta a objetos de trabajo de Paperclip
- visibilidad de presupuesto / costo
- extensibilidad primero de plugins

Este plan se basa en el panorama externo resumido en `doc/memory-landscape.md` y en la arquitectura actual de Paperclip en:

- `doc/SPEC-implementation.md`
- `doc/plugins/PLUGIN_SPEC.md`
- `doc/plugins/PLUGIN_AUTHORING_GUIDE.md`
- `packages/plugins/sdk/src/types.ts`

## Recomendación en una oración

Paperclip no debería incrustar un motor de memoria opinado en el núcleo. Debería agregar un plano de control de memoria con alcance de empresa con un pequeño contrato de adaptador normalizado, y luego dejar que los incorporados y los plugins implementen el comportamiento específico del proveedor.

## Decisiones de producto

### 1. La memoria es de alcance de empresa por defecto

Cada enlace de memoria pertenece exactamente a una empresa.

Ese enlace puede entonces ser:

- el predeterminado de la empresa
- una sobrescritura de agente
- una sobrescritura de proyecto más adelante si la necesitamos

Sin compartir memoria entre empresas en el diseño inicial.

### 2. Los proveedores se seleccionan por clave

Cada proveedor de memoria configurado obtiene una clave estable dentro de una empresa, por ejemplo:

- `default`
- `mem0-prod`
- `local-markdown`
- `research-kb`

Los agentes y servicios resuelven el proveedor activo por clave, no por lógica de proveedor codificada.

### 3. Los plugins son la ruta principal de proveedor

Los incorporados son útiles para una ruta local sin configuración, pero la mayoría de los proveedores deberían llegar a través del tiempo de ejecución existente de plugins de Paperclip.

Eso mantiene el núcleo pequeño y coincide con la dirección actual de que los sistemas opcionales tipo conocimiento viven en los bordes.

### 4. Paperclip es dueño del enrutamiento, la procedencia y la contabilidad

Los proveedores no deberían decidir cómo las entidades de Paperclip se mapean a la gobernanza.

El núcleo de Paperclip debería ser dueño de:

- quién tiene permitido llamar a una operación de memoria
- qué alcance de empresa / agente / proyecto está activo
- a qué issue / ejecución / comentario / documento pertenece la operación
- cómo se registra el uso

### 5. La memoria automática debería ser estrecha al principio

La captura automática es útil, pero la captura silenciosa amplia es peligrosa.

Los ganchos automáticos iniciales deberían ser:

- captura posterior a la ejecución desde ejecuciones de agentes
- captura de comentarios/documentos de issue cuando el enlace la habilita
- recuperación previa a la ejecución para hidratación de contexto del agente

Todo lo demás debería comenzar explícito.

## Conceptos propuestos

### Proveedor de memoria

Una implementación incorporada o suministrada por plugin que almacena y recupera memoria.

Ejemplos:

- markdown local + índice vectorial
- adaptador mem0
- adaptador supermemory
- adaptador MemOS

### Enlace de memoria

Un registro de configuración con alcance de empresa que apunta a un proveedor y lleva configuración específica del proveedor.

Este es el objeto seleccionado por clave.

### Alcance de memoria

El alcance normalizado de Paperclip pasado a una solicitud de proveedor.

Como mínimo:

- `companyId`
- `agentId` opcional
- `projectId` opcional
- `issueId` opcional
- `runId` opcional
- `subjectId` opcional para identidad externa/usuario

### Referencia de fuente de memoria

El identificador de procedencia que explica de dónde vino una memoria.

Los tipos de fuente admitidos deberían incluir:

- `issue_comment`
- `issue_document`
- `issue`
- `run`
- `activity`
- `manual_note`
- `external_document`

### Operación de memoria

Una acción normalizada de escritura, consulta, exploración o eliminación realizada a través de Paperclip.

Paperclip debería registrar cada operación, ya sea el proveedor local o externo.

## Contrato requerido del adaptador

El núcleo requerido debería ser lo suficientemente pequeño para ajustarse a `memsearch`, `mem0`, `Memori`, `MemOS` u `OpenViking`.

```ts
export interface MemoryAdapterCapabilities {
  profile?: boolean;
  browse?: boolean;
  correction?: boolean;
  asyncIngestion?: boolean;
  multimodal?: boolean;
  providerManagedExtraction?: boolean;
}

export interface MemoryScope {
  companyId: string;
  agentId?: string;
  projectId?: string;
  issueId?: string;
  runId?: string;
  subjectId?: string;
}

export interface MemorySourceRef {
  kind:
    | "issue_comment"
    | "issue_document"
    | "issue"
    | "run"
    | "activity"
    | "manual_note"
    | "external_document";
  companyId: string;
  issueId?: string;
  commentId?: string;
  documentKey?: string;
  runId?: string;
  activityId?: string;
  externalRef?: string;
}

export interface MemoryUsage {
  provider: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  embeddingTokens?: number;
  costCents?: number;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface MemoryWriteRequest {
  bindingKey: string;
  scope: MemoryScope;
  source: MemorySourceRef;
  content: string;
  metadata?: Record<string, unknown>;
  mode?: "append" | "upsert" | "summarize";
}

export interface MemoryRecordHandle {
  providerKey: string;
  providerRecordId: string;
}

export interface MemoryQueryRequest {
  bindingKey: string;
  scope: MemoryScope;
  query: string;
  topK?: number;
  intent?: "agent_preamble" | "answer" | "browse";
  metadataFilter?: Record<string, unknown>;
}

export interface MemorySnippet {
  handle: MemoryRecordHandle;
  text: string;
  score?: number;
  summary?: string;
  source?: MemorySourceRef;
  metadata?: Record<string, unknown>;
}

export interface MemoryContextBundle {
  snippets: MemorySnippet[];
  profileSummary?: string;
  usage?: MemoryUsage[];
}

export interface MemoryAdapter {
  key: string;
  capabilities: MemoryAdapterCapabilities;
  write(req: MemoryWriteRequest): Promise<{
    records?: MemoryRecordHandle[];
    usage?: MemoryUsage[];
  }>;
  query(req: MemoryQueryRequest): Promise<MemoryContextBundle>;
  get(handle: MemoryRecordHandle, scope: MemoryScope): Promise<MemorySnippet | null>;
  forget(handles: MemoryRecordHandle[], scope: MemoryScope): Promise<{ usage?: MemoryUsage[] }>;
}
```

Este contrato intencionalmente no obliga a un proveedor a exponer su grafo interno, sistema de archivos u ontología.

## Superficies opcionales del adaptador

Estas deberían estar controladas por capacidad, no requeridas:

- `browse(scope, filters)` para inspección de sistema de archivos / grafo / línea de tiempo
- `correct(handle, patch)` para flujos de corrección en lenguaje natural
- `profile(scope)` cuando el proveedor puede sintetizar preferencias o resúmenes estables
- `sync(source)` para conectores o ingesta en segundo plano
- `explain(queryResult)` para proveedores que pueden exponer trazas de recuperación

## Qué debería persistir Paperclip

Paperclip no debería espejar el corpus completo de memoria del proveedor en Postgres a menos que el proveedor sea un proveedor local gestionado por Paperclip.

El núcleo de Paperclip debería persistir:

- enlaces de memoria y sobrescrituras
- claves de proveedor y metadatos de capacidad
- registros normalizados de operaciones de memoria
- identificadores de registro de proveedor devueltos por las operaciones cuando estén disponibles
- referencias de fuente de vuelta a comentarios de issues, documentos, ejecuciones y actividad
- datos de uso y costo

Para proveedores externos, la carga útil de memoria misma puede permanecer en el proveedor.

## Modelo de ganchos

### Ganchos automáticos

Estos deberían ser de bajo riesgo y fáciles de razonar:

1. `pre-run hydrate`
   Antes de que comience una ejecución de agente, Paperclip puede llamar a `query(... intent = "agent_preamble")` usando el enlace activo.

2. `post-run capture`
   Después de que termina una ejecución, Paperclip puede escribir un resumen o nota derivada de la transcripción ligada a la ejecución.

3. `issue comment / document capture`
   Cuando está habilitada en el enlace, Paperclip puede capturar comentarios de issues o documentos de issues seleccionados como fuentes de memoria.

### Ganchos explícitos

Estos deberían ser primero impulsados por herramientas o UI:

- `memory.search`
- `memory.note`
- `memory.forget`
- `memory.correct`
- `memory.browse`

### No automáticos en la primera versión

- rastreo web amplio
- importación silenciosa de archivos de repositorio arbitrarios
- compartir memoria entre empresas
- eliminación destructiva automática
- migración de proveedor entre enlaces

## Reglas de UX del agente

Paperclip debería dar a los agentes tanto recuperación automática como herramientas explícitas, con guía simple:

- usar `memory.search` cuando la tarea dependa de decisiones previas, personas, proyectos o contexto de largo plazo que no esté en el hilo actual del issue
- usar `memory.note` cuando un hecho, preferencia o decisión durable deba sobrevivir a esta ejecución
- usar `memory.correct` cuando el usuario diga explícitamente que el contexto previo es incorrecto
- confiar en la captura automática posterior a la ejecución para el residuo ordinario de sesión para que los agentes no tengan que escribir notas de memoria para cada intercambio trivial

Esto mantiene la memoria disponible sin forzar a cada prompt de agente a convertirse en un protocolo de gestión de memoria.

## Superficie de exploración e inspección

Paperclip necesita una UI de primera clase para la memoria, de lo contrario los proveedores se convierten en cajas negras.

La superficie inicial de exploración debería admitir:

- enlace activo por empresa y agente
- operaciones de memoria recientes
- fuentes de escritura recientes
- resultados de consulta con enlaces de vuelta a la fuente
- filtros por agente, issue, ejecución, tipo de fuente y fecha
- resúmenes de uso / costo / latencia del proveedor

Cuando un proveedor admite exploración más rica, el plugin puede agregar vistas más profundas a través de las superficies de UI de plugins existentes.

## Costo y evaluación

Cada respuesta del adaptador debería poder retornar registros de uso.

Paperclip debería acumular:

- tokens de inferencia de memoria
- tokens de embedding
- costo de proveedor externo
- latencia
- conteo de consultas
- conteo de escrituras

También debería registrar métricas orientadas a evaluación donde sea posible:

- tasa de aciertos de recuperación
- tasa de consultas vacías
- conteo de correcciones manuales
- conteos de éxito / falla por enlace

Esto es importante porque un sistema de memoria que "funciona" pero quema presupuesto silenciosamente no es aceptable en Paperclip.

## Adiciones sugeridas al modelo de datos

A nivel de plano de control, las probables nuevas tablas centrales son:

- `memory_bindings`
  - clave con alcance de empresa
  - id de proveedor / id de plugin
  - blob de configuración
  - estado habilitado

- `memory_binding_targets`
  - tipo de objetivo (`company`, `agent`, más adelante `project`)
  - id de objetivo
  - id de enlace

- `memory_operations`
  - id de empresa
  - id de enlace
  - tipo de operación (`write`, `query`, `forget`, `browse`, `correct`)
  - campos de alcance
  - referencias de fuente
  - uso / latencia / costo
  - éxito / error

El estado de largo plazo específico del proveedor debería permanecer en el estado del plugin o en el proveedor mismo a menos que un proveedor local incorporado necesite su propio esquema.

## Primer incorporado recomendado

El mejor incorporado sin configuración es un proveedor local markdown-first con indexación semántica opcional.

Por qué:

- coincide con la postura local-first de Paperclip
- es inspeccionable
- es fácil de respaldar y depurar
- le da al sistema una base incluso sin claves de API externas

El diseño aún debería tratar ese incorporado como solo otro proveedor detrás del mismo contrato de plano de control.

## Fases de despliegue

### Fase 1: Contrato de plano de control

- agregar modelos de enlace de memoria y tipos de API
- agregar superficie de capacidad / registro de plugins para proveedores de memoria
- agregar registro de operaciones e informes de uso

### Fase 2: Un incorporado + un ejemplo de plugin

- entregar un proveedor local markdown-first
- entregar un ejemplo de adaptador alojado para validar la ruta de proveedor externo

### Fase 3: Inspección de UI

- agregar ajustes de memoria de empresa / agente
- agregar un explorador de operaciones de memoria
- agregar enlaces de vuelta a la fuente hacia issues y ejecuciones

### Fase 4: Ganchos automáticos

- hidratación previa a la ejecución
- captura posterior a la ejecución
- captura seleccionada de comentarios / documentos de issue

### Fase 5: Capacidades ricas

- flujos de corrección
- vistas de exploración / grafo nativas del proveedor
- sobrescrituras a nivel de proyecto si se necesitan
- paneles de evaluación

## Preguntas abiertas

- ¿Las sobrescrituras de proyecto deberían existir en V1 del servicio de memoria, o deberíamos forzar primero predeterminado de empresa + sobrescritura de agente?
- ¿Queremos en absoluto pipelines de extracción gestionados por Paperclip, o los incorporados deberían ser el único lugar donde Paperclip es dueño de la extracción?
- ¿El uso de memoria debería extender directamente el modelo actual de `cost_events`, o las operaciones de memoria deberían mantener un registro de uso paralelo y acumularse en `cost_events` secundariamente?
- ¿Queremos que los cambios de instalación / enlace de proveedor requieran aprobaciones para algunas empresas?

## Conclusión

La abstracción correcta es:

- Paperclip es dueño de los enlaces de memoria, alcances, procedencia, gobernanza e informes de uso.
- Los proveedores son dueños de la extracción, el ranking, el almacenamiento y la semántica de memoria nativa del proveedor.

Eso le da a Paperclip un "servicio de memoria" estable sin atar el producto a una filosofía de memoria o a un proveedor.
