# Plan de producto de UI de habilidades 2026-03-14

Estado: Propuesto
Fecha: 2026-03-14
Audiencia: Producto e ingeniería
Relacionado:
- `doc/plans/2026-03-13-company-import-export-v2.md`
- `doc/plans/2026-03-14-adapter-skill-sync-rollout.md`
- `docs/companies/companies-spec.md`
- `ui/src/pages/AgentDetail.tsx`

## 1. Propósito

Este documento define el plan de producto y UI para la gestión de habilidades en Paperclip.

El objetivo es hacer las habilidades comprensibles y gestionables en el sitio web sin pretender que todos los adaptadores se comportan igual.

Este plan asume:

- `SKILL.md` sigue siendo compatible con Agent Skills
- la compatibilidad con `skills.sh` es un requisito de V1
- la importación/exportación de empresas de Paperclip puede incluir habilidades como contenido de paquete
- los adaptadores pueden admitir sincronización persistente de habilidades, montaje efímero de habilidades, descubrimiento de habilidades de solo lectura, o ninguna integración de habilidades

## 2. Estado actual

Ya existe una primera pasada de UI de sincronización de habilidades a nivel de agente en `AgentDetail`.

Hoy admite:

- cargar el estado de sincronización de habilidades del adaptador
- mostrar claramente adaptadores no admitidos
- mostrar habilidades gestionadas como casillas de verificación
- mostrar habilidades externas por separado
- sincronizar habilidades deseadas para adaptadores que implementan la nueva API

Limitaciones actuales:

1. No hay UI de biblioteca de habilidades a nivel de empresa.
2. No hay flujo de importación de paquetes para habilidades en el sitio web.
3. No hay distinción entre gestión de paquetes de habilidades y adjunto de habilidades por agente.
4. No hay vista de deseado vs real multiagente.
5. La UI actual está orientada a sincronización de adaptador, no a paquetes.
6. Los adaptadores no admitidos se degradan con seguridad, pero no con elegancia.

## 2.1 Decisiones V1

Para V1, este plan asume que las siguientes decisiones de producto ya están tomadas:

1. La compatibilidad con `skills.sh` es requerida.
2. La asociación de agente a habilidad en `AGENTS.md` es por nombre corto o slug.
3. Las habilidades de empresa y los adjuntos de habilidades de agente son conceptos separados.
4. Las habilidades de agente deberían moverse a su propia pestaña en lugar de vivir dentro de la configuración.
5. La importación/exportación de empresas debería eventualmente hacer ida y vuelta de paquetes de habilidades y adjuntos de habilidades de agente.

## 3. Principios de producto

1. Las habilidades son primero activos de la empresa, segundo adjuntos del agente.
2. La gestión de paquetes y la sincronización del adaptador son preocupaciones diferentes y no deberían confundirse en una pantalla.
3. La UI siempre debe decir la verdad sobre lo que Paperclip sabe:
   - estado deseado en Paperclip
   - estado real reportado por el adaptador
   - si el adaptador puede conciliar ambos
4. La compatibilidad con Agent Skills debe seguir siendo visible en el modelo de producto.
5. Las asociaciones de agente a habilidad deberían ser legibles por humanos y basadas en nombre corto donde sea posible.
6. Los adaptadores no admitidos aún deberían tener una UI útil, no solo un callejón sin salida.

## 4. Modelo de usuario

Paperclip debería tratar las habilidades en dos alcances:

### 4.1 Habilidades de empresa

Estas son habilidades reutilizables conocidas por la empresa.

Ejemplos:

- importadas desde un repositorio de GitHub
- agregadas desde una carpeta local
- instaladas desde un repositorio compatible con `skills.sh`
- creadas localmente dentro de Paperclip más adelante

Estas deberían tener:

- nombre
- descripción
- slug o identidad de paquete
- fuente/procedencia
- nivel de confianza
- estado de compatibilidad

### 4.2 Habilidades de agente

Estos son adjuntos de habilidades para un agente específico.

Cada adjunto debería tener:

- nombre corto
- estado deseado en Paperclip
- estado real en el adaptador cuando sea legible
- estado de sincronización
- origen

Los adjuntos de agente normalmente deberían referenciar habilidades por nombre corto o slug, por ejemplo:

- `review`
- `react-best-practices`

no por ruta de archivo relativa ruidosa.

## 4.3 Trabajos principales del usuario

