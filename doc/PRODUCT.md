# Paperclip — Definición de producto

## Qué es

Paperclip es el plano de control para empresas de IA autónomas. Una instancia de Paperclip puede operar varias empresas. Una **empresa** es un objeto de primer orden.

## Conceptos centrales

### Empresa

Una empresa tiene:

- Un **objetivo** — la razón de su existencia ("Crear la app #1 de notas con IA que haga $1M de MRR en 3 meses")
- **Empleados** — cada empleado es un agente de IA
- **Estructura de org** — quién reporta a quién
- **Ingresos y gastos** — seguidos a nivel de empresa
- **Jerarquía de tareas** — todo el trabajo se remonta al objetivo de la empresa

### Empleados y agentes

Cada empleado es un agente. Cuando creas una empresa, empiezas definiendo al CEO, y luego construyes desde ahí.

Cada empleado tiene:

- **Tipo de adaptador + configuración** — cómo se ejecuta este agente y qué define su identidad/comportamiento. Esto es específico del adaptador (p. ej., un agente OpenClaw podría usar archivos SOUL.md y HEARTBEAT.md; un agente Claude Code podría usar CLAUDE.md; un script simple podría usar argumentos de CLI). Paperclip no prescribe el formato — el adaptador lo hace.
- **Rol y reporte** — su título, a quién reporta, quién le reporta
- **Descripción de capacidades** — un párrafo corto sobre lo que hace este agente y cuándo es relevante (ayuda a otros agentes a descubrir quién puede ayudar con qué)

Ejemplo: la configuración de adaptador de un agente CEO le dice "revisa lo que están haciendo tus ejecutivos, verifica las métricas de la empresa, reprioriza si es necesario, asigna nuevas iniciativas estratégicas" en cada latido. La configuración de un ingeniero le dice "revisa las tareas asignadas, elige la de mayor prioridad y trabájala".

Luego defines quién reporta al CEO: un CTO gestionando programadores, un CMO gestionando el equipo de marketing, y así sucesivamente. Cada agente en el árbol recibe su propia configuración de adaptador.

### Ejecución de agentes

Hay dos modos fundamentales para ejecutar el latido de un agente:

1. **Ejecutar un comando** — Paperclip lanza un proceso (comando shell, script Python, etc.) y lo monitorea. El latido es "ejecuta esto y monitorea".
2. **Disparar y olvidar una solicitud** — Paperclip envía un webhook/llamada API a un agente que se ejecuta externamente. El latido es "notifica a este agente para que despierte". (Los hooks de OpenClaw funcionan así).

Proveemos valores por defecto sensatos — un agente por defecto que llama a Claude Code o Codex con tu configuración, recuerda IDs de sesión, ejecuta scripts básicos. Pero puedes conectar cualquier cosa.

### Gestión de tareas

La gestión de tareas es jerárquica. En cualquier momento, cada pieza de trabajo debe remontarse al objetivo de nivel superior de la empresa a través de una cadena de tareas padre:

```
Estoy investigando los anuncios de Facebook que usa Granola (tarea actual)
  porque → Necesito crear anuncios de Facebook para nuestro software (padre)
    porque → Necesito aumentar nuevos registros en 100 usuarios (padre)
      porque → Necesito llevar los ingresos a $2,000 esta semana (padre)
        porque → ...
          porque → Estamos construyendo la app #1 de notas con IA hasta $1M de MRR en 3 meses
```

Las tareas tienen ascendencia. Cada tarea existe al servicio de una tarea padre, hasta llegar al objetivo de la empresa. Esto es lo que mantiene alineados a los agentes autónomos — siempre pueden responder "¿por qué estoy haciendo esto?"

Estructura de tareas más detallada por definir (TBD).

## Principios

1. **Sin opiniones sobre cómo ejecutas tus agentes.** Tus agentes podrían ser bots OpenClaw, scripts Python, scripts Node, sesiones Claude Code, instancias Codex — no nos importa. Paperclip define el plano de control para la comunicación y provee infraestructura utilitaria para latidos. No impone un runtime de agentes.

2. **La empresa es la unidad de organización.** Todo vive bajo una empresa. Una instancia de Paperclip, muchas empresas.

3. **La configuración del adaptador define al agente.** Cada agente tiene un tipo de adaptador y una configuración que controla su identidad y comportamiento. El contrato mínimo es solo "ser invocable".

4. **Todo el trabajo se remonta al objetivo.** La gestión jerárquica de tareas significa que nada existe aislado. Si no puedes explicar por qué una tarea importa para el objetivo de la empresa, no debería existir.

5. **Plano de control, no plano de ejecución.** Paperclip orquesta. Los agentes se ejecutan donde se ejecuten y llaman a casa.

## Flujo de usuario (escenario ideal)

1. Abre Paperclip, crea una nueva empresa
2. Define el objetivo de la empresa: "Crear la app #1 de notas con IA, $1M de MRR en 3 meses"
3. Crea al CEO
   - Elige un adaptador (p. ej., adaptador de proceso para Claude Code, adaptador HTTP para OpenClaw)
   - Configura el adaptador (identidad del agente, comportamiento del bucle, ajustes de ejecución)
   - El CEO propone el desglose estratégico → el tablero aprueba
