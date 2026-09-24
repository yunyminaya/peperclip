# Plan de optimización de tokens

Fecha: 2026-03-13  
Discusión relacionada: https://github.com/paperclipai/paperclip/discussions/449

## Objetivo

Reducir el consumo de tokens de forma material sin reducir la capacidad de los agentes, la visibilidad del plano de control ni la calidad de completitud de tareas.

Este plan se basa en:

- el diseño actual del plano de control V1
- la implementación actual de adaptadores y latidos
- la discusión de usuario enlazada
- datos locales de tiempo de ejecución de la instancia default de Paperclip el 2026-03-13

## Resumen ejecutivo

La discusión acierta direccionalmente en dos cosas:

1. Deberíamos preservar la localidad de sesión y caché de prompts de forma más agresiva.
2. Deberíamos separar las instrucciones estables de arranque del contexto dinámico por latido.

Pero eso por sí solo no basta.

Después de revisar el código y los datos locales de ejecución, el problema de tokens parece tener cuatro causas distintas:

1. **Inflación de medición en adaptadores con sesión.** Algunos contadores de tokens, especialmente para `codex_local`, parecen registrarse como totales acumulados de sesión en lugar de deltas por latido.
2. **Reinicios evitables de sesión.** Las sesiones de tareas se reinician intencionalmente en despertares de temporizador y despertares manuales, lo que destruye la localidad de caché para rutas comunes de latido.
3. **Re-adquisición repetida de contexto.** La habilidad `paperclip` les dice a los agentes que re-obtengan asignaciones, detalles de issues, ancestros y hilos completos de comentarios en cada latido. La API actualmente no ofrece alternativas eficientes orientadas a deltas.
4. **Superficies grandes de instrucciones estáticas.** Los archivos de instrucciones de agentes y las habilidades inyectadas globalmente se reintroducen al arrancar aunque la mayor parte de ese contenido no haya cambiado y no se necesite para la tarea actual.

El enfoque correcto es:

1. corregir la telemetría para poder confiar en los números
2. preservar la reutilización donde sea seguro
3. hacer la recuperación de contexto incremental
4. agregar compactación/rotación de sesiones para que las sesiones de vida larga no se vuelvan progresivamente más caras

## Hallazgos validados

### 1. La telemetría de tokens está al menos parcialmente sobreestimada hoy

Observado desde la instancia local default:

- `heartbeat_runs`: 11,360 ejecuciones entre 2026-02-18 y 2026-03-13
- suma de `usage_json.inputTokens`: `2,272,142,368,952`
- suma de `usage_json.cachedInputTokens`: `2,217,501,559,420`

Esos totales no son creíbles como uso verdadero por latido para los tamaños de prompt observados.

Evidencia de soporte:

- los promedios de `adapter.invoke.payload.prompt` eran pequeños:
  - `codex_local`: ~193 caracteres de promedio, 6,067 caracteres máximo
  - `claude_local`: ~160 caracteres de promedio, 1,160 caracteres máximo
- a pesar de eso, muchas ejecuciones de `codex_local` reportan millones de tokens de entrada
- una sesión de Codex reutilizada en los datos locales abarca 3,607 ejecuciones y registró `inputTokens` creciendo hasta `1,155,283,166`

Interpretación:

- para adaptadores con sesión, especialmente Codex, probablemente estamos almacenando el uso reportado por el tiempo de ejecución como un **total de sesión**, no un **delta por ejecución**
- esto empeora el reporte de tendencias, el trabajo de optimización y la confianza del cliente

Esto **no** significa que no haya un problema real de tokens. Significa que necesitamos una línea base confiable antes de poder juzgar el impacto de la optimización.

### 2. Los despertares de temporizador actualmente descartan sesiones de tarea reutilizables

En `server/src/services/heartbeat.ts`, `shouldResetTaskSessionForWake(...)` devuelve `true` para:

- `wakeReason === "issue_assigned"`
- `wakeSource === "timer"`
- despertares manuales bajo demanda

Eso significa que muchos latidos normales omiten la reanudación de la sesión de tarea guardada aunque el workspace esté estable.

Los datos locales respaldan el impacto:

- ejecuciones `timer/system`: 6,587 en total
- solo 976 tenían una sesión previa
- solo 963 terminaron con la misma sesión

Así que los despertares de temporizador son la ruta de latido más grande y mayormente no están reanudando el estado previo de tarea.

### 3. Repetidamente pedimos a los agentes recargar el mismo contexto de tarea

La habilidad `paperclip` actualmente les dice a los agentes que hagan esto en esencialmente cada latido:

