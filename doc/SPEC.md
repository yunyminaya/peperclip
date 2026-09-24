# Especificación de Paperclip

Especificación objetivo para el plano de control de Paperclip. Documento vivo — actualizado de forma incremental durante las entrevistas de especificación.

---

## 1. Modelo de empresa [BORRADOR]

Una empresa es un objeto de primer orden. Una instancia de Paperclip ejecuta múltiples empresas. Una empresa no tiene un campo de «objetivo» independiente — su dirección está definida por su conjunto de iniciativas (ver Mapeo de jerarquía de tareas).

### Campos (Borrador)

| Campo       | Tipo          | Notas                             |
| ----------- | ------------- | --------------------------------- |
| `id`        | uuid          | Clave primaria                    |
| `name`      | string        | Nombre de la empresa              |
| `createdAt` | timestamp     |                                   |
| `updatedAt` | timestamp     |                                   |

### Gobernanza del tablero [BORRADOR]

Toda empresa tiene un **tablero** que gobierna las decisiones de alto impacto. El tablero es la capa de supervisión humana.

**V1: tablero humano único.** Un operador humano.

#### Puertas de aprobación del tablero (V1)

- Contrataciones de nuevos agentes (crear nuevos agentes)
- Desglose estratégico inicial del CEO (el CEO propone, el tablero aprueba antes de que empiece la ejecución)
- [TBD: otras acciones sujetas a gobernanza — cambios de objetivos, ¿despedir agentes?]

#### Poderes del tablero (siempre disponibles)

El tablero tiene **acceso irrestricto** a todo el sistema en todo momento:

- **Establecer y modificar presupuestos de la empresa** — el tablero fija presupuestos de costo de tokens/LLM de nivel superior
- **Pausar/reanudar cualquier agente** — detener el latido de un agente de inmediato
- **Pausar/reanudar cualquier elemento de trabajo** — pausar una tarea, proyecto, árbol de subtareas, hito. Los elementos pausados no son recogidos por los agentes.
- **Acceso total de gestión de proyectos** — crear, editar, comentar, modificar, eliminar, reasignar cualquier tarea/proyecto/hito desde la UI
- **Anular cualquier decisión de un agente** — reasignar tareas, cambiar prioridades, modificar descripciones
- **Cambiar manualmente cualquier presupuesto** en cualquier nivel

El tablero no es solo una puerta de aprobación — es una superficie de control en vivo. El humano puede intervenir en cualquier nivel en cualquier momento.

#### Delegación de presupuesto

El tablero fija presupuestos a nivel de empresa. El CEO puede fijar presupuestos para los agentes bajo su mando, y cada mánager puede hacer lo mismo con sus reportes. Cómo funciona en la práctica esta delegación de presupuesto en cascada está por definir (TBD), pero la estructura de permisos lo permite. El tablero puede anular manualmente cualquier presupuesto en cualquier nivel.

**Modelos de gobernanza futuros** (fuera de V1):

- Presupuestos de contratación (aprobar contrataciones automáticamente hasta $X/mes)
- Tableros multimiembro
- Autoridad delegada (el CEO puede contratar dentro de límites)

### Preguntas abiertas

- Seguimiento de ingresos/gastos externos — plugin futuro. El presupuesto de costos de tokens/LLM es central.
- ¿Ajustes y configuración a nivel de empresa?
- ¿Ciclo de vida de la empresa (pausar, archivar, eliminar)?
- ¿Qué acciones sujetas a gobernanza existen además de la contratación y la aprobación de la estrategia del CEO?

---

## 2. Modelo de agentes [BORRADOR]

Todo empleado es un agente. Los agentes son la fuerza de trabajo.

### Identidad del agente (a nivel de adaptador)

Conceptos como SOUL.md (identidad/misión) y HEARTBEAT.md (definición del ciclo) **no forman parte del protocolo Paperclip**. Son configuraciones específicas del adaptador. Por ejemplo, un adaptador de OpenClaw podría usar archivos SOUL.md y HEARTBEAT.md. Un adaptador de Claude Code podría usar CLAUDE.md. Un simple script de Python podría usar argumentos de línea de comandos.

