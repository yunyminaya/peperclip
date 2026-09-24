# Panorama de memoria

Fecha: 2026-03-17

Este documento resume los sistemas de memoria referenciados en la tarea `PAP-530` y extrae los patrones de diseño que importan para Paperclip.

## Qué necesita Paperclip de este estudio

Paperclip no intenta convertirse en un único motor de memoria opinado. El objetivo más útil es una superficie de memoria de plano de control que:

- permanezca con alcance de empresa
- deje que cada empresa elija un proveedor de memoria por defecto
- deje que agentes específicos hagan override de ese valor por defecto
- mantenga procedencia de vuelta a ejecuciones, issues, comentarios y documentos de Paperclip
- registre costo y latencia relacionados con memoria igual que el resto del plano de control registra trabajo
- funcione con proveedores provistos por plugins, no solo integrados

La pregunta no es "¿qué proyecto de memoria gana?". La pregunta es "¿cuál es el contrato Paperclip más pequeño que puede estar sobre varios sistemas de memoria muy distintos sin aplanar las diferencias útiles?".

## Agrupación rápida

### APIs de memoria alojadas

- `mem0`
- `supermemory`
- `Memori`

Estas optimizan una historia simple de integración de aplicación: enviar conversación/contenido más una identidad, luego consultar memoria relevante o contexto de usuario después.

### Frameworks de memoria centrados en agentes / OS de memoria

- `MemOS`
- `memU`
- `EverMemOS`
- `OpenViking`

Estos tratan la memoria como un subsistema de runtime de agente, no solo como un índice de búsqueda. Usualmente agregan memoria de tareas, perfiles, organización estilo sistema de archivos, ingestión asíncrona o gestión de habilidades/recursos.

### Almacenes/índices de memoria local-first

- `nuggets`
- `memsearch`

Estos enfatizan persistencia local, inspeccionabilidad y bajo overhead operativo. Son útiles porque Paperclip es local-first hoy y necesita al menos una ruta de cero configuración.

## Notas por proyecto

