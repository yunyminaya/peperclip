# Especificación de empresas de agentes

Extensión de la especificación de Agent Skills

Versión: `agentcompanies/v1-draft`

## 1. Propósito

Un paquete de empresa de agentes es un formato nativo del sistema de archivos y de GitHub para describir una empresa, equipo, agente, proyecto, tarea y las habilidades asociadas usando archivos markdown con frontmatter YAML.

Esta especificación es una extensión de la especificación de Agent Skills, no un reemplazo de ella.

Define cómo la estructura de paquetes a nivel de empresa, equipo y agente se compone alrededor del modelo existente de `SKILL.md`.

Esta especificación es neutral respecto a proveedores. Está pensada para ser utilizable por cualquier runtime de empresas de agentes, no solo por Paperclip.

El formato está diseñado para:

- ser legible y escribible por humanos
- funcionar directamente desde una carpeta local o un repositorio de GitHub
- no requerir un registro central
- soportar atribución y referencias fijadas a archivos upstream
- extender el ecosistema existente de Agent Skills sin redefinirlo
- ser útil fuera de Paperclip

## 2. Principios fundamentales

1. Markdown es canónico.
2. Los repositorios Git son contenedores de paquetes válidos.
3. Los registros son capas opcionales de descubrimiento, no autoridades.
4. `SKILL.md` sigue siendo propiedad de la especificación de Agent Skills.
5. Las referencias externas deben poder fijarse a commits Git inmutables.
6. Los metadatos de atribución y licencia deben sobrevivir a la importación/exportación.
7. Los slugs y las rutas relativas son la capa de identidad portable, no los ids de la base de datos.
8. La estructura de carpetas convencional debería funcionar sin cableado verboso.
9. La fidelidad específica de cada proveedor pertenece a extensiones opcionales, no al paquete base.

## 3. Tipos de paquete

La raíz de un paquete se identifica por un archivo markdown principal:

- `COMPANY.md` para un paquete de empresa
- `TEAM.md` para un paquete de equipo
- `AGENTS.md` para un paquete de agente
- `PROJECT.md` para un paquete de proyecto
- `TASK.md` para un paquete de tarea
- `SKILL.md` para un paquete de habilidad definido por la especificación de Agent Skills

Un repositorio de GitHub puede contener un paquete en la raíz o muchos paquetes en subdirectorios.

## 4. Archivos y directorios reservados

Convenciones comunes:

```text
COMPANY.md
TEAM.md
AGENTS.md
PROJECT.md
TASK.md
SKILL.md

agents/<slug>/AGENTS.md
teams/<slug>/TEAM.md
projects/<slug>/PROJECT.md
projects/<slug>/tasks/<slug>/TASK.md
tasks/<slug>/TASK.md
skills/<slug>/SKILL.md
.paperclip.yaml

HEARTBEAT.md
SOUL.md
TOOLS.md
README.md
assets/
scripts/
references/
```

Reglas:

- solo los archivos markdown son documentos de contenido canónicos
- se permiten directorios no markdown como `assets/`, `scripts/` y `references/`
- las herramientas de paquetes pueden generar archivos lock opcionales, pero los archivos lock no son necesarios para la autoría

## 5. Frontmatter común

Los documentos de paquete pueden soportar estos campos:

```yaml
schema: agentcompanies/v1
kind: company | team | agent | project | task
slug: my-slug
name: Human Readable Name
description: Short description
version: 0.1.0
license: MIT
authors:
  - name: Jane Doe
homepage: https://example.com
tags:
  - startup
  - engineering
metadata: {}
sources: []
```

Notas:

- `schema` es opcional y normalmente solo debería aparecer en la raíz del paquete
- `kind` es opcional cuando la ruta y el nombre del archivo ya hacen obvio el tipo
- `slug` debería ser seguro para URLs y estable
- `sources` es para procedencia y referencias externas
- `metadata` es para extensiones específicas de cada herramienta
- los exportadores deberían omitir campos vacíos o con valores por defecto

## 6. COMPANY.md

`COMPANY.md` es el punto de entrada raíz de un paquete de empresa completo.

### Campos requeridos

