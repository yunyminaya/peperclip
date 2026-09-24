# Plan de ajuste de la habilidad de Paperclip

## Estado

Seguimiento diferido. No incluir en el PR actual de optimización de tokens más allá de documentar el plan.

## Por qué está diferido

La habilidad `paperclip` forma parte de la superficie crítica de seguridad del plano de control. Ajustarla puede reducir el uso de tokens en sesiones nuevas, pero también conlleva riesgo de regresión del prompt. Aún no tenemos evaluaciones que nos permitan demostrar con seguridad la preservación del comportamiento en el manejo de asignaciones, las reglas de checkout, la etiqueta de comentarios, los flujos de aprobación y las rutas de escalamiento.

El PR actual debería primero entregar las mejoras de infraestructura de menor riesgo:

- normalización de telemetría
- reutilización segura de sesiones
- contexto incremental de issues/comentarios
- separación de prompts de bootstrap vs de latido
- aislamiento de worktrees de Codex

## Problema actual

Las ejecuciones nuevas aún gastan una cantidad considerable de tokens de entrada incluso después de las correcciones de rutas de contexto. El costo inicial restante parece provenir de cargar la habilidad `paperclip` completa y la superficie de instrucciones relacionada en el contexto al inicio de la ejecución.

La habilidad actualmente mezcla tres tipos de contenido en un solo archivo:

- el procedimiento de latido de la ruta crítica usado en casi cada ejecución
- la política crítica e invariantes de seguridad
- material de referencia/flujo de trabajo poco común que la mayoría de las ejecuciones no necesita

Esa estructura es segura pero costosa.

## Objetivos

- reducir los tokens de instrucciones de la primera ejecución sin debilitar la seguridad del agente
- preservar todas las capacidades actuales del plano de control de Paperclip
- mantener el comportamiento común de latido explícito y fácil de seguir para los agentes
- mover los flujos de trabajo poco comunes y el material de referencia fuera de la ruta crítica
- crear una estructura que más adelante pueda evaluarse sistemáticamente

## No objetivos

- cambiar la semántica de la API de Paperclip
- eliminar reglas de gobernanza requeridas
- eliminar flujos de trabajo poco comunes
- cambiar los valores predeterminados del agente en el PR actual

## Dirección recomendada

### 1. Separar la ruta crítica del material de consulta

Reestructurar la habilidad en:

- una sección central siempre cargada para el ciclo de latido común
- material bajo demanda para flujos de trabajo poco frecuentes y referencia profunda

El núcleo debería cubrir solo lo necesario en casi cada activación:

- autenticación y encabezados requeridos
- recuperación de asignaciones con la bandeja de entrada primero
- comportamiento obligatorio de checkout
- primero `heartbeat-context`
- reglas de recuperación incremental de comentarios
- excepción de mención/autoasignación
- eliminación de duplicados de tareas bloqueadas
- expectativas de estado/comentario/versión antes de salir

### 2. Normalizar la habilidad en torno a un procedimiento canónico

Las mismas reglas están actualmente expresadas varias veces en:

- pasos de latido
- reglas críticas
- referencia de endpoints
- ejemplos de flujos de trabajo

Refactorizar para que cada hecho operativo tenga un hogar principal:

- procedimiento
- lista de invariantes
- apéndice/referencia

Esto reduce el peso del prompt y disminuye la probabilidad de deriva interna de instrucciones.

### 3. Comprimir la prosa en formas de instrucción de alta señal

Reescribir la ruta crítica usando formas operativas compactas:

- lista de verificación ordenada corta
- lista plana de invariantes
- ejemplos mínimos solo donde la ambigüedad sería riesgosa

Reducir:

- explicación narrativa
- advertencias repetidas ya cubiertas en otro lugar
- cargas útiles de ejemplo grandes para operaciones comunes
- matrices largas de endpoints en el cuerpo principal

### 4. Mover los flujos de trabajo poco comunes detrás de activadores explícitos

Estos flujos de trabajo deberían seguir disponibles pero no deberían dominar el contexto de ejecuciones nuevas:

- flujo de invitación de OpenClaw
- flujo de configuración de proyecto
- flujo de escritura de `<plan/>` en planificación
- flujo de actualización de ruta de instrucciones
- ejemplos detallados de formato de enlaces

Enfoque recomendado:

- mantener un puntero corto en la habilidad principal
- mover los procedimientos detallados a habilidades hermanas o documentos referenciados que los agentes lean solo cuando los necesiten

### 5. Separar la política de la referencia

La habilidad debería distinguir:

- reglas operativas obligatorias
- búsqueda/referencia de endpoints
- guías de procesos de negocio

Esa separación facilita evaluar los cambios de prompt más adelante y permite que los adaptadores o la orquestación elijan qué debe cargarse siempre.

## Estructura objetivo propuesta

1. Propósito y autenticación
2. Procedimiento de latido compacto
3. Invariantes estrictas
4. Estilo requerido de comentarios/actualizaciones
5. Índice de flujos de trabajo activados
6. Apéndice/referencia

## Plan de despliegue

### Fase 1. Inventario y medición

- anotar la habilidad actual por sección y estimar el peso en tokens
- identificar qué secciones son realmente de ruta crítica vs poco comunes
- capturar ejecuciones representativas para comparar el tamaño del prompt y el comportamiento antes/después

### Fase 2. Refactorización estructural sin cambios semánticos

- reescribir la habilidad principal con la estructura objetivo
- preservar todas las reglas y capacidades existentes
- mover los detalles de flujos de trabajo poco comunes al material complementario referenciado
- mantener los cambios de redacción conservadores

### Fase 3. Validar contra escenarios reales

Ejecutar verificaciones de escenarios para:

- latido normal asignado
- activación por comentario
- comportamiento de eliminación de duplicados de tareas bloqueadas
- activación por resolución de aprobación
- creación de delegaciones/subtareas
- traspaso del tablero de vuelta al usuario
- manejo de solicitudes de plan

### Fase 4. Decidir la estrategia de carga predeterminada

Después de la validación, decidir si:

- toda la habilidad principal sigue cargándose por defecto, o
- solo el núcleo compacto se carga por defecto y las secciones poco comunes se obtienen bajo demanda

No cambiar esta política de carga sin validación.

## Riesgos

- degradación del prompt en las reglas de seguridad del plano de control
- que los agentes olviden flujos de trabajo poco comunes pero importantes
- eliminación accidental de redacción repetida que aportaba comportamiento útil
- introducir precedencia de instrucciones ambigua entre la habilidad central y los materiales complementarios

## Precondiciones antes de la implementación

- definir escenarios de aceptación para la corrección del plano de control
- agregar al menos una evaluación ligera o cobertura de escenarios con guion para los flujos clave de Paperclip
- confirmar cómo la capa de adaptador/bootstrap debería cargar el contenido de la habilidad vs las referencias

## Criterios de éxito

- tokens de entrada de primera ejecución materialmente menores para agentes coordinados por Paperclip
- sin regresión en la disciplina de checkout, actualizaciones de issues, manejo de bloqueos o delegación
- sin aumento en el uso incorrecto de la API ni en errores de propiedad
- los agentes aún completan correctamente los flujos de trabajo poco comunes cuando se les pide explícitamente
