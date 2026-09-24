# Plan de importación/exportación de empresas V2 2026-03-13

Estado: Plan de implementación propuesto
Fecha: 2026-03-13
Audiencia: Producto e ingeniería
Reemplaza para la dirección del formato de paquete:
- `doc/plans/2026-02-16-module-system.md`: secciones que describen las plantillas de empresa solo como JSON
- `docs/specs/cliphub-plan.md`: supuestos sobre la forma del paquete blueprint donde entren en conflicto con el modelo de paquete markdown-first

## 1. Propósito

Este documento define el plan de próxima etapa para la importación/exportación de empresas en Paperclip.

El cambio central es:

- pasar de un paquete de portabilidad JSON-first específico de Paperclip a un formato de paquete markdown-first
- hacer que los repositorios de GitHub sean fuentes de paquete de primera clase
- tratar el modelo de paquete de empresa como una extensión del ecosistema existente de Agent Skills en lugar de inventar un formato de habilidad separado
- admitir la reutilización de empresa, equipo, agente y habilidad sin requerir un registro central

El borrador normativo del formato de paquete está en:

- `docs/companies/companies-spec.md`

Este plan trata sobre la implementación y el despliegue dentro de Paperclip.

Los detalles del despliegue de habilidades en todos los adaptadores están en:

- `doc/plans/2026-03-14-adapter-skill-sync-rollout.md`

## 2. Resumen ejecutivo

Paperclip ya tiene primitivas de portabilidad en el repositorio:

- API de importación/exportación/vista previa del servidor
- comandos de importación/exportación del CLI
- tipos y validadores compartidos de portabilidad

Esas primitivas están migrando al nuevo modelo de paquete en lugar de extenderse para compatibilidad con versiones anteriores.

La nueva dirección es:

1. autoría de paquetes markdown-first
2. repositorio de GitHub o carpeta local como fuente de verdad predeterminada
3. una especificación de paquete base neutral ante proveedores para tiempos de ejecución de empresas de agentes, no solo Paperclip
4. el modelo de paquete de empresa es explícitamente una extensión de Agent Skills
5. sin dependencia futura de `paperclip.manifest.json`
6. descubrimiento implícito de carpetas por convención para el caso común
7. un sidecar `.paperclip.yaml` siempre emitido para detalles de alta fidelidad específicos de Paperclip
8. resolución del grafo de paquetes en tiempo de importación
9. UI de importación a nivel de entidad con selección de árbol consciente de dependencias
10. la compatibilidad con `skills.sh` es un requisito de V1 para los paquetes de habilidades y los flujos de instalación de habilidades
11. superficies de sincronización de habilidades conscientes del adaptador para que Paperclip pueda leer, comparar, habilitar, deshabilitar y conciliar habilidades donde el adaptador lo admita

## 3. Objetivos del producto

### 3.1 Objetivos

- Un usuario puede apuntar Paperclip a una carpeta local o un repositorio de GitHub e importar un paquete de empresa sin ningún registro.
- Un paquete es legible y escribible por humanos con flujos de trabajo git normales.
- Un paquete puede contener:
  - definición de empresa
  - definición de subárbol de organización / equipo
  - definiciones de agentes
  - proyectos y tareas iniciales opcionales
  - habilidades reutilizables
- El soporte de habilidades V1 es compatible con el ecosistema existente de `skills.sh` / Agent Skills.
- Un usuario puede importar a:
  - una empresa nueva
  - una empresa existente
- La vista previa de importación muestra:
  - qué se creará
  - qué se actualizará
  - qué se omitirá
  - qué se referencia externamente
  - qué necesita secretos o aprobaciones
- La exportación conserva la atribución, las licencias y las referencias upstream fijadas.
- La exportación produce un paquete limpio neutral ante proveedores más un sidecar de Paperclip.
- `companies.sh` puede actuar más adelante como capa de descubrimiento/índice sobre repositorios que implementen este formato.

### 3.2 No objetivos

- No se requiere un registro central para la validez del paquete.
- Esto no es una copia de seguridad/restauración completa de la base de datos.
- Esto no intenta exportar el estado de tiempo de ejecución como:
  - ejecuciones de latido
  - claves de API
  - totales de gasto
  - sesiones de ejecución
  - espacios de trabajo transitorios