```yaml
name: Lean Dev Shop
description: Small engineering-focused AI company
slug: lean-dev-shop
schema: agentcompanies/v1
```

### Campos recomendados

```yaml
version: 1.0.0
license: MIT
authors:
  - name: Example Org
goals:
  - Build and ship software products
includes:
  - https://github.com/example/shared-company-parts/blob/0123456789abcdef0123456789abcdef01234567/teams/engineering/TEAM.md
requirements:
  secrets:
    - OPENAI_API_KEY
```

### Semántica

- `includes` define el grafo del paquete
- el contenido local del paquete debería descubrirse implícitamente por convención de carpetas
- `includes` es opcional y debería usarse principalmente para referencias externas o ubicaciones no estándar
- los elementos incluidos pueden ser referencias locales o externas
- `COMPANY.md` puede incluir agentes directamente, equipos, proyectos, tareas o habilidades
- un importador de empresas puede representar `includes` como la interfaz de importación de árbol/casillas

## 7. TEAM.md

`TEAM.md` define un subárbol de organización.

### Ejemplo

```yaml
name: Engineering
description: Product and platform engineering team
schema: agentcompanies/v1
slug: engineering
manager: ../cto/AGENTS.md
includes:
  - ../platform-lead/AGENTS.md
  - ../frontend-lead/AGENTS.md
  - ../../skills/review/SKILL.md
tags:
  - team
  - engineering
```

### Semántica

- un paquete de equipo es un subárbol reutilizable, no necesariamente una tabla de la base de datos en tiempo de ejecución
- `manager` identifica el agente raíz del subárbol
- `includes` puede contener agentes hijos, equipos hijos o habilidades compartidas
- un paquete de equipo puede importarse en una empresa existente y adjuntarse bajo un gerente objetivo

## 8. AGENTS.md

`AGENTS.md` define un agente.

### Ejemplo

```yaml
name: CEO
title: Chief Executive Officer
reportsTo: null
skills:
  - plan-ceo-review
  - review
```

### Semántica

- el contenido del cuerpo es el contenido de instrucciones canónico por defecto para el agente
- `docs` apunta a documentos markdown hermanos cuando existen
- `skills` referencia paquetes reutilizables de `SKILL.md` por nombre corto o slug de la habilidad
- una entrada de habilidad simple como `review` debería resolverse a `skills/review/SKILL.md` por convención
- si un paquete referencia habilidades externas, el agente debería seguir refiriéndose a la habilidad por su nombre corto; el propio paquete de la habilidad es dueño de cualquier referencia de origen, fijación o detalle de atribución
- las herramientas pueden permitir entradas de ruta o URL como válvula de escape, pero los exportadores deberían preferir referencias de habilidades basadas en nombre corto en `AGENTS.md`
- la configuración de adaptador/runtime específica de cada proveedor no debería vivir en el paquete base
- las rutas absolutas locales, los valores de cwd específicos de la máquina y los valores secretos no deben exportarse como datos canónicos del paquete

### Resolución de habilidades

El estándar de asociación preferido entre agentes y habilidades es por nombre corto de habilidad.

Orden de resolución sugerido para una entrada de habilidad de un agente:

1. una habilidad del paquete local en `skills/<shortname>/SKILL.md`
2. un paquete de habilidad referenciado o incluido cuyo slug o nombre corto declarado coincida
3. una entrada de biblioteca de habilidades de empresa gestionada por la herramienta con el mismo nombre corto

Reglas:

- los exportadores deberían emitir nombres cortos en `AGENTS.md` siempre que sea posible
- los importadores no deberían requerir rutas de archivo completas para referencias de habilidades ordinarias
- el propio paquete de habilidad debería llevar cualquier complejidad alrededor de referencias externas, vendoring, espejos o contenido upstream fijado
- esto mantiene `AGENTS.md` legible y consistente con el intercambio estilo `skills.sh`

## 9. PROJECT.md

`PROJECT.md` define un paquete de proyecto ligero.

### Ejemplo

```yaml
name: Q2 Launch
description: Ship the Q2 launch plan and supporting assets
owner: cto
```

### Semántica

