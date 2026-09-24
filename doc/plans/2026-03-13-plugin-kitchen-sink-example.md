# Plan del plugin Kitchen Sink

## Objetivo

Agregar un nuevo plugin de ejemplo de primera parte, `Kitchen Sink (Example)`, que demuestre cada superficie de API de plugins de Paperclip actualmente implementada en un solo lugar.

Este plugin está pensado para ser:

- una implementación de referencia viva para contribuyentes
- un arnés de pruebas manuales para el tiempo de ejecución de plugins
- una demo descubrible de lo que los plugins realmente pueden hacer hoy

No está pensado para ser un plugin de producto pulido para usuarios finales.

## Por qué

El sistema de plugins actual tiene una superficie de API real, pero está repartida en:

- documentos del SDK
- tipos del SDK
- prosa de la especificación del plugin
- dos plugins de ejemplo que cada uno muestra solo una porción estrecha

Eso hace difícil responder preguntas básicas como:

- ¿qué pueden renderizar los plugins?
- ¿qué pueden hacer realmente los workers de plugins?
- ¿qué superficies son reales vs aspiracionales?
- ¿cómo debería estructurarse un nuevo plugin en este repositorio?

El plugin kitchen-sink debería responder esas preguntas con ejemplos.

## Criterios de éxito

El plugin es exitoso si un contribuyente puede instalarlo y, sin leer primero el SDK, descubrir y ejercitar el área de superficie del tiempo de ejecución actual de plugins desde dentro de Paperclip.

En concreto:

- se instala desde la lista de ejemplos incluidos
- expone al menos una demo para cada superficie de API de worker implementada
- expone al menos una demo para cada superficie de UI montada por el host
- etiqueta claramente las demos solo locales / solo confiables
- es lo suficientemente seguro para desarrollo local por defecto
- sirve también como arnés de regresión para cambios en el tiempo de ejecución de plugins

## Restricciones

- Mantenerlo instalado a nivel de instancia, no de empresa.
- Tratar esto como un plugin de ejemplo confiable/local.
- No depender de supuestos de tiempo de ejecución seguros en la nube.
- Evitar valores predeterminados destructivos.
- Evitar mutaciones irreversibles a menos que estén claramente etiquetadas y sean fáciles de deshacer.

## Fuente de verdad de este plan

Este plan se basa en el SDK/tipos/tiempo de ejecución actualmente implementados, no solo en la especificación de largo plazo.

Referencias principales:

- `packages/plugins/sdk/README.md`
- `packages/plugins/sdk/src/types.ts`
- `packages/plugins/sdk/src/ui/types.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/types/plugin.ts`

## Inventario de superficie actual

### API de worker/tiempo de ejecución a demostrar

Estos son los clientes concretos de `ctx` actualmente expuestos por el SDK:

- `ctx.config`
- `ctx.events`
- `ctx.jobs`
- `ctx.launchers`
- `ctx.http`
- `ctx.secrets`
- `ctx.assets`
- `ctx.activity`
- `ctx.state`
- `ctx.entities`
- `ctx.projects`
- `ctx.companies`
- `ctx.issues`
- `ctx.agents`
- `ctx.goals`
- `ctx.data`
- `ctx.actions`
- `ctx.streams`
- `ctx.tools`
- `ctx.metrics`
- `ctx.logger`

### Superficies de UI a demostrar

Superficies definidas en el SDK:

- `page`
- `settingsPage`
- `dashboardWidget`
- `sidebar`
- `sidebarPanel`
- `detailTab`
- `taskDetailView`
- `projectSidebarItem`
- `toolbarButton`
- `contextMenuItem`
- `commentAnnotation`
- `commentContextMenuItem`

### Confianza actual del host

Confirmadas o fuertemente indicadas como montadas en la app actual:

- `page`
- `settingsPage`
- `dashboardWidget`
- `detailTab`
- `projectSidebarItem`
- superficies de comentarios
- infraestructura de launchers

Necesitan validación explícita antes de afirmar cobertura completa de demo:

