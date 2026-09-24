# Ideas de plugins desde OpenCode

Estado: informe de diseño, no un compromiso de la V1

Paperclip V1 excluye explícitamente un marco de plugins en [doc/SPEC-implementation.md](../SPEC-implementation.md), pero la especificación de largo plazo dice que la arquitectura debería dejar espacio para extensiones. Este informe estudia el sistema de plugins de `opencode` y traduce los patrones útiles a un diseño con forma de Paperclip.

Supuesto de este documento: Paperclip es una instancia controlada por el operador de un solo inquilino. La instalación de plugins debería ser, por tanto, global en toda la instancia. Las "empresas" siguen siendo objetos Paperclip de primera clase, pero son registros organizacionales, no límites de aislamiento de inquilinos para la confianza o la instalación de plugins.

## Resumen ejecutivo

`opencode` ya tiene un sistema de plugins real. Es intencionalmente de baja fricción:

- los plugins son módulos JS/TS simples
- se cargan desde directorios locales y paquetes npm
- pueden enganchar muchos eventos del runtime
- pueden agregar herramientas personalizadas
- pueden extender los flujos de autenticación de proveedores
- se ejecutan en proceso y pueden mutar el comportamiento del runtime directamente

Ese modelo funciona bien para una herramienta de codificación local. No debería copiarse literalmente en Paperclip.

La conclusión principal es:

- Paperclip debería copiar el SDK tipado de `opencode`, la carga determinista, la baja fricción de autoría y las superficies de extensión claras.
- Paperclip no debería copiar el modelo de confianza de `opencode`, la carga de plugins locales de proyecto, el comportamiento de "sobrescritura por colisión de nombres", ni los hooks arbitrarios de mutación en proceso para la lógica de negocio principal.
- Paperclip debería usar múltiples clases de extensión en lugar de una sola bolsa genérica de plugins:
  - módulos confiables en proceso para preocupaciones de plataforma de bajo nivel como adaptadores de agentes, proveedores de almacenamiento, proveedores de secretos y posiblemente backends de registro de ejecuciones
  - plugins fuera de proceso para la mayoría de las integraciones de terceros como Linear, GitHub Issues, Grafana, Stripe y programadores
  - herramientas de agentes contribuidas por plugins (con espacios de nombres, no sobrescritura por colisión)
  - UI React incluida por el plugin cargada en ranuras de extensión del host vía un puente tipado
  - un bus de eventos tipado con filtrado en el servidor y eventos de plugin a plugin, además de trabajos programados para automatización

Si Paperclip hace bien esto, los ejemplos que enumeraste se vuelven directos:

- explorador de archivos / terminal / flujo de trabajo git / seguimiento de procesos hijos se convierten en plugins de espacio de trabajo que resuelven rutas desde el host y manejan las operaciones del SO directamente
- Linear / GitHub / Grafana / Stripe se convierten en plugins conectores
- futuras funciones de base de conocimiento y contabilidad también pueden encajar en el mismo modelo

## Fuentes examinadas

Cloné `anomalyco/opencode` y revisé el commit:

- `a965a062595403a8e0083e85770315d5dc9628ab`

Archivos principales revisados:

- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/plugin/src/index.ts`
- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/plugin/src/tool.ts`
- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/opencode/src/plugin/index.ts`
- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/opencode/src/config/config.ts`
- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/opencode/src/tool/registry.ts`
- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/opencode/src/provider/auth.ts`
- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/web/src/content/docs/plugins.mdx`
- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/web/src/content/docs/custom-tools.mdx`
- `https://github.com/anomalyco/opencode/blob/a965a062595403a8e0083e85770315d5dc9628ab/packages/web/src/content/docs/ecosystem.mdx`

Archivos Paperclip relevantes revisados para las costuras de extensión actuales:

- [server/src/adapters/registry.ts](../../server/src/adapters/registry.ts)
- [ui/src/adapters/registry.ts](../../ui/src/adapters/registry.ts)
- [server/src/storage/provider-registry.ts](../../server/src/storage/provider-registry.ts)
- [server/src/secrets/provider-registry.ts](../../server/src/secrets/provider-registry.ts)
- [server/src/services/run-log-store.ts](../../server/src/services/run-log-store.ts)
- [server/src/services/activity-log.ts](../../server/src/services/activity-log.ts)
- [doc/SPEC.md](../SPEC.md)
- [doc/SPEC-implementation.md](../SPEC-implementation.md)

## Lo que OpenCode implementa en realidad

## 1. API de autoría de plugins

`opencode` expone un paquete pequeño, `@opencode-ai/plugin`, con una función tipada `Plugin` y un ayudante tipado `tool()`.

Forma principal:

- un plugin es una función async que recibe un objeto de contexto
- el plugin devuelve un objeto `Hooks`
- los hooks son opcionales
- los plugins también pueden contribuir herramientas y proveedores de autenticación

El contexto de inicialización del plugin incluye:

- un cliente SDK
- información del proyecto actual
- directorio actual
- worktree de git actual
- URL del servidor
- acceso al shell de Bun

Eso es importante: `opencode` da a los plugins un poder de runtime amplio de inmediato, no una API de capacidades estrecha.

## 2. Modelo de hooks

El conjunto de hooks es amplio. Incluye:

- suscripción a eventos
- hook de tiempo de configuración
- hooks de mensajes
- hooks de parámetros/encabezados de modelo
- hooks de decisión de permisos
- inyección de entorno de shell
- hooks de antes/después de la ejecución de herramientas
- mutación de definiciones de herramientas
- personalización del prompt de compactación
- transformaciones de completado de texto

El patrón de implementación es muy simple:

- el código principal construye un objeto `output`
- cada hook de plugin coincidente se ejecuta en secuencia
- los hooks mutan el `output`
- la salida final mutada la usa el núcleo

Esto es elegante y fácil de extender.

También es extremadamente potente. Un plugin puede cambiar encabezados de autenticación, parámetros de modelo, respuestas de permisos, entradas de herramientas, descripciones de herramientas y el entorno del shell.

## 3. Descubrimiento de plugins y orden de carga

`opencode` admite dos fuentes de plugins:

- archivos locales
- paquetes npm

Directorios locales:

- `~/.config/opencode/plugins/`
- `.opencode/plugins/`

Plugins npm:

- listados en la configuración bajo `plugin: []`

El orden de carga es determinista y documentado:

1. configuración global
2. configuración del proyecto
3. directorio global de plugins
4. directorio de plugins del proyecto

Detalles importantes:

- los arrays de configuración se concatenan en lugar de reemplazarse
- los nombres de plugins duplicados se deduplican, ganando las entradas de mayor precedencia
- los plugins internos de primera parte y los plugins por defecto también se cargan a través del pipeline de plugins

Esto le da a `opencode` un modelo real de precedencia en lugar de "lo que cargó al final por accidente".

## 4. Manejo de dependencias

Para los directorios locales de configuración/plugins, `opencode`:

- asegura que exista un `package.json`
- inyecta `@opencode-ai/plugin`
- ejecuta `bun install`

Eso permite que los plugins locales y las herramientas personalizadas locales importen dependencias.

Esto es excelente para la ergonomía del desarrollador local.

No es un valor predeterminado seguro para un servidor de plano de control controlado por el operador.

## 5. Manejo de errores

Los fallos de carga de plugins no colapsan el runtime por defecto.

En cambio, `opencode`:

- registra el error
- publica un evento de error de sesión
- continúa cargando otros plugins

Ese es un buen patrón operativo. Un plugin defectuoso no debería inutilizar todo el producto a menos que el operador lo haya configurado explícitamente como requerido.

## 6. Las herramientas son un punto de extensión de primera clase

`opencode` tiene dos formas de agregar herramientas:

- exportar herramientas directamente desde un plugin vía `hook.tool`
- definir archivos locales en `.opencode/tools/` o directorios globales de herramientas

La API de herramientas es sólida:

- las herramientas tienen descripciones
- las herramientas tienen esquemas Zod
- la ejecución de herramientas obtiene contexto como ID de sesión, ID de mensaje, directorio y worktree
- las herramientas se fusionan en el mismo registro que las herramientas integradas
- las propias definiciones de herramientas pueden mutarse mediante un hook `tool.definition`

La parte más agresiva del diseño:

- las herramientas personalizadas pueden sobrescribir herramientas integradas por nombre

Eso es muy potente para un asistente de codificación local.
Es demasiado peligroso para las acciones principales de Paperclip.

Sin embargo, el concepto de plugins que contribuyen herramientas utilizables por agentes es muy valioso para Paperclip — siempre que las herramientas de plugins tengan espacios de nombres (no puedan ocultar herramientas principales) y estén controladas por capacidades.

## 7. La autenticación también es una superficie de plugins

`opencode` permite a los plugins registrar métodos de autenticación para proveedores.

Un plugin puede contribuir:

- metadatos de métodos de autenticación
- flujos de prompts
- flujos OAuth
- flujos de claves API
- cargadores de solicitudes que adaptan el comportamiento del proveedor tras una autenticación exitosa

Este es un patrón sólido que vale la pena copiar. Las integraciones a menudo necesitan UX de autenticación personalizada y manejo de tokens.

## 8. Evidencia del ecosistema

La página del ecosistema es la mejor prueba de que el modelo funciona en la práctica.
Los plugins de la comunidad ya cubren:

- sistemas de sandbox/espacios de trabajo
- proveedores de autenticación
- encabezados de sesión / telemetría
- funciones de memoria/contexto
- programación
- notificaciones
- ayudantes de worktree
- agentes en segundo plano
- monitoreo