- Esto no requiere una tabla de `teams` de tiempo de ejecución de primera clase antes de que la portabilidad de equipos esté disponible.

## 4. Estado actual en el repositorio

La implementación actual existe aquí:

- tipos compartidos: `packages/shared/src/types/company-portability.ts`
- validadores compartidos: `packages/shared/src/validators/company-portability.ts`
- rutas del servidor: `server/src/routes/companies.ts`
- servicio del servidor: `server/src/services/company-portability.ts`
- comandos del CLI: `cli/src/commands/client/company.ts`

Limitaciones actuales del producto:

1. La UX de importación/exportación aún necesita una selección de árbol más profunda y pulido en la gestión de habilidades/paquetes.
2. La sincronización de habilidades específica del adaptador sigue siendo desigual entre adaptadores y debe degradarse con elegancia cuando no se admite.
3. Los proyectos y las tareas iniciales deberían seguir siendo opt-in en la exportación en lugar de contenido predeterminado del paquete.
4. La importación/exportación aún necesita una cobertura más sólida en torno a la atribución, la verificación de fijados y las advertencias de paquetes ejecutables.
5. El analizador actual de frontmatter de markdown es intencionalmente ligero y debe mantenerse limitado a la forma documentada.

## 5. Dirección canónica del paquete

### 5.1 Formato de autoría canónico

El formato de autoría canónico se convierte en un paquete markdown-first con raíz en uno de:

- `COMPANY.md`
- `TEAM.md`
- `AGENTS.md`
- `PROJECT.md`
- `TASK.md`
- `SKILL.md`

El borrador normativo es:

- `docs/companies/companies-spec.md`

### 5.2 Relación con Agent Skills

Paperclip no debe redefinir `SKILL.md`.

Reglas:

- `SKILL.md` sigue siendo compatible con Agent Skills
- el modelo de paquete de empresa es una extensión de Agent Skills
- el paquete base es neutral ante proveedores y está pensado para cualquier tiempo de ejecución de empresa de agentes
- la fidelidad específica de Paperclip está en `.paperclip.yaml`
- Paperclip puede resolver e instalar paquetes `SKILL.md`, pero no debe requerir un formato de habilidad exclusivo de Paperclip
- la compatibilidad con `skills.sh` es un requisito de V1, no algo deseable para el futuro

### 5.3 Asociación de agente a habilidad

`AGENTS.md` debería asociar habilidades por nombre corto o slug de habilidad, no por ruta detallada en el caso común.

Ejemplo preferido:

- `skills: [review, react-best-practices]`

Modelo de resolución:

- `review` se resuelve a `skills/review/SKILL.md` por convención del paquete
- si la habilidad es externa o referenciada, el paquete de habilidad es dueño de esa complejidad
- los exportadores deberían preferir asociaciones basadas en nombre corto en `AGENTS.md`
- los importadores deberían resolver el nombre corto primero contra las habilidades locales del paquete, luego contra las habilidades de empresa referenciadas o instaladas
### 5.4 Paquete base vs extensión de Paperclip

El formato del repositorio debería tener dos capas:

- paquete base:
  - mínimo, legible, social, neutral ante proveedores
  - descubrimiento implícito de carpetas por convención
  - sin campos de tiempo de ejecución exclusivos de Paperclip por defecto
- extensión de Paperclip:
  - `.paperclip.yaml`
  - fidelidad de adaptador/tiempo de ejecución/permisos/presupuesto/espacio de trabajo
  - emitido por las herramientas de Paperclip como sidecar mientras el paquete base sigue siendo legible

### 5.5 Relación con el manifiesto V1 actual

`paperclip.manifest.json` no forma parte de la dirección futura del paquete.

Esto debe tratarse como un corte duro en la dirección del producto.

- el diseño de repositorio markdown-first es el objetivo
- ningún trabajo nuevo debería profundizar la inversión en el modelo de manifiesto antiguo
- las futuras API y UI de portabilidad deberían apuntar solo al modelo markdown-first

## 6. Modelo de grafo de paquetes

### 6.1 Tipos de entidad

La importación/exportación de Paperclip debería admitir estos tipos de entidad:

- company
- team
- agent
- project
- task
- skill

### 6.2 Semántica de equipo

`team` es primero un concepto de paquete, no un requisito de tabla de base de datos.

En la portabilidad V2 de Paperclip:

- un equipo es un subárbol de organización importable
- tiene como raíz un agente gerente
- puede adjuntarse bajo un gerente objetivo en una empresa existente

Esto evita bloquear la portabilidad en un futuro modelo de `teams` de tiempo de ejecución.

El seguimiento de equipos importados debería ser inicialmente basado en paquete/procedencia:

- si se importó un paquete de equipo, los agentes importados deberían llevar suficiente procedencia para reconstruir esa agrupación
- Paperclip puede tratar "este conjunto de agentes vino del paquete de equipo X" como el modelo de equipo importado
- la agrupación por procedencia es el modelo de equipo previsto a corto y mediano plazo para importación/exportación
- solo agregar una tabla de `teams` de tiempo de ejecución de primera clase más adelante si las necesidades del producto van más allá de lo que la agrupación por procedencia puede expresar

### 6.3 Grafo de dependencias

La importación debería operar sobre un grafo de entidades, no sobre selección cruda de archivos.

Ejemplos:

- seleccionar un agente selecciona automáticamente sus documentos y referencias de habilidades requeridas
- seleccionar un equipo selecciona automáticamente su subárbol
- seleccionar una empresa selecciona automáticamente todas las entidades incluidas por defecto
- seleccionar un proyecto selecciona automáticamente sus tareas iniciales

La salida de vista previa debería reflejar explícitamente la resolución del grafo.

## 7. Referencias externas, fijado y atribución

### 7.1 Por qué esto importa

Algunos paquetes:

- referenciarán archivos upstream que no queremos volver a publicar
- incluirán trabajo de terceros donde la atribución debe permanecer visible
- necesitarán protección contra el intercambio de ramas

### 7.2 Política

Paperclip debería admitir referencias de fuente en los metadatos del paquete con:

- repo
- path
- commit sha
- optional blob sha
- optional sha256
- attribution
- license
- usage mode

Modos de uso:

- `vendored`
- `referenced`
- `mirrored`

El comportamiento predeterminado del exportador para contenido de terceros debería ser:

- preferir `referenced`
- conservar la atribución
- no insertar silenciosamente contenido de terceros en las exportaciones

### 7.3 Modelo de confianza

El contenido de paquete importado debería clasificarse por nivel de confianza:

- markdown-only
- markdown + assets
- markdown + scripts/executables

La UI y el CLI deberían mostrarlo claramente antes de aplicar.

## 8. Comportamiento de importación

### 8.1 Fuentes admitidas

- carpeta local
- archivo raíz de paquete local
- URL de repositorio de GitHub
- URL de subárbol de GitHub
- URL directa a markdown/raíz de paquete

El descubrimiento basado en registro puede agregarse más adelante, pero debe seguir siendo opcional.

### 8.2 Objetivos de importación

- empresa nueva
- empresa existente

Para importaciones en empresas existentes, la vista previa debe admitir:

- manejo de colisiones
- selección de punto de adjunto para importaciones de equipos
- importación selectiva de entidades

### 8.3 Estrategia de colisiones

El soporte actual de `rename | skip | replace` se mantiene, pero la coincidencia debería mejorar con el tiempo.

Orden de coincidencia preferido:

1. procedencia de instalación previa
2. identidad estable de entidad del paquete
3. slug
4. nombre humano como último recurso débil

La coincidencia solo por slug es aceptable únicamente como estrategia de transición.

### 8.4 Salida de vista previa requerida

Cada vista previa de importación debería mostrar:

- acción de empresa objetivo
- plan de creación/actualización/omisión a nivel de entidad
- contenido externo referenciado
- archivos faltantes
- discrepancias de hash o problemas de fijado
- entradas de entorno, incluyendo requeridas vs opcionales y valores predeterminados cuando existan
- tipos de contenido no admitidos
- advertencias de confianza/licencias

### 8.5 Superficie de sincronización de habilidades del adaptador

La gente quiere gestión de habilidades en la UI, pero las habilidades dependen del adaptador.