- `sidebar`
- `sidebarPanel`
- `taskDetailView`
- `toolbarButton` como slot directo, distinto de la colocación de launcher
- `contextMenuItem` como slot directo, distinto del menú de comentarios y la colocación de launcher

La implementación debería mantener una pequeña lista de validación para estas antes de llamar al plugin "completo".

## Concepto del plugin

El plugin debería llamarse:

- nombre visible: `Kitchen Sink (Example)`
- paquete: `@paperclipai/plugin-kitchen-sink-example`
- id del plugin: `paperclip.kitchen-sink-example` o `paperclip-kitchen-sink-example`

Recomendación: usar `paperclip-kitchen-sink-example` para coincidir con el estilo de nombres de ejemplos actual del repositorio.

Mezcla de categorías:

- `ui`
- `automation`
- `workspace`
- `connector`

Es intencionalmente amplia porque el punto es la cobertura.

## Forma de UX

El plugin debería tener una consola demo principal de página completa más satélites más pequeños en otras superficies.

### 1. Página del plugin

Ruta principal: la superficie `page` del plugin debería ser el panel central para todas las demos.

Secciones de página recomendadas:

- `Overview`
  - qué demuestra este plugin
  - capacidades actuales otorgadas
  - contexto actual del host
- `UI Surfaces`
  - enlaces que explican dónde debería aparecer cada otra superficie
- `Data + Actions`
  - botones y formularios para demos de worker impulsadas por bridge
- `Events + Streams`
  - emitir evento
  - ver registro de eventos
  - salida de demo por stream
- `Paperclip Domain APIs`
  - empresas
  - proyectos/espacios de trabajo
  - issues
  - objetivos
  - agentes
- `Local Workspace + Process`
  - listado de archivos
  - lectura/escritura de archivos en área temporal
  - demo de proceso hijo
- `Jobs + Webhooks + Tools`
  - estado de jobs
  - URL de webhook y entregas recientes
  - herramientas declaradas
- `State + Entities + Assets`
  - editor de estado con alcance
  - inspector de entidades del plugin
  - demo de subida/recursos generados
- `Observability`
  - métricas escritas
  - muestras del registro de actividad
  - últimos registros del worker

### 2. Widget del panel

Un widget compacto en el panel principal debería mostrar:

- salud del plugin
- conteo de demos ejercitadas
- actividad reciente de eventos/streams
- atajo a la página completa del plugin

### 3. Elemento de sidebar de proyecto

Agregar un enlace `Kitchen Sink` bajo cada proyecto que enlace profundo a una pestaña de plugin con alcance de proyecto.

### 4. Pestañas de detalle

Usar pestañas de detalle para demostrar renderizado con contexto de entidad en:

- `project`
- `issue`
- `agent`
- `goal`

Cada pestaña debería mostrar:

- el contexto del host que recibió
- la obtención de entidad relevante vía worker bridge
- una pequeña acción con alcance de esa entidad

### 5. Superficies de comentarios

Usar demos de comentarios de issue para probar puntos de extensión específicos de comentarios:

- `commentAnnotation`
  - renderizar metadatos analizados debajo de cada comentario
  - mostrar id de comentario, id de issue y un pequeño estado derivado
- `commentContextMenuItem`
  - agregar una acción de menú como `Copy Context To Kitchen Sink`
  - la acción escribe una entidad del plugin o un registro de estado para inspección posterior

### 6. Página de ajustes

La `settingsPage` personalizada debería ser intencionalmente simple y operativa:

- `About`
- `Danger / Trust Model`
- interruptores de demo
- valores predeterminados de procesos locales
- comportamiento de ruta temporal del espacio de trabajo
- entradas de referencia de secretos
- configuración de muestra de eventos/jobs/webhooks

Este plugin también debería mantener útil la pestaña genérica `Status` de ajustes del plugin escribiendo salud, registros y métricas.

## Matriz de funciones

Cada API de worker implementada debería tener una demo visible.

### `ctx.config`

Demo:

- leer configuración en vivo
- mostrar JSON de configuración
- reaccionar a cambios de configuración sin reiniciar donde sea posible