Eso valida la tesis principal: una API de plugins simple y tipada puede crear velocidad real en el ecosistema.

## Lo que OpenCode hace bien

## 1. Separar el SDK de plugins del runtime del host

Esta es una de las mejores partes del diseño.

- los autores de plugins programan contra un paquete público limpio
- los internos del host pueden evolucionar detrás del cargador
- el código del runtime y el código del plugin tienen un límite de contrato limpio

Paperclip debería absolutamente hacer esto.

## 2. Carga determinista y precedencia

`opencode` es explícito sobre:

- de dónde vienen los plugins
- cómo se fusiona la configuración
- qué orden gana

Paperclip debería copiar esta disciplina.

## 3. Autoría de baja ceremonia

Un autor de plugins no tiene que aprender un framework gigante.

- exportar función async
- devolver hooks
- opcionalmente exportar herramientas

Esa simplicidad importa.

## 4. Definiciones de herramientas tipadas

El ayudante `tool()` es excelente:

- tipado
- basado en esquemas
- fácil de documentar
- fácil para la validación del runtime

Paperclip debería adoptar este estilo para acciones de plugins, automatizaciones y esquemas de UI.

## 5. Las funciones integradas y los plugins usan formas similares

`opencode` usa el mismo sistema de hooks para el comportamiento estilo plugin interno y externo en varios lugares.
Eso reduce los casos especiales.

Paperclip puede beneficiarse de eso con adaptadores, backends de secretos, proveedores de almacenamiento y módulos conectores.

## 6. Extensión incremental, no gran abstracción por adelantado

`opencode` no diseñó primero una plataforma gigante de marketplace.
Agregó puntos de extensión concretos que las funciones reales necesitaban.

Esa es la mentalidad correcta también para Paperclip.

## Lo que Paperclip no debería copiar directamente

## 1. Código de plugin arbitrario en proceso como valor predeterminado

`opencode` es básicamente un runtime de agentes local, por lo que la ejecución de plugins sin sandbox es aceptable para su audiencia.

Paperclip es un plano de control para una instancia gestionada por el operador con objetos de empresa.
El perfil de riesgo es diferente:

- los secretos importan
- las puertas de aprobación importan
- los presupuestos importan
- las acciones de mutación requieren auditabilidad

Los plugins de terceros por defecto no deberían ejecutarse con acceso ilimitado en proceso a la memoria del servidor, los manejadores de BD y los secretos.

## 2. Carga de plugins locales de proyecto

`opencode` tiene carpetas de plugins locales de proyecto porque la herramienta gira en torno a una base de código.

Paperclip no tiene alcance de proyecto. Tiene alcance de instancia.
La unidad comparable es:

- paquete de plugin instalado en la instancia

Paperclip no debería cargar automáticamente código arbitrario desde un repositorio de espacio de trabajo como `.paperclip/plugins` o directorios de proyecto.

## 3. Hooks arbitrarios de mutación sobre decisiones de negocio principales

Hooks como:

- `permission.ask`
- `tool.execute.before`
- `chat.headers`
- `shell.env`

tienen sentido en `opencode`.

Para Paperclip, hooks equivalentes en:

- decisiones de aprobación
- semántica de checkout de issues
- comportamiento del registro de actividad
- aplicación de presupuesto

serían un error.

Las invariantes principales deberían quedarse en el código principal, no volverse reescribibles por hooks.

## 4. Sobrescritura por colisión de nombres

Permitir que un plugin reemplace una herramienta integrada por nombre es útil en un producto de agentes local.

Paperclip no debería permitir que los plugins reemplacen silenciosamente:

- rutas principales
- acciones de mutación principales
- comportamientos de autenticación
- evaluadores de permisos
- lógica de presupuesto
- lógica de auditoría

La extensión debería ser aditiva o explícitamente delegada, nunca ocultación accidental.

## 5. Auto-instalación y ejecución desde la configuración del usuario

El flujo de "instalar dependencias al inicio" de `opencode` es ergonómico.
Para Paperclip sería arriesgado porque combina:

- instalación de paquetes
- carga de código
- ejecución

dentro de la ruta de inicio del servidor del plano de control.

Paperclip debería requerir un paso explícito de instalación por parte del operador.

## Por qué Paperclip necesita una forma diferente

Los productos resuelven problemas diferentes.

| Tema | OpenCode | Paperclip |
|---|---|---|
| Unidad principal | proyecto/worktree local | instancia de operador de un solo inquilino con objetos de empresa |
| Supuesto de confianza | usuario avanzado local en su propia máquina | operador que gestiona una instancia Paperclip confiable |
| Radio de fallo | sesión/runtime local | todo el plano de control de la empresa |
| Estilo de extensión | mutar el comportamiento del runtime libremente | preservar gobernanza y auditabilidad |
| Modelo de UI | la app local puede cargar comportamiento local | la UI del panel debe mantenerse coherente y segura |
| Modelo de seguridad | plugins locales confiables del host | necesita límites de capacidades y auditabilidad |

Eso significa que Paperclip debería tomar prestadas las buenas ideas de `opencode` pero usar una arquitectura más estricta.

## Paperclip ya tiene costuras útiles previas a los plugins

Paperclip ya tiene varias costuras tipo extensión:

- registro de adaptadores del servidor: [server/src/adapters/registry.ts](../../server/src/adapters/registry.ts)
- registro de adaptadores de la UI: [ui/src/adapters/registry.ts](../../ui/src/adapters/registry.ts)
- registro de proveedores de almacenamiento: [server/src/storage/provider-registry.ts](../../server/src/storage/provider-registry.ts)
- registro de proveedores de secretos: [server/src/secrets/provider-registry.ts](../../server/src/secrets/provider-registry.ts)
- costura de almacén de registro de ejecuciones conectable: [server/src/services/run-log-store.ts](../../server/src/services/run-log-store.ts)
- registro de actividad y emisión de eventos en vivo: [server/src/services/activity-log.ts](../../server/src/services/activity-log.ts)

Esto es una buena noticia.
Paperclip no necesita inventar la extensibilidad desde cero.
Necesita unificar y endurecer las costuras existentes.

## Modelo de plugins recomendado para Paperclip

## 1. Usar múltiples clases de extensión

No crear un objeto gigante `hooks` para todo.

Usar clases de plugin distintas con diferentes modelos de confianza.

| Clase de extensión | Ejemplos | Modelo de runtime | Nivel de confianza | Por qué |
|---|---|---|---|---|
| Módulo de plataforma | adaptadores de agentes, proveedores de almacenamiento, proveedores de secretos, backends de registro de ejecuciones | en proceso | alta confianza | integración estrecha, rendimiento, APIs de bajo nivel |
| Plugin conector | Linear, GitHub Issues, Grafana, Stripe | worker o sidecar fuera de proceso | media | sincronización externa, aislamiento más seguro, límite de fallo más claro |
| Plugin de espacio de trabajo | explorador de archivos, terminal, flujo de trabajo git, seguimiento de procesos hijos/servidores | fuera de proceso, acceso directo al SO | media | resuelve rutas de espacios de trabajo desde el host, posee directamente la lógica de sistema de archivos/git/PTY/procesos |
| Contribución de UI | widgets del panel, formularios de ajustes, paneles de empresa | paquetes React incluidos por el plugin en ranuras de extensión del host vía puente | media | los plugins poseen su renderizado; el host controla la colocación de ranuras y el acceso al puente |
| Plugin de automatización | alertas, programadores, trabajos de sincronización, procesadores de webhooks | fuera de proceso | media | la automatización basada en eventos encaja naturalmente en los plugins |

Esta división es la recomendación de diseño más importante de este informe.

## 2. Mantener separados los módulos de bajo nivel de los plugins de terceros

Paperclip ya tiene este patrón implícitamente:

- los adaptadores son una cosa
- los proveedores de almacenamiento son otra
- los proveedores de secretos son otra

Mantener esa separación.

Lo formalizaría así:

- `module` significa código confiable cargado por el host para servicios de runtime de bajo nivel
- `plugin` significa código de integración que habla con Paperclip a través de un protocolo de plugin tipado y un modelo de capacidades

Esto evita intentar forzar Stripe, una terminal PTY y un nuevo adaptador de agentes en la misma abstracción.

## 3. Preferir extensiones basadas en eventos sobre mutación de lógica principal

Para plugins de terceros, la API principal debería ser:

- suscribirse a eventos de dominio tipados (con filtrado opcional en el servidor)
- emitir eventos con espacio de nombres del plugin para comunicación entre plugins
- leer el estado de la instancia, incluyendo registros de negocio limitados a la empresa cuando sea relevante
- registrar webhooks
- ejecutar trabajos programados
- contribuir herramientas que los agentes pueden usar durante las ejecuciones
- escribir estado propio del plugin
- agregar superficies de UI aditivas
- invocar acciones explícitas de Paperclip a través de la API

No hacer a los plugins de terceros responsables de:

- decidir si una aprobación pasa
- interceptar la semántica de checkout de issues
- reescribir el comportamiento del registro de actividad
- sobrescribir topes duros de presupuesto

Esas son invariantes principales.

## 4. Los plugins incluyen su propia UI

Los plugins incluyen su propia UI React como módulo empaquetado dentro de `dist/ui/`. El host carga los componentes del plugin en **ranuras de extensión** designadas (páginas, pestañas, widgets, entradas de barra lateral) y proporciona un **puente** para que el frontend del plugin hable con su propio backend worker y acceda al contexto del host.

**Cómo funciona:**

