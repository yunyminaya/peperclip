# Plan del framework de evals de agentes

Fecha: 2026-03-13

## Contexto

Necesitamos evals para lo que Paperclip realmente envía:

- comportamiento de agentes producido por la configuración del adaptador
- plantillas de prompts y prompts bootstrap
- conjuntos de habilidades e instrucciones de habilidades
- elección de modelo
- elecciones de política de tiempo de ejecución que afectan resultados y costo

Principalmente **no** necesitamos un pipeline de fine-tuning.
Necesitamos un framework de regresión que pueda responder:

- si cambiamos prompts o habilidades, ¿los agentes aún hacen lo correcto?
- si cambiamos de modelo, ¿qué mejoró, empeoró o se volvió más caro?
- si optimizamos tokens, ¿preservamos los resultados de tareas?
- ¿podemos hacer crecer la suite con el tiempo desde el uso real de Paperclip?

Este plan se basa en:

- `doc/GOAL.md`
- `doc/PRODUCT.md`
- `doc/SPEC-implementation.md`
- `docs/agents-runtime.md`
- `doc/plans/2026-03-13-TOKEN-OPTIMIZATION-PLAN.md`
- Discusión #449: <https://github.com/paperclipai/paperclip/discussions/449>
- Mejores prácticas de evals de OpenAI: <https://developers.openai.com/api/docs/guides/evaluation-best-practices>
- Docs de Promptfoo: <https://www.promptfoo.dev/docs/configuration/test-cases/> y <https://www.promptfoo.dev/docs/providers/custom-api/>
- Docs de evals de agentes complejos de LangSmith: <https://docs.langchain.com/langsmith/evaluate-complex-agent>
- Docs de datasets/scorers de Braintrust: <https://www.braintrust.dev/docs/annotate/datasets> y <https://www.braintrust.dev/docs/evaluate/write-scorers>

## Recomendación

Paperclip debería tomar un **enfoque de dos etapas**:

1. **Comenzar con Promptfoo ahora** para evals estrechas de comportamiento de prompts y habilidades entre modelos.
2. **Crecer hacia un harness propio, local al repo en TypeScript** para evals completas de escenarios de Paperclip.

Así que la recomendación ya no es "omitir Promptfoo". Es:

- usar Promptfoo como la capa de arranque más rápida
- mantener los casos de eval y fixtures en este repo
- evitar hacer de la configuración de Promptfoo la abstracción más profunda a largo plazo

Más específicamente:

1. Las definiciones canónicas de eval deberían vivir en este repo bajo un directorio `evals/` de nivel superior.
2. `v0` debería usar Promptfoo para ejecutar casos de prueba enfocados entre modelos y proveedores.
3. El harness de largo plazo debería ejecutar **escenarios reales de Paperclip** contra empresas/issues/agentes sembrados, no solo completitudes crudas de prompts.
4. El modelo de puntuación debería combinar:
   - verificaciones deterministas
   - puntuación estructurada de rúbrica
   - juicio pareado candidato-vs-línea-base
   - métricas de eficiencia desde telemetría normalizada de uso/costo
5. El framework debería comparar **bundles**, no solo modelos.

Un bundle es:

- tipo de adaptador
- id de modelo
- plantilla(s) de prompt
- plantilla de prompt bootstrap
- lista de permitidos de habilidades / versión de contenido de habilidades
- flags relevantes de tiempo de ejecución

Esa es la unidad correcta porque eso es lo que realmente cambia el comportamiento en Paperclip.

## Por qué esta es la forma correcta

### 1. Necesitamos evaluar el comportamiento del sistema, no solo la salida del prompt

Las herramientas solo de prompts son útiles, pero los modos de falla reales de Paperclip son a menudo:

- issue equivocado elegido
- secuencia equivocada de llamadas a la API
- mala delegación
- falla en respetar límites de aprobación
- comportamiento de sesión obsoleta
- sobre-lectura de contexto
- afirmar completitud sin producir artefactos o comentarios

Esos son comportamientos del plano de control. Requieren configuración de escenario, ejecución e inspección de trazas.

### 2. El repo ya es TypeScript-first

El monorepo existente ya usa:

- `pnpm`
- `tsx`
- `vitest`
- TypeScript en servidor, UI, contratos compartidos y adaptadores

Un harness TypeScript-first encajará mejor en el repo y CI que introducir un subsistema de pruebas Python-first como ruta por defecto.

Python puede quedar opcional más tarde para scorers especializados o experimentos de investigación.

### 3. Necesitamos comparación de proveedores/modelos sin vendor lock-in

La guía de OpenAI es direccionalmente correcta:

- evaluar temprano y seguido
- usar evals específicas de la tarea
- registrar todo
- preferir juzgar estilo comparación/pareado sobre puntuación abierta

Pero la API de Evals de OpenAI no es el plano de control correcto para Paperclip como sistema primario porque nuestro objetivo es explícitamente multi-modelo y multi-proveedor.

### 4. Los productos de evals hospedados son útiles, y Promptfoo es la herramienta correcta de arranque

El tradeoff actual:

- Promptfoo es muy bueno para matrices locales basadas en repo de prompts/proveedores e integración CI.
- LangSmith es fuerte en evals de agentes estilo trayectoria.
- Braintrust tiene un modelo limpio de dataset + scorer + experimento y fuerte soporte TypeScript.

La sugerencia de la comunidad es direccionalmente correcta:

- Promptfoo nos permite empezar pequeño
- soporta aserciones simples como contains / not-contains / regex / JS personalizado
- puede ejecutar los mismos casos entre múltiples modelos
- soporta OpenRouter
- puede entrar a CI más tarde

Eso lo hace la mejor herramienta `v0` para "¿este cambio de prompt/habilidad/modelo obviamente regresó algo?"

Pero Paperclip aún debería evitar hacer de una plataforma hospedada o un formato de configuración de terceros la abstracción central antes de tener nuestro propio modelo de eval estable.

El movimiento correcto es:

- comenzar con Promptfoo para ganancias rápidas
- mantener los datos portables y propiedad del repo
- construir un harness propio delgado alrededor de conceptos de Paperclip a medida que el sistema crece
- opcionalmente exportar a o integrar con otras herramientas más tarde si es útil

## Qué deberíamos evaluar

Deberíamos dividir las evals en cuatro capas.

### Capa 1: Evals deterministas de contrato

Estas no deberían requerir un modelo juez.

Ejemplos:

- el agente comenta en el issue asignado
- sin mutación fuera de la empresa del agente
- las acciones que requieren aprobación no evaden el flujo de aprobación
- las transiciones de tareas son legales
- la salida contiene los campos estructurados requeridos
- los enlaces de artefactos existen cuando la tarea requería un artefacto
- sin re-obtención completa del hilo en casos solo-delta una vez que la API lo soporta

Estas son baratas, confiables y deberían ser la primera línea de defensa.

### Capa 2: Evals de comportamiento de un solo paso

Estas prueban comportamientos estrechos en aislamiento.

Ejemplos:

- elige el issue correcto desde la bandeja de entrada
- escribe un primer comentario de estado razonable
- decide pedir aprobación en lugar de actuar directamente
- delega al reporte correcto
- reconoce el estado bloqueado y lo reporta claramente

Estas son lo más cercano a evals de prompts, pero aún enmarcadas en términos de Paperclip.

### Capa 3: Evals de escenario de punta a punta

Estas ejecutan un latido completo o una secuencia corta de latidos contra un escenario sembrado.

Ejemplos:

- recepción de nueva asignación
- continuación de hilo largo
- aclaración disparada por mención
- solicitud de contratación con puerta de aprobación
- escalación del gerente
- tarea de codificación en workspace que debe dejar una actualización significativa del issue

Estas deberían evaluar tanto el estado final como la calidad de la traza.

### Capa 4: Evals de eficiencia y regresión

Estas no son evals de "¿la respuesta se veía bien?". Son evals de "¿preservamos la calidad mientras mejoramos costo/latencia?".

Ejemplos:

- tokens de entrada normalizados por latido exitoso
- tokens normalizados por issue completado
- tasa de reutilización de sesiones
- tasa de recarga completa de hilos
- duración de reloj de pared
- costo por escenario exitoso

Esta capa es especialmente importante para el trabajo de optimización de tokens.