Paperclip no prescribe cómo un agente define su identidad o su comportamiento. Provee el plano de control; el adaptador define el funcionamiento interno del agente.

### Configuración del agente [BORRADOR]

Cada agente tiene un **tipo de adaptador** y un **blob de configuración específico del adaptador**. El adaptador define qué campos de configuración existen.

#### Protocolo Paperclip (lo que Paperclip sabe)

A nivel de protocolo, Paperclip rastrea:

- Identidad del agente (id, name, role, title)
- Posición en la organización (a quién reporta, quién le reporta)
- Tipo de adaptador + configuración del adaptador
- Estado (active, paused, terminated)
- Datos de seguimiento de costos (si el agente los reporta)

#### Configuración del adaptador (específica del agente)

Cada tipo de adaptador define su propio esquema de configuración. Ejemplos:

- **Adaptador de OpenClaw**: contenido de SOUL.md, contenido de HEARTBEAT.md, ajustes específicos de OpenClaw
- **Adaptador de proceso**: comando a ejecutar, variables de entorno, directorio de trabajo
- **Adaptador HTTP**: URL del endpoint, encabezados de autenticación, plantilla del payload

#### Configuraciones de organización exportables

Un objetivo clave: **las configuraciones de agentes de toda la organización son exportables.** Se puede exportar la configuración completa de agentes de una empresa —cada agente, sus configuraciones de adaptador, la estructura de la organización— como un artefacto portable. Esto permite:

- Compartir plantillas de empresas («una organización de agencia de marketing prearmada»)
- Controlar por versiones la configuración de la empresa
- Duplicar/forkear empresas

#### Entrega de contexto

Configurable por agente. Dos extremos del espectro:

- **Payload completo** — Paperclip empaqueta el contexto relevante (tareas actuales, mensajes, estado de la empresa, métricas) en la invocación del latido. Adecuado para agentes simples/sin estado que no pueden llamar de vuelta a Paperclip.
- **Ping ligero** — El latido es solo una señal de despertar. El agente llama a la API de Paperclip para obtener el contexto que necesite. Adecuado para agentes sofisticados que gestionan su propio estado.

#### Contrato mínimo

El requisito mínimo para ser un agente de Paperclip: **que sea invocable.** Eso es todo. Paperclip puede invocarte mediante un comando o un webhook. No hay obligación de reportar de vuelta — Paperclip infiere el estado básico a partir de la vitalidad del proceso cuando puede.

#### Niveles de integración

Más allá del mínimo, Paperclip provee una integración progresivamente más rica:

1. **Invocable** (mínimo) — Paperclip puede iniciarte. Ese es el único contrato.
2. **Reporte de estado** — El agente reporta de vuelta éxito/falla/en curso después de la ejecución.
3. **Totalmente instrumentado** — El agente reporta estado, uso de costos/tokens, actualizaciones de tareas y registros. Integración bidireccional con el plano de control.

Paperclip incluye **agentes predeterminados** que demuestran la integración completa: seguimiento de progreso, instrumentación de costos y una **habilidad de Paperclip** (una habilidad de Claude Code para interactuar con la API de Paperclip) para la gestión de tareas. Sirven tanto como valores predeterminados útiles como implementaciones de referencia para los autores de adaptadores.

#### Formatos de exportación

Dos modos de exportación:

1. **Exportación de plantilla** (predeterminada) — solo estructura: definiciones de agentes, organigrama, configuraciones de adaptador, descripciones de roles. Opcionalmente incluye unas pocas tareas semilla para empezar. Esta es la plantilla para levantar una nueva empresa.
2. **Exportación de instantánea** — estado completo: estructura + tareas actuales, progreso, estado de los agentes. Una imagen completa que podrías restaurar o forkear.

El flujo de trabajo habitual: exportar una plantilla, crear una nueva empresa a partir de ella, agregar un par de tareas iniciales, listo.

---

## 3. Estructura de la organización [BORRADOR]

Estructura de reporte jerárquica. CEO en la cima, los reportes se propagan hacia abajo.