1. La UI del plugin exporta componentes nombrados para cada ranura que llena (p. ej. `DashboardWidget`, `IssueDetailTab`, `SettingsPage`).
2. El host monta el componente del plugin en la ranura correcta, pasando un objeto puente con hooks como `usePluginData(key, params)` y `usePluginAction(key)`.
3. El componente del plugin obtiene datos de su propio worker vía el puente y los renderiza como quiera.
4. El host aplica puertas de capacidades a través del puente — si el worker no tiene una capacidad, el puente rechaza la llamada.

**Lo que controla el host:** dónde aparecen los componentes del plugin, la API del puente, la aplicación de capacidades y las primitivas de UI compartidas (`@paperclipai/plugin-sdk/ui`) con tokens de diseño y componentes comunes.

**Lo que controla el plugin:** cómo renderizar sus datos, qué datos obtener, qué acciones exponer y si usar los componentes compartidos del host o construir una UI totalmente personalizada.

Ranuras de extensión de la primera versión:

- widgets del panel
- páginas de ajustes
- pestañas de páginas de detalle (proyecto, issue, agente, objetivo, ejecución)
- entradas de barra lateral
- páginas de plugins en contexto de empresa

El SDK del host incluye componentes compartidos (MetricCard, DataTable, StatusBadge, LogView, etc.) para consistencia visual, pero son opcionales.

Más adelante, si los plugins de terceros no confiables se vuelven comunes, el host puede moverse a aislamiento basado en iframes sin cambiar el código fuente del plugin (la API del puente sigue igual).

## 5. Hacer la instalación global y mantener las asignaciones/configuraciones separadas

`opencode` es mayormente configuración local a nivel de usuario.
Paperclip debería tratar la instalación de plugins como una acción global a nivel de instancia.

Ejemplos:

- instalar `@paperclip/plugin-linear` una vez
- hacerlo disponible en todas partes de inmediato
- opcionalmente almacenar asignaciones sobre objetos Paperclip si una empresa se asigna a un equipo de Linear diferente que otra

## 6. Usar espacios de trabajo de proyecto como ancla principal para herramientas locales

Paperclip ya tiene un modelo concreto de espacios de trabajo para proyectos:

- los proyectos exponen `workspaces` y `primaryWorkspace`
- la base de datos ya tiene `project_workspaces`
- las rutas de proyecto ya admiten crear, actualizar y eliminar espacios de trabajo
- la resolución de latido ya prefiere los espacios de trabajo de proyecto antes de retroceder a espacios de trabajo de sesión de tarea o de inicio de agente

Eso significa que los plugins locales/runtime deberían anclarse generalmente a proyectos primero, no inventar un modelo paralelo de espacios de trabajo.

Guía práctica:

- el explorador de archivos debería explorar primero los espacios de trabajo de proyecto
- las sesiones de terminal deberían poder lanzarse desde un espacio de trabajo de proyecto
- git debería tratar el espacio de trabajo de proyecto como el ancla raíz del repositorio
- el servidor de desarrollo y el seguimiento de procesos hijos deberían adjuntarse a espacios de trabajo de proyecto
- las vistas de issue y agente aún pueden enlazar en profundidad al contexto relevante del espacio de trabajo de proyecto

En otras palabras:

- `project` es el objeto de negocio
- `project_workspace` es el ancla local de runtime
- los plugins deberían construir sobre eso en lugar de crear primero un modelo de espacio de trabajo no relacionado

## 7. Permitir que los plugins contribuyan herramientas de agentes

`opencode` hace de las herramientas un punto de extensión de primera clase. Esta es también una de las superficies de mayor valor para Paperclip.

Un plugin de Linear debería poder contribuir una herramienta `search-linear-issues` que los agentes usen durante las ejecuciones. Un plugin git debería contribuir `create-branch` y `get-diff`. Un plugin explorador de archivos debería contribuir `read-file` y `list-directory`.

Las restricciones clave:

- las herramientas de plugins tienen espacios de nombres por ID de plugin (p. ej. `linear:search-issues`) para que no puedan ocultar herramientas principales
- las herramientas de plugins requieren la capacidad `agent.tools.register`
- la ejecución de herramientas pasa por el mismo límite RPC del worker que todo lo demás
- los resultados de herramientas aparecen en los registros de ejecución

Esto encaja naturalmente — el plugin ya tiene el contexto del SDK, las credenciales de la API externa y la lógica de dominio. Envolver eso en una definición de herramienta es un trabajo adicional mínimo para el autor del plugin.

## 8. Admitir eventos de plugin a plugin

Los plugins deberían poder emitir eventos personalizados a los que otros plugins pueden suscribirse. Por ejemplo, el plugin git detecta un push y emite `plugin.@paperclip/plugin-git.push-detected`. El plugin de GitHub Issues se suscribe a ese evento y actualiza los enlaces de PR.

Esto evita que los plugins necesiten coordinarse a través de estado compartido o canales externos. El host enruta los eventos de plugin a través del mismo bus de eventos con la misma semántica de entrega que los eventos principales.

Los eventos de plugin usan un espacio de nombres `plugin.<pluginId>.*` para que no puedan colisionar con eventos principales.

## 9. Generar automáticamente la UI de ajustes desde el esquema de configuración

Los plugins que declaran un `instanceConfigSchema` deberían obtener gratis un formulario de ajustes generado automáticamente. El host renderiza entradas de texto, menús desplegables, interruptores, arrays y selectores de ref de secretos directamente desde el JSON Schema.

Para plugins que necesitan una UX de ajustes más rica, pueden declarar una ranura de extensión `settingsPage` e incluir un componente React personalizado. Ambos enfoques coexisten.

Esto importa porque los formularios de ajustes son código repetitivo que todo plugin necesita. Generarlos automáticamente desde el esquema que ya existe elimina una porción significativa de fricción de autoría.

## 10. Diseñar para apagado elegante y actualización

La especificación debería ser explícita sobre qué pasa cuando un worker de plugin se detiene — durante actualizaciones, desinstalaciones o reinicios de la instancia.

La política recomendada:

- enviar `shutdown()` con un plazo configurable (por defecto 10 segundos)
- SIGTERM después del plazo, SIGKILL 5 segundos más tarde
- los trabajos en curso marcados como `cancelled`
- las llamadas de puente en curso devuelven errores estructurados a la UI

Para actualizaciones específicamente: el worker viejo drena, el worker nuevo inicia. Si la nueva versión agrega capacidades, entra en `upgrade_pending` hasta que el operador la apruebe.

## 11. Definir el ciclo de vida de datos de desinstalación

Cuando un plugin se desinstala, sus datos (`plugin_state`, `plugin_entities`, `plugin_jobs`, etc.) deberían conservarse por un período de gracia (por defecto 30 días), no eliminarse de inmediato. El operador puede reinstalar dentro del período de gracia y recuperar el estado, o purgar forzosamente vía CLI.

Esto importa porque las desinstalaciones accidentales no deberían causar pérdida de datos irreversible.

## 12. Invertir en observabilidad de plugins

Los registros de plugin vía `ctx.logger` deberían almacenarse y ser consultables desde la página de ajustes del plugin. El host también debería capturar el `stdout`/`stderr` crudo del proceso worker como respaldo.

El panel de salud del plugin debería mostrar: estado del worker, tiempo activo, registros recientes, tasas de éxito/fallo de trabajos, tasas de entrega de webhooks y uso de recursos. El host debería emitir eventos internos (`plugin.health.degraded`, `plugin.worker.crashed`) que otros plugins o paneles pueden consumir.

Esto es crítico para los operadores. Sin observabilidad, depurar problemas de plugins requiere acceso SSH y seguimiento manual de registros.

## 13. Incluir un arnés de pruebas y plantilla inicial

Un paquete `@paperclipai/plugin-test-harness` debería proporcionar un host simulado con almacenes en memoria, emisión de eventos sintética y simulación de `getData`/`performAction`/`executeTool`. Los autores de plugins deberían poder escribir pruebas unitarias sin una instancia Paperclip en ejecución.

Una CLI `create-paperclip-plugin` debería andamiar un plugin funcional con manifiesto, worker, paquete de UI, archivo de prueba y configuración de build.

La baja fricción de autoría se señaló como una de las mejores cualidades de `opencode`. El arnés de pruebas y la plantilla inicial son como Paperclip logra lo mismo.

## 14. Admitir ciclo de vida de plugins en caliente

La instalación, desinstalación, actualización y cambios de configuración de plugins deberían surtir efecto sin reiniciar el servidor Paperclip. Esto es crítico para el flujo de trabajo del desarrollador y la experiencia del operador.

La arquitectura de worker fuera de proceso hace esto natural:

- **Instalación en caliente**: generar un nuevo worker, registrar sus suscripciones a eventos, programaciones de trabajos, endpoints de webhook y herramientas de agentes en tablas de enrutamiento en vivo, cargar su paquete de UI en el registro de ranuras de extensión.
- **Desinstalación en caliente**: apagado elegante del worker, eliminar todos los registros de las tablas de enrutamiento, desmontar componentes de UI, iniciar el período de gracia de retención de datos.
- **Actualización en caliente**: apagar el worker viejo, iniciar el worker nuevo, intercambiar atómicamente las entradas de la tabla de enrutamiento, invalidar la caché del paquete de UI para que el frontend cargue el paquete actualizado.
- **Cambio de configuración en caliente**: escribir la nueva configuración en `plugin_config`, notificar al worker en ejecución vía IPC (`configChanged`). El worker aplica el cambio sin reiniciarse. Si no maneja `configChanged`, el host reinicia solo ese worker.