### `ctx.events`

Demos:

- emitir un evento de plugin
- suscribirse a eventos de plugin
- suscribirse a un evento central de Paperclip como `issue.created`
- mostrar eventos recibidos recientes en una línea de tiempo

### `ctx.jobs`

Demos:

- un job demo programado estilo latido
- un botón de ejecución manual desde la UI si el host admite activación manual de jobs
- mostrar último resultado de ejecución y marcas de tiempo

### `ctx.launchers`

Demos:

- declarar launchers en el manifiesto
- opcionalmente registrar un launcher de tiempo de ejecución desde el worker
- mostrar metadatos del launcher en la página del plugin

### `ctx.http`

Demo:

- hacer una simple solicitud GET saliente a un endpoint seguro
- mostrar código de estado, latencia y resultado JSON

Recomendación: por defecto usar un endpoint local de Paperclip o un endpoint público estable de eco para evitar documentos inestables.

### `ctx.secrets`

Demo:

- el operador ingresa una referencia de secreto en la configuración
- el plugin la resuelve bajo demanda
- la UI solo muestra la longitud del resultado enmascarado / estado de éxito, nunca el secreto crudo

### `ctx.assets`

Demos:

- generar un recurso de texto desde la UI
- opcionalmente subir un pequeño blob JSON o archivo de texto tipo captura
- mostrar la URL del recurso devuelta

### `ctx.activity`

Demo:

- botón para escribir una entrada del registro de actividad del plugin contra la empresa/entidad actual

### `ctx.state`

Demos:

- estado con alcance de instancia
- estado con alcance de empresa
- estado con alcance de proyecto
- estado con alcance de issue
- controles de eliminación/restablecimiento

Usar un pequeño inspector/editor de estado en la página del plugin.

### `ctx.entities`

Demos:

- crear registros de muestra propios del plugin
- listarlos/filtrarlos
- mostrar un caso de uso realista como "comentarios copiados" o "registros demo de sincronización"

### `ctx.projects`

Demos:

- listar proyectos
- listar espacios de trabajo de proyecto
- resolver espacio de trabajo principal
- resolver espacio de trabajo para issue

### `ctx.companies`

Demo:

- listar empresas y mostrar la empresa seleccionada actual

### `ctx.issues`

Demos:

- listar issues en la empresa actual
- crear issue
- actualizar estado/título de issue
- listar comentarios
- crear comentario

### `ctx.agents`

Demos:

- listar agentes
- invocar un agente con un prompt de prueba
- pausar/reanudar donde sea seguro

Los controles de mutación de agentes deberían estar detrás de una advertencia explícita.

### `ctx.agents.sessions`

Demos:

- crear sesión de chat de agente
- enviar mensaje
- devolver eventos por stream a la UI
- cerrar sesión

Esta es una fuerte candidata para la mejor demo "impactante" en la página del plugin.

### `ctx.goals`

Demos:

- listar objetivos
- crear objetivo
- actualizar estado/título

### `ctx.data`

Usar en todo el plugin para todas las demos de lectura vía bridge.

### `ctx.actions`

Usar en todo el plugin para todas las demos de mutación vía bridge.

### `ctx.streams`

Demos:

- stream de registro de eventos en vivo
- stream estilo tokens desde un relay de sesión de agente
- stream de progreso falso para una acción de larga duración

### `ctx.tools`

Demos:

- declarar 2-3 herramientas de agente simples
- herramienta 1: eco/diagnóstico
- herramienta 2: resumen de proyecto/espacio de trabajo
- herramienta 3: crear issue o escribir estado del plugin

La página del plugin debería listar las herramientas declaradas y mostrar cargas útiles de entrada de ejemplo.

### `ctx.metrics`

Demo:

- escribir una métrica de muestra en cada acción demo principal
- mostrar una pequeña tabla de métricas recientes en la página del plugin

### `ctx.logger`

Demo:

- cada acción registra entradas estructuradas
- la página `Status` de ajustes del plugin funciona entonces también como visor de registros

## Demos de espacio de trabajo local y procesos