### Visibilidad de los agentes

**Visibilidad total en toda la organización.** Todo agente puede ver el organigrama completo, todas las tareas, todos los agentes. La estructura de la organización define **líneas de reporte y delegación**, no control de acceso.

Cada agente publica una descripción breve de sus responsabilidades y capacidades — casi como habilidades («cuándo soy relevante»). Esto permite a otros agentes descubrir quién puede ayudar con qué.

### Trabajo entre equipos

Los agentes pueden crear tareas y asignarlas a agentes fuera de su línea de reporte. Este es el mecanismo para la colaboración entre equipos. Estas reglas están codificadas principalmente en el SKILL.md de Paperclip, que se recomienda para todos los agentes. La aplicación Paperclip hace cumplir las herramientas y una gobernanza ligera, pero las reglas entre equipos siguientes son implementadas principalmente por decisiones de los agentes.

#### Reglas de aceptación de tareas

Cuando un agente recibe una tarea de fuera de su equipo:

1. **Está de acuerdo en que es apropiada + puede hacerla** → completarla directamente
2. **Está de acuerdo en que es apropiada + no puede hacerla** → marcarla como bloqueada
3. **Duda si vale la pena hacerla** → **no puede cancelarla por sí mismo.** Debe reasignarla a su propio mánager y explicar la situación. El mánager decide si aceptarla, reasignarla o escalarla.

#### Protocolo de escalado del mánager

Es responsabilidad de todo mánager entender por qué sus subordinados están bloqueados y resolverlo:

0. **Decidir** — como mánager, ¿vale la pena hacer este trabajo?
1. **Delegar hacia abajo** — pedir a alguien bajo su mando que ayude a desbloquear
2. **Escalar hacia arriba** — pedir ayuda al mánager superior

#### Seguimiento de la profundidad de la solicitud

Cuando una tarea se origina a partir de una solicitud entre equipos, registrar la **profundidad** como un entero — cuántos saltos de delegación hay desde el solicitante original. Esto da visibilidad de qué tan lejos se propaga el trabajo por la organización.

#### Códigos de facturación

Las tareas llevan un **código de facturación** para que el gasto de tokens durante la ejecución se pueda atribuir aguas arriba a la tarea/agente solicitante. Cuando el Agente A le pide al Agente B que haga un trabajo, el costo del trabajo de B se imputa a la solicitud de A. Esto permite la atribución de costos en toda la organización.

### Preguntas abiertas

- ¿Es un árbol estricto o los agentes pueden reportar a varios mánagers?
- ¿La estructura de la organización puede cambiar en tiempo de ejecución? (agentes reasignados, equipos reestructurados)
- ¿Los agentes heredan alguna configuración de su mánager?
- Formato del código de facturación — ¿cadena simple? ¿jerárquico?

---

## 4. Sistema de latidos [BORRADOR]

El latido es un protocolo, no un runtime. Paperclip define cómo iniciar el ciclo de un agente. Lo que el agente hace con ese ciclo — cuánto dura, si está limitado a una tarea o es continuo — depende totalmente del agente.

### Adaptadores de ejecución

La configuración del agente incluye un **adaptador** que define cómo Paperclip invoca al agente. Los adaptadores integrados incluyen:

| Adaptador | Mecanismo | Ejemplo |
| ---------------- | -------------------------- | -------------------------------------------------- |
| `process` | Ejecutar un proceso hijo | `python run_agent.py --agent-id {id}` |
| `http` | Enviar una solicitud HTTP | `POST https://openclaw.example.com/hook/{id}` |
| `claude_local` | Proceso local de Claude Code | worker de latido de Claude Code |
| `codex_local` | Proceso local de Codex | worker de latido de Codex CLI |
| `opencode_local` | Proceso local de OpenCode | worker de latido de OpenCode |
| `pi_local` | Proceso local de Pi | worker de latido de Pi CLI |
| `cursor` | Puente API/CLI de Cursor | worker de latido integrado con Cursor |
| `openclaw_gateway` | API de gateway de OpenClaw | Agente de OpenClaw gestionado vía gateway |
| `hermes_local` | Proceso local de Hermes | worker de latido del agente Hermes |