- obtener asignaciones
- obtener detalles del issue
- obtener la cadena de ancestros
- obtener los comentarios completos del issue

La forma actual de la API refuerza ese patrón:

- `GET /api/issues/:id/comments` devuelve el hilo completo
- no hay endpoint `since`, cursor, digest o resumen para consumo de latidos
- `GET /api/issues/:id` devuelve el contexto enriquecido completo del issue, no un payload mínimo de delta

Esto es seguro pero caro. Obliga al modelo a consumir repetidamente información sin cambios.

### 4. Los payloads de instrucciones estáticas no están separados limpiamente de los prompts dinámicos de latido

La discusión de usuario sugirió un prompt bootstrap. Esa es la dirección correcta.

Estado actual:

- la UI expone `bootstrapPromptTemplate`
- las rutas de ejecución de adaptadores actualmente no lo usan
- varios adaptadores anteponen el contenido de `instructionsFilePath` directamente en el prompt por ejecución o en el prompt de sistema

Resultado:

- las instrucciones estables se reenvían o se reaplican en la misma ruta que el contenido dinámico del latido
- no estamos optimizando deliberadamente para el caché de prompts del proveedor

### 5. Inyectamos más superficie de habilidades de la que la mayoría de los agentes necesita

Los adaptadores locales inyectan habilidades del repo en directorios de habilidades del tiempo de ejecución.

Matiz importante de `codex_local`:

- Codex no lee habilidades directamente del worktree activo.
- Paperclip descubre habilidades del repo desde el checkout actual, luego las enlaza vía symlink a `$CODEX_HOME/skills` o `~/.codex/skills`.
- Si un symlink existente de habilidad de Paperclip ya apunta a otro checkout vivo, la implementación actual lo omite en lugar de re-apuntarlo.
- Esto puede dejar a Codex usando contenido obsoleto de habilidades de un worktree diferente incluso después de que los cambios de habilidades del lado de Paperclip aterricen.
- Eso es tanto un riesgo de corrección como un riesgo de análisis de tokens, porque el comportamiento en tiempo de ejecución puede no reflejar las instrucciones en el checkout bajo prueba.

Tamaños actuales de habilidades del repo:

- `skills/paperclip/SKILL.md`: 17,441 bytes
- `.agents/skills/create-agent-adapter/SKILL.md`: 31,832 bytes
- `skills/paperclip-create-agent/SKILL.md`: 4,718 bytes
- `skills/para-memory-files/SKILL.md`: 3,978 bytes

Eso es casi 58 KB de markdown de habilidades antes de cualquier instrucción específica de la empresa.

No todo eso necesariamente se carga en el contexto del modelo en cada ejecución, pero aumenta la superficie de instrucciones de arranque y debería tratarse como una preocupación de presupuesto de tokens.

## Principios

Deberíamos optimizar tokens bajo estas reglas:

1. **No perder funcionalidad.** Los agentes aún deben poder reanudar el trabajo de forma segura, entender por qué existen las tareas y actuar dentro de las reglas de gobernanza.
2. **Preferir contexto estable sobre contexto repetido.** Las instrucciones sin cambios no deberían reenviarse por la ruta más cara.
3. **Preferir deltas sobre recargas completas.** Los latidos deberían consumir solo lo que cambió desde la última ejecución útil.
4. **Medir deltas normalizados, no afirmaciones crudas del adaptador.** Especialmente para CLIs con sesión.
5. **Mantener salidas de emergencia.** Las ejecuciones del tablero/manuales aún pueden querer una sesión fresca forzada.

## Plan

## Fase 1: Hacer confiable la telemetría de tokens

Esto debería pasar primero.

### Cambios

- Almacenar ambos:
  - uso crudo reportado por el adaptador
  - uso por ejecución normalizado por Paperclip
- Para adaptadores con sesión, calcular deltas normalizados contra el uso previo de la misma sesión persistida.
- Agregar campos explícitos para:
  - `sessionReused`
  - `taskSessionReused`
  - `promptChars`
  - `instructionsChars`
  - `hasInstructionsFile`
  - `skillSetHash` o conteo de habilidades
  - `contextFetchMode` (`full`, `delta`, `summary`)
- Agregar pruebas de parser por adaptador que distingan contadores acumulados de sesión de contadores por ejecución.

### Por qué

Sin esto, no podemos saber si una reducción vino de una optimización real o de un artefacto de reporte.

### Criterios de éxito

- los totales de tokens por ejecución dejan de explotar en sesiones de vida larga
- la curva de uso de una sesión reanudada es creíble y monotónica a nivel de sesión, pero no doblemente contada a nivel de ejecución
- las páginas de costo pueden mostrar números crudos y normalizados mientras migramos