La UI debería admitir estos trabajos limpiamente:

1. "Muéstrame qué habilidades tiene esta empresa".
2. "Importar una habilidad desde GitHub o una carpeta local".
3. "Ver si una habilidad es segura, compatible y quién la usa".
4. "Adjuntar habilidades a un agente".
5. "Ver si el adaptador realmente tiene esas habilidades".
6. "Conciliar el estado deseado vs real de habilidades".
7. "Entender qué sabe Paperclip vs qué sabe el adaptador".

## 5. Superficies centrales de UI

El producto debería tener dos superficies principales de habilidades.

### 5.1 Página de habilidades de empresa

Agregar una página a nivel de empresa, probablemente:

- `/companies/:companyId/skills`

Propósito:

- gestionar la biblioteca de habilidades de la empresa
- importar e inspeccionar paquetes de habilidades
- entender procedencia y confianza
- ver qué agentes usan qué habilidades

#### Ruta

- `/companies/:companyId/skills`

#### Acciones principales

- importar habilidad
- inspeccionar habilidad
- adjuntar a agentes
- desadjuntar de agentes
- exportar habilidades seleccionadas más adelante

#### Estado vacío

Cuando la empresa no tiene habilidades gestionadas:

- explicar qué son las habilidades
- explicar la compatibilidad con `skills.sh` / Agent Skills
- ofrecer `Import from GitHub` e `Import from folder`
- opcionalmente mostrar habilidades descubiertas por el adaptador como una sección secundaria de "aún no gestionadas"

#### A. Lista de biblioteca de habilidades

Cada fila de habilidad debería mostrar:

- nombre
- descripción corta
- insignia de fuente
- insignia de confianza
- insignia de compatibilidad
- número de agentes adjuntos

Estados de fuente sugeridos:

- local
- github
- paquete importado
- referencia externa
- solo descubierta por adaptador

Estados de compatibilidad sugeridos:

- compatible
- extensión de paperclip
- desconocido
- inválido

Estados de confianza sugeridos:

- solo markdown
- recursos
- scripts/ejecutables

Affordances de lista sugeridas:

- buscar por nombre o slug
- filtrar por fuente
- filtrar por nivel de confianza
- filtrar por uso
- ordenar por nombre, importación reciente, conteo de uso

#### B. Acciones de importación

Permitir:

- importar desde carpeta local
- importar desde URL de GitHub
- importar desde URL directa

Futuro:

- instalar desde `companies.sh`
- instalar desde `skills.sh`

Requisito V1:

- importar desde una fuente compatible con `skills.sh` debería funcionar sin requerir un diseño de paquete específico de Paperclip

#### C. Panel lateral o página de detalle de habilidad

Cada habilidad debería tener una vista de detalle que muestre:

- `SKILL.md` renderizado
- fuente y fijado del paquete
- archivos incluidos
- advertencias de confianza y licencias
- quién la usa
- notas de compatibilidad del adaptador

Ruta recomendada:

- `/companies/:companyId/skills/:skillId`

Secciones recomendadas:

- Resumen
- Contenidos
- Uso
- Fuente
- Confianza / licencias

#### D. Vista de uso

Cada habilidad de empresa debería mostrar qué agentes la usan.

Columnas sugeridas:

- agente
- estado deseado
- estado real
- adaptador
- modo de sincronización
- último estado de sincronización

### 5.2 Pestaña de habilidades de agente

Mantener y evolucionar la UI existente de sincronización de habilidades de `AgentDetail`, pero moverla fuera de la configuración.

Propósito:

- adjuntar/desadjuntar habilidades de empresa a un agente
- inspeccionar la realidad del adaptador para ese agente
- conciliar el estado deseado vs real
- mantener el formato de asociación legible y alineado con `AGENTS.md`

#### Ruta

- `/agents/:agentId/skills`

#### Pestañas del agente

El modelo de pestañas a nivel de agente previsto se convierte en:

- `dashboard`
- `configuration`
- `skills`
- `runs`

Esto es preferible a ocultar las habilidades dentro de la configuración porque:

- las habilidades no son solo configuración del adaptador
- las habilidades necesitan su propio lenguaje de sincronización/estado
- las habilidades son un activo reutilizable de la empresa, no meramente un campo de agente
- la pantalla necesita espacio para estado deseado vs real, advertencias y adopción de habilidades externas