El SDK del plugin intencionalmente deja las operaciones de archivos/procesos al plugin mismo una vez que tiene metadatos del espacio de trabajo.

El plugin kitchen-sink debería demostrar eso explícitamente.

### Demos de espacio de trabajo

- listar archivos de un espacio de trabajo seleccionado
- leer un archivo
- escribir en un archivo temporal propio del plugin
- opcionalmente buscar archivos con `rg` si está disponible

### Demos de procesos

- ejecutar un comando de corta duración como `pwd`, `ls` o `git status`
- devolver stdout/stderr por stream a la UI
- mostrar código de salida y tiempos

Salvaguardas importantes:

- los comandos predeterminados deben ser de solo lectura
- sin interpolación de shell desde entrada libre arbitraria en v1
- proporcionar una lista de comandos curada o un formulario de comandos fuertemente validado
- etiquetar claramente esta área como solo local y solo confiable

## Cobertura propuesta del manifiesto

El plugin debería aspirar a declarar:

- `page`
- `settingsPage`
- `dashboardWidget`
- `detailTab` para `project`, `issue`, `agent`, `goal`
- `projectSidebarItem`
- `commentAnnotation`
- `commentContextMenuItem`

Luego, tras la validación del host, agregar si se admiten:

- `sidebar`
- `sidebarPanel`
- `taskDetailView`
- `toolbarButton`
- `contextMenuItem`

También debería declarar una o más entradas `ui.launchers` para ejercitar el comportamiento de launchers independientemente del renderizado de slots.

## Diseño de paquete propuesto

Nuevo paquete:

- `packages/plugins/examples/plugin-kitchen-sink-example/`

Archivos esperados:

- `package.json`
- `README.md`
- `tsconfig.json`
- `src/index.ts`
- `src/manifest.ts`
- `src/worker.ts`
- `src/ui/index.tsx`
- `src/ui/components/...`
- `src/ui/hooks/...`
- `src/lib/...`
- opcional `scripts/build-ui.mjs` si el empaquetado de UI necesita esbuild

## Arquitectura interna propuesta

### Módulos del worker

División recomendada:

- `src/worker.ts`
  - definición del plugin y cableado
- `src/worker/data.ts`
  - `ctx.data.register(...)`
- `src/worker/actions.ts`
  - `ctx.actions.register(...)`
- `src/worker/events.ts`
  - suscripciones a eventos y búfer de registro de eventos
- `src/worker/jobs.ts`
  - manejadores de jobs programados
- `src/worker/tools.ts`
  - declaraciones y manejadores de herramientas
- `src/worker/local-runtime.ts`
  - demos de archivos/procesos
- `src/worker/demo-store.ts`
  - ayudantes para estado/entidades/recursos/métricas

### Módulos de UI

División recomendada:

- `src/ui/index.tsx`
  - componentes de slot exportados
- `src/ui/page/KitchenSinkPage.tsx`
- `src/ui/settings/KitchenSinkSettingsPage.tsx`
- `src/ui/widgets/KitchenSinkDashboardWidget.tsx`
- `src/ui/tabs/ProjectKitchenSinkTab.tsx`
- `src/ui/tabs/IssueKitchenSinkTab.tsx`
- `src/ui/tabs/AgentKitchenSinkTab.tsx`
- `src/ui/tabs/GoalKitchenSinkTab.tsx`
- `src/ui/comments/KitchenSinkCommentAnnotation.tsx`
- `src/ui/comments/KitchenSinkCommentMenuItem.tsx`
- `src/ui/shared/...`

## Esquema de configuración

El plugin debería tener un `instanceConfigSchema` sustancial pero comprensible.

Campos de configuración recomendados:

- `enableDangerousDemos`
- `enableWorkspaceDemos`
- `enableProcessDemos`
- `showSidebarEntry`
- `showSidebarPanel`
- `showProjectSidebarItem`
- `showCommentAnnotation`
- `showCommentContextMenuItem`
- `showToolbarLauncher`
- `defaultDemoCompanyId` opcional
- `secretRefExample`
- `httpDemoUrl`
- `processAllowedCommands`
- `workspaceScratchSubdir`