## Fase 2: Preservar la reutilización segura de sesiones por defecto

Este es el cambio de comportamiento de mayor apalancamiento.

### Cambios

- Dejar de reiniciar sesiones de tareas en despertares ordinarios de temporizador.
- Seguir reiniciando en:
  - invocaciones manuales explícitas de "ejecución fresca"
  - cambios de asignación
  - mismatch de workspace
  - mismatch de modelo / errores inválidos de reanudación
- Agregar un flag explícito de despertar como `forceFreshSession: true` cuando el tablero quiera un reinicio.
- Registrar por qué una sesión se reutilizó o reinició en los metadatos de ejecución.

### Por qué

Los despertares de temporizador son la ruta de latido dominante. Reiniciarlos destruye tanto la continuidad de sesión como la reutilización de caché de prompts.

### Criterios de éxito

- los despertares de temporizador reanudan la sesión de tarea previa en la gran mayoría de casos de workspace estable
- sin aumento en fallas de sesiones obsoletas
- menos tokens de entrada normalizados por latido de temporizador

## Fase 3: Separar el contexto estático bootstrap del contexto por latido

Esta es la versión correcta de la idea bootstrap de la discusión.

### Cambios

- Implementar `bootstrapPromptTemplate` en las rutas de ejecución de adaptadores.
- Usarlo solo al iniciar una sesión fresca, no en sesiones reanudadas.
- Mantener `promptTemplate` intencionalmente pequeño y estable:
  - quién soy
  - qué disparó este despertar
  - qué tarea/comentario/aprobación priorizar
- Mover el texto de configuración de vida larga fuera de los prompts recurrentes por ejecución donde sea posible.
- Agregar guía y advertencias de UI cuando `promptTemplate` contenga contenido de alta rotación o grande inline.

### Por qué

Las instrucciones estáticas y el contexto dinámico de despertar tienen diferente comportamiento de caché y deberían modelarse por separado.

Para `codex_local`, esto también requiere aislar el skill home de Codex por worktree o enseñar a Paperclip a re-apuntar sus propios symlinks de habilidades cuando el checkout origen cambia. De lo contrario, las mejoras de prompts y habilidades en el worktree activo pueden no llegar al agente en ejecución.

### Criterios de éxito

- los prompts de sesión fresca pueden seguir siendo más ricos sin inflar cada latido reanudado
- los prompts reanudados se vuelven cortos y estructuralmente estables
- las tasas de acierto de caché mejoran para adaptadores que preservan sesiones

## Fase 4: Hacer incremental el contexto de issue/tarea

Este es el mayor cambio de producto y probablemente el mayor ahorrador real de tokens después de la reutilización de sesiones.

### Cambios

Agregar endpoints orientados a latidos y comportamiento de habilidades:

- `GET /api/agents/me/inbox-lite`
  - lista mínima de asignaciones
  - id de issue, identificador, estado, prioridad, updatedAt, lastExternalCommentAt
- `GET /api/issues/:id/heartbeat-context`
  - estado compacto del issue
  - resumen de cadena de padres
  - último resumen de ejecución
  - marcadores de cambio
- `GET /api/issues/:id/comments?after=<cursor>` o `?since=<timestamp>`
  - devolver solo comentarios nuevos
- opcional `GET /api/issues/:id/context-digest`
  - resumen compacto generado por el servidor para uso de latidos

Actualizar la habilidad `paperclip` para que el patrón default sea:

1. obtener bandeja de entrada compacta
2. obtener contexto compacto de tarea
3. obtener solo comentarios nuevos a menos que esta sea la primera lectura, un despertar disparado por mención o un cache miss
4. obtener el hilo completo solo bajo demanda

### Por qué

Hoy estamos usando APIs de tablero de fidelidad completa como APIs de latido. Eso es conveniente pero ineficiente en tokens.

### Criterios de éxito

- después de la primera adquisición de tarea, la mayoría de los latidos consumen solo deltas
- el trabajo de tareas bloqueadas o de hilos largos ya no repite todo el historial de comentarios
- los despertares disparados por mención aún tienen suficiente contexto para responder correctamente

## Fase 5: Agregar compactación de sesiones y rotación controlada

Esto protege contra el bloat de sesiones de vida larga.

### Cambios

- Agregar umbrales de rotación por adaptador/sesión:
  - turnos
  - tokens de entrada normalizados
  - edad
  - degradación de acierto de caché
- Antes de rotar, producir un resumen estructurado de continuidad:
  - objetivo actual
  - trabajo completado
  - decisiones abiertas
  - bloqueadores
  - archivos/artefactos tocados
  - próxima acción recomendada