La invalidación de caché del frontend usa URLs de paquete versionadas o con hash de contenido y un evento `plugin.ui.updated` que dispara reimportación sin recarga completa de página.

Cada proceso worker es independiente — iniciar, detener o reemplazar un worker nunca afecta a ningún otro plugin ni al host mismo.

## 15. Definir versionado del SDK y compatibilidad

`opencode` no tiene una historia formal de versionado del SDK porque los plugins se ejecutan en proceso y están efectivamente fijados al runtime actual. El modelo fuera de proceso de Paperclip significa que los plugins pueden construirse contra una versión del SDK y ejecutarse en un host que ha avanzado. Esto necesita reglas explícitas.

Enfoque recomendado:

- **Paquete SDK único**: `@paperclipai/plugin-sdk` con exportaciones de subruta — raíz para código de worker, `/ui` para código de frontend. Una dependencia, una versión, un changelog.
- **Versión major del SDK = versión de API**: `@paperclipai/plugin-sdk@2.x` apunta a `apiVersion: 2`. Los plugins construidos con SDK 1.x declaran `apiVersion: 1` y siguen funcionando.
- **Soporte multi-versión del host**: el host admite al menos la `apiVersion` actual y la anterior simultáneamente, con manejadores de protocolo IPC separados por versión.
- **`sdkVersion` en el manifiesto**: los plugins declaran un rango semver (p. ej. `">=1.4.0 <2.0.0"`). El host lo valida al instalar.
- **Cronograma de deprecación**: las versiones de API anteriores obtienen al menos 6 meses de soporte continuo después de que sale una nueva versión. El host registra advertencias de deprecación y muestra un banner en la página de ajustes del plugin.
- **Guías de migración**: cada versión major del SDK incluye una guía de migración paso a paso que cubre cada cambio incompatible.
- **Superficie de UI versionada con el worker**: tanto el worker como las superficies de UI están en el mismo paquete, así que versionan juntos. Los cambios incompatibles en componentes de UI compartidos requieren un bump de versión major igual que los cambios de API del worker.
- **Matriz de compatibilidad publicada**: el host publica una matriz de versiones de API admitidas y rangos de SDK, consultable vía API.

## Una forma concreta de SDK para Paperclip

Un primer paso intencionalmente estrecho podría verse así:

```ts
import { definePlugin, z } from "@paperclipai/plugin-sdk";

export default definePlugin({
  id: "@paperclip/plugin-linear",
  version: "0.1.0",
  categories: ["connector", "ui"],
  capabilities: [
    "events.subscribe",
    "jobs.schedule",
    "http.outbound",
    "instance.settings.register",
    "ui.dashboardWidget.register",
    "secrets.read-ref",
  ],
  instanceConfigSchema: z.object({
    linearBaseUrl: z.string().url().optional(),
    companyMappings: z.array(
      z.object({
        companyId: z.string(),
        teamId: z.string(),
        apiTokenSecretRef: z.string(),
      }),
    ).default([]),
  }),
  async register(ctx) {
    ctx.jobs.register("linear-pull", { cron: "*/5 * * * *" }, async (job) => {
      // sync Linear issues into plugin-owned state or explicit Paperclip entities
    });

    // subscribe with optional server-side filter
    ctx.events.on("issue.created", { projectId: "proj-1" }, async (event) => {
      // only receives issue.created events for project proj-1
    });

    // subscribe to events from another plugin
    ctx.events.on("plugin.@paperclip/plugin-git.push-detected", async (event) => {
      // react to the git plugin detecting a push
    });

    // contribute a tool that agents can use during runs
    ctx.tools.register("search-linear-issues", {
      displayName: "Search Linear Issues",
      description: "Search for Linear issues by query",
      parametersSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    }, async (params, runCtx) => {
      // search Linear API and return results
      return { content: JSON.stringify(results) };
    });

    // getData is called by the plugin's own UI components via the host bridge
    ctx.data.register("sync-health", async ({ companyId }) => {
      // return typed JSON that the plugin's DashboardWidget component renders
      return { syncedCount: 142, trend: "+12 today", mappings: [...] };
    });

    ctx.actions.register("resync", async ({ companyId }) => {
      // run sync logic
    });
  },
});
```

El paquete de UI del plugin (separado del worker) podría verse así:

```tsx
// dist/ui/index.tsx
import { usePluginData, usePluginAction, MetricCard, ErrorBoundary } from "@paperclipai/plugin-sdk/ui";

export function DashboardWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = usePluginData("sync-health", { companyId: context.companyId });
  const resync = usePluginAction("resync");

  if (loading) return <Spinner />;
  if (error) return <div>Plugin error: {error.message} ({error.code})</div>;

  return (
    <ErrorBoundary fallback={<div>Widget failed to render</div>}>
      <MetricCard label="Synced Issues" value={data.syncedCount} trend={data.trend} />
      <button onClick={() => resync({ companyId: context.companyId })}>Resync Now</button>
    </ErrorBoundary>
  );
}
```

El punto importante no es la sintaxis exacta.
El punto importante es la forma del contrato:

- manifiesto tipado
- capacidades explícitas
- configuración global explícita con asignaciones opcionales de empresa
- suscripciones a eventos con filtrado opcional en el servidor
- eventos de plugin a plugin vía tipos de evento con espacio de nombres
- contribuciones de herramientas de agentes
- trabajos
- UI incluida por el plugin que se comunica con su worker a través del puente del host
- propagación estructurada de errores del worker a la UI

## Superficies de extensión principales recomendadas

## 1. Superficies de módulos de plataforma

Estas deberían mantenerse cerca del estilo actual de registro.

Candidatas:

- `registerAgentAdapter()`
- `registerStorageProvider()`
- `registerSecretProvider()`
- `registerRunLogStore()`

Estos son módulos de plataforma confiables, no plugins casuales.

## 2. Superficies de plugins conectores

Estos son los mejores candidatos de plugin a corto plazo.

Capacidades:

- suscribirse a eventos de dominio
- definir trabajos de sincronización programados
- exponer rutas de API específicas del plugin bajo `/api/plugins/:pluginId/...`
- usar refs de secretos de empresa
- escribir estado de plugin
- publicar datos del panel
- registrar actividad a través de APIs principales

Ejemplos:

- sincronización de issues de Linear
- sincronización de issues de GitHub
- tarjetas de panel de Grafana
- resúmenes de MRR / suscripciones de Stripe

## 3. Superficies de runtime de espacio de trabajo

Los plugins de espacio de trabajo manejan herramientas locales directamente:

- explorador de archivos
- terminal
- flujo de trabajo git
- seguimiento de procesos hijos
- seguimiento de servidor de desarrollo local

Los plugins resuelven rutas de espacios de trabajo a través de APIs del host (`ctx.projects` proporciona metadatos de espacio de trabajo incluyendo `cwd`, `repoUrl`, etc.) y luego operan en el sistema de archivos, generan procesos, ejecutan `git` en el shell o abren sesiones PTY usando APIs estándar de Node o cualquier librería que elijan.

El host no envuelve ni delega estas operaciones. Esto mantiene el núcleo ligero — no hay necesidad de mantener una superficie de API paralela para cada operación a nivel de SO que un plugin pueda necesitar. Los plugins poseen sus propias implementaciones.

## Requisitos de gobernanza y seguridad

Cualquier sistema de plugins de Paperclip tiene que preservar las invariantes principales del plano de control de los documentos del repo.

Eso significa:

- la instalación de plugins es global a la instancia
- las "empresas" siguen siendo objetos de negocio en la API y el modelo de datos, no límites de inquilinos
- las puertas de aprobación siguen siendo del núcleo
- los topes duros de presupuesto siguen siendo del núcleo
- las acciones de mutación se registran en el registro de actividad
- los secretos siguen basados en refs y redactados en los registros

Requeriría lo siguiente para cada plugin:

## 1. Declaración de capacidades

Cada plugin declara un conjunto estático de capacidades como:

- `companies.read`
- `issues.read`
- `issues.write`
- `events.subscribe`
- `events.emit`
- `jobs.schedule`
- `http.outbound`
- `webhooks.receive`
- `assets.read`
- `assets.write`
- `secrets.read-ref`
- `agent.tools.register`
- `plugin.state.read`
- `plugin.state.write`

El panel/operador ve esto antes de la instalación.

## 2. Instalación global

Un plugin se instala una vez y queda disponible en toda la instancia.
Si necesita asignaciones sobre objetos Paperclip específicos, esas son datos del plugin, no límites de habilitación/deshabilitación.

## 3. Registro de actividad

Las mutaciones originadas en plugins deberían fluir por el mismo mecanismo de registro de actividad, con un tipo de actor dedicado `plugin`:

- `actor_type = plugin`
- `actor_id = <plugin-id>` (p. ej. `@paperclip/plugin-linear`)

## 4. Salud e informes de fallos

Cada plugin debería exponer:

- estado habilitado/deshabilitado
- última ejecución exitosa
- último error
- historial reciente de webhooks/trabajos

Un plugin roto no debe romper al resto de la empresa.

## 5. Manejo de secretos

Los plugins deberían recibir refs de secretos, no valores crudos de secretos en la persistencia de configuración.
La resolución debería pasar por la abstracción existente de proveedores de secretos.

## 6. Límites de recursos

Los plugins deberían tener:

- límites de timeout
- límites de concurrencia
- políticas de reintento
- presupuestos opcionales por plugin

Esto importa especialmente para conectores de sincronización y plugins de espacio de trabajo.