Los valores predeterminados deberían mantener desactivado el comportamiento riesgoso.

## Valores de seguridad predeterminados

Postura predeterminada:

- UI y demos de solo lectura activadas
- demos de dominio que mutan activadas pero explícitamente etiquetadas
- demos de procesos desactivadas por defecto
- sin entrada de shell arbitraria por defecto
- nunca renderizar secretos crudos

## Plan de construcción por fases

### Fase 1: Esqueleto central del plugin

- armar el paquete
- agregar manifiesto, worker, puntos de entrada de UI
- agregar README
- hacer que aparezca en la lista de ejemplos incluidos

### Fase 2: Superficies de UI centrales confirmadas

- página del plugin
- página de ajustes
- widget del panel
- elemento de sidebar de proyecto
- pestañas de detalle

### Fase 3: API centrales de worker

- config
- state
- entities
- companies/projects/issues/goals
- data/actions
- metrics/logger/activity

### Fase 4: API de tiempo real y automatización

- streams
- events
- jobs
- webhooks
- sesiones de agente
- tools

### Fase 5: Demos locales de tiempo de ejecución confiable

- demos de archivos del espacio de trabajo
- demos de procesos hijo
- protegidas por configuración

### Fase 6: Superficies de UI secundarias

- anotación de comentarios
- elemento de menú contextual de comentarios
- launchers

### Fase 7: Superficies solo de validación

Validar si el host actual realmente monta:

- `sidebar`
- `sidebarPanel`
- `taskDetailView`
- `toolbarButton` de slot directo
- `contextMenuItem` de slot directo

Si están montadas, agregar demos.
Si no están montadas, documentarlas como definidas por el SDK pero pendientes del host.

## Entregables de documentación

El plugin debería incluir un README que contenga:

- qué demuestra
- qué superficies son solo locales
- cómo instalarlo
- dónde debería aparecer cada superficie de UI
- un mapeo de tarjeta de demo a API del SDK

También debería referenciarse desde los documentos de plugins como el "plugin de referencia de todo".

## Pruebas y verificación

Verificación mínima:

- typecheck/build del paquete
- instalación desde la lista de ejemplos incluidos
- la página carga
- el widget aparece
- la pestaña de proyecto aparece
- las superficies de comentarios se renderizan
- la página de ajustes carga
- las acciones clave tienen éxito

Lista manual recomendada:

- crear issue desde el plugin
- crear objetivo desde el plugin
- emitir y recibir evento de plugin
- salida de acción por stream
- abrir sesión de agente y recibir respuesta por stream
- subir un recurso
- escribir registro de actividad del plugin
- ejecutar una demo de proceso local segura

## Preguntas abiertas

1. ¿La demo de procesos debería seguir siendo solo de comandos curados en el primer pase?
   Recomendación: sí.

2. ¿El plugin debería crear automáticamente issues/objetivos desechables de "kitchen sink demo"?
   Recomendación: no. Hacer la creación explícita.

3. ¿Deberíamos exponer en la UI superficies tipadas pero no admitidas aunque el montaje del host no esté cableado?
   Recomendación: sí, pero etiquetarlas como `SDK-defined / host validation pending`.

4. ¿Las demos de mutación de agentes deberían incluir pausa/reanudación por defecto?
   Recomendación: probablemente sí, pero detrás de un bloque de advertencia.

5. ¿Este plugin debería tratarse más adelante como un arnés de regresión admitido en CI?
   Recomendación: sí. A largo plazo, este debería ser el paquete de prueba de humo del tiempo de ejecución de plugins.

## Próximo paso recomendado

Si este plan parece correcto, el próximo pase de implementación debería comenzar construyendo solo:

- esqueleto del paquete
- página
- página de ajustes
- widget del panel
- una pestaña de detalle de proyecto
- una pestaña de detalle de issue
- el andamiaje básico de worker/acción/datos/estado/eventos

Eso es suficiente para fijar la arquitectura antes de llenar cada superficie de demo.