Los adaptadores `process` y `http` se incluyen como valores genéricos predeterminados. Otros adaptadores integrados cubren runtimes de codificación locales comunes (ver lista arriba), y se pueden registrar nuevos tipos de adaptadores mediante el sistema de plugins (ver Arquitectura de plugins/extensiones).

### Interfaz del adaptador

Cada adaptador implementa tres métodos:

```
invoke(agentConfig, context?) → void     // Start the agent's cycle
status(agentConfig) → AgentStatus        // Is it running? finished? errored?
cancel(agentConfig) → void               // Graceful stop signal (for pause/resume)
```

Este es el contrato completo del adaptador. `invoke` inicia el agente, `status` permite a Paperclip verificarlo, `cancel` habilita la funcionalidad de pausa del tablero. Todo lo demás (reporte de costos, actualizaciones de tareas) es opcional y fluye por la API REST de Paperclip.

### Qué controla Paperclip

- **Cuándo** disparar el latido (programación/frecuencia, por agente)
- **Cómo** dispararlo (selección del adaptador + configuración)
- **Qué contexto** incluir (ping ligero vs. payload completo, por agente)

### Qué NO controla Paperclip

- Cuánto dura la ejecución del agente
- Qué hace el agente durante su ciclo
- Si el agente está limitado a una tarea, a una ventana de tiempo o es continuo

### Comportamiento de pausa

Cuando el tablero (o el sistema) pausa un agente:

1. **Señalar la ejecución actual** — enviar una señal de terminación elegante al proceso/sesión en ejecución
2. **Periodo de gracia** — dar al agente tiempo para terminar, guardar el estado, reportar el estado final
3. **Terminación forzada tras el tiempo límite** — si el agente no se detiene dentro del periodo de gracia, terminarlo
4. **Detener futuros latidos** — no se dispararán nuevos ciclos de latido hasta que el agente se reanude

Esto es «señal elegante + detener futuros latidos». La ejecución actual tiene la oportunidad de aterrizar de forma limpia.

### Preguntas abiertas

- Frecuencia del latido — ¿quién la controla? ¿Fija? ¿Por agente? ¿Tipo cron?
- ¿Qué pasa cuando falla una invocación del latido? (el proceso falla, HTTP 500)
- Monitoreo de salud — ¿cómo distingue Paperclip «atascado» de «trabajando en una tarea larga»?
- ¿Pueden los agentes autodisparar su próximo latido? («Terminé, despiértame de nuevo en 5 min»)
- Duración del periodo de gracia — ¿fija? ¿configurable por agente?

---

## 5. Comunicación entre agentes [BORRADOR]

Toda la comunicación entre agentes fluye por el **sistema de tareas**.

### Modelo: tareas + comentarios

- **Delegación** = crear una tarea y asignarla a otro agente
- **Coordinación** = comentar en las tareas
- **Actualizaciones de estado** = actualizar el estado y los campos de la tarea

No hay un sistema separado de mensajería o chat. Las tareas son el canal de comunicación. Esto mantiene todo el contexto adjunto al trabajo al que se refiere y crea un rastro de auditoría natural.

### Implicaciones

- La «bandeja de entrada» de un agente es: las tareas que tiene asignadas + los comentarios en tareas en las que participa
- El CEO delega creando tareas asignadas al CTO
- El CTO las divide en subtareas asignadas a ingenieros
- La discusión ocurre en los comentarios de la tarea, no en un canal lateral
- Si un agente necesita escalar, comenta en la tarea padre o reasigna

### Mapeo de jerarquía de tareas

Jerarquía completa: **Iniciativa** (objetivo de la empresa) → Proyectos → Hitos → Issues → Sub-issues. Todo se remonta a una iniciativa, y el «objetivo de la empresa» es simplemente la primera/iniciativa principal.

---

## 6. Seguimiento de costos [BORRADOR]

El presupuesto de costos de tokens/LLM es una parte central de Paperclip. El seguimiento de ingresos y gastos externos es un plugin futuro.

