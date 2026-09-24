---
name: company-creator
description: >
  Create agent company packages conforming to the Agent Companies specification
  (agentcompanies/v1). Use when a user wants to create a new agent company from
  scratch, build a company around an existing git repo or skills collection, or
  scaffold a team/department of agents. Triggers on: "create a company", "make me
  a company", "build a company from this repo", "set up an agent company",
  "create a team of agents", "hire some agents", or when given a repo URL and
  asked to turn it into a company. Do NOT use for importing an existing company
  package (use the CLI import command instead) or for modifying a company that
  is already running in Paperclip.
---

# Creador de empresas

Crea paquetes de empresas de agentes que cumplan con la especificación Agent Companies.

Referencias de la especificación:

- Especificación normativa: `docs/companies/companies-spec.md` (lee esto antes de generar archivos)
- Especificación web: https://agentcompanies.io/specification
- Sitio del protocolo: https://agentcompanies.io/

## Dos modos

### Modo 1: empresa desde cero

El usuario describe lo que quiere. Entrevístalo para concretar la visión y luego genera el paquete.

### Modo 2: empresa a partir de un repositorio

El usuario proporciona una URL de repositorio git, una ruta local o un tuit. Analiza el repositorio y luego crea una empresa que lo envuelva.

Consulta [references/from-repo-guide.md](references/from-repo-guide.md) para ver los pasos detallados del análisis del repositorio.

## Proceso

### Paso 1: reunir contexto

Determina qué modo aplica:

- **Desde cero**: ¿Qué tipo de empresa o equipo? ¿Qué dominio? ¿Qué deben hacer los agentes?
- **Desde un repositorio**: clona/lee el repositorio. Busca habilidades existentes, configuraciones de agentes, README y estructura del código fuente.

### Paso 2: entrevista (usa AskUserQuestion)

No te saltes este paso. Usa AskUserQuestion para alinearte con el usuario antes de escribir archivos.

**Para empresas desde cero**, pregunta sobre:

- Propósito y dominio de la empresa (1-2 oraciones está bien)
- Qué agentes necesitan: propón un plan de contratación basado en lo que describieron
- Si es una empresa completa (necesita un CEO) o un equipo/departamento (no necesita CEO)
- Habilidades específicas que deben tener los agentes
- Cómo fluye el trabajo por la organización (ver "Flujo de trabajo" abajo)
- Si quieren proyectos y tareas iniciales

**Para empresas desde un repositorio**, presenta tu análisis y pregunta:

- Confirma los agentes que planeas crear y sus roles
- Si referenciar o incluir (vendored) las habilidades descubiertas (predeterminado: referenciar)
- Agentes o habilidades adicionales más allá de lo que proporciona el repositorio
- Nombre de la empresa y cualquier personalización
- Confirma el flujo de trabajo que inferiste del repositorio (ver "Flujo de trabajo" abajo)

**Flujo de trabajo: ¿cómo se mueve el trabajo por esta empresa?**

Una empresa no es solo una lista de agentes con habilidades. Es una organización que toma ideas y las convierte en productos de trabajo. Necesitas entender el flujo de trabajo para que cada agente sepa:

- Quién les da trabajo y en qué forma (una tarea, una rama, una pregunta, una solicitud de revisión)
- Qué hacen con eso
- A quién le entregan el trabajo cuando terminan y cómo es esa entrega
- Qué significa "terminado" para su rol

**No toda empresa es un pipeline.** Infiere el patrón de flujo de trabajo adecuado a partir del contexto:

- **Pipeline** — etapas secuenciales, cada agente entrega al siguiente. Úsalo cuando el repositorio/dominio tiene un proceso lineal claro (p. ej., plan → construcción → revisión → publicación → QA, o ideación de contenido → borrador → edición → publicación).
- **Hub-and-spoke** — un gerente delega a especialistas que reportan de forma independiente. Úsalo cuando los agentes hacen distintos tipos de trabajo que no se alimentan entre sí (p. ej., un CEO que asigna trabajo a un investigador, un especialista de marketing y un analista).
- **Colaborativo** — los agentes trabajan juntos en lo mismo como pares. Úsalo para equipos pequeños donde todos contribuyen al mismo resultado (p. ej., un estudio de diseño, un equipo de lluvia de ideas).
- **Bajo demanda** — los agentes se convocan según se necesitan, sin un flujo fijo. Úsalo cuando los agentes son más como una caja de herramientas de especialistas que el usuario llama directamente.

Para empresas desde cero, propón un patrón de flujo de trabajo basado en lo que describieron y pregunta si encaja.