Eso significa que la planificación de portabilidad y UI debe incluir un modelo de capacidad del adaptador para habilidades.

Paperclip debería definir una nueva superficie del adaptador en torno a habilidades:

- listar las habilidades actualmente habilitadas para un agente
- informar cómo el adaptador representa esas habilidades
- instalar o habilitar una habilidad
- deshabilitar o eliminar una habilidad
- informar el estado de sincronización entre la configuración de paquete deseada y el estado real del adaptador

Ejemplos:

- los adaptadores estilo Claude Code / Codex pueden gestionar habilidades como paquetes locales del sistema de archivos o directorios de habilidades propios del adaptador
- los adaptadores estilo OpenClaw pueden exponer las habilidades actualmente habilitadas a través de una API o una superficie de configuración reflejada
- algunos adaptadores pueden ser de solo lectura y solo informar lo que tienen

Forma de capacidad del adaptador planificada:

- `supportsSkillRead`
- `supportsSkillWrite`
- `supportsSkillRemove`
- `supportsSkillSync`
- `skillStorageKind` como `filesystem`, `remote_api`, `inline_config` o `unknown`

Interfaz base del adaptador:

- `listSkills(agent)`
- `applySkills(agent, desiredSkills)`
- `removeSkill(agent, skillId)` opcional
- `getSkillSyncState(agent, desiredSkills)` opcional

Comportamiento planificado de Paperclip:

- si un adaptador admite lectura, Paperclip debería mostrar las habilidades actuales en la UI
- si un adaptador admite escritura, Paperclip debería permitir al usuario habilitar/deshabilitar habilidades importadas
- si un adaptador admite sincronización, Paperclip debería calcular el estado deseado vs real y ofrecer acciones de conciliación
- si un adaptador no admite estas capacidades, la UI debería seguir mostrando las habilidades deseadas a nivel de paquete pero marcarlas como no gestionadas

## 9. Comportamiento de exportación

### 9.1 Objetivo de exportación predeterminado

El objetivo de exportación predeterminado debería convertirse en una estructura de carpetas markdown-first.

Ejemplo:

```text
my-company/
├── COMPANY.md
├── agents/
├── teams/
└── skills/
```

### 9.2 Reglas de exportación

Las exportaciones deberían:

- omitir identificadores locales de máquina
- omitir marcas de tiempo y contadores a menos que se necesiten explícitamente
- omitir valores de secretos
- omitir rutas absolutas locales
- omitir contenido de prompt duplicado en línea de `.paperclip.yaml` cuando `AGENTS.md` ya lleva las instrucciones
- conservar referencias y atribución
- emitir `.paperclip.yaml` junto al paquete base
- expresar el entorno/secretos del adaptador como declaraciones portátiles de entradas de entorno en lugar de identificadores de enlaces de secretos exportados
- conservar el contenido compatible de `SKILL.md` tal cual

Los proyectos y los issues no deberían exportarse por defecto.

Deberían ser opt-in mediante selectores como:

- `--projects project-shortname-1,project-shortname-2`
- `--issues PAP-1,PAP-3`
- `--project-issues project-shortname-1,project-shortname-2`

Esto admite flujos de trabajo de "paquete de empresa público limpio" donde un mantenedor exporta un paquete de empresa orientado a seguidores sin empaquetar elementos de trabajo activos cada vez.

### 9.3 Unidades de exportación

Unidades de exportación iniciales:

- paquete de empresa
- paquete de equipo
- paquete de un solo agente

Unidades opcionales posteriores:

- exportación de paquete de habilidades
- paquete de proyectos/tareas semilla

## 10. Modelo de almacenamiento dentro de Paperclip

### 10.1 Corto plazo

En la primera fase, las entidades importadas pueden seguir mapeándose a las tablas actuales de tiempo de ejecución:

- company -> companies
- agent -> agents
- team -> adjunto de subárbol de agentes importados más agrupación por procedencia del paquete
- skill -> metadatos de paquete reutilizable con alcance de empresa más estado de adjunto de habilidad deseada con alcance de agente donde se admita

### 10.2 Mediano plazo

Paperclip debería agregar registros gestionados de paquete/procedencia para que las importaciones no sean copias anónimas de una sola vez.

Capacidades necesarias:

- recordar el origen de instalación
- admitir reimportación / actualización
- distinguir ediciones locales del estado upstream del paquete
- conservar referencias externas y metadatos a nivel de paquete
- conservar la agrupación de equipos importados sin requerir una tabla de `teams` de tiempo de ejecución de inmediato
- conservar el estado de habilidad deseada separado del estado de tiempo de ejecución del adaptador
- admitir tanto habilidades reutilizables con alcance de empresa como adjuntos de habilidades con alcance de agente

Tablas futuras sugeridas:

- package_installs
- package_install_entities
- package_sources
- agent_skill_desires
- adapter_skill_snapshots

Esto no es necesario para la UI de la fase 1, pero sí para un sistema sólido a largo plazo.

## 11. Plan de API

### 11.1 Mantener los endpoints existentes inicialmente

Conservar:

- `POST /api/companies/:companyId/export`
- `POST /api/companies/import/preview`
- `POST /api/companies/import`

Pero evolucionar las cargas útiles hacia el modelo de grafo markdown-first.

### 11.2 Nuevas capacidades de API

Agregar soporte para:

- resolución de raíz de paquete desde entradas locales/GitHub
- vista previa de resolución de grafo
- resultados de verificación de fijado y hash de fuente
- selección a nivel de entidad
- selección de objetivo de adjunto de equipo
- planificación de colisiones consciente de procedencia

### 11.3 Cambios de análisis

Reemplazar el actual analizador ad hoc de frontmatter de markdown con un analizador real que pueda manejar:

- YAML anidado
- arreglos/objetos de forma confiable
- ida y vuelta consistente

Esto es un prerrequisito para el nuevo modelo de paquete.

## 12. Plan de CLI

El CLI debería seguir admitiendo importación/exportación directa sin registro.

Comandos objetivo:

- `paperclipai company export <company-id> --out <path>`
- `paperclipai company import <path-or-url> --dry-run`
- `paperclipai company import <path-or-url> --target existing -C <company-id>`

Adiciones planificadas:

- `--package-kind company|team|agent`
- `--attach-under <agent-id-or-slug>` para importaciones de equipos
- `--strict-pins`
- `--allow-unpinned`
- `--materialize-references`
- `--sync-skills`

## 13. Plan de UI

### 13.1 Importación/exportación en ajustes de empresa

Agregar una sección real de importación/exportación a los ajustes de empresa.

UI de exportación:

- selector de tipo de paquete de exportación
- opciones de inclusión
- guía de descarga/destino de exportación local
- resumen de atribución/referencias

UI de importación:

- entrada de fuente:
  - subida/carpeta donde se admita
  - URL de GitHub
  - URL genérica
- panel de vista previa con:
  - raíz de paquete resuelta
  - árbol de dependencias
  - casillas de verificación por entidad
  - advertencias de confianza/licencias
  - requisitos de secretos
  - plan de colisiones

### 13.2 UX de importación de equipos

Si se importa un equipo en una empresa existente:

- mostrar la estructura del subárbol
- exigir al usuario elegir dónde adjuntarlo
- vista previa de actualizaciones de gerente/reportes antes de aplicar
- conservar la procedencia del equipo importado para que la UI pueda decir más adelante "estos agentes vinieron del paquete de equipo X"

### 13.3 UX de habilidades

Ver también:

- `doc/plans/2026-03-14-skills-ui-product-plan.md`

Si se importan habilidades:

- mostrar si cada habilidad es local, incluida o referenciada
- mostrar si contiene scripts/recursos
- conservar la compatibilidad con Agent Skills en la presentación y la exportación
- conservar la compatibilidad con `skills.sh` tanto en la importación como en los flujos de instalación
- mostrar los adjuntos de habilidades del agente por nombre corto/slug en lugar de rutas de archivo ruidosas
- tratar las habilidades del agente como una pestaña dedicada del agente, no solo otra subsección de configuración
- mostrar las habilidades actuales reportadas por el adaptador cuando se admita
- mostrar las habilidades deseadas del paquete por separado del estado real del adaptador
- ofrecer acciones de conciliación cuando el adaptador admita sincronización

## 14. Fases de despliegue

### Fase 1: Estabilizar la portabilidad V1 actual