- Persistir ese resumen en el estado de la sesión de tarea o el estado de tiempo de ejecución.
- Iniciar la próxima sesión con:
  - prompt bootstrap
  - resumen compacto de continuidad
  - disparador actual de despertar

### Por qué

Incluso cuando la reutilización es deseable, algunas sesiones se vuelven demasiado caras para mantenerse vivas indefinidamente.

### Criterios de éxito

- las sesiones muy largas dejan de crecer sin límite
- rotar una sesión no causa pérdida de continuidad de tarea
- la tasa de completitud exitosa de tareas se mantiene plana o mejora

## Fase 6: Reducir la superficie innecesaria de habilidades

### Cambios

- Moverse de "inyectar todas las habilidades del repo" a una lista de permitidos por agente o por adaptador.
- El conjunto default de habilidades del tiempo de ejecución local probablemente debería ser:
  - `paperclip`
- Agregar habilidades opt-in para agentes especializados:
  - `paperclip-create-agent`
  - `para-memory-files`
  - `create-agent-adapter`
- Exponer el conjunto activo de habilidades en la configuración del agente y los metadatos de ejecución.
- Para `codex_local`, ya sea:
  - correr con un `CODEX_HOME` específico del worktree, o
  - tratar los symlinks de habilidades de Codex propiedad de Paperclip como reparables cuando apuntan a un checkout diferente

### Por qué

La mayoría de los agentes no necesita habilidades de autoría de adaptadores o del sistema de memoria en cada ejecución.

### Criterios de éxito

- superficie menor de instrucciones de arranque
- sin pérdida de capacidad para agentes especialistas que explícitamente necesitan habilidades extra

## Orden de despliegue

Orden recomendado:

1. normalización de telemetría
2. reutilización de sesión en despertares de temporizador
3. implementación del prompt bootstrap
4. APIs delta de latido + reescritura de la habilidad `paperclip`
5. compactación/rotación de sesiones
6. listas de permitidos de habilidades

## Métricas de aceptación

Deberíamos tratar este plan como exitoso solo si mejoramos tanto la eficiencia como los resultados de tareas.

Métricas primarias:

- tokens de entrada normalizados por latido exitoso
- tokens de entrada normalizados por issue completado
- ratio de acierto de caché para adaptadores con sesión
- tasa de reutilización de sesiones por fuente de invocación
- fracción de latidos que obtienen hilos completos de comentarios

Métricas de guarda:

- tasa de completitud de tareas
- tasa de tareas bloqueadas
- tasa de fallas de sesiones obsoletas
- tasa de intervención manual
- tasa de reapertura de issues después de completitud del agente

Objetivos iniciales:

- 30% a 50% de reducción en tokens de entrada normalizados por latido reanudado exitoso
- 80%+ de reutilización de sesión en despertares estables de temporizador
- 80%+ de reducción en recargas completas de hilos de comentarios después de la primera lectura de tarea
- sin regresión estadísticamente significativa en tasa de completitud o tasa de fallas

## Tareas concretas de ingeniería

1. Agregar campos de uso normalizado y soporte de migración para analítica de ejecuciones.
2. Parchear la contabilidad de adaptadores con sesión para calcular deltas desde totales previos de sesión.
3. Cambiar `shouldResetTaskSessionForWake(...)` para que los despertares de temporizador no reinicien por defecto.
4. Implementar `bootstrapPromptTemplate` de punta a punta en la ejecución de adaptadores.
5. Agregar APIs de contexto de latido compacto y comentarios incrementales.
6. Reescribir `skills/paperclip/SKILL.md` alrededor del comportamiento de obtención delta.
7. Agregar rotación de sesiones con resúmenes de continuidad.
8. Reemplazar la inyección global de habilidades con listas de permitidos explícitas.
9. Corregir la resolución de habilidades de `codex_local` para que los cambios de habilidades locales del worktree lleguen confiablemente al tiempo de ejecución.

## Recomendación

Tratar esto como un esfuerzo de dos vías:

- **Vía A: corrección y ganancias sin arrepentimiento**
  - normalización de telemetría
  - reutilización de sesión en despertares de temporizador
  - implementación del prompt bootstrap
- **Vía B: reducción estructural de tokens**
  - APIs delta
  - reescritura de habilidades
  - compactación de sesiones
  - listas de permitidos de habilidades

Si solo hacemos la Vía A, mejoraremos las cosas, pero los agentes aún releerán demasiado contexto de tarea sin cambios.

Si solo hacemos la Vía B sin corregir la telemetría primero, no podremos probar limpiamente las ganancias.