#### Diseño de pestaña

La pestaña `Skills` debería tener tres secciones apiladas:

1. Resumen
2. Habilidades gestionadas
3. Habilidades externas / descubiertas

El resumen debería mostrar:

- soporte de sincronización del adaptador
- modo de sincronización
- número de habilidades gestionadas
- número de habilidades externas
- conteo de derivas o advertencias

#### A. Habilidades deseadas

Mostrar habilidades gestionadas de la empresa adjuntas al agente.

Cada fila debería mostrar:

- nombre de habilidad
- nombre corto
- estado de sincronización
- fuente
- última observación del adaptador si está disponible

Cada fila debería admitir:

- habilitar / deshabilitar
- abrir detalle de habilidad
- ver insignia de fuente
- ver insignia de sincronización

#### B. Habilidades externas o descubiertas

Mostrar habilidades reportadas por el adaptador que no son gestionadas por la empresa.

Esto importa porque Codex y adaptadores similares pueden ya tener habilidades locales que Paperclip no instaló.

Estas deberían estar claramente marcadas:

- externa
- no gestionada por Paperclip

Cada fila externa debería admitir:

- inspeccionar
- adoptar en la biblioteca de la empresa más adelante
- adjuntar como habilidad gestionada más adelante si corresponde

#### C. Controles de sincronización

Admitir:

- sincronizar
- restablecer borrador
- desadjuntar

Futuro:

- importar habilidad externa a la biblioteca de la empresa
- promover habilidad local ad hoc a habilidad de empresa gestionada

Acciones de pie recomendadas:

- `Sync skills`
- `Reset`
- `Refresh adapter state`

## 6. Modelo de estado de habilidad en la UI

Cada adjunto de habilidad debería tener un estado orientado al usuario.

Estados sugeridos:

- `in_sync`
- `desired_only`
- `external`
- `drifted`
- `unmanaged`
- `unknown`

Definiciones:

- `in_sync`: deseado y real coinciden
- `desired_only`: Paperclip la quiere, el adaptador aún no la muestra
- `external`: el adaptador la tiene pero Paperclip no la gestiona
- `drifted`: el adaptador tiene una versión/ubicación conflictiva o inesperada
- `unmanaged`: el adaptador no admite sincronización, Paperclip solo rastrea el estado deseado
- `unknown`: la lectura del adaptador falló o el estado no es confiable

Texto de insignia sugerido:

- `In sync`
- `Needs sync`
- `External`
- `Drifted`
- `Unmanaged`
- `Unknown`

## 7. Reglas de presentación del adaptador

La UI no debería describir todos los adaptadores de la misma forma.

### 7.1 Adaptadores persistentes

Ejemplo:

- Codex local

Lenguaje:

- instalado
- sincronizado en el directorio del adaptador
- habilidades externas detectadas

### 7.2 Adaptadores efímeros

Ejemplo:

- Claude local

Lenguaje:

- se montará en la próxima ejecución
- habilidades efectivas de tiempo de ejecución
- no instalado globalmente

### 7.3 Adaptadores no admitidos

Lenguaje:

- este adaptador aún no implementa sincronización de habilidades
- Paperclip aún puede rastrear habilidades deseadas
- el estado real del adaptador no está disponible

Este estado aún debería permitir:

- adjuntar habilidades de empresa al agente como estado deseado
- exportación/importación de esos adjuntos deseados

## 7.4 Adaptadores de solo lectura

Algunos adaptadores pueden listar habilidades pero no mutarlas.

Lenguaje:

- Paperclip puede ver las habilidades del adaptador
- este adaptador no admite aplicar cambios
- el estado deseado puede rastrearse, pero la conciliación es manual

## 8. Arquitectura de información

Navegación recomendada:

- la navegación de empresa agrega `Skills`
- el detalle de agente agrega `Skills` como su propia pestaña
- el detalle de habilidad de empresa obtiene su propia ruta cuando se lance la biblioteca de la empresa

Separación recomendada:

- La página de habilidades de empresa responde: "¿Qué habilidades tenemos?"
- La pestaña de habilidades de agente responde: "¿Qué usa este agente y está sincronizado?"

## 8.1 Mapa de rutas propuesto

- `/companies/:companyId/skills`
- `/companies/:companyId/skills/:skillId`
- `/agents/:agentId/skills`

## 8.2 Navegación y descubrimiento