- un paquete de proyecto agrupa tareas iniciales relacionadas y markdown de apoyo
- `owner` debería referenciar el slug de un agente cuando haya un responsable claro del proyecto
- una subcarpeta convencional de `tasks/` debería descubrirse implícitamente
- `includes` puede contener `TASK.md`, `SKILL.md` o documentos de apoyo cuando se necesita cableado explícito
- los paquetes de proyecto están pensados para sembrar trabajo planificado, no para representar el estado de las tareas en tiempo de ejecución

## 10. TASK.md

`TASK.md` define una tarea inicial ligera.

### Ejemplo

```yaml
name: Monday Review
assignee: ceo
project: q2-launch
recurring: true
```

### Semántica

- el contenido del cuerpo es la descripción canónica de la tarea en markdown
- `assignee` debería referenciar el slug de un agente dentro del paquete
- `project` debería referenciar el slug de un proyecto cuando la tarea pertenece a un `PROJECT.md`
- `recurring: true` marca la tarea como trabajo recurrente en curso en lugar de una tarea inicial única
- las tareas son intencionalmente trabajo semilla básico: título, cuerpo markdown, responsable, vínculo al proyecto y `recurring: true` opcional
- las herramientas también pueden soportar campos opcionales como `priority`, `labels` o `metadata`, pero no deberían requerirlos en el paquete base

### Tareas recurrentes

- el paquete base solo necesita indicar si una tarea es recurrente
- los proveedores pueden adjuntar la fidelidad real de programación / disparador / tiempo de ejecución en una extensión de proveedor como `.paperclip.yaml`
- esto mantiene `TASK.md` portable mientras permite que los sistemas de runtime más ricos mantengan sus propios detalles de automatización de ida y vuelta
- los paquetes heredados aún pueden usar `schedule.recurrence` durante la transición, pero los exportadores deberían preferir `recurring: true`

Ejemplo de extensión de Paperclip:

```yaml
routines:
  monday-review:
    triggers:
      - kind: schedule
        cronExpression: "0 9 * * 1"
        timezone: America/Chicago
```

- los proveedores deberían ignorar las extensiones de tareas recurrentes que no entiendan
- los proveedores que importen datos heredados de `schedule.recurrence` pueden traducirlos a su propio modelo de disparadores de runtime, pero las nuevas exportaciones deberían preferir el campo base más simple `recurring: true`

## 11. Compatibilidad con SKILL.md

Un paquete de habilidad debe seguir siendo un paquete válido de Agent Skills.

Reglas:

- `SKILL.md` debería seguir la especificación de Agent Skills
- Paperclip no debe requerir campos adicionales de nivel superior para la validez de una habilidad
- las extensiones específicas de Paperclip deben vivir bajo `metadata.paperclip` o `metadata.sources`
- un directorio de habilidad puede incluir `scripts/`, `references/` y `assets/` exactamente como espera el ecosistema de Agent Skills
- las herramientas que implementen esta especificación deberían tratar la compatibilidad con `skills.sh` como un objetivo de primera clase en lugar de inventar un formato de habilidad paralelo

En otras palabras, esta especificación extiende Agent Skills hacia arriba en la composición empresa/equipo/agente. No redefine la semántica de los paquetes de habilidades.

### Ejemplo de extensión compatible

```yaml
---
name: review
description: Paranoid code review skill
allowed-tools:
  - Read
  - Grep
metadata:
  paperclip:
    tags:
      - engineering
      - review
  sources:
    - kind: github-file
      repo: vercel-labs/skills
      path: review/SKILL.md
      commit: 0123456789abcdef0123456789abcdef01234567
      sha256: 3b7e...9a
      attribution: Vercel Labs
      usage: referenced
---
```

## 12. Referencias de origen

Un paquete puede apuntar a contenido upstream en lugar de vendorizarlo.

### Objeto de origen

```yaml
sources:
  - kind: github-file
    repo: owner/repo
    path: path/to/file.md
    commit: 0123456789abcdef0123456789abcdef01234567
    blob: abcdef0123456789abcdef0123456789abcdef01
    sha256: 3b7e...9a
    url: https://github.com/owner/repo/blob/0123456789abcdef0123456789abcdef01234567/path/to/file.md
    rawUrl: https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/path/to/file.md
    attribution: Owner Name
    license: MIT
    usage: referenced
```