- agregar pruebas para los flujos de portabilidad actuales
- reemplazar el analizador de frontmatter
- agregar UI de ajustes de empresa para las capacidades actuales de importación/exportación
- comenzar el trabajo de migración hacia el lector de paquetes markdown-first

### Fase 2: Lector de paquetes markdown-first

- admitir detección de raíz `COMPANY.md` / `TEAM.md` / `AGENTS.md`
- construir el grafo interno desde paquetes markdown-first
- admitir entradas de carpeta local y repositorio de GitHub de forma nativa
- admitir referencias de habilidades de agente por nombre corto/slug
- resolver paquetes locales `skills/<slug>/SKILL.md` por convención
- admitir repositorios de habilidades compatibles con `skills.sh` como fuentes de paquete V1

### Fase 3: UX de importación basada en grafo y superficies de habilidades

- vista previa de árbol de entidades
- selección con casillas de verificación
- flujo de adjunto de subárbol de equipo
- advertencias de licencias/confianza/referencias
- base de la biblioteca de habilidades de empresa
- base de la pestaña dedicada de `Skills` del agente
- base de la UI de lectura/sincronización de habilidades del adaptador

### Fase 4: Nuevo modelo de exportación

- exportar estructura de carpetas markdown-first por defecto

### Fase 5: Procedencia y actualizaciones

- persistir la procedencia de instalación
- admitir reimportación y actualizaciones conscientes del paquete
- mejorar la coincidencia de colisiones más allá de solo slug
- agregar agrupación por procedencia de equipos importados
- agregar estado de sincronización de habilidades deseadas vs reales

### Fase 6: Contenido semilla opcional

- objetivos
- proyectos
- issues/tareas iniciales

Esta fase es intencionalmente posterior a que el modelo estructural esté estable.

## 15. Plan de documentación

Documentos principales:

- `docs/companies/companies-spec.md` como el borrador del formato de paquete
- este plan de implementación para la secuencia de despliegue

Documentos a actualizar más adelante a medida que aterrice la implementación:

- `doc/SPEC-implementation.md`
- `docs/api/companies.md`
- `docs/cli/control-plane-commands.md`
- documentos de operador del tablero para la importación/exportación en ajustes de empresa

## 16. Preguntas abiertas

1. ¿Los paquetes de habilidades importados deberían almacenarse como archivos de paquete gestionados en el almacenamiento de Paperclip, o solo referenciarse en tiempo de importación?
   Decisión: los archivos de paquete gestionados deberían admitir tanto la reutilización con alcance de empresa como el adjunto con alcance de agente.
2. ¿Cuál es la interfaz mínima de habilidades del adaptador necesaria para que la UI sea útil en Claude Code, Codex, OpenClaw y futuros adaptadores?
   Decisión: usar la interfaz base de la sección 8.5.
3. ¿Paperclip debería admitir la selección directa de carpetas locales en la UI web, o mantener eso solo en el CLI inicialmente?
4. ¿Queremos archivos de bloqueo generados opcionales en la fase 2, o los diferimos hasta el trabajo de procedencia?
5. ¿Qué tan estricto debería ser el fijado por defecto para las referencias de GitHub:
   - advertir cuando no esté fijado
   - o bloquear en modo normal
6. ¿La agrupación por procedencia del paquete es suficiente para los equipos importados, o esperamos pronto requisitos de producto que justificarían una tabla de `teams` de tiempo de ejecución de primera clase?
   Decisión: la agrupación por procedencia es suficiente por ahora para el modelo de producto de importación/exportación.

## 17. Recomendación

Ingeniería debería tratar esto como el plan vigente actual para la importación/exportación de empresas más allá de la función de portabilidad V1 existente.

Próximos pasos inmediatos:

1. aceptar `docs/companies/companies-spec.md` como el borrador del formato de paquete
2. implementar el trabajo de estabilización de la fase 1
3. construir el lector de paquetes markdown-first de la fase 2 antes de expandir ClipHub o `companies.sh`
4. tratar el formato antiguo basado en manifiesto como obsoleto y no parte de la superficie futura

Esto mantiene a Paperclip alineado con:

- distribución nativa de GitHub
- compatibilidad con Agent Skills
- un modelo de ecosistema opcional al registro