| Proyecto | Forma | API / modelo notable | Buen encaje para Paperclip | Desajuste principal |
|---|---|---|---|---|
| [nuggets](https://github.com/NeoVertex1/nuggets) | motor de memoria local + gateway de mensajería | memoria HRR con alcance de tema con `remember`, `recall`, `forget`, promoción de hechos a `MEMORY.md` | buen ejemplo de memoria local ligera y promoción automática | arquitectura muy específica; no es un servicio multitenant general |
| [mem0](https://github.com/mem0ai/mem0) | alojado + SDK OSS | `add`, `search`, `getAll`, `get`, `update`, `delete`, `deleteAll`; partición de entidades vía `user_id`, `agent_id`, `run_id`, `app_id` | lo más cercano a una API de proveedor limpia con identidades y filtros de metadatos | el proveedor posee fuertemente la extracción; Paperclip no debe asumir que cada backend se comporta como mem0 |
| [MemOS](https://github.com/MemTensor/MemOS) | OS de memoria / framework | agregar-recuperar-editar-eliminar unificado, cubos de memoria, memoria multimodal, memoria de herramientas, planificador asíncrono, retroalimentación/corrección | fuente fuerte para capacidades opcionales más allá de búsqueda simple | mucho más amplio que el contrato mínimo que Paperclip debe estandarizar primero |
| [supermemory](https://github.com/supermemoryai/supermemory) | memoria alojada + API de contexto | `add`, `profile`, `search.memories`, `search.documents`, subida de documentos, ajustes; construcción automática de perfiles y olvido | ejemplo fuerte de "bundle de contexto" en lugar de resultados crudos de búsqueda | fuertemente productizado alrededor de su propia ontología y flujo alojado |
| [memU](https://github.com/NevaMind-AI/memU) | framework de memoria proactiva de agente | metáfora de sistema de archivos, bucle proactivo, predicción de intención, modelo de compañero siempre activo | buena fuente para cuándo la memoria debe disparar comportamiento de agente, no solo recuperación | el encuadre de asistente proactivo es más amplio que el plano de control centrado en tareas de Paperclip |
| [Memori](https://github.com/MemoriLabs/Memori) | fabric de memoria alojada + wrappers de SDK | se registra contra SDKs de LLM, atribución vía `entity_id` + `process_id`, sesiones, nube + BYODB | ejemplo fuerte de captura automática alrededor de clientes de modelo | el diseño centrado en wrappers no mapea 1:1 al ciclo de vida de ejecución / issue / comentario de Paperclip |
| [EverMemOS](https://github.com/EverMind-AI/EverMemOS) | sistema de memoria conversacional de largo plazo | extracción MemCell, narrativas estructuradas, perfiles de usuario, recuperación híbrida / reranking | modelo útil para memorias estructuradas ricas en procedencia y perfiles en evolución | enfocado en memoria conversacional más que en eventos generalizados de plano de control |
| [memsearch](https://github.com/zilliztech/memsearch) | índice de memoria local markdown-first | markdown como fuente de verdad, `index`, `search`, `watch`, parseo de transcripciones, hooks de plugins | excelente baseline para un proveedor integrado local e inspeccionabilidad de procedencia | intencionalmente simple; sin semántica de servicio alojado ni flujo rico de corrección |
| [OpenViking](https://github.com/volcengine/OpenViking) | base de datos de contexto | organización estilo sistema de archivos de memorias/recursos/habilidades, carga por niveles, trayectorias de recuperación visualizadas | fuente fuerte para UX de exploración/inspección y procedencia de contexto | trata "base de datos de contexto" como una superficie de producto más grande que la que Paperclip debe poseer |

## Primitivas comunes en el panorama

Aunque los sistemas discrepan en arquitectura, convergen en unas pocas primitivas:

- `ingest`: agregar memoria desde texto, mensajes, documentos o transcripciones
- `query`: buscar o recuperar memoria dado una tarea, pregunta o alcance
- `scope`: particionar memoria por usuario, agente, proyecto, proceso o sesión
- `provenance`: llevar suficientes metadatos para explicar de dónde vino una memoria
- `maintenance`: actualizar, olvidar, deduplicar, compactar o corregir memorias con el tiempo
- `context assembly`: convertir memorias crudas en un bundle listo para prompt para el agente

Si Paperclip no expone esto, no se adaptará bien a los sistemas de arriba.

## Dónde difieren los sistemas

Estas diferencias son exactamente por qué Paperclip necesita un contrato en capas en lugar de un único motor hardcodeado.

### 1. ¿Quién posee la extracción?

- `mem0`, `supermemory` y `Memori` esperan que el proveedor infiera memorias de conversaciones.
- `memsearch` espera que el host decida qué markdown escribir, luego lo indexa.
- `MemOS`, `memU`, `EverMemOS` y `OpenViking` están en algún punto intermedio y a menudo exponen pipelines de construcción de memoria más ricos.

Paperclip debe soportar ambos:

- extracción gestionada por el proveedor
- extracción gestionada por Paperclip con almacenamiento / recuperación gestionados por el proveedor

### 2. ¿Cuál es la fuente de verdad?

- `memsearch` y `nuggets` hacen la fuente inspeccionable en disco.
- las APIs alojadas a menudo hacen al proveedor canónico.
- los sistemas estilo sistema de archivos como `OpenViking` y `memU` tratan la jerarquía misma como parte del modelo de memoria.

Paperclip no debe requerir una única forma de almacenamiento. Debe requerir referencias normalizadas de vuelta a entidades de Paperclip.

### 3. ¿La memoria es solo búsqueda, o también perfil y estado de planificación?

- `mem0` y `memsearch` centran búsqueda y CRUD.
- `supermemory` agrega perfiles de usuario como salida de primera clase.
- `MemOS`, `memU`, `EverMemOS` y `OpenViking` se expanden a trazas de herramientas, memoria de tareas, recursos y habilidades.

Paperclip debe hacer de la búsqueda simple el contrato mínimo y las salidas más ricas capacidades opcionales.

### 4. ¿La memoria es síncrona o asíncrona?

- las herramientas locales a menudo trabajan sincrónicamente en proceso.
- los sistemas más grandes agregan planificadores, indexación en segundo plano, compactación o jobs de sincronización.

Paperclip necesita tanto operaciones directas de solicitud/respuesta como hooks de mantenimiento en segundo plano.

## Conclusiones específicas de Paperclip

### Paperclip debe poseer estas preocupaciones

- vincular un proveedor a una empresa y opcionalmente hacer override por agente
- mapear entidades de Paperclip a alcances de proveedor
- procedencia de vuelta a comentarios de issues, documentos, ejecuciones y actividad
- reporte de costo / token / latencia para trabajo de memoria
- superficies de exploración e inspección en la UI de Paperclip
- gobernanza sobre operaciones destructivas

### Los proveedores deben poseer estas preocupaciones

- heurísticas de extracción
- estrategia de embedding / indexación
- ranking y reranking
- síntesis de perfiles
- resolución de contradicciones y lógica de olvido
- detalles del motor de almacenamiento

### El contrato de plano de control debe mantenerse pequeño

Paperclip no necesita estandarizar cada función de cada proveedor. Necesita:

- un núcleo portable requerido
- flags de capacidad opcionales para proveedores más ricos
- una forma de registrar ids nativos de proveedor y metadatos sin pretender que todos los proveedores son equivalentes internamente

## Dirección recomendada

Paperclip debe adoptar un modelo de memoria de dos capas:

1. `Memory binding + control plane layer`
   Paperclip decide qué clave de proveedor está en efecto para una empresa, agente o proyecto, y registra cada operación de memoria con procedencia y uso.

2. `Provider adapter layer`
   Un adaptador integrado o provisto por plugin convierte solicitudes de memoria de Paperclip en llamadas específicas del proveedor.

El núcleo portable debe cubrir:

- ingest / escritura
- búsqueda / recuperación
- exploración / inspección
- obtener por handle de registro de proveedor
- olvido / corrección
- reporte de uso

Las capacidades opcionales pueden cubrir:

- síntesis de perfiles
- ingestión asíncrona
- contenido multimodal
- memoria de herramientas / recursos / habilidades
- exploración de grafos nativa del proveedor

Eso es suficiente para soportar:

- una baseline local markdown-first similar a `memsearch`
- servicios alojados similares a `mem0`, `supermemory` o `Memori`
- sistemas de memoria de agente más ricos como `MemOS` o `OpenViking`

sin forzar a Paperclip a convertirse en un motor de memoria monolítico.