## Adiciones al modelo de datos a considerar

Evitaría "migraciones SQL arbitrarias definidas por plugins de terceros" en la primera versión.
Eso es demasiado poder demasiado pronto.

El modelo mental correcto es:

- reutilizar tablas principales cuando los datos son claramente parte de Paperclip mismo
- usar tablas de extensión genéricas para la mayoría del estado propio de plugins
- solo permitir tablas específicas de plugins más adelante, y solo para módulos de plataforma confiables o un flujo de migración estrechamente controlado

## Estrategia de Postgres recomendada para extensiones

### 1. Las tablas principales siguen siendo principales

Si un concepto se está volviendo parte del modelo de producto real de Paperclip, debería obtener una tabla normal de primera parte.

Ejemplos:

- `project_workspaces` ya es una tabla principal porque los espacios de trabajo de proyecto ahora son parte de Paperclip mismo
- si un futuro "estado git de proyecto" se vuelve una función principal en lugar de metadatos propios del plugin, eso también debería ser una tabla de primera parte

### 2. La mayoría de los plugins deberían empezar en tablas de extensión genéricas

Para la mayoría de los plugins, el host debería proporcionar algunas tablas genéricas de persistencia y el plugin almacena registros con espacios de nombres allí.

Esto mantiene el sistema manejable:

- migraciones más simples
- respaldo/restauración más simple
- historia de portabilidad más simple
- revisión más fácil por el operador
- menos chances de que la deriva de esquema de plugin rompa la instancia

### 3. Limitar los datos de plugin a objetos Paperclip antes de agregar esquemas personalizados

Muchos datos de plugin cuelgan naturalmente de objetos Paperclip existentes:

- el estado de plugin de espacio de trabajo de proyecto a menudo debería limitarse a `project` o `project_workspace`
- el estado de sincronización de issues debería limitarse a `issue`
- los widgets de métricas pueden limitarse a `company`, `project` u `goal`
- el seguimiento de procesos puede limitarse a `project_workspace`, `agent` o `run`

Eso da un buen modelo de clave predeterminado antes de introducir tablas personalizadas.

### 4. Agregar migraciones de módulos confiables más adelante, no migraciones arbitrarias de plugins ahora

Si Paperclip eventualmente necesita tablas propias de extensiones, solo permitiría eso para:

- paquetes confiables de primera parte
- módulos de plataforma confiables
- quizás plugins instalados explícitamente revisados por el admin con versiones fijadas

No dejaría que plugins aleatorios de terceros ejecuten migraciones de esquema de forma libre al inicio.

En cambio, agregar un mecanismo controlado más adelante si se vuelve necesario.

## Tablas de extensión base sugeridas

## 1. `plugins`

Registro de instalación a nivel de instancia.

Campos sugeridos:

- `id`
- `package_name`
- `version`
- `categories`
- `manifest_json`
- `installed_at`
- `status`

## 2. `plugin_config`

Configuración de plugin a nivel de instancia.

Campos sugeridos:

- `id`
- `plugin_id`
- `config_json`
- `created_at`
- `updated_at`
- `last_error`

## 3. `plugin_state`

Estado clave/valor genérico para plugins.

Campos sugeridos:

- `id`
- `plugin_id`
- `scope_kind` (`instance | company | project | project_workspace | agent | issue | goal | run`)
- `scope_id` anulable
- `namespace`
- `state_key`
- `value_json`
- `updated_at`

Esto basta para muchos conectores antes de permitir tablas personalizadas.

Ejemplos:

- IDs externos de Linear claveados por `issue`
- cursores de sincronización de GitHub claveados por `project`
- preferencias del explorador de archivos claveadas por `project_workspace`
- metadatos de ramas git claveados por `project_workspace`
- metadatos de procesos claveados por `project_workspace` o `run`

## 4. `plugin_jobs`

Seguimiento de trabajos programados y ejecuciones.

Campos sugeridos:

- `id`
- `plugin_id`
- `scope_kind` anulable
- `scope_id` anulable
- `job_key`
- `status`
- `last_started_at`
- `last_finished_at`
- `last_error`

## 5. `plugin_webhook_deliveries`

Si los plugins exponen webhooks, vale la pena almacenar el historial de entregas.

Campos sugeridos:

- `id`
- `plugin_id`
- `scope_kind` anulable
- `scope_id` anulable
- `endpoint_key`
- `status`
- `received_at`
- `response_code`
- `error`

## 6. Quizás más adelante: `plugin_entities`

Si el estado genérico de plugin se vuelve demasiado limitante, agregar una tabla de entidades estructurada y consultable para registros de conectores antes de permitir migraciones arbitrarias de plugins.

Campos sugeridos:

- `id`
- `plugin_id`
- `entity_type`
- `scope_kind`
- `scope_id`
- `external_id`
- `title`
- `status`
- `data_json`
- `updated_at`

Esto es un punto medio útil:

- mucho más consultable que el estado clave/valor opaco
- aún evita dejar que cada plugin cree su propio esquema relacional de inmediato

## Cómo los ejemplos solicitados encajan en este modelo

| Caso de uso | Mejor ajuste | Primitivas del host necesarias | Notas |
|---|---|---|---|
| Explorador de archivos | plugin de espacio de trabajo | metadatos del espacio de trabajo del proyecto | el plugin posee las operaciones del sistema de archivos directamente |
| Terminal | plugin de espacio de trabajo | metadatos del espacio de trabajo del proyecto | el plugin crea sesiones PTY directamente |
| Flujo de trabajo git | plugin de espacio de trabajo | metadatos del espacio de trabajo del proyecto | el plugin ejecuta git directamente |
| Seguimiento de issues de Linear | plugin conector | trabajos, webhooks, refs de secretos, API de sincronización de issues | candidato muy fuerte |
| Seguimiento de issues de GitHub | plugin conector | trabajos, webhooks, refs de secretos | candidato muy fuerte |
| Métricas de Grafana | plugin conector + widget del panel | HTTP saliente | probablemente solo lectura primero |
| Seguimiento de procesos hijos/servidores | plugin de espacio de trabajo | metadatos del espacio de trabajo del proyecto | el plugin gestiona los procesos directamente |
| Seguimiento de ingresos de Stripe | plugin conector | refs de secretos, sincronización programada, API de métricas de empresa | candidato fuerte |

# Ejemplos de plugins

## Explorador de archivos de espacio de trabajo

Idea de paquete: `@paperclip/plugin-workspace-files`

Este plugin permite al panel inspeccionar espacios de trabajo de proyecto, espacios de trabajo de agentes, artefactos generados y archivos relacionados con issues sin bajar al shell. Es útil para:

- explorar archivos dentro de espacios de trabajo de proyecto
- depurar lo que cambió un agente
- revisar salidas generadas antes de la aprobación
- adjuntar archivos de un espacio de trabajo a issues
- entender el diseño del repositorio de una empresa
- inspeccionar espacios de trabajo de inicio de agentes en modo local confiable

### UX

- Página de ajustes: `/settings/plugins/workspace-files`
- Página principal: `/:companyPrefix/plugins/workspace-files`
- Pestaña de proyecto: `/:companyPrefix/projects/:projectId?tab=files`
- Pestaña de issue opcional: `/:companyPrefix/issues/:issueId?tab=files`
- Pestaña de agente opcional: `/:companyPrefix/agents/:agentId?tab=workspace`

Pantallas principales e interacciones:

- Ajustes del plugin:
  - elegir si el plugin usa por defecto `project.primaryWorkspace`
  - elegir qué espacios de trabajo de proyecto son visibles
  - elegir si se permiten escrituras de archivos o solo lectura
  - elegir si los archivos ocultos son visibles
- Página principal del explorador:
  - selector de proyecto arriba
  - selector de espacio de trabajo limitado a los `workspaces` del proyecto seleccionado
  - vista de árbol a la izquierda
  - panel de vista previa de archivo a la derecha
  - cuadro de búsqueda para buscar por nombre de archivo/ruta
  - acciones: copiar ruta, descargar archivo, adjuntar a issue, abrir diff
- Pestaña de proyecto:
  - abre directamente en el espacio de trabajo principal del proyecto
  - permite al panel cambiar entre todos los espacios de trabajo del proyecto
  - muestra metadatos del espacio de trabajo como `cwd`, `repoUrl` y `repoRef`
- Pestaña de issue:
  - resuelve el proyecto del issue y abre ese contexto de espacio de trabajo del proyecto
  - muestra archivos vinculados al issue
  - permite al panel extraer archivos del espacio de trabajo del proyecto a los adjuntos del issue
  - muestra la ruta y la info de última modificación de cada archivo vinculado
- Pestaña de agente:
  - muestra el espacio de trabajo resuelto actual del agente
  - si la ejecución está adjunta a un proyecto, enlaza de vuelta a la vista del espacio de trabajo del proyecto
  - permite al panel inspeccionar los archivos que el agente está tocando actualmente

Flujos principales:

- El operador abre un proyecto y explora los archivos de su espacio de trabajo principal.
- El operador cambia de un espacio de trabajo de proyecto a otro cuando un proyecto tiene múltiples checkouts o referencias de repositorio.
- El operador abre un issue, adjunta un artefacto generado desde el explorador de archivos y deja un comentario de revisión.
- El operador abre la página de detalle de un agente para inspeccionar los archivos exactos detrás de una ejecución fallida.

### Hooks necesarios

Capacidades recomendadas y puntos de extensión:

- `instance.settings.register`
- `ui.sidebar.register`
- `ui.page.register`
- `ui.detailTab.register` para `project`, `issue` y `agent`
- `projects.read`
- `project.workspaces.read`
- `assets.write` opcional
- `activity.log.write`

El plugin resuelve las rutas de espacios de trabajo a través de `ctx.projects` y maneja todas las operaciones del sistema de archivos (leer, escribir, stat, buscar, listar directorio) directamente usando APIs de Node.

Suscripciones de eventos opcionales:

- `events.subscribe(agent.run.started)`
- `events.subscribe(agent.run.finished)`
- `events.subscribe(issue.attachment.created)`

## Terminal de espacio de trabajo

Idea de paquete: `@paperclip/plugin-terminal`

Este plugin da al panel una UI de terminal controlada para espacios de trabajo de proyecto y espacios de trabajo de agentes. Es útil para:

- depurar ejecuciones atascadas
- verificar el estado del entorno
- ejecutar comandos manuales dirigidos
- observar comandos de larga duración
- emparejar un operador humano con un flujo de trabajo de agentes

### UX

- Página de ajustes: `/settings/plugins/terminal`
- Página principal: `/:companyPrefix/plugins/terminal`
- Pestaña de proyecto: `/:companyPrefix/projects/:projectId?tab=terminal`
- Pestaña de agente opcional: `/:companyPrefix/agents/:agentId?tab=terminal`
- Pestaña de ejecución opcional: `/:companyPrefix/agents/:agentId/runs/:runId?tab=terminal`

Pantallas principales e interacciones:

- Ajustes del plugin:
  - shells permitidos y política de shell
  - si los comandos son de solo lectura, de forma libre o de lista permitida
  - si las terminales requieren una confirmación explícita del operador antes de lanzarse
  - si las nuevas sesiones de terminal usan por defecto el espacio de trabajo principal del proyecto
- Página principal de terminal:
  - lista de sesiones de terminal activas
  - botón para abrir una nueva sesión
  - selector de proyecto, luego selector de espacio de trabajo de los workspaces de ese proyecto
  - asociación opcional de agente
  - panel de terminal con entrada, redimensionado y soporte de reconexión
  - controles: interrumpir, matar, limpiar, guardar transcripción
- Pestaña de terminal de proyecto:
  - abre una sesión ya limitada al espacio de trabajo principal del proyecto
  - permite al panel cambiar entre los espacios de trabajo configurados del proyecto
  - muestra comandos recientes y estado relacionado de procesos/servidores para ese proyecto
- Pestaña de terminal de agente:
  - abre una sesión ya limitada al espacio de trabajo del agente
  - muestra ejecuciones y comandos recientes relacionados
- Pestaña de terminal de ejecución:
  - permite al panel inspeccionar el entorno alrededor de una ejecución fallida específica

Flujos principales:

- El operador abre una terminal contra el espacio de trabajo de un agente para reproducir un comando fallido.
- El operador abre una página de proyecto y lanza una terminal directamente en el espacio de trabajo principal de ese proyecto.
- El operador observa un servidor de desarrollo o comando de prueba de larga duración desde la página de terminal.
- El operador mata o interrumpe un proceso descontrolado desde la misma UI.

### Hooks necesarios

Capacidades recomendadas y puntos de extensión:

- `instance.settings.register`
- `ui.sidebar.register`
- `ui.page.register`
- `ui.detailTab.register` para `project`, `agent` y `run`
- `projects.read`
- `project.workspaces.read`
- `activity.log.write`

El plugin resuelve las rutas de espacios de trabajo a través de `ctx.projects` y maneja la gestión de sesiones PTY (abrir, entrada, redimensionar, terminar, suscribir) directamente usando librerías PTY de Node.

Suscripciones de eventos opcionales:

- `events.subscribe(agent.run.started)`
- `events.subscribe(agent.run.failed)`
- `events.subscribe(agent.run.cancelled)`

## Flujo de trabajo git

Idea de paquete: `@paperclip/plugin-git`

Este plugin agrega herramientas de flujo de trabajo con conocimiento del repositorio alrededor de issues y espacios de trabajo. Es útil para:

- creación de ramas ligada a issues
- revisión rápida de diffs
- visibilidad de commits y worktrees
- preparación de PR
- tratar el espacio de trabajo principal del proyecto como el ancla canónica del repositorio
- ver si el espacio de trabajo de un agente está limpio o sucio

### UX

- Página de ajustes: `/settings/plugins/git`
- Página principal: `/:companyPrefix/plugins/git`
- Pestaña de proyecto: `/:companyPrefix/projects/:projectId?tab=git`
- Pestaña de issue opcional: `/:companyPrefix/issues/:issueId?tab=git`
- Pestaña de agente opcional: `/:companyPrefix/agents/:agentId?tab=git`

Pantallas principales e interacciones:

- Ajustes del plugin:
  - plantilla de nombres de ramas
  - ref de secreto de token de proveedor remoto opcional
  - si las acciones de escritura están habilitadas o solo lectura
  - si el plugin siempre usa `project.primaryWorkspace` a menos que se elija un espacio de trabajo de proyecto diferente
- Página general de git:
  - selector de proyecto y selector de espacio de trabajo
  - rama actual
  - estado de adelanto/retraso
  - resumen de archivos sucios
  - commits recientes
  - worktrees activos
  - acciones: refrescar, crear rama, crear worktree, agregar todo al stage, commit, abrir diff
- Pestaña de proyecto:
  - abre en el espacio de trabajo principal del proyecto
  - muestra metadatos del espacio de trabajo y enlace del repositorio (`cwd`, `repoUrl`, `repoRef`)
  - muestra rama, diff e historial de commits para ese espacio de trabajo de proyecto
- Pestaña de issue:
  - resuelve el proyecto del issue y usa ese contexto de espacio de trabajo del proyecto
  - acción "crear rama desde el issue"
  - vista de diff limitada al espacio de trabajo seleccionado del proyecto
  - vincular metadatos de rama/worktree al issue
- Pestaña de agente:
  - muestra la rama, el worktree y el estado de suciedad del agente
  - muestra commits recientes producidos por ese agente
  - si el agente trabaja dentro de un espacio de trabajo de proyecto, enlaza de vuelta a la pestaña git del proyecto

Flujos principales:

- El operador crea una rama desde un issue y la ata al espacio de trabajo principal del proyecto.
- El operador abre un proyecto y revisa el diff para el espacio de trabajo de ese proyecto sin salir de Paperclip.
- El operador revisa el diff después de una ejecución sin salir de Paperclip.
- El operador abre una lista de worktrees para entender ramas paralelas entre agentes.

### Hooks necesarios

Capacidades recomendadas y puntos de extensión:

- `instance.settings.register`
- `ui.sidebar.register`
- `ui.page.register`
- `ui.detailTab.register` para `project`, `issue` y `agent`
- `ui.action.register`
- `projects.read`
- `project.workspaces.read`
- `agent.tools.register` opcional (p. ej. `create-branch`, `get-diff`, `get-status`)
- `events.emit` opcional (p. ej. `plugin.@paperclip/plugin-git.push-detected`)
- `activity.log.write`

El plugin resuelve las rutas de espacios de trabajo a través de `ctx.projects` y maneja todas las operaciones git (estado, diff, log, crear rama, commit, crear worktree, push) directamente usando la CLI de git o una librería git.

Suscripciones de eventos opcionales:

- `events.subscribe(issue.created)`
- `events.subscribe(issue.updated)`
- `events.subscribe(agent.run.finished)`

El plugin git puede emitir eventos `plugin.@paperclip/plugin-git.push-detected` a los que otros plugins (p. ej. GitHub Issues) se suscriben para coordinación entre plugins.

Nota: la creación de PR de GitHub/GitLab probablemente debería vivir en un plugin conector separado en lugar de sobrecargar el plugin git local.

## Seguimiento de issues de Linear

Idea de paquete: `@paperclip/plugin-linear`

Este plugin sincroniza el trabajo de Paperclip con Linear. Es útil para:

- importar backlog desde Linear
- vincular issues de Paperclip a issues de Linear
- sincronizar estado, comentarios y asignados
- mapear objetivos/proyectos de empresa a planificación externa de producto
- dar a los operadores del tablero un solo lugar para ver la salud de la sincronización

### UX

- Página de ajustes: `/settings/plugins/linear`
- Página principal: `/:companyPrefix/plugins/linear`
- Widget del panel: `/:companyPrefix/dashboard`
- Pestaña de issue opcional: `/:companyPrefix/issues/:issueId?tab=linear`
- Pestaña de proyecto opcional: `/:companyPrefix/projects/:projectId?tab=linear`

Pantallas principales e interacciones:

- Ajustes del plugin:
  - ref de secreto de token de API de Linear
  - asignaciones de espacio de trabajo/equipo/proyecto
  - asignación de estados entre Paperclip y Linear
  - dirección de sincronización: solo importación, solo exportación, bidireccional
  - interruptor de sincronización de comentarios
- Página general de Linear:
  - tarjeta de salud de sincronización
  - trabajos de sincronización recientes
  - proyectos y equipos asignados
  - cola de conflictos sin resolver
  - acciones de importación para equipos, proyectos e issues
- Pestaña de issue:
  - clave y URL del issue de Linear vinculado
  - estado de sincronización y última hora de sincronización
  - acciones: vincular existente, crear en Linear, resincronizar ahora, desvincular
  - línea de tiempo de comentarios/cambios de estado sincronizados
- Widget del panel:
  - errores de sincronización abiertos
  - conteo de issues importados vs vinculados
  - fallos recientes de webhooks/trabajos