### Reporte de costos

Los agentes totalmente instrumentados reportan el uso de tokens/API de vuelta a Paperclip. Los costos se rastrean en todos los niveles:

- **Por agente** — ¿cuánto cuesta este empleado?
- **Por tarea** — ¿cuánto costó esta unidad de trabajo?
- **Por proyecto** — ¿cuánto cuesta este entregable?
- **Por empresa** — tasa de consumo total

Los costos deben expresarse tanto en **tokens** como en **dólares**.

Los códigos de facturación en las tareas (ver Estructura de la organización) permiten la atribución de costos entre equipos — cuando el Agente A le solicita trabajo al Agente B, los costos de B se consolidan en la solicitud de A.

### Controles de presupuesto

Tres niveles:

1. **Visibilidad** — paneles que muestran el gasto en cada nivel (agente, tarea, proyecto, empresa)
2. **Alertas suaves** — umbrales configurables (p. ej., advertir al 80 % del presupuesto)
3. **Tope duro** — pausa automática del agente al alcanzar el presupuesto. El tablero es notificado. El tablero puede anular/elevar el límite.

Los presupuestos pueden configurarse como **ilimitados** (sin tope).

### Preguntas abiertas

- API de reporte de costos — ¿cuál es el esquema para que un agente reporte costos?
- Diseño del panel — ¿qué métricas son las más importantes en cada nivel?
- Periodo del presupuesto — ¿diario? ¿semanal? ¿mensual? ¿continuo?

---

## 7. Agentes predeterminados y flujo de arranque [BORRADOR]

### Secuencia de arranque

Cómo una empresa pasa de «creada» a «en ejecución»:

1. El humano crea una empresa y sus iniciativas iniciales
2. El humano define las tareas iniciales de nivel superior
3. El humano crea el agente CEO (usando la plantilla de CEO predeterminada o una personalizada)
4. Primer latido del CEO: revisa las iniciativas y las tareas, propone un desglose estratégico (estructura de la organización, subtareas, plan de contratación)
5. **El tablero aprueba** el plan estratégico del CEO
6. El CEO comienza la ejecución — creando tareas, proponiendo contrataciones (aprobadas por el tablero), delegando

### Agentes predeterminados

Paperclip incluye plantillas de agentes predeterminadas:

- **Agente predeterminado** — un ciclo básico de Claude Code o Codex. Conoce la **habilidad de Paperclip** (SKILL.md) para interactuar con el sistema de tareas, leer el contexto de la empresa, reportar el estado.
- **CEO predeterminado** — extiende al agente predeterminado con comportamiento específico de CEO: planificación estratégica, delegación a subordinados, revisión de progreso, comunicación con el tablero.

Son puntos de partida. Los usuarios pueden personalizarlos o reemplazarlos por completo.

### Comportamiento del agente predeterminado

El ciclo del agente predeterminado está **dirigido por la configuración**. La configuración del adaptador contiene las instrucciones que definen lo que el agente hace en cada ciclo de latido. No hay un ciclo estándar codificado — la configuración de cada agente determina su comportamiento.

Esto significa que la configuración predeterminada del CEO le dice al CEO que revise la estrategia, verifique los reportes, etc. La configuración predeterminada del ingeniero le dice al ingeniero que revise las tareas asignadas, elija la de mayor prioridad y la trabaje. Pero estas son decisiones de configuración, no requisitos del protocolo.

### Habilidad de Paperclip (SKILL.md)

Una definición de habilidad que enseña a los agentes a interactuar con Paperclip. Provee:

- CRUD de tareas (crear, leer, actualizar, completar tareas)
- Reporte de estado (registrarse, reportar progreso)
- Contexto de la empresa (leer objetivo, organigrama, estado actual)
- Reporte de costos (registrar uso de tokens/API)
- Reglas de comunicación entre agentes

Esta habilidad es independiente del adaptador — puede cargarse en Claude Code, inyectarse en prompts o usarse como documentación de API para agentes personalizados.

---