4. Define los reportes del CEO: CTO, CMO, CFO, etc.
   - Cada uno recibe su propia configuración de adaptador y definición de rol
5. Define sus reportes: ingenieros bajo el CTO, marketers bajo el CMO, etc.
6. Define presupuestos, define tareas estratégicas iniciales
7. Ponlo en marcha — los agentes inician sus latidos y la empresa opera

## Guías

Hay dos modos de runtime que Paperclip debe soportar:

- `local_trusted` (por defecto): despliegue local confiable de un solo usuario sin fricción de login
- `authenticated`: modo que requiere login y soporta políticas de exposición en red privada y pública

El diseño canónico de modos y las expectativas de comandos viven en `doc/DEPLOYMENT-MODES.md`.

## Más detalle

Consulta [SPEC.md](./SPEC.md) para la especificación técnica completa y [TASKS.md](./TASKS.md) para el modelo de datos de gestión de tareas.

---

La identidad central de Paperclip es un **plano de control para empresas de IA autónomas**, centrado en **empresas, organigramas, objetivos, issues/comentarios, latidos, presupuestos, aprobaciones y gobernanza del tablero**. Los documentos públicos también son explícitos sobre los límites actuales: **las tareas/comentarios son el modelo de comunicación integrado**, Paperclip **no es un chatbot** y **no es una herramienta de revisión de código**. El roadmap ya apunta hacia **incorporación más fácil, agentes en la nube, configuración de agentes más fácil, plugins, mejores documentos y empresas/plantillas reutilizables estilo ClipMart/ClipHub**.

## Qué debería hacer Paperclip vs. qué no

**Sí**

- Mantente a **nivel del tablero y nivel de empresa**. Los usuarios deben gestionar objetivos, orgs, presupuestos, aprobaciones y resultados.
- Haz que los primeros cinco minutos se sientan mágicos: instala, responde unas preguntas, ve a un CEO hacer algo real.
- Mantén el trabajo anclado a **issues/comentarios/proyectos/objetivos**, incluso si la superficie se siente conversacional.
- Trata **agencia / equipo interno / startup** como la misma abstracción subyacente con distintas plantillas y etiquetas.
- Haz que los resultados sean de primera clase: archivos, documentos, reportes, vistas previas, enlaces, capturas de pantalla.
- Provee **hooks hacia flujos de trabajo de ingeniería**: worktrees, servidores de vista previa, enlaces de PR, herramientas externas de revisión.
- Usa **plugins** para casos límite como chat enriquecido, bases de conocimiento, editores de documentos, trazado personalizado.

**No**

- No hagas del producto central una app de chat general. La definición actual del producto es explícitamente centrada en tareas/comentarios y "no es un chatbot", y ese límite es valioso.
- No construyas un reemplazo completo de Jira/GitHub. El repo/documentos ya posicionan a Paperclip como orquestación de organizaciones, no enfocado en revisión de pull requests.
- No construyas primero RBAC de nivel empresarial. La especificación actual de V1 aún trata la gobernanza multi-tablero y los permisos humanos granulares como fuera de alcance, así que la primera versión multiusuario debe ser gruesa y con alcance de empresa.
- No lideres con logs bash crudos y transcripciones. La vista por defecto debe ser intención/progreso legible por humanos, con el detalle crudo debajo.
- No obligues a los usuarios a entender el plomería de proveedores/API keys a menos que sea absolutamente necesario. Ya hay issues activos de incorporación/autenticación; la fricción aquí es claramente real.

## Objetivos de diseño específicos

1. **Tiempo hasta el primer éxito menor a 5 minutos**
   Un usuario nuevo debe pasar de instalar a "mi CEO completó una primera tarea" en una sesión.

2. **La abstracción a nivel del tablero siempre gana**
   La UI por defecto debe responder: qué está haciendo la empresa, quién lo está haciendo, por qué importa, cuánto costó y qué necesita mi aprobación.

3. **La conversación permanece adjunta a objetos de trabajo**
   "Chatear con el CEO" debe resolverse igual en hilos de estrategia, decisiones, tareas o aprobaciones.

4. **Divulgación progresiva**
   Capa superior: resumen legible por humanos. Capa intermedia: checklist/pasos/artefactos. Capa inferior: logs crudos/llamadas a herramientas/transcripción.

5. **Resultados primero**
   El trabajo no está terminado hasta que el usuario pueda ver el resultado: archivo, documento, enlace de vista previa, captura de pantalla, plan o PR.

6. **Local primero, listo para la nube**
   El modelo mental no debe cambiar entre uso local en solitario y despliegue compartido/privado o público/en la nube.

7. **Autonomía segura**
   El modo auto está permitido; la quema oculta de tokens no.

8. **Núcleo delgado, bordes ricos**
   Pon el chat opcional, el conocimiento y las superficies especiales en plugins/extensiones en lugar de inflar el plano de control.