Para empresas desde un repositorio, infiere el patrón a partir de la estructura del repositorio. Si las habilidades tienen una dependencia secuencial clara (como `plan-ceo-review → plan-eng-review → review → ship → qa`), eso es un pipeline. Si las habilidades son capacidades independientes, es más probable que sea hub-and-spoke o bajo demanda. Expresa tu inferencia en la entrevista para que el usuario la confirme o la ajuste.

**Principios clave de la entrevista:**

- Propón un plan de contratación concreto. No hagas preguntas abiertas como "¿qué agentes quieres?": sugiere agentes específicos según el contexto y deja que el usuario los ajuste.
- Manténlo ligero. La mayoría de los usuarios son nuevos en las empresas de agentes. Unos pocos agentes (3-5) es lo típico para una startup. No sugieras 10 o más agentes a menos que el alcance lo exija.
- Las empresas desde cero deben empezar con un CEO que dirija a todos. Los equipos/departamentos no necesitan uno.
- Haz 2-3 preguntas enfocadas por ronda, no 10.

### Paso 3: lee la especificación

Antes de generar archivos, lee la especificación normativa:

```
docs/companies/companies-spec.md
```

Lee también la referencia rápida: [references/companies-spec.md](references/companies-spec.md)

Y el ejemplo: [references/example-company.md](references/example-company.md)

### Paso 4: genera el paquete

Crea la estructura de directorios y todos los archivos. Sigue las convenciones de la especificación al pie de la letra.

**Estructura de directorios:**

```
<company-slug>/
├── COMPANY.md
├── agents/
│   └── <slug>/AGENTS.md
├── teams/
│   └── <slug>/TEAM.md        (if teams are needed)
├── projects/
│   └── <slug>/PROJECT.md     (if projects are needed)
├── tasks/
│   └── <slug>/TASK.md        (if tasks are needed)
├── skills/
│   └── <slug>/SKILL.md       (if custom skills are needed)
└── .paperclip.yaml            (Paperclip vendor extension)
```

**Reglas:**

- Los slugs deben ser aptos para URL, en minúsculas y con guiones
- COMPANY.md lleva `schema: agentcompanies/v1`; los demás archivos lo heredan
- Las instrucciones del agente van en el cuerpo de AGENTS.md, no en .paperclip.yaml
- Las habilidades referenciadas por nombre corto en AGENTS.md se resuelven a `skills/<shortname>/SKILL.md`
- Para habilidades externas, usa `sources` con `usage: referenced` (ver sección 12 de la especificación)
- No exportes secretos, rutas locales de la máquina ni IDs de base de datos
- Omite campos vacíos o con valores predeterminados
- Para empresas generadas desde un repositorio, agrega un pie de página de referencias al final del cuerpo de COMPANY.md:
  `Generated from [repo-name](repo-url) with the company-creator skill from [Paperclip](https://github.com/paperclipai/paperclip)`

**Estructura de reporte:**

- Todo agente excepto el CEO debe tener `reportsTo` configurado con el slug de su gerente
- El CEO tiene `reportsTo: null`
- Para equipos sin CEO, el agente de nivel superior tiene `reportsTo: null`

**Escribir instrucciones de agente conscientes del flujo de trabajo:**

Cada cuerpo de AGENTS.md debe incluir no solo lo que hace el agente, sino cómo encaja en el flujo de trabajo de la organización. Incluye:

1. **De dónde viene el trabajo** — "Recibes ideas de funciones del usuario" o "Tomas las tareas que te asigna el CTO"
2. **Lo que produces** — "Produces un plan técnico con diagramas de arquitectura" o "Produces una rama revisada y aprobada, lista para publicar"
3. **A quién entregas** — "Cuando tu plan esté cerrado, entrégalo al Staff Engineer para su implementación" o "Cuando la revisión se apruebe, entrégalo al Release Engineer para publicarlo"
4. **Qué te activa** — "Te activas cuando una nueva idea de función necesita pensamiento a nivel de producto" o "Te activas cuando una rama está lista para la revisión previa al landing"

Esto convierte una colección de agentes en una organización que realmente trabaja en conjunto. Sin contexto del flujo de trabajo, los agentes operan de forma aislada: hacen su trabajo pero no saben qué pasa antes o después de ellos.

### Paso 5: confirma la ubicación de salida

Pregunta al usuario dónde escribir el paquete. Opciones comunes:

- Un subdirectorio en el repositorio actual
- Un directorio nuevo que especifique el usuario
- El directorio actual (si está vacío o lo confirma)