## 8. Arquitectura y despliegue [BORRADOR]

### Modelo de despliegue

**Monoinquilino, auto-alojable.** No es un SaaS. Una instancia = las empresas de un operador.

#### Ruta de desarrollo (despliegue progresivo)

1. **Dev local** — Un comando para instalar y ejecutar. Postgres embebido. Todo en tu máquina. Los agentes se ejecutan localmente.
2. **Alojado** — Desplegar en Vercel/Supabase/AWS/cualquiera. Los agentes remotos se conectan a tu servidor con una base de datos compartida. La UI es accesible vía web.
3. **Empresa abierta** — Opcionalmente hacer públicas algunas partes (p. ej., un tablón de empleos visible al público para empresas abiertas).

La restricción clave: debe ser trivial pasar de «lo estoy probando en mi máquina» a «mis agentes se ejecutan en servidores remotos hablando con mi instancia de Paperclip».

#### Autenticación de agentes

Cuando un usuario crea un agente, Paperclip genera una **cadena de conexión** que contiene: la URL del servidor, una API key e instrucciones para autenticarse. Se asume que el agente es capaz de deducir cómo llamar a la API con su token/key.

Flujo:

1. El humano crea un agente en la UI
2. Paperclip genera una cadena de conexión (URL + key + instrucciones)
3. El humano entrega esta cadena al agente (p. ej., en su configuración de adaptador, entorno, etc.)
4. El agente usa la key para autenticar las llamadas API al plano de control

### Stack tecnológico