## Diseño central

## 1. Objeto canónico: `EvalCase`

Cada caso de eval debería definir:

- configuración del escenario
- bundle(s) objetivo
- modo de ejecución
- invariantes esperadas
- rúbrica de puntuación
- tags/metadatos

Forma sugerida:

```ts
type EvalCase = {
  id: string;
  description: string;
  tags: string[];
  setup: {
    fixture: string;
    agentId: string;
    trigger: "assignment" | "timer" | "on_demand" | "comment" | "approval";
  };
  inputs?: Record<string, unknown>;
  checks: {
    hard: HardCheck[];
    rubric?: RubricCheck[];
    pairwise?: PairwiseCheck[];
  };
  metrics: MetricSpec[];
};
```

Lo importante es que el caso es sobre un escenario de Paperclip, no sobre una cadena de prompt standalone.

## 2. Objeto canónico: `EvalBundle`

Forma sugerida:

```ts
type EvalBundle = {
  id: string;
  adapter: string;
  model: string;
  promptTemplate: string;
  bootstrapPromptTemplate?: string;
  skills: string[];
  flags?: Record<string, string | number | boolean>;
};
```

Cada ejecución de comparación debería decir qué bundle se probó.

Esto evita el error común de decir "el modelo X es mejor" cuando el cambio real fue modelo + prompt + habilidades + comportamiento de tiempo de ejecución.

## 3. Salida canónica: `EvalTrace`

Deberíamos capturar una traza normalizada para puntuación:

- ids de ejecuciones
- prompts realmente enviados
- metadatos de reutilización de sesión
- mutaciones de issues
- comentarios creados
- aprobaciones solicitadas
- artefactos creados
- telemetría de tokens/costo
- tiempos
- salidas crudas

La capa de scorers nunca debería necesitar raspar registros ad hoc.

## Framework de puntuación

## 1. Verificaciones duras primero

Cada eval debería comenzar con verificaciones pasa/falla que pueden invalidar la ejecución de inmediato.

Ejemplos:

- tocó la empresa equivocada
- omitió una aprobación requerida
- no produjo actualización de issue
- devolvió salida estructurada malformada
- marcó la tarea como hecha sin el artefacto requerido

Si una verificación dura falla, el escenario falla sin importar el estilo o el puntaje del juez.

## 2. Puntuación de rúbrica segundo

La puntuación de rúbrica debería usar criterios estrechos, no prompts vagos de "¿qué tan bueno estuvo esto?".

Buenas dimensiones de rúbrica:

- comprensión de la tarea
- cumplimiento de gobernanza
- comunicación útil de progreso
- delegación correcta
- evidencia de completitud
- concisión / verbosidad innecesaria

Cada rúbrica debería ser una decisión pequeña 0-1 o 0-2, no una escala amorfa de 1-10.

## 3. Juicio pareado para candidato vs línea base

La guía de evals de OpenAI acierta en que los LLMs son mejores discriminando que generando de forma abierta.

Así que para verificaciones de calidad no deterministas, el patrón default debería ser:

- ejecutar el bundle de línea base en el caso
- ejecutar el bundle candidato en el mismo caso
- pedir a un modelo juez cuál es mejor en criterios explícitos
- permitir `baseline`, `candidate` o `tie`

Esto es mejor que pedir al juez un puntaje absoluto de calidad sin ancla.

## 4. La puntuación de eficiencia es separada

No enterrar la eficiencia dentro de un solo puntaje mezclado de calidad.

Registrarla por separado:

- puntaje de calidad
- puntaje de costo
- puntaje de latencia

Luego calcular una decisión resumen como:

- el candidato es aceptable solo si la calidad es no-inferior y la eficiencia mejoró

Eso es mucho más fácil de razonar que un número mágico.

## Regla de decisión sugerida

Para gating de PR:

1. Sin regresiones en verificaciones duras.
2. Sin regresión significativa en la tasa de pase de escenarios requeridos.
3. Sin regresión significativa en dimensiones clave de rúbrica.
4. Si el cambio es orientado a optimización de tokens, requerir mejora de eficiencia en los escenarios objetivo.

Para reportes de comparación más profundos, mostrar:

- tasa de pase
- victorias/derrotas/empates pareados
- mediana de tokens normalizados
- mediana de tiempo de reloj de pared
- deltas de costo

## Estrategia de dataset

Deberíamos construir explícitamente el dataset desde tres fuentes.

### 1. Casos semilla escritos a mano

Comenzar aquí.

Estos deberían cubrir invariantes centrales del producto:

- recepción de asignación
- actualización de estado
- reporte bloqueado
- delegación
- solicitud de aprobación
- denegación de acceso entre empresas
- seguimiento de comentario de issue

Estos son pequeños, claros y estables.

### 2. Casos derivados de producción

Según la guía de OpenAI, deberíamos registrar todo y minar el uso real para casos de eval.

Paperclip debería hacer crecer la cobertura de evals promoviendo ejecuciones reales a casos cuando veamos:

- regresiones
- fallas interesantes
- casos borde
- patrones de éxito de alto valor que vale la pena preservar

La versión inicial puede ser manual:

- tomar una ejecución real
- redactarla/normalizarla
- convertirla en un `EvalCase`

Más tarde podemos automatizar la generación traza-a-caso.

### 3. Casos adversariales y de guarda

Estos deberían sondear intencionalmente modos de falla:

- intentos de bypass de aprobación
- referencias a la empresa equivocada
- trampas de contexto obsoleto
- hilos largos irrelevantes
- instrucciones engañosas en comentarios
- trampas de verbosidad

Aquí es donde las ideas red-team estilo promptfoo pueden volverse útiles más tarde, pero no es la primera rebanada.

## Layout del repo

Layout inicial recomendado:

```text
evals/
  README.md
  promptfoo/
    promptfooconfig.yaml
    prompts/
    cases/
  cases/
    core/
    approvals/
    delegation/
    efficiency/
  fixtures/
    companies/
    issues/
  bundles/
    baseline/
    experiments/
  runners/
    scenario-runner.ts
    compare-runner.ts
  scorers/
    hard/
    rubric/
    pairwise/
  judges/
    rubric-judge.ts
    pairwise-judge.ts
  lib/
    types.ts
    traces.ts
    metrics.ts
  reports/
    .gitignore
```

Por qué `evals/` de nivel superior:

- hace que las evals se sientan de primera clase
- evita ocultarlas dentro de `server/` aunque abarquen adaptadores y comportamiento de tiempo de ejecución
- deja espacio tanto para TS como para helpers opcionales de Python más tarde
- nos da un lugar limpio para la configuración Promptfoo `v0` más el runner propio posterior

## Modelo de ejecución

El harness debería soportar tres modos.

### Modo A: Smoke local barato

Propósito:

- correr en PRs
- mantener bajo el costo
- atrapar regresiones obvias

Características:

- 5 a 20 casos
- 1 o 2 bundles
- mayormente verificaciones duras y rúbricas estrechas

### Modo B: Comparación candidato vs línea base

Propósito:

- evaluar un cambio de prompt/habilidad/modelo antes del merge

Características:

- ejecuciones pareadas
- juicio pareado habilitado
- reporte de diff de calidad + eficiencia

### Modo C: Matriz nocturna más amplia

Propósito:

- comparar múltiples modelos y bundles
- hacer crecer datos históricos de benchmark

Características:

- conjunto de casos más grande
- múltiples modelos
- juicio de rúbrica/pareado más caro

## CI y flujo de trabajo de desarrollador

Comandos sugeridos:

```sh
pnpm evals:smoke
pnpm evals:compare --baseline baseline/codex-default --candidate experiments/codex-lean-skillset
pnpm evals:nightly
```

Comportamiento de PR:

- ejecutar `evals:smoke` en cambios de prompt/habilidad/adaptador/tiempo de ejecución
- opcionalmente disparar `evals:compare` para PRs etiquetados o ejecuciones manuales

Comportamiento nocturno:

- ejecutar una matriz más grande
- guardar el artefacto de reporte
- exponer líneas de tendencia en tasa de pase, victorias pareadas y eficiencia

## Comparación de frameworks

## Promptfoo

Mejor uso para Paperclip:

- micro-evals a nivel de prompt
- comparación de proveedor/modelo
- integración rápida de CI local
- aserciones JS personalizadas y proveedores personalizados
- evals de capa bootstrap para una habilidad o un flujo de trabajo de agente

Qué cambió en esta recomendación:

- Promptfoo es ahora el **punto de partida** recomendado
- especialmente para "una habilidad, un puñado de casos, comparar entre modelos"

Por qué aún no debería ser el único sistema a largo plazo:

- su abstracción primaria sigue orientada a prompt/proveedor/caso de prueba
- Paperclip necesita configuración de escenario, inspección de estado del plano de control y trazas multi-paso como conceptos de primera clase

Recomendación:

- usar Promptfoo primero
- almacenar la configuración y casos de Promptfoo en el repo bajo `evals/promptfoo/`
- usar aserciones JS/TS personalizadas y, si se necesita más tarde, un proveedor personalizado que llame a los runners de escenario de Paperclip
- no hacer del YAML de Promptfoo el único formato canónico de eval de Paperclip una vez que superemos las evals a nivel de prompt

## LangSmith

Qué acierta:

- evals de respuesta final
- evals de trayectoria
- evals de un solo paso

Por qué no el sistema primario hoy:

- mejor ajuste para equipos ya centrados en LangChain/LangGraph
- introduce gravedad de flujo de trabajo hospedado/externo antes de que nuestro propio modelo de eval esté estable

Recomendación:

- copiar la taxonomía trayectoria/final/un-solo-paso
- no adoptar la plataforma como el requisito por defecto

## Braintrust

Qué acierta:

- soporte TypeScript
- modelo limpio de dataset/tarea/scorer
- registro de producción a datasets
- comparación de experimentos en el tiempo

Por qué no el sistema primario hoy:

- aún externaliza el dataset canónico y el flujo de revisión
- no estamos aún en la madurez donde la gestión hospedada de experimentos debería definir la forma del sistema

Recomendación:

- tomar prestado su modelo mental de dataset/scorer/experimento
- revisitar una vez que queramos revisión hospedada e historial de experimentos a escala

## OpenAI Evals / API de Evals

Qué acierta:

- principios fuertes de eval
- énfasis en evals específicas de la tarea
- mentalidad de evaluación continua

Por qué no el sistema primario:

- Paperclip debe comparar entre modelos/proveedores
- no queremos que nuestro runner primario de evals esté acoplado a un vendor de modelos

Recomendación:

- usar la guía
- no usarlo como el tiempo de ejecución central de evals de Paperclip

## Primera rebanada de implementación

La primera versión debería ser intencionalmente pequeña.

## Fase 0: Bootstrap de Promptfoo

Construir:

- `evals/promptfoo/promptfooconfig.yaml`
- 5 a 10 casos enfocados para una habilidad o un flujo de trabajo de agente
- matriz de modelos usando los proveedores que más nos importan
- mayormente aserciones deterministas:
  - contains
  - not-contains
  - regex
  - aserciones JS personalizadas

Alcance objetivo:

- una habilidad, o un flujo de trabajo estrecho como recepción de asignación / primera actualización de estado
- comparar un conjunto pequeño de bundles entre varios modelos

Criterios de éxito:

- podemos ejecutar un comando y comparar salidas entre modelos
- las regresiones de prompt/habilidad se vuelven visibles rápidamente
- el equipo obtiene señal antes de construir infraestructura más pesada

## Fase 1: Esqueleto y casos centrales

Construir:

- scaffold de `evals/`
- tipos `EvalCase`, `EvalBundle`, `EvalTrace`
- runner de escenario para casos locales sembrados
- 10 casos centrales escritos a mano
- solo verificaciones duras

Casos objetivo:

- recepción de issue asignado
- escribir comentario de progreso
- pedir aprobación cuando se requiere
- respetar el límite de empresa
- reportar estado bloqueado
- evitar marcar como hecho sin evidencia de artefacto/comentario

Criterios de éxito:

- un desarrollador puede ejecutar una suite smoke local
- los cambios de prompt/habilidad pueden fallar la suite de forma determinista
- los casos Promptfoo `v0` migran a o coexisten con esta capa limpiamente

## Fase 2: Capa pareada y de rúbrica

Construir:

- interfaz de scorer de rúbrica
- runner de juez pareado
- comando de comparación candidato vs línea base
- salida de reporte markdown/html

Criterios de éxito:

- los cambios de bundle de modelo/prompt producen un reporte de diff legible
- podemos decir "mejor", "peor" o "igual" en escenarios curados

## Fase 3: Integración de eficiencia

Construir:

- métricas de tokens/costo normalizados en trazas de eval
- comparaciones de costo y latencia
- puertas de eficiencia para el trabajo de optimización de tokens

Dependencia:

- esto debería alinearse con el trabajo de normalización de telemetría en `2026-03-13-TOKEN-OPTIMIZATION-PLAN.md`

Criterios de éxito:

- la calidad y la eficiencia pueden juzgarse juntas
- el trabajo de reducción de tokens ya no depende de mejoras anecdóticas

## Fase 4: Ingesta de casos de producción

Construir:

- herramientas para promover ejecuciones reales a nuevos casos de eval
- etiquetado de metadatos
- proceso de crecimiento del corpus de fallas

Criterios de éxito:

- la suite de evals crece desde el comportamiento real del producto en lugar de quedarse sintética

## Categorías iniciales de casos

Deberíamos comenzar con estas categorías:

1. `core.assignment_pickup`
2. `core.progress_update`
3. `core.blocked_reporting`
4. `governance.approval_required`
5. `governance.company_boundary`
6. `delegation.correct_report`
7. `threads.long_context_followup`
8. `efficiency.no_unnecessary_reloads`

Eso es suficiente para empezar a atrapar las clases de regresiones que realmente nos importan.

## Guardas importantes

### 1. No confiar solo en modelos jueces

Cada escenario importante necesita primero verificaciones deterministas.

### 2. No bloquear PRs en un solo puntaje ruidoso

Usar invariantes pasa/falla más un número pequeño de verificaciones estables de rúbrica o pareadas.

### 3. No confundir puntaje de benchmark con calidad de producto

La suite debe seguir creciendo desde ejecuciones reales, de lo contrario se volverá un benchmark de juguete.

### 4. No evaluar solo la salida final

La trayectoria importa para los agentes:

- ¿llamaron a las APIs correctas de Paperclip?
- ¿pidieron aprobación?
- ¿comunicaron progreso?
- ¿eligieron el issue correcto?

### 5. No hacer el framework con forma de vendor

Nuestro modelo de eval debería sobrevivir cambios en:

- proveedor juez
- proveedor candidato
- implementación de adaptador
- elecciones de herramientas hospedadas

## Preguntas abiertas

1. ¿Debería el primer runner de escenario invocar al servidor real por HTTP, o llamar servicios directamente en proceso?
   Mi recomendación: comenzar en proceso por velocidad, luego agregar cobertura en modo HTTP una vez que el modelo se estabilice.

2. ¿Deberíamos soportar scorers de Python en v1?
   Mi recomendación: no. Mantener v1 todo TypeScript.

3. ¿Deberíamos commitear las salidas de línea base?
   Mi recomendación: commitear definiciones de casos y definiciones de bundles, pero mantener los artefactos de ejecución fuera de git.

4. ¿Deberíamos agregar seguimiento hospedado de experimentos de inmediato?
   Mi recomendación: no. Revisitar después de que el harness local pruebe ser útil.

## Recomendación final

Comenzar con Promptfoo para comparaciones inmediatas y estrechas de modelo y prompt, luego crecer hacia un framework propio `evals/` en TypeScript que evalúe **escenarios y bundles de Paperclip**, no solo prompts.

Usar esta estructura:

- Promptfoo para bootstrap `v0`
- verificaciones duras deterministas como base
- juicio de rúbrica y pareado para calidad no determinista
- métricas de eficiencia normalizadas como un eje separado
- datasets locales al repo que crecen desde ejecuciones reales

Usar herramientas externas selectivamente:

- Promptfoo como la ruta inicial para pruebas estrechas de prompt/proveedor
- Braintrust o LangSmith más tarde si queremos gestión hospedada de experimentos

Pero mantener el modelo canónico de eval dentro del repo de Paperclip y alineado a los comportamientos reales del plano de control de Paperclip.
