# Despliegue de sincronización de habilidades por adaptador 2026-03-14

Estado: Propuesto
Fecha: 2026-03-14
Audiencia: Producto e ingeniería
Relacionado:
- `doc/plans/2026-03-14-skills-ui-product-plan.md`
- `doc/plans/2026-03-13-company-import-export-v2.md`
- `docs/companies/companies-spec.md`

## 1. Propósito

Este documento define el plan de despliegue para el soporte de habilidades en todos los adaptadores de Paperclip.

El objetivo no es solo "mostrar una pestaña de habilidades". El objetivo es:

- cada adaptador tiene un modelo de verdad deliberado de sincronización de habilidades
- la UI dice la verdad para ese adaptador
- Paperclip almacena el estado de habilidad deseado de forma consistente incluso cuando el adaptador no puede conciliarlo por completo
- los adaptadores no admitidos se degradan con claridad y seguridad

## 2. Matriz actual de adaptadores

Paperclip actualmente tiene estos adaptadores:

- `claude_local`
- `codex_local`
- `cursor_local`
- `gemini_local`
- `opencode_local`
- `pi_local`
- `openclaw_gateway`

La API de habilidades actual admite:

- `unsupported`
- `persistent`
- `ephemeral`

Estado actual de implementación:

- `codex_local`: implementado, `persistent`
- `claude_local`: implementado, `ephemeral`
- `cursor_local`: aún no implementado, pero técnicamente apto para `persistent`
- `gemini_local`: aún no implementado, pero técnicamente apto para `persistent`
- `pi_local`: aún no implementado, pero técnicamente apto para `persistent`
- `opencode_local`: aún no implementado; probablemente `persistent`, pero con manejo especial porque actualmente inyecta en el directorio compartido de habilidades de Claude
- `openclaw_gateway`: aún no implementado; bloqueado en el soporte del protocolo de gateway, así que `unsupported` por ahora

## 3. Principios de producto

1. Las habilidades deseadas viven en Paperclip para cada adaptador.
2. Los adaptadores pueden exponer diferentes modelos de verdad, y la UI debe reflejar eso honestamente.
3. Los adaptadores persistentes deberían leer y conciliar el estado instalado real.
4. Los adaptadores efímeros deberían reportar el estado efectivo de tiempo de ejecución, no pretender que poseen una instalación persistente.
5. Los adaptadores de directorio compartido necesitan salvaguardas más fuertes que los adaptadores de directorio aislado.
6. Los adaptadores de gateway o nube no deben fingir sincronización local del sistema de archivos.

## 4. Clasificación de adaptadores

### 4.1 Adaptadores persistentes de directorio local

Estos adaptadores tienen un directorio local estable de habilidades que Paperclip puede leer y gestionar.

Candidatos:

- `codex_local`
- `cursor_local`
- `gemini_local`
- `pi_local`
- `opencode_local` con salvedades

UX esperada:

- mostrar habilidades instaladas reales
- mostrar habilidades gestionadas vs externas
- admitir `sync`
- admitir eliminación de obsoletas
- conservar habilidades externas desconocidas

### 4.2 Adaptadores de montaje efímero

Estos adaptadores no tienen un estado de instalación persistente significativo propio de Paperclip.

Adaptador actual:

- `claude_local`

UX esperada:

- mostrar habilidades deseadas de Paperclip
- mostrar directorios externos descubribles si están disponibles
- decir "se montará en la próxima ejecución" en lugar de "instalado"
- no implicar un estado de instalación persistente propio del adaptador

### 4.3 Adaptadores no admitidos / remotos

Estos adaptadores no pueden admitir sincronización de habilidades sin nuevas capacidades externas.

Adaptador actual:

- `openclaw_gateway`

UX esperada:

- la biblioteca de habilidades de empresa sigue funcionando
- la UI de adjunto de agente sigue funcionando a nivel de estado deseado
- el estado real del adaptador es `unsupported`
- el botón de sincronización está deshabilitado o reemplazado con texto explicativo

## 5. Plan por adaptador

### 5.1 Codex Local

Modo objetivo:

- `persistent`

Estado actual:

- ya implementado

Requisitos para terminar:

- mantener como implementación de referencia
- reforzar las pruebas en torno a habilidades personalizadas externas y eliminación de obsoletas
- garantizar que las habilidades de empresa importadas puedan adjuntarse y sincronizarse sin trabajo manual de rutas

Criterios de éxito:

- listar habilidades instaladas gestionadas y externas
- sincronizar habilidades deseadas en `CODEX_HOME/skills`
- conservar habilidades externas gestionadas por el usuario

### 5.2 Claude Local

Modo objetivo:

- `ephemeral`

Estado actual:

- ya implementado

Requisitos para terminar:

- pulir el lenguaje de estado en la UI
- distinguir claramente "deseado" de "montado en la próxima ejecución"
- opcionalmente mostrar directorios de habilidades externas configurados si Claude los expone

Criterios de éxito:

- habilidades deseadas almacenadas en Paperclip
- habilidades seleccionadas montadas por ejecución
- sin lenguaje engañoso de "instalado"

### 5.3 Cursor Local

Modo objetivo:

- `persistent`

Base técnica:

- el tiempo de ejecución ya inyecta habilidades de Paperclip en `~/.cursor/skills`

Trabajo de implementación:

1. Agregar `listSkills` para Cursor.
2. Agregar `syncSkills` para Cursor.
3. Reutilizar el mismo patrón de symlink gestionado que Codex.
4. Distinguir:
   - habilidades gestionadas de Paperclip
   - habilidades externas ya presentes
   - habilidades deseadas faltantes
   - habilidades gestionadas obsoletas

Pruebas:

- pruebas unitarias para descubrimiento
- pruebas unitarias para sincronización y eliminación de obsoletas
- verificar que la configuración compartida de autenticación/sesión no se altere

Criterios de éxito:

- los agentes de Cursor muestran el estado instalado real
- la sincronización desde la pestaña de Skills del agente funciona

### 5.4 Gemini Local

Modo objetivo:

- `persistent`

Base técnica:

- el tiempo de ejecución ya inyecta habilidades de Paperclip en `~/.gemini/skills`

Trabajo de implementación:

1. Agregar `listSkills` para Gemini.
2. Agregar `syncSkills` para Gemini.
3. Reutilizar las convenciones de symlink gestionado de Codex/Cursor.
4. Verificar que la autenticación permanezca intacta mientras se concilian las habilidades.

Salvedad potencial:

- si Gemini trata ese directorio de habilidades como estado de usuario compartido, la UI debería advertir antes de eliminar habilidades gestionadas obsoletas

Criterios de éxito:

- los agentes de Gemini pueden conciliar el estado de habilidad deseado vs real

### 5.5 Pi Local

Modo objetivo:

- `persistent`

Base técnica:

- el tiempo de ejecución ya inyecta habilidades de Paperclip en `~/.pi/agent/skills`

Trabajo de implementación:

1. Agregar `listSkills` para Pi.
2. Agregar `syncSkills` para Pi.
3. Reutilizar ayudantes de symlink gestionado.
4. Verificar que el comportamiento del archivo de sesión permanezca independiente de la sincronización de habilidades.

Criterios de éxito:

- los agentes de Pi exponen el estado real de habilidad instalada
- Paperclip puede sincronizar habilidades deseadas en el directorio persistente de Pi

### 5.6 OpenCode Local

Modo objetivo:

- `persistent`

Caso especial:

- OpenCode actualmente inyecta habilidades de Paperclip en `~/.claude/skills`

Esto es riesgoso para el producto porque:

- comparte estado con Claude
- Paperclip puede implicar accidentalmente que las habilidades pertenecen solo a OpenCode cuando el directorio es compartido

Plan:

Fase 1:

- implementar `listSkills` y `syncSkills`
- tratarlo como `persistent`
- etiquetar explícitamente el directorio como compartido en el texto de la UI
- solo eliminar habilidades gestionadas obsoletas de Paperclip que estén claramente marcadas como gestionadas por Paperclip

Fase 2:

- investigar si OpenCode admite su propio directorio de habilidades aislado
- si sí, migrar a un directorio específico del adaptador y eliminar la salvedad del directorio compartido

Criterios de éxito:

- los agentes de OpenCode muestran el estado real
- el riesgo del directorio compartido es visible y acotado

### 5.7 OpenClaw Gateway

Modo objetivo:

- `unsupported` hasta que exista soporte del protocolo de gateway

Trabajo externo requerido:

- API de gateway para listar habilidades instaladas/disponibles
- API de gateway para instalar/eliminar o conciliar habilidades de otra forma
- metadatos de gateway sobre si el estado es persistente o efímero

Hasta entonces:

- Paperclip almacena solo habilidades deseadas
- la UI muestra estado real no admitido
- sin implementación falsa de sincronización

Objetivo futuro:

- probablemente un cuarto modelo de verdad eventualmente, como estado persistente gestionado remotamente
- por ahora, mantener la API actual y tratar el gateway como no admitido

## 6. Plan de API

## 6.1 Mantener la API mínima actual del adaptador

El contrato del adaptador a corto plazo sigue siendo:

- `listSkills(ctx)`
- `syncSkills(ctx, desiredSkills)`

Esto es suficiente para todos los adaptadores locales.

## 6.2 Puntos de extensión opcionales

Agregar solo si se necesita después del primer despliegue amplio:

- `skillHomeLabel`
- `sharedHome: boolean`
- `supportsExternalDiscovery: boolean`
- `supportsDestructiveSync: boolean`

Estos deberían ser adiciones opcionales de metadatos a la instantánea, no nuevos métodos de adaptador requeridos.

## 7. Plan de UI

La biblioteca de habilidades a nivel de empresa puede seguir siendo neutral ante el adaptador.

La pestaña de Skills a nivel de agente debe volverse consciente del adaptador en texto y estado:

- `persistent`: instalado / faltante / obsoleto / externo
- `ephemeral`: montado en la próxima ejecución / externo / solo deseado
- `unsupported`: solo deseado, el adaptador no puede reportar el estado real

Requisito adicional de UI para adaptadores de directorio compartido:

- mostrar una pequeña advertencia de que el adaptador usa un directorio de habilidades de usuario compartido
- evitar lenguaje destructivo a menos que Paperclip pueda probar que una habilidad es gestionada por Paperclip

## 8. Fases de despliegue

### Fase 1: Terminar la familia local de sistema de archivos

Entregar:

- `cursor_local`
- `gemini_local`
- `pi_local`

Justificación:

- son los más cercanos a Codex en arquitectura
- ya inyectan en directorios de habilidades locales estables

### Fase 2: Soporte de directorio compartido de OpenCode

Entregar:

- `opencode_local`

Justificación:

- técnicamente factible ahora
- necesita un lenguaje de producto ligeramente más cuidadoso por el directorio compartido de habilidades de Claude

### Fase 3: Decisión de soporte de gateway

Decidir:

- mantener `openclaw_gateway` no admitido para V1
- o extender el protocolo de gateway para gestión remota de habilidades

Mi recomendación:

- no bloquear V1 en el soporte de gateway
- mantenerlo explícitamente no admitido hasta que exista el protocolo remoto

## 9. Definición de terminado

El soporte de habilidades en todos los adaptadores está listo cuando todo esto es cierto:

1. Cada adaptador tiene un modelo de verdad explícito:
   - `persistent`
   - `ephemeral`
   - `unsupported`
2. El texto de la UI coincide con ese modelo de verdad.
3. Todos los adaptadores persistentes locales implementan:
   - `listSkills`
   - `syncSkills`
4. Las pruebas cubren:
   - almacenamiento de estado deseado
   - descubrimiento de estado real
   - distinciones gestionado vs externo
   - limpieza de habilidades gestionadas obsoletas donde se admita
5. `openclaw_gateway` está:
   - explícitamente no admitido con UX limpia
   - o respaldado por una API remota real de habilidades

## 10. Recomendación

El orden inmediato recomendado es:

1. `cursor_local`
2. `gemini_local`
3. `pi_local`
4. `opencode_local`
5. diferir `openclaw_gateway`

Eso lleva a Paperclip de "las habilidades funcionan para Codex y Claude" a "las habilidades funcionan para toda la familia de adaptadores locales", que es el hito significativo de V1.