### Tipos soportados

- `local-file`
- `local-dir`
- `github-file`
- `github-dir`
- `url`

### Modos de uso

- `vendored`: los bytes están incluidos en el paquete
- `referenced`: el paquete apunta a contenido upstream inmutable
- `mirrored`: los bytes se almacenan en caché localmente pero la atribución upstream sigue siendo canónica

### Reglas

- `commit` es requerido para `github-file` y `github-dir` en modo estricto
- `sha256` es fuertemente recomendado y debería verificarse al descargar
- las referencias solo de rama pueden permitirse en modo desarrollo pero deben advertir
- los exportadores deberían usar `referenced` por defecto para contenido de terceros a menos que la redistribución esté claramente permitida

## 13. Reglas de resolución

Dada la raíz de un paquete, un importador resuelve en este orden:

1. rutas relativas locales
2. rutas absolutas locales si la herramienta de importación lo permite explícitamente
3. referencias fijadas de GitHub
4. URLs genéricas

Para referencias fijadas de GitHub:

1. resolver `repo + commit + path`
2. descargar contenido
3. verificar `sha256` si está presente
4. verificar `blob` si está presente
5. fallar de forma cerrada ante discrepancia

Un importador debe mostrar:

- archivos faltantes
- discrepancias de hash
- licencias faltantes
- contenido upstream referenciado que requiere descarga por red
- contenido ejecutable en habilidades o scripts

## 14. Grafo de importación

Un importador de paquetes debería construir un grafo a partir de:

- `COMPANY.md`
- `TEAM.md`
- `AGENTS.md`
- `PROJECT.md`
- `TASK.md`
- `SKILL.md`
- referencias locales y externas

Comportamiento sugerido de la interfaz de importación:

- representar el grafo como un árbol
- casilla de verificación a nivel de entidad, no a nivel de archivo
- seleccionar un agente selecciona automáticamente los documentos requeridos y las habilidades referenciadas
- seleccionar un equipo selecciona automáticamente su subárbol
- seleccionar un proyecto selecciona automáticamente sus tareas incluidas
- seleccionar una tarea recurrente debería dejar claro que el objetivo de la importación es una rutina / automatización, no una tarea única
- seleccionar contenido de terceros referenciado muestra la atribución, la licencia y la política de descarga

## 15. Extensiones de proveedor

Los datos específicos de cada proveedor deberían vivir fuera de la forma del paquete base.

Para Paperclip, la extensión de fidelidad preferida es:

```text
.paperclip.yaml
```

Ejemplos de uso:

- tipo de adaptador y configuración de adaptador
- entradas env del adaptador y valores por defecto
- ajustes de runtime
- permisos
- presupuestos
- políticas de aprobación
- políticas de espacio de trabajo de ejecución de proyectos
- metadatos solo de Paperclip para issue/tarea

Reglas:

- el paquete base debe seguir siendo legible sin la extensión
- las herramientas que no entiendan una extensión de proveedor deberían ignorarla
- las herramientas de Paperclip pueden emitir la extensión de proveedor por defecto como sidecar manteniendo el markdown base limpio

Forma sugerida de Paperclip:

```yaml
schema: paperclip/v1
agents:
  claudecoder:
    adapter:
      type: claude_local
      config:
        model: claude-opus-4-6
    inputs:
      env:
        ANTHROPIC_API_KEY:
          kind: secret
          requirement: optional
          default: ""
        GH_TOKEN:
          kind: secret
          requirement: optional
        CLAUDE_BIN:
          kind: plain
          requirement: optional
          default: claude
routines:
  monday-review:
    triggers:
      - kind: schedule
        cronExpression: "0 9 * * 1"
        timezone: America/Chicago
```

Reglas adicionales para exportadores de Paperclip:

- no duplicar `promptTemplate` cuando `AGENTS.md` ya contiene las instrucciones del agente
- no exportar vinculaciones de secretos específicas del proveedor como `secretId`, `version` o `type: secret_ref`
- exportar las entradas env como declaraciones portables con semántica de `required` u `optional` y valores por defecto opcionales
- advertir sobre valores dependientes del sistema como comandos absolutos y sobrescrituras absolutas de `PATH`
- omitir campos de Paperclip vacíos o con valores por defecto cuando sea posible