| Capa          | Tecnología                                                   |
| ------------- | ------------------------------------------------------------ |
| Frontend      | React + Vite                                                 |
| Backend       | TypeScript + Express (API REST, no tRPC — se necesitan clientes no TS) |
| Base de datos | PostgreSQL (ver [doc/DATABASE.md](./doc/DATABASE.md) para detalles — PGlite embebido para dev, Docker o Supabase alojado para producción) |
| Autenticación | [Better Auth](https://www.better-auth.com/)                  |

### Modelo de concurrencia: checkout atómico de tareas

Las tareas usan **asignación única** (un agente por tarea) con **checkout atómico**:

1. El agente intenta poner una tarea en `in_progress` (reclamándola)
2. La API/base de datos lo hace cumplir de forma atómica — si otro agente ya la reclamó, la solicitud falla con un error que identifica qué agente la tiene
3. Si la tarea ya está asignada al agente solicitante desde una sesión anterior, puede reanudarla

No se necesita bloqueo optimista ni CRDT. El modelo de asignación única + checkout atómico previene conflictos a nivel de diseño.

### Humanos en el loop

Los agentes pueden crear tareas asignadas a humanos. El miembro del tablero (o cualquier humano con acceso) puede completar estas tareas desde la UI.

Cuando un humano completa una tarea, si el adaptador del agente solicitante soporta **pingbacks** (p. ej., hooks de OpenClaw), Paperclip envía una notificación para despertar a ese agente. Esto mantiene a los humanos como participantes raros pero posibles en el flujo de trabajo.

Se desalienta a los agentes de asignar tareas a humanos en el SKILL de Paperclip, pero a veces es inevitable.

### Diseño de la API

**API REST única y unificada.** La misma API sirve tanto a la UI frontend como a los agentes. La autenticación determina los permisos — la autenticación del tablero tiene acceso total, las API keys de los agentes tienen acceso limitado (sus propias tareas, reporte de costos, contexto de la empresa).

Sin «API de agentes» separada de «API del tablero». Mismos endpoints, distintos niveles de autorización.

### Artefactos de trabajo

Paperclip gestiona artefactos de trabajo vinculados a tareas: documentos de issues (planes en texto enriquecido, specs, notas adjuntas a issues) y archivos adjuntos. Los agentes los leen y escriben mediante la API como parte de la ejecución normal de tareas. La infraestructura de entrega completa (repositorios de código, despliegues, runtime de producción) sigue siendo dominio del agente — Paperclip orquesta el trabajo, no el pipeline de construcción.

### Preguntas abiertas

- Actualizaciones en tiempo real a la UI — ¿WebSocket? ¿SSE? ¿Polling?
- Alcance de las API keys de agentes — ¿a qué puede acceder exactamente un agente? ¿Solo a sus propias tareas? ¿A las de su equipo? ¿A toda la empresa?

### Recuperación ante fallas: manual, no automática

Cuando un agente falla o desaparece a mitad de una tarea, Paperclip **no** reasigna ni libera automáticamente la tarea. En su lugar:

- Paperclip expone tareas estancadas (tareas en `in_progress` sin actividad reciente) mediante paneles e informes
- Paperclip no falla en silencio — las herramientas de auditoría y visibilidad hacen los problemas evidentes
- La recuperación la manejan humanos o procesos emergentes (p. ej., un agente de gestión de proyectos cuyo trabajo es monitorear el trabajo estancado y exponerlo)

**Principio: Paperclip reporta problemas, no los arregla en silencio.** La recuperación automática oculta fallas. Una buena visibilidad permite que la entidad correcta (humano o agente) decida qué hacer.

### Arquitectura de plugins/extensiones

El sistema central de Paperclip debe ser extensible. Funcionalidades como bases de conocimiento, seguimiento de ingresos externos y nuevos adaptadores de agentes deben poder agregarse como **plugins** sin modificar el núcleo. Esto significa:

- Límites de API bien definidos a los que los plugins pueden engancharse
- Sistema de eventos o hooks para reaccionar a eventos del ciclo de vida de tareas/agentes
- **Plugins de adaptadores de agentes** — se pueden registrar nuevos tipos de adaptadores mediante el sistema de plugins
- Componentes de UI registrables por plugins (futuro)

El framework de plugins ya está publicado. Los plugins pueden registrar nuevos tipos de adaptadores, engancharse a eventos del ciclo de vida y contribuir componentes de UI (p. ej., botones globales de barra de herramientas). Un SDK de plugins y comandos CLI (`paperclipai plugin`) están disponibles para crear e instalar plugins.

---

## 9. Frontend / UI [BORRADOR]

### Vistas principales

Cada una es una página/ruta distinta:

1. **Organigrama** — el árbol de la organización con indicadores de estado en vivo (running/idle/paused/error) por agente. Feed de actividad en tiempo real de lo que hacen los agentes.
2. **Tablón de tareas** — Gestión de tareas. Vistas de Kanban y lista. Filtrar por equipo, agente, proyecto, estado.
3. **Panel** — métricas de alto nivel: conteo de agentes, tareas activas, costos, progreso de objetivos, tasa de consumo. La vista rápida de GOAL.md.
4. **Detalle del agente** — profundización en un solo agente: sus tareas, actividad, costos, configuración, historial de estado.
5. **Vistas de proyectos/iniciativas** — seguimiento del progreso contra hitos y objetivos.
6. **Panel de costos** — visualización del gasto en cada nivel (agente, tarea, proyecto, empresa).

### Controles del tablero (disponibles en todas partes)

- Pausar/reanudar agentes (cualquier vista)
- Pausar/reanudar tareas/proyectos (cualquier vista)
- Aprobar/rechazar acciones pendientes (contrataciones, propuestas de estrategia)
- Creación, edición y comentarios directos de tareas

---

## 10. Alcance de V1 (MVP) [BORRADOR]

**Ciclo completo con un adaptador.** V1 debe demostrar el ciclo completo de Paperclip de extremo a extremo, aunque sea estrecho.

### Imprescindible (V1)

- [ ] **CRUD de empresas** — crear una empresa con iniciativas
- [ ] **CRUD de agentes** — crear/editar/pausar/reanudar agentes con configuración de adaptador
- [ ] **Organigrama** — definir la estructura de reporte, visualizarla
- [ ] **Adaptador de proceso** — invoke(), status(), cancel() para procesos hijos locales
- [ ] **Gestión de tareas** — ciclo de vida completo con jerarquía (las tareas se remontan al objetivo de la empresa)
- [ ] **Checkout atómico de tareas** — asignación única, bloqueo de `in_progress`
- [ ] **Gobernanza del tablero** — el humano aprueba contrataciones, pausa agentes, establece presupuestos, acceso total de gestión de proyectos
- [ ] **Seguimiento de costos** — los agentes reportan uso de tokens, visibilidad por agente/tarea/empresa
- [ ] **Controles de presupuesto** — alertas suaves + tope duro con pausa automática
- [ ] **Agente predeterminado** — ciclo básico de Claude Code/Codex con la habilidad de Paperclip
- [ ] **CEO predeterminado** — planificación estratégica, delegación, comunicación con el tablero
- [ ] **Habilidad de Paperclip (SKILL.md)** — enseña a los agentes a interactuar con la API
- [ ] **API REST** — API completa para interacción de agentes (Express)
- [ ] **UI web** — React/Vite: organigrama, tablón de tareas, panel, vistas de costos
- [ ] **Autenticación de agentes** — generación de cadena de conexión con URL + key + instrucciones
- [ ] **Configuración de dev con un solo comando** — PGlite embebido, todo local
- [ ] **Múltiples tipos de adaptadores** (HTTP, gateway de OpenClaw y adaptadores de codificación locales)

### Fuera de V1

- Base de conocimiento — un plugin futuro
- Modelos avanzados de gobernanza (presupuestos de contratación, tableros multimiembro)
- Seguimiento de ingresos/gastos más allá de costos de tokens — un plugin futuro
- Tablón de empleos público / funcionalidades de empresa abierta

---

## 11. Base de conocimiento

**Anti-objetivo para el núcleo.** La base de conocimiento no es parte del núcleo de Paperclip — será un plugin. El sistema de tareas + comentarios + descripciones de agentes proveen suficiente contexto compartido.

La arquitectura debe soportar agregar un plugin de base de conocimiento más adelante (límites de API limpios, eventos del ciclo de vida enganchables), pero el sistema central explícitamente no incluye una.

---

## 12. Anti-requisitos

Cosas que Paperclip explícitamente **no** hace:

- **No es un runtime de agentes** — Paperclip orquesta, los agentes se ejecutan en otro lugar
- **No es una base de conocimiento** — el núcleo no tiene wiki/docs/DB vectorial (territorio de plugins)
- **No es un SaaS** — monoinquilino, auto-alojado
- **No opina sobre la implementación de agentes** — cualquier lenguaje, cualquier framework, cualquier runtime
- **No se auto-repara automáticamente** — expone problemas, no los arregla en silencio
- **No gestiona infraestructura de entrega** — sin gestión de repos, sin despliegue, sin sistemas de archivos (pero sí gestiona documentos y adjuntos vinculados a tareas)
- **No reasigna trabajo automáticamente** — las tareas estancadas se exponen, no se redistribuyen en silencio
- **No rastrea ingresos/gastos externos** — eso es un plugin futuro. El presupuesto de costos de tokens/LLM es central.

---

## 13. Principios (consolidados)

1. **No opina sobre cómo ejecutas tus agentes.** Cualquier lenguaje, cualquier framework, cualquier runtime. Paperclip es el plano de control, no el plano de ejecución.
2. **La empresa es la unidad de organización.** Todo vive bajo una empresa.
3. **Las tareas son el canal de comunicación.** Toda la comunicación entre agentes fluye por tareas + comentarios. Sin canales laterales.
4. **Todo el trabajo se remonta al objetivo.** Gestión jerárquica de tareas — nada existe de forma aislada.
5. **El tablero gobierna.** Los humanos retienen el control a través del tablero. Valores predeterminados conservadores (aprobación humana requerida).
6. **Expone problemas, no los ocultes.** Buena auditoría y visibilidad. Sin auto-recuperación silenciosa.
7. **Propiedad atómica.** Un solo asignado por tarea. El checkout atómico previene conflictos.
8. **Despliegue progresivo.** Trivial empezar en local, sencillo escalar a alojado.
9. **Núcleo extensible.** Límites limpios para que los plugins agreguen capacidades (adaptadores, base de conocimiento, seguimiento de ingresos) sin modificar el núcleo.