### Paso 6: escribe README.md y LICENSE

**README.md** — todo paquete de empresa lleva un README. Debe ser una introducción agradable y legible que alguien que navegue por GitHub apreciaría. Incluye:

- Nombre de la empresa y qué hace
- El flujo de trabajo / cómo opera la empresa
- Organigrama como lista o tabla Markdown que muestre agentes, títulos, estructura de reporte y habilidades
- Descripción breve del rol de cada agente
- Citas y referencias: enlace al repositorio fuente (si es desde un repositorio), enlace a la especificación de Agent Companies (https://agentcompanies.io/specification) y enlace a Paperclip (https://github.com/paperclipai/paperclip)
- Una sección "Inicio rápido" que explique cómo importar: `paperclipai company import --from <path>`

**LICENSE** — incluye un archivo LICENSE. El titular del copyright es el usuario que crea la empresa, no el autor del repositorio original (él hizo las habilidades; el usuario está haciendo la empresa). Usa el mismo tipo de licencia que el repositorio fuente (si es desde un repositorio) o pregunta al usuario (si es desde cero). Por defecto, MIT si no está claro.

### Paso 7: escribe los archivos y resume

Escribe todos los archivos y luego da un resumen breve:

- Nombre de la empresa y qué hace
- Lista de agentes con roles y estructura de reporte
- Habilidades (personalizadas + referenciadas)
- Proyectos y tareas, si hay
- La ruta de salida

## Lineamientos de .paperclip.yaml

El archivo `.paperclip.yaml` es la extensión de proveedor (vendor) de Paperclip. Configura adaptadores y entradas de entorno por agente.

### Reglas de adaptadores

**No especifiques un adaptador a menos que el repositorio o el contexto del usuario lo justifiquen.** Si no sabes qué adaptador quiere el usuario, omite el bloque de adaptador por completo: Paperclip usará su valor predeterminado. Especificar un tipo de adaptador desconocido causa un error de importación.

Tipos de adaptador admitidos por Paperclip (estos son los ÚNICOS valores válidos):
- `claude_local` — Claude Code CLI
- `codex_local` — Codex CLI
- `opencode_local` — OpenCode CLI
- `pi_local` — Pi CLI
- `cursor` — Cursor
- `gemini_local` — Gemini CLI
- `openclaw_gateway` — OpenClaw gateway

Configura un adaptador solo cuando:
- El repositorio o sus habilidades apuntan claramente a un runtime específico (p. ej., gstack está construido para Claude Code, por lo que `claude_local` es apropiado)
- El usuario solicita explícitamente un adaptador específico
- El rol del agente requiere una capacidad específica del runtime

### Reglas de entradas de entorno

**No agregues variables de entorno de relleno.** Agrega solo las entradas de entorno que el agente realmente necesite según sus habilidades o su rol:
- `GH_TOKEN` para agentes que suben código, crean PRs o interactúan con GitHub
- Claves de API solo cuando una habilidad las requiera explícitamente
- Nunca configures `ANTHROPIC_API_KEY` como variable de entorno vacía predeterminada: el runtime se encarga de eso

Ejemplo con adaptador (solo cuando esté justificado):
```yaml
schema: paperclip/v1
agents:
  release-engineer:
    adapter:
      type: claude_local
      config:
        model: claude-sonnet-4-6
    inputs:
      env:
        GH_TOKEN:
          kind: secret
          requirement: optional
```

Ejemplo — solo aparecen los agentes con anulaciones reales:
```yaml
schema: paperclip/v1
agents:
  release-engineer:
    inputs:
      env:
        GH_TOKEN:
          kind: secret
          requirement: optional
```

En este ejemplo, solo aparece `release-engineer` porque necesita `GH_TOKEN`. Los demás agentes (ceo, cto, etc.) no tienen anulaciones, así que se omiten por completo de `.paperclip.yaml`.

## Referencias externas de habilidades

Al referenciar habilidades desde un repositorio de GitHub, usa siempre el patrón de referencias:

```yaml
metadata:
  sources:
    - kind: github-file
      repo: owner/repo
      path: path/to/SKILL.md
      commit: <full SHA from git ls-remote or the repo>
      attribution: Owner or Org Name
      license: <from the repo's LICENSE>
      usage: referenced
```

Obtén el SHA del commit con:

```bash
git ls-remote https://github.com/owner/repo HEAD
```

NO copies el contenido de habilidades externas en el paquete a menos que el usuario lo pida explícitamente.