Puntos de entrada recomendados:

- sidebar de empresa: `Skills`
- pestañas de página de agente: `Skills`
- vista previa de importación de empresa: enlazar habilidades importadas a la página de habilidades de empresa más adelante
- filas de habilidades de agente: enlazar al detalle de habilidad de empresa

## 9. Integración de importación / exportación

La UI de habilidades y la portabilidad de paquetes deberían encontrarse en la biblioteca de habilidades de la empresa.

Comportamiento de importación:

- importar un paquete de empresa con contenido `SKILL.md` debería crear o actualizar habilidades de empresa
- los adjuntos de agente deberían provenir principalmente de asociaciones de nombre corto de `AGENTS.md`
- `.paperclip.yaml` puede agregar fidelidad específica de Paperclip, pero no debería reemplazar el modelo base de asociación de nombre corto
- las habilidades de terceros referenciadas deberían mantener visible la procedencia

Comportamiento de exportación:

- exportar una empresa debería incluir habilidades gestionadas de empresa cuando se seleccionen
- `AGENTS.md` debería emitir asociaciones de habilidades por nombre corto o slug
- `.paperclip.yaml` puede agregar fidelidad de habilidades específica de Paperclip más adelante si se necesita, pero no debería ser requerido para la asociación ordinaria de agente a habilidad
- las habilidades externas solo del adaptador no deberían exportarse silenciosamente como habilidades de empresa gestionadas

## 9.1 Flujos de importación

Los flujos V1 deberían admitir:

1. importar una o más habilidades desde una carpeta local
2. importar una o más habilidades desde un repositorio de GitHub
3. importar un paquete de empresa que contenga habilidades
4. adjuntar habilidades importadas a uno o más agentes

La vista previa de importación para habilidades debería mostrar:

- habilidades descubiertas
- fuente y fijado
- nivel de confianza
- advertencias de licencias
- si una habilidad de empresa existente se creará, actualizará u omitirá

## 9.2 Flujos de exportación

V1 debería admitir:

1. exportar una empresa con habilidades gestionadas incluidas cuando se seleccionen
2. exportar un agente cuyo `AGENTS.md` contenga asociaciones de habilidades de nombre corto
3. preservar la compatibilidad con Agent Skills para cada `SKILL.md`

Fuera del alcance de V1:

- exportar automáticamente habilidades externas solo del adaptador como paquetes gestionados

## 10. Forma de datos y API

Este plan implica una división limpia en los conceptos del backend.

### 10.1 Registros de habilidades de empresa

Paperclip debería tener un modelo de habilidad con alcance de empresa o un modelo de paquete gestionado que represente:

- identidad
- fuente
- archivos
- procedencia
- metadatos de confianza y licencias

### 10.2 Adjuntos de habilidades de agente

Paperclip debería almacenar por separado:

- id de agente
- identidad de habilidad
- estado deseado habilitado
- ordenamiento opcional o metadatos más adelante

### 10.3 Instantánea de sincronización del adaptador

Las lecturas del adaptador deberían retornar:

- bandera de admitido
- modo de sincronización
- entradas
- advertencias
- habilidades deseadas

Esto ya existe en forma aproximada y debería ser la base para la UI.

### 10.4 Necesidades de API orientadas a la UI

La UI completa implica estas superficies de API:

- listar habilidades gestionadas de empresa
- importar habilidades de empresa desde ruta/URL/GitHub
- obtener detalle de una habilidad de empresa
- listar agentes que usan una habilidad dada
- adjuntar/desadjuntar habilidades de empresa para un agente
- listar instantánea de sincronización del adaptador para un agente
- aplicar habilidades deseadas para un agente

Las API existentes de sincronización de habilidades a nivel de agente pueden seguir siendo la base para la pestaña del agente.
Las API de biblioteca a nivel de empresa aún necesitan diseñarse e implementarse.

## 11. UX página por página

### 11.1 Página de lista de habilidades de empresa

Encabezado:

- título
- explicación corta de compatibilidad con Agent Skills / `skills.sh`
- botón de importar

Cuerpo:

- filtros
- tabla o tarjetas de habilidades
- estado vacío cuando no hay

Contenido secundario:

- panel de advertencias para habilidades no confiables o incompatibles

### 11.2 Página de detalle de habilidad de empresa

Encabezado:

- nombre de habilidad
- nombre corto
- insignia de fuente
- insignia de confianza
- insignia de compatibilidad

Secciones:

- `SKILL.md` renderizado
- archivos y referencias
- uso por agentes
- fuente / procedencia
- advertencias de confianza y licencias

Acciones:

- adjuntar a agente
- eliminar de la biblioteca de la empresa más adelante
- exportar más adelante

### 11.3 Pestaña de habilidades de agente

Encabezado:

- resumen de soporte del adaptador
- modo de sincronización
- acciones de actualización y sincronización

Cuerpo:

- lista de habilidades gestionadas
- lista de habilidades externas/descubiertas
- advertencias / bloque de estado no admitido

## 12. Estados y casos vacíos

### 12.1 Página de habilidades de empresa

Estados:

- vacío
- cargando
- cargado
- importación en curso
- importación fallida

### 12.2 Detalle de habilidad de empresa

Estados:

- cargando
- no encontrado
- incompatible
- cargado

### 12.3 Pestaña de habilidades de agente

Estados:

- cargando instantánea
- adaptador no admitido
- adaptador de solo lectura
- adaptador con capacidad de sincronización
- sincronización fallida
- borrador obsoleto

## 13. Permisos y gobernanza

Política V1 sugerida:

- los usuarios del tablero pueden gestionar habilidades de empresa
- los usuarios del tablero pueden adjuntar habilidades a agentes
- los agentes mismos no mutan la biblioteca de habilidades de empresa por defecto
- más adelante, ciertos agentes pueden obtener permisos con alcance para adjunto o sincronización de habilidades

## 14. Fases de UI

### Fase A: Estabilizar la UI actual de sincronización de habilidades de agente

Objetivos:

- mover habilidades a una pestaña de `AgentDetail`
- mejorar el lenguaje de estado
- admitir estado solo deseado incluso en adaptadores no admitidos
- pulir el texto para adaptadores persistentes vs efímeros

### Fase B: Agregar página de habilidades de empresa

Objetivos:

- biblioteca de habilidades a nivel de empresa
- importar desde GitHub/carpeta local
- vista de detalle básica
- conteos de uso por agente
- ruta de importación compatible con `skills.sh`

### Fase C: Conectar habilidades con portabilidad

Objetivos:

- importar paquetes de empresa crea habilidades de empresa
- exportar habilidades seleccionadas funciona limpiamente
- los adjuntos de agente hacen ida y vuelta principalmente a través de nombres cortos de `AGENTS.md`

### Fase D: Flujo de adopción de habilidades externas

Objetivos:

- detectar habilidades externas del adaptador
- permitir importarlas al estado gestionado de la empresa donde sea posible
- hacer explícita la procedencia

### Fase E: UX avanzada de sincronización y deriva

Objetivos:

- comparación de deseado vs real
- acciones de resolución de deriva
- informes de uso y sincronización de habilidades multiagente

## 15. Riesgos de diseño

1. Sobrecargar la página del agente con gestión de paquetes hará la función confusa.
2. Tratar los adaptadores no admitidos como rotos en lugar de no gestionados hará que el producto se sienta inconsistente.
3. Mezclar habilidades externas descubiertas por el adaptador con habilidades gestionadas de empresa sin etiquetas claras erosionará la confianza.
4. Si los registros de habilidades de empresa no existen, la importación/exportación y la UI seguirán débilmente acopladas y la fidelidad de ida y vuelta seguirá débil.
5. Si las asociaciones de agente a habilidad están basadas en rutas en lugar de nombres cortos, el formato se sentirá demasiado técnico y demasiado específico de Paperclip.

## 16. Recomendación

El próximo paso de producto debería ser:

1. mover las habilidades fuera de la configuración del agente a una pestaña dedicada de `Skills`
2. agregar una página dedicada de `Skills` a nivel de empresa como superficie de biblioteca y gestión de paquetes
3. hacer que la importación/exportación de empresas apunte a esa biblioteca de habilidades de empresa, no directamente a la página del agente
4. preservar la verdad consciente del adaptador en la UI separando claramente:
   - deseado
   - real
   - externo
   - no gestionado
5. mantener las asociaciones de agente a habilidad basadas en nombre corto en `AGENTS.md`

Eso le da a Paperclip una historia coherente de habilidades en lugar de forzar la gestión de paquetes, la sincronización del adaptador y la configuración del agente en la misma pantalla.