Flujos principales:

- El operador habilita el plugin, asigna un equipo de Linear e importa un backlog a Paperclip.
- Los cambios de estado de issues de Paperclip se envían a Linear y los comentarios de Linear llegan de vuelta a través de webhooks.
- El operador resuelve conflictos de asignación desde la página del plugin en lugar de dejar que el estado derive en silencio.

### Hooks necesarios

Capacidades recomendadas y puntos de extensión:

- `instance.settings.register`
- `ui.sidebar.register`
- `ui.page.register`
- `ui.dashboardWidget.register`
- `ui.detailTab.register` para `issue` y `project`
- `events.subscribe(issue.created)`
- `events.subscribe(issue.updated)`
- `events.subscribe(issue.comment.created)`
- `events.subscribe(project.updated)`
- `jobs.schedule`
- `webhooks.receive`
- `http.outbound`
- `secrets.read-ref`
- `plugin.state.read`
- `plugin.state.write`
- `issues.create` opcional
- `issues.update` opcional
- `issue.comments.create` opcional
- `agent.tools.register` opcional (p. ej. `search-linear-issues`, `get-linear-issue`)
- `activity.log.write`

Restricción importante:

- el procesamiento de webhooks debería ser idempotente y consciente de conflictos
- los IDs externos y los cursores de sincronización pertenecen al estado propio del plugin, no inline en las filas principales de issue en la primera versión

## Seguimiento de issues de GitHub

Idea de paquete: `@paperclip/plugin-github-issues`

Este plugin sincroniza los issues de Paperclip con GitHub Issues y opcionalmente vincula PRs. Es útil para:

- importar backlogs de repositorios
- reflejar el estado y los comentarios de issues
- vincular PRs a issues de Paperclip
- seguir trabajo entre repositorios desde una vista de empresa
- unir el flujo de trabajo de ingeniería con la gobernanza de tareas de Paperclip

### UX

- Página de ajustes: `/settings/plugins/github-issues`
- Página principal: `/:companyPrefix/plugins/github-issues`
- Widget del panel: `/:companyPrefix/dashboard`
- Pestaña de issue opcional: `/:companyPrefix/issues/:issueId?tab=github`
- Pestaña de proyecto opcional: `/:companyPrefix/projects/:projectId?tab=github`

Pantallas principales e interacciones:

- Ajustes del plugin:
  - ref de secreto de GitHub App o PAT
  - asignaciones de org/repo
  - asignación de etiquetas/estados
  - si el enlace de PR está habilitado
  - si los nuevos issues de Paperclip deberían crear issues de GitHub automáticamente
- Página general de GitHub:
  - lista de asignaciones de repositorios
  - salud de sincronización y eventos de webhook recientes
  - acción de importar backlog
  - cola de issues de GitHub sin vincular
- Pestaña de issue:
  - issue de GitHub vinculado y PRs vinculados opcionales
  - acciones: crear issue de GitHub, vincular issue existente, desvincular, resincronizar
  - línea de tiempo de sincronización de comentarios/estados
- Widget del panel:
  - PRs abiertos vinculados a issues activos de Paperclip
  - fallos de webhooks
  - métricas de retraso de sincronización

Flujos principales:

- El operador importa GitHub Issues de un repositorio a Paperclip.
- Los webhooks de GitHub actualizan el estado de comentarios/estado en Paperclip.
- Un PR se vincula de vuelta al issue de Paperclip para que el panel pueda seguir el estado de entrega.

### Hooks necesarios

Capacidades recomendadas y puntos de extensión:

- `instance.settings.register`
- `ui.sidebar.register`
- `ui.page.register`
- `ui.dashboardWidget.register`
- `ui.detailTab.register` para `issue` y `project`
- `events.subscribe(issue.created)`
- `events.subscribe(issue.updated)`
- `events.subscribe(issue.comment.created)`
- `events.subscribe(plugin.@paperclip/plugin-git.push-detected)` (coordinación entre plugins)
- `jobs.schedule`
- `webhooks.receive`
- `http.outbound`
- `secrets.read-ref`
- `plugin.state.read`
- `plugin.state.write`
- `issues.create` opcional
- `issues.update` opcional
- `issue.comments.create` opcional
- `activity.log.write`

Restricción importante:

- mantener "estado git local" y "estado de issue remoto de GitHub" en plugins separados aunque trabajen juntos — los eventos entre plugins manejan la coordinación

## Métricas de Grafana

Idea de paquete: `@paperclip/plugin-grafana`

Este plugin expone métricas y paneles externos dentro de Paperclip. Es útil para:

- visibilidad de KPI de empresa
- monitoreo de infraestructura/incidentes
- mostrar gráficos de despliegues, tráfico, latencia o ingresos junto al trabajo
- crear issues de Paperclip desde métricas anómalas

### UX

- Página de ajustes: `/settings/plugins/grafana`
- Página principal: `/:companyPrefix/plugins/grafana`
- Widgets del panel: `/:companyPrefix/dashboard`
- Pestaña de objetivo opcional: `/:companyPrefix/goals/:goalId?tab=metrics`

Pantallas principales e interacciones:

- Ajustes del plugin:
  - URL base de Grafana
  - ref de secreto de token de cuenta de servicio
  - asignaciones de paneles y paneles
  - intervalo de refresco
  - reglas opcionales de umbrales de alerta
- Widgets del panel:
  - una o más tarjetas de métricas en el panel principal
  - vista rápida de tendencia y última hora de refresco
  - enlace hacia Grafana y enlace hacia la página completa del plugin de Paperclip
- Página completa de métricas:
  - paneles de Grafana seleccionados incrustados o delegados
  - selector de métricas
  - selector de rango de tiempo
  - acción "crear issue desde anomalía"
- Pestaña de objetivo:
  - tarjetas de métricas relevantes para un objetivo o proyecto específico

Flujos principales:

- El operador ve degradación del servicio o movimiento de KPI de negocio directamente en el panel de Paperclip.
- El operador entra a la página completa de métricas para inspeccionar los paneles relevantes de Grafana.
- El operador crea un issue de Paperclip desde un incumplimiento de umbral con una instantánea de métrica adjunta.

### Hooks necesarios

Capacidades recomendadas y puntos de extensión:

- `instance.settings.register`
- `ui.dashboardWidget.register`
- `ui.page.register`
- `ui.detailTab.register` para `goal` o `project`
- `jobs.schedule`
- `http.outbound`
- `secrets.read-ref`
- `plugin.state.read`
- `plugin.state.write`
- `issues.create` opcional
- `assets.write` opcional
- `activity.log.write`

Suscripciones de eventos opcionales:

- `events.subscribe(goal.created)`
- `events.subscribe(project.updated)`

Restricción importante:

- empezar solo lectura primero
- no hacer la lógica de alertas de Grafana parte del núcleo de Paperclip; mantenerla como señal aditiva y creación de issues

## Seguimiento de procesos hijos / servidores

Idea de paquete: `@paperclip/plugin-runtime-processes`

Este plugin rastrea procesos locales de larga duración y servidores de desarrollo iniciados en espacios de trabajo de proyecto. Es útil para:

- ver qué agente inició qué servicio local
- rastrear puertos, salud y tiempo activo
- reiniciar servidores de desarrollo fallidos
- exponer el estado de procesos junto al estado de issues y ejecuciones
- hacer visibles al panel los flujos de trabajo de desarrollo local

### UX

- Página de ajustes: `/settings/plugins/runtime-processes`
- Página principal: `/:companyPrefix/plugins/runtime-processes`
- Widget del panel: `/:companyPrefix/dashboard`
- Página de detalle de proceso: `/:companyPrefix/plugins/runtime-processes/:processId`
- Pestaña de proyecto: `/:companyPrefix/projects/:projectId?tab=processes`
- Pestaña de agente opcional: `/:companyPrefix/agents/:agentId?tab=processes`

Pantallas principales e interacciones:

- Ajustes del plugin:
  - si se permite el registro manual de procesos
  - comportamiento de comprobación de salud
  - si los operadores pueden detener/reiniciar procesos
  - preferencias de retención de registros
- Página de lista de procesos:
  - tabla de estado con nombre, comando, cwd, agente propietario, puerto, tiempo activo y salud
  - filtros para procesos en ejecución/finalizados/fallidos
  - acciones: inspeccionar, detener, reiniciar, ver registros
- Pestaña de proyecto:
  - filtra la lista de procesos a los espacios de trabajo del proyecto
  - muestra a qué espacio de trabajo pertenece cada proceso
  - agrupa procesos por espacio de trabajo de proyecto
- Página de detalle de proceso:
  - metadatos del proceso
  - cola de registros en vivo
  - historial de comprobaciones de salud
  - enlaces al issue o ejecución asociados
- Pestaña de agente:
  - muestra procesos iniciados por o asignados a ese agente

Flujos principales:

- Un agente inicia un servidor de desarrollo; el plugin lo detecta y lo rastrea.
- El operador abre un proyecto e inmediatamente ve los procesos adjuntos al espacio de trabajo de ese proyecto.
- El operador ve un proceso fallido en el panel y lo reinicia desde la página del plugin.
- El operador adjunta registros de proceso a un issue al depurar un fallo.

### Hooks necesarios

Capacidades recomendadas y puntos de extensión:

- `instance.settings.register`
- `ui.sidebar.register`
- `ui.page.register`
- `ui.dashboardWidget.register`
- `ui.detailTab.register` para `project` y `agent`
- `projects.read`
- `project.workspaces.read`
- `plugin.state.read`
- `plugin.state.write`
- `activity.log.write`