## 16. Reglas de exportación

Un exportador conforme debería:

- emitir raíces markdown y diseño de carpetas relativo
- omitir ids y marcas de tiempo locales de la máquina
- omitir valores secretos
- omitir rutas específicas de la máquina
- preservar descripciones de tareas y declaraciones de tareas recurrentes al exportar tareas
- omitir campos vacíos/por defecto
- usar por defecto el paquete base neutral de proveedores
- los exportadores de Paperclip deberían emitir `.paperclip.yaml` como sidecar por defecto
- preservar atribución y referencias de origen
- preferir `referenced` sobre el vendoring silencioso para contenido de terceros
- preservar `SKILL.md` tal cual al exportar habilidades compatibles

## 17. Licencias y atribución

Una herramienta conforme debe:

- preservar los metadatos de `license` y `attribution` al importar y exportar
- distinguir contenido vendorizado vs referenciado
- no incluir silenciosamente contenido de terceros referenciado durante la exportación
- mostrar los metadatos de licencia faltantes como una advertencia
- mostrar licencias restrictivas o desconocidas antes de instalar/importar si el contenido está vendorizado o en espejo

## 18. Archivo lock opcional

La autoría no requiere un archivo lock.

Las herramientas pueden generar un archivo lock opcional como:

```text
company-package.lock.json
```

Propósito:

- almacenar en caché las referencias resueltas
- registrar los hashes finales
- soportar instalaciones reproducibles

Reglas:

- los archivos lock son opcionales
- los archivos lock son artefactos generados, no entrada canónica de autoría
- el paquete markdown sigue siendo la fuente de verdad

## 19. Mapeo de Paperclip

Paperclip puede mapear esta especificación a su modelo de runtime así:

- paquete base:
  - `COMPANY.md` → metadatos de la empresa
  - `TEAM.md` → subárbol de organización importable
  - `AGENTS.md` → identidad e instrucciones del agente
  - `PROJECT.md` → definición de proyecto inicial
  - `TASK.md` → definición de issue/tarea inicial, o plantilla de tarea recurrente cuando `recurring: true`
  - `SKILL.md` → paquete de habilidad importado
  - `sources[]` → procedencia y referencias upstream fijadas
- extensión de Paperclip:
  - `.paperclip.yaml` → configuración de adaptador, configuración de runtime, declaraciones de entradas env, permisos, presupuestos, disparadores de rutinas y otra fidelidad específica de Paperclip

Los metadatos en línea solo de Paperclip que deben vivir dentro de un archivo markdown compartido deberían usar:

- `metadata.paperclip`

Eso mantiene el formato base más amplio que Paperclip.

Esta especificación en sí sigue siendo neutral de proveedores y está pensada para cualquier runtime de empresas de agentes, no solo Paperclip.

## 20. Transición

Paperclip debería migrar a este modelo de paquete markdown-first como el formato de portabilidad principal.

`paperclip.manifest.json` no necesita preservarse como requisito de compatibilidad para el futuro sistema de paquetes.

Para Paperclip, esto debería tratarse como una transición dura en la dirección del producto en lugar de una estrategia de formato dual de larga duración.

## 21. Ejemplo mínimo

```text
lean-dev-shop/
├── COMPANY.md
├── agents/
│   ├── ceo/AGENTS.md
│   └── cto/AGENTS.md
├── projects/
│   └── q2-launch/
│       ├── PROJECT.md
│       └── tasks/
│           └── monday-review/
│               └── TASK.md
├── teams/
│   └── engineering/TEAM.md
├── tasks/
│   └── weekly-review/TASK.md
└── skills/
    └── review/SKILL.md

Optional:

```text
.paperclip.yaml
```
```

**Recomendación**
Esta es la dirección que tomaría:

- hacer de esta la especificación orientada a humanos
- definir la compatibilidad de `SKILL.md` como innegociable
- tratar esta especificación como una extensión de Agent Skills, no como un formato paralelo
- hacer de `companies.sh` una capa de descubrimiento para repositorios que implementen esta especificación, no una autoridad de publicación