El plugin resuelve las rutas de espacios de trabajo a través de `ctx.projects` y maneja la gestión de procesos (registrar, listar, terminar, reiniciar, leer registros, sondeos de salud) directamente usando APIs de Node.

Suscripciones de eventos opcionales:

- `events.subscribe(agent.run.started)`
- `events.subscribe(agent.run.finished)`

## Seguimiento de ingresos de Stripe

Idea de paquete: `@paperclip/plugin-stripe`

Este plugin trae datos de ingresos y suscripciones de Stripe a Paperclip. Es útil para:

- mostrar MRR y churn junto a los objetivos de empresa
- rastrear pruebas, conversiones y pagos fallidos
- permitir al panel conectar el movimiento de ingresos con el trabajo en curso
- habilitar futuros paneles financieros más allá de los costos de tokens

### UX

- Página de ajustes: `/settings/plugins/stripe`
- Página principal: `/:companyPrefix/plugins/stripe`
- Widgets del panel: `/:companyPrefix/dashboard`
- Pestañas opcionales de métricas de empresa/objetivo si esas superficies existen más adelante

Pantallas principales e interacciones:

- Ajustes del plugin:
  - ref de secreto de clave secreta de Stripe
  - selección de cuenta si se necesita
  - definiciones de métricas como tratamiento de MRR y manejo de pruebas
  - intervalo de sincronización
  - ref de secreto de firma de webhook
- Widgets del panel:
  - tarjeta de MRR
  - suscripciones activas
  - conversión de prueba a pago
  - alertas de pagos fallidos
- Página general de Stripe:
  - gráficos de series de tiempo
  - eventos recientes de clientes/suscripciones
  - salud de webhooks
  - historial de sincronización
  - acción: crear issue desde anomalía de facturación

Flujos principales:

- El operador habilita el plugin y conecta una cuenta de Stripe.
- Los webhooks y la reconciliación programada mantienen el estado del plugin actualizado.
- Los widgets de ingresos aparecen en el panel principal y pueden vincularse a objetivos de empresa.
- Picos de pagos fallidos o eventos de churn pueden generar issues de Paperclip para seguimiento.

### Hooks necesarios

Capacidades recomendadas y puntos de extensión:

- `instance.settings.register`
- `ui.dashboardWidget.register`
- `ui.page.register`
- `jobs.schedule`
- `webhooks.receive`
- `http.outbound`
- `secrets.read-ref`
- `plugin.state.read`
- `plugin.state.write`
- `metrics.write`
- `issues.create` opcional
- `activity.log.write`

Restricción importante:

- Los datos de Stripe deberían mantenerse aditivos al núcleo de Paperclip
- no deberían filtrarse a la lógica principal de presupuestos, que trata específicamente del gasto en modelos/tokens en V1

## Patrones específicos de OpenCode que vale la pena adoptar

## Adoptar

- paquete SDK separado del cargador del runtime
- orden de carga determinista y precedencia
- API de autoría muy pequeña
- esquemas tipados para entradas/configuración/herramientas de plugin
- herramientas como punto de extensión de primera clase del plugin (con espacios de nombres, no sobrescritura por colisión)
- extensiones internas usando las mismas formas de registro que las externas cuando sea razonable
- errores de carga de plugin aislados del inicio del host cuando sea posible
- documentación de plugins explícita orientada a la comunidad y plantillas de ejemplo
- arnés de pruebas y plantilla inicial para baja fricción de autoría
- ciclo de vida de plugins en caliente sin reinicio del servidor (habilitado por workers fuera de proceso)
- versionado formal del SDK con soporte multi-versión del host

## Adaptar, no copiar

- carga de rutas locales
- auto-instalación de dependencias
- modelo de mutación por hooks
- comportamiento de sobrescritura de integrados
- objetos de contexto amplios del runtime

## Evitar

- carga arbitraria de código local de proyecto
- confianza implícita en paquetes npm al inicio
- plugins que sobrescriben invariantes principales
- ejecución en proceso sin sandbox como modelo de extensión por defecto

## Plan de despliegue sugerido

## Fase 0: Endurecer las costuras que ya existen

- formalizar los registros de adaptador/almacenamiento/secretos/registro de ejecuciones como "módulos de plataforma"
- eliminar el comportamiento de respaldo ad hoc donde sea posible
- documentar contratos de registro estables

## Fase 1: Agregar primero plugins conectores

Esta es la categoría de plugin de mayor valor y menor riesgo.

Construir:

- manifiesto de plugin
- ciclo de vida de instalación/actualización global
- configuración global de plugin y almacenamiento opcional de asignaciones de empresa
- acceso a refs de secretos
- suscripción a eventos de dominio tipados
- trabajos programados
- endpoints de webhook
- ayudantes de registro de actividad
- carga de paquete de UI de plugin, puente del host, `@paperclipai/plugin-sdk/ui`
- montaje de ranuras de extensión para páginas, pestañas, widgets, entradas de barra lateral
- formulario de ajustes generado automáticamente desde `instanceConfigSchema`
- propagación de errores del puente (`PluginBridgeError`)
- herramientas de agentes contribuidas por plugins
- eventos de plugin a plugin (espacio de nombres `plugin.<pluginId>.*`)
- filtrado de eventos (en el servidor, por suscripción)
- apagado elegante con plazos configurables
- registro de plugin y panel de salud
- desinstalación con período de gracia de retención de datos
- arnés de pruebas `@paperclipai/plugin-test-harness` y plantilla inicial `create-paperclip-plugin`
- ciclo de vida de plugins en caliente (instalación, desinstalación, actualización, cambio de configuración sin reinicio del servidor)
- versionado del SDK con soporte multi-versión del host y política de deprecación

Esta fase cubriría de inmediato:

- Linear
- GitHub
- Grafana
- Stripe
- explorador de archivos
- terminal
- flujo de trabajo git
- seguimiento de procesos hijos/servidores

Los plugins de espacio de trabajo no requieren APIs adicionales del host — resuelven las rutas de espacios de trabajo a través de `ctx.projects` y manejan las operaciones de sistema de archivos, git, PTY y procesos directamente.

## Fase 2: Considerar UI más rica y empaquetado de plugins

Solo después de que la Fase 1 esté estable:

- aislamiento basado en iframes para paquetes de UI de plugins de terceros no confiables
- paquetes de plugin firmados/verificados
- marketplace de plugins
- backends o migraciones de almacenamiento de plugin personalizados opcionales

## Decisión de arquitectura recomendada

Si tuviera que colapsar este informe en una decisión de arquitectura, sería:

Paperclip no debería implementar "un sistema genérico de hooks en proceso estilo OpenCode."
Paperclip debería implementar "una plataforma de plugins con múltiples niveles de confianza":

- módulos de plataforma confiables para integración de runtime de bajo nivel
- plugins tipados fuera de proceso para integraciones en toda la instancia y automatización
- herramientas de agentes contribuidas por plugins (con espacios de nombres, controladas por capacidades)
- paquetes de UI incluidos por el plugin renderizados en ranuras de extensión del host vía un puente tipado con propagación estructurada de errores
- eventos de plugin a plugin para coordinación entre plugins
- UI de ajustes generada automáticamente desde el esquema de configuración
- invariantes del núcleo que los plugins pueden observar y rodear con acciones, pero no reemplazar
- observabilidad de plugins, gestión elegante del ciclo de vida y un arnés de pruebas para baja fricción de autoría
- ciclo de vida de plugins en caliente — sin reinicio del servidor para instalación, desinstalación, actualización o cambios de configuración
- versionado del SDK con soporte multi-versión del host y política clara de deprecación

Eso obtiene las ventajas de la extensibilidad de `opencode` sin importar el modelo de amenaza equivocado.

## Próximos pasos concretos que tomaría en Paperclip

1. Escribir un RFC corto de arquitectura de extensiones que formalice la distinción entre `platform modules` y `plugins`.
2. Introducir un tipo pequeño de manifiesto de plugin en `packages/shared` y una sección de instalación/configuración de `plugins` en la configuración de instancia.
3. Construir un bus de eventos de dominio tipado alrededor de los patrones existentes de actividad/eventos en vivo, con filtrado de eventos en el servidor y un espacio de nombres `plugin.*` para eventos entre plugins. Mantener las invariantes principales no enganchables.
4. Implementar el MVP de plugin: instalación/configuración global, refs de secretos, trabajos, webhooks, paquetes de UI de plugin, ranuras de extensión, formularios de ajustes generados automáticamente, propagación de errores del puente.
5. Agregar contribuciones de herramientas de agentes — los plugins registran herramientas con espacios de nombres que los agentes pueden llamar durante las ejecuciones.
6. Agregar observabilidad de plugins: registro estructurado vía `ctx.logger`, panel de salud, eventos internos de salud.
7. Agregar política de apagado elegante y ciclo de vida de datos de desinstalación con período de gracia de retención.
8. Incluir el arnés de pruebas `@paperclipai/plugin-test-harness` y la plantilla inicial `create-paperclip-plugin`.
9. Implementar el ciclo de vida de plugins en caliente — instalación, desinstalación, actualización y cambios de configuración sin reinicio del servidor.
10. Definir la política de versionado del SDK — semver, soporte multi-versión del host, cronograma de deprecación, guías de migración, matriz de compatibilidad publicada.
11. Construir plugins de espacio de trabajo (explorador de archivos, terminal, git, seguimiento de procesos) que resuelvan las rutas de espacios de trabajo desde el host y manejen directamente las operaciones a nivel de SO.
