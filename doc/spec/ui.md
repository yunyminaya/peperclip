# Especificación de UI de Paperclip

Estado: Borrador
Fecha: 2026-02-17

## 1. Filosofía de diseño

La UI de Paperclip es un plano de control de nivel profesional, no un panel de juguete. Debe sentirse como la herramienta en la que vives todo el día — rápida, orientada al teclado, densa en información sin estar desordenada, con tema oscuro por defecto. Cada píxel debe ganarse su lugar.

Principios de diseño:

- **Denso pero legible.** Muestra la máxima información sin requerir clics para revelarla. Usa el espacio en blanco para separar, no para rellenar.
- **Teclado primero.** Atajos globales para buscar (Cmd+K), nuevo issue (C), navegación. Los usuarios avanzados rara vez deberían tocar el mouse.
- **Contextual, no modal.** Edición en línea sobre cuadros de diálogo. Desplegables sobre navegaciones de página. El contexto mental del usuario nunca debe romperse innecesariamente.
- **Tema oscuro por defecto.** Grises neutros, no negro puro. Colores de acento usados con moderación para estado y prioridad. El texto es el elemento visual principal.

### Sistema de color

- **Fondo:** `hsl(220, 13%, 10%)` (gris carbón oscuro, no negro puro)
- **Superficie/tarjeta:** `hsl(220, 13%, 13%)`
- **Borde:** `hsl(220, 10%, 18%)`
- **Texto primario:** `hsl(220, 10%, 90%)`
- **Texto secundario:** `hsl(220, 10%, 55%)`
- **Acento (interactivo):** `hsl(220, 80%, 60%)` (azul apagado)

Colores de estado (consistentes en todas las entidades):
- **Backlog:** gris `hsl(220, 10%, 45%)`
- **Todo:** gris azulado `hsl(220, 20%, 55%)`
- **In Progress:** amarillo `hsl(45, 90%, 55%)`
- **In Review:** violeta `hsl(270, 60%, 60%)`
- **Done:** verde `hsl(140, 60%, 50%)`
- **Cancelled:** gris `hsl(220, 10%, 40%)`
- **Blocked:** ámbar `hsl(25, 90%, 55%)`

Indicadores de prioridad:
- **Critical:** círculo rojo, relleno
- **High:** círculo naranja, medio relleno
- **Medium:** círculo amarillo, contorno
- **Low:** círculo gris, contorno, punteado

### Tipografía

- **Fuente:** pila de fuentes del sistema (Inter si está cargada, si no `-apple-system, BlinkMacSystemFont, 'Segoe UI'`)
- **Cuerpo:** 13px / interlineado 1.5
- **Etiquetas/metadatos:** 11px / mayúsculas con espaciado
- **Encabezados:** 14-18px / seminegrita, nunca todo en mayúsculas

### Íconos

Usa `lucide-react` en todo. Cada elemento de la barra lateral, cada indicador de estado, cada botón de acción debe tener un ícono. Los íconos son de 16px en la navegación, 14px en línea.

---

## 2. Estructura de la aplicación

La app es un diseño de tres zonas:

```
┌──────────┬────────────────────────────────────────────────┐
│          │  Breadcrumb bar                                │
│ Sidebar  ├──────────────────────────┬─────────────────────┤
│ (240px)  │  Main content            │  Properties panel   │
│          │  (flex-1)                │  (320px, optional)  │
│          │                          │                     │
└──────────┴──────────────────────────┴─────────────────────┘
```

- **Barra lateral:** Fija a la izquierda, 240px. Colapsable a solo íconos (48px) vía toggle o atajo de teclado.
- **Barra de migas de pan:** Abarca todo el ancho sobre el contenido principal + propiedades. Muestra la ruta de navegación, acciones de la entidad y controles de vista.
- **Contenido principal:** Desplazable. Contiene la vista primaria (lista, detalle, gráfico, etc).
- **Panel de propiedades:** Lado derecho, 320px. Se muestra en vistas de detalle (detalle de issue, detalle de proyecto, detalle de agente). Oculto en vistas de lista y panel. Redimensionable.

El panel de propiedades se desliza hacia adentro cuando haces clic en una vista de detalle y se desliza hacia afuera cuando vuelves a una lista. NO es una barra lateral — es contextual a la entidad seleccionada.

---

## 3. Barra lateral

La barra lateral es la navegación principal. Está agrupada en secciones lógicas con encabezados colapsables.

### 3.1 Encabezado de empresa

Parte superior de la barra lateral. Siempre visible.

```
┌─────────────────────────┐
│ [icon] Acme Corp      ▼ │  ← Company switcher dropdown
├─────────────────────────┤
│ [🔍]  [✏️]              │  ← Search + New Issue
└─────────────────────────┘
```

El **selector de empresa** es un botón desplegable que ocupa todo el ancho del encabezado de la barra lateral. Muestra:
- Ícono de empresa (avatar de primera letra con color de empresa, o ícono subido)
- Nombre de la empresa (truncado con elipsis si es largo)
- Ícono de chevron-abajo

Al hacer clic se abre un desplegable con:
- Lista de todas las empresas (con punto de estado: verde=activa, amarillo=pausada, gris=archivada)
- Campo de búsqueda en la parte superior del desplegable (para usuarios con muchas empresas)
- Separador
- Acción `+ Create company` al final

Debajo del nombre de la empresa, una fila de botones de ícono:
- **Buscar** (ícono de lupa) — abre el modal de búsqueda Cmd+K
- **Nuevo issue** (ícono de lápiz/pluma cuadrada) — abre el modal de nuevo issue en el contexto de la empresa actual

### 3.2 Sección personal

Sin encabezado de sección — siempre están arriba, debajo del encabezado de empresa.

```
  Inbox                    3
  My Issues
```

- **Bandeja de entrada** — elementos que requieren la atención del operador del tablero. Contador de insignia a la derecha. Incluye: aprobaciones pendientes, alertas de presupuesto, latidos fallidos. El número es el conteo total de no leídos/no resueltos.
- **Mis issues** — issues creados por el operador del tablero o asignados a él.

### 3.3 Sección de trabajo

Encabezado de sección: **Trabajo** (colapsable, con toggle de chevron)

```
  Work                     ▼
    Issues
    Projects
    Goals
    Views
```

- **Issues** — lista principal de tareas de la empresa seleccionada. Esta es la vista de trabajo.
- **Proyectos** — lista de proyectos. Los proyectos agrupan issues y enlazan a objetivos.
- **Objetivos** — jerarquía de objetivos de la empresa.
- **Vistas** — configuraciones guardadas de filtro/orden (p. ej., "Errores críticos", "Tareas sin asignar", "Tareas del CEO"). Los usuarios pueden crear, nombrar y fijar vistas personalizadas aquí.

### 3.4 Sección de empresa

Encabezado de sección: **Empresa** (colapsable)

```
  Company                  ▼
    Dashboard
    Org Chart
    Agents
    Costs
    Activity
```

- **Panel** — resumen de salud de la empresa: estados de agentes, velocidad de tareas, consumo de costos, conteo de aprobaciones pendientes.
- **Organigrama** — visualización de árbol interactiva de la jerarquía de reportes de agentes.
- **Agentes** — lista plana de todos los agentes con estado, rol, último latido, gasto.
- **Costos** — panel de costos con desgloses por agente, proyecto, modelo, tiempo.
- **Actividad** — log de auditoría de todos los eventos del sistema.

Nota: las aprobaciones no tienen una entrada de navegación superior. Se presentan vía la **bandeja de entrada** (punto de interacción primario), el **panel** (métrica de conteo pendiente) y **en línea en las páginas de entidades** (p. ej., una página de detalle de agente muestra la aprobación que autorizó su contratación). La ruta `/approvals` sigue existiendo y es accesible vía los enlaces "Ver todas las aprobaciones" en la bandeja de entrada y el panel, pero no está en la navegación lateral.

### 3.5 Comportamiento de secciones

- Cada encabezado de sección es clicable para colapsar/expandir sus hijos.
- El estado colapsado persiste en localStorage.
- El elemento de navegación activo se resalta con un acento de borde izquierdo y tinte de fondo.
- Pasar el cursor sobre un elemento de navegación muestra un sutil resaltado de fondo.
- Los contadores de insignia están alineados a la derecha, renderizados como pequeñas píldoras (p. ej., `3` en un rectángulo redondeado).
- Los íconos son de 16px, alineados a la izquierda, con 8px de separación del texto de la etiqueta.

### 3.6 Íconos de la barra lateral

Cada elemento de navegación tiene un ícono distintivo (lucide-react):

| Item | Icon |
|------|------|
| Bandeja de entrada | `Inbox` |
| Mis issues | `CircleUser` |
| Issues | `CircleDot` |
| Proyectos | `Hexagon` |
| Objetivos | `Target` |
| Vistas | `LayoutList` |
| Panel | `LayoutDashboard` |
| Organigrama | `GitBranch` |
| Agentes | `Bot` |
| Costos | `DollarSign` |
| Actividad | `History` |

---

## 4. Barra de migas de pan

La barra de migas de pan está sobre el contenido principal y el panel de propiedades. Sirve como navegación e indicador de contexto.

### 4.1 Estructura

```
┌─────────────────────────────────────────────────────────────────────┐
│ Projects › Paperclip › Issues › CLIP-42  [⭐] [···]     [🔔] [⬜] │
└─────────────────────────────────────────────────────────────────────┘
```

**Lado izquierdo:**
- Segmentos de migas de pan, separados por chevrones `›`.
- Cada segmento es clicable para navegar a ese nivel.
- El segmento actual no es clicable, texto ligeramente más grueso.
- Ícono de estrella para marcar/fijar la entidad actual como favorita.
- Menú de tres puntos para acciones de la entidad (eliminar, archivar, duplicar, copiar enlace, etc.)

**Lado derecho:**
- Campana de notificación (si está en una vista de detalle — suscribirse a cambios en esta entidad)
- Toggle del panel (mostrar/ocultar el panel de propiedades derecho)

### 4.2 Pestañas específicas de vista

En ciertas páginas de detalle, la barra de migas de pan también contiene una fila de pestañas debajo de las migas:

**Detalle de proyecto:**
```
  Overview    Updates    Issues    Settings
```

**Detalle de agente:**
```
  Overview    Heartbeats    Issues    Costs
```

Las pestañas se renderizan como botones en forma de píldora. La pestaña activa tiene un sutil relleno de fondo.

---

## 5. Issues (gestión de tareas)

Los issues son la unidad central de trabajo. Esta sección detalla la experiencia completa de issues.

### 5.1 Vista de lista de issues

La lista de issues es la vista por defecto al hacer clic en "Issues" en la barra lateral.

**Diseño:**
```
┌─────────────────────────────────────────────────────────────────┐
│ [All Issues] [Active] [Backlog]  [⚙ Settings]    [≡ Filter]  [Display ▼] │
├─────────────────────────────────────────────────────────────────┤
│ ▼ Todo                                                3    [+] │
│ ☐ --- CLIP-5  ○ Implement user auth          @CTO    Feb 16  │
│ ☐ --- CLIP-3  ○ Set up CI pipeline           @DevOps Feb 16  │
│ ☐ --- CLIP-8  ○ Write API documentation      @Writer Feb 17  │
│                                                                 │
│ ▼ In Progress                                         2    [+] │
│ ☐ !!! CLIP-1  ◐ Build landing page           @FE     Feb 15  │
│ ☐ --- CLIP-4  ◐ Database schema design       @CTO    Feb 14  │
│                                                                 │
│ ▼ Backlog                                             5    [+] │
│ ☐ --- CLIP-9  ◌ Research competitors                  Feb 17  │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Barra de herramientas superior:**
- **Pestañas de estado:** `All Issues`, `Active` (todo + in_progress + in_review + blocked), `Backlog`. Cada pestaña muestra un ícono de estado y un conteo. La pestaña activa está rellena, las demás delineadas.
- **Engranaje de ajustes:** Configura valores por defecto de visualización de issues, campos personalizados.
- **Botón de filtro:** Abre una barra de filtros debajo de la barra de herramientas.
- **Desplegable de visualización:** Alterna entre modos de agrupación (por estado, por prioridad, por asignado, por proyecto, ninguno) y modos de diseño (lista, panel/kanban).

**Agrupación:**
- Los issues se agrupan por estado por defecto (como en las capturas de referencia).
- Cada encabezado de grupo muestra: chevron de colapso, ícono de estado, nombre del estado, conteo y un botón `+` para crear un nuevo issue en ese estado.
- Los grupos son colapsables. Los grupos colapsados muestran solo el encabezado con el conteo.

**Filas de issues:**
Cada fila contiene, de izquierda a derecha:
1. **Casilla de verificación** — para selección múltiple. Oculta por defecto, aparece al pasar el cursor (a la izquierda de la prioridad).
2. **Indicador de prioridad** — ícono que representa critical/high/medium/low (ver Sistema de color arriba). Siempre visible.
3. **Clave del issue** — p. ej., `CLIP-5`. Monoespaciado, color atenuado. El prefijo se deriva del proyecto (o de la empresa si no hay proyecto).
4. **Círculo de estado** — clicable para abrir el desplegable de cambio de estado (igual que la captura de referencia). El relleno/color del círculo refleja el estado actual.
5. **Título** — texto primario, truncado con elipsis si es demasiado largo.
6. **Asignado** — avatar (ícono de agente) + nombre del agente, alineado a la derecha. Si no está asignado, muestra un marcador de círculo punteado.
7. **Fecha** — fecha de creación o fecha objetivo, texto atenuado, al extremo derecho.

**Interacciones de fila:**
- Clic en la fila → navega a la vista de detalle del issue.
- Clic en el círculo de estado → abre el desplegable de estado en línea (Backlog, Todo, In Progress, In Review, Done, Cancelled) con números del teclado como atajos (1-6).
- Clic en la casilla → selecciona para acciones masivas. Cuando se selecciona alguna casilla, aparece una barra de acciones masivas al final de la lista.
- Pasar el cursor → muestra la casilla, y la fila recibe un sutil resaltado de fondo.
- Clic derecho → menú contextual (mismas acciones que el menú de tres puntos).

**Barra de acciones masivas:**
Cuando se seleccionan uno o más issues, aparece una barra flotante al final:
```
┌─────────────────────────────────────────────────────────┐
│  3 selected    [Status ▼] [Priority ▼] [Assignee ▼] [Project ▼]  [🗑 Delete]  [✕ Cancel] │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Barra de filtros de issues

Al hacer clic en "Filtrar" se revela una barra de filtros debajo de la barra de herramientas:

```
┌─────────────────────────────────────────────────────────┐
│ [+ Add filter]  Status is Todo, In Progress  [×]        │
│                 Priority is Critical, High    [×]        │
│                 Assignee is CTO-Agent         [×]        │
└─────────────────────────────────────────────────────────┘
```

- Cada filtro es una ficha que muestra `campo operador valor`.
- Clic en una ficha para editarla.
- `×` elimina el filtro.
- `+ Add filter` abre un desplegable de campos disponibles: Estado, Prioridad, Asignado, Proyecto, Objetivo, Fecha de creación, Etiquetas, Creador.
- Los filtros se componen con AND.
- Los filtros activos persisten en el query string de la URL para que sean compartibles/marcables.

### 5.3 Vista de detalle de issue (tres paneles)

Al hacer clic en un issue se abre la vista de detalle. El área de contenido principal se divide en dos zonas, con la barra lateral aún visible a la izquierda.

```
┌──────────┬────────────────────────────────┬──────────────────────┐
│          │ Issues › CLIP-42               │                      │
│ Sidebar  │                                │   Properties     [+] │
│          │ Fix user authentication bug    │                      │
│          │ Implement proper token...      │   Status    In Progress │
│          │                                │   Priority  High     │
│          │ ┌──────────────────────────┐   │   Assignee  CTO      │
│          │ │ Properties bar (inline)  │   │   Project   Auth     │
│          │ │ In Progress · High ·     │   │   Goal      Security │
│          │ │ CTO · Auth project · ... │   │   Labels    bug, auth│
│          │ └──────────────────────────┘   │   Start     Feb 15   │
│          │                                │   Target    Feb 20   │
│          │ Description                    │   Created   Feb 14   │
│          │ ─────────────────              │                      │
│          │ The current authentication     │   ─────────────────  │
│          │ system has a token refresh...  │   Activity           │
│          │                                │   CTO commented 2h   │
│          │ Comments                       │   Status → In Prog   │
│          │ ─────────────────              │   Created by Tablero   │
│          │ [avatar] CTO · 2 hours ago     │                      │
│          │ I've identified the root...    │                      │
│          │                                │                      │
│          │ [avatar] DevOps · 1 hour ago   │                      │
│          │ The CI is set up to run...     │                      │
│          │                                │                      │
│          │ ┌──────────────────────────┐   │                      │
│          │ │ Write a comment...       │   │                      │
│          │ └──────────────────────────┘   │                      │
└──────────┴────────────────────────────────┴──────────────────────┘
```

#### Panel central (contenido principal)

**Área de encabezado:**
- Título del issue, grande (18px, seminegrita), editable al hacer clic (edición en línea).
- Subtítulo: clave del issue `CLIP-42` en texto atenuado.
- Debajo del título: barra de propiedades en línea que muestra propiedades clave como fichas clicables (mismo patrón que las capturas de referencia): `[○ In Progress] [!!! High] [👤 CTO] [📅 Target date] [📁 Auth] [···]`. Cada ficha es clicable para cambiar esa propiedad en línea.

**Descripción:**
- Descripción renderizada en markdown.
- Clic para editar — abre un editor de markdown en el lugar.
- Admite encabezados, listas, bloques de código, enlaces, imágenes.

**Subtareas (si hay):**
- Listadas debajo de la descripción como sección colapsable.
- Cada subtarea es una mini fila de issue (círculo de estado + título + asignado).
- Botón `+ Add subtask` al final.

**Comentarios:**
- Lista cronológica de comentarios.
- Cada comentario muestra: avatar/ícono del autor, nombre del autor, marca de tiempo, cuerpo (renderizado en markdown).
- Entrada de comentario al final — un área de texto con soporte de markdown y un botón "Comment".
- Los comentarios de agentes muestran un ícono de bot; los comentarios del panel muestran un ícono de usuario.

#### Panel derecho (panel de propiedades)

**Encabezado:** etiqueta "Properties" con un botón `+` para agregar un campo personalizado.

**Lista de propiedades:** Cada propiedad es una fila con etiqueta a la izquierda y valor editable a la derecha.

| Propiedad | Control |
|-----------|---------|
| Estado | Desplegable con opciones de estado + punto de color |
| Prioridad | Desplegable con opciones de prioridad + ícono |
| Asignado | Selector de agente con búsqueda |
| Proyecto | Selector de proyecto |
| Objetivo | Selector de objetivo |
| Etiquetas | Entrada de etiquetas de selección múltiple |
| Lead | Selector de agente |
| Miembros | Selector de agentes de selección múltiple |
| Fecha de inicio | Selector de fecha |
| Fecha objetivo | Selector de fecha |
| Creado por | Texto de solo lectura |
| Creado | Marca de tiempo de solo lectura |
| Código de facturación | Entrada de texto |

Debajo de las propiedades, un separador, luego:

**Sección de actividad:**
- Encabezado "Activity" con enlace "See all".
- Línea de tiempo compacta de eventos recientes: cambios de estado, cambios de asignación, comentarios, etc.
- Cada entrada: ícono + descripción + marca de tiempo relativa.

### 5.4 Modal de nuevo issue

Activado por el ícono de lápiz de la barra lateral, el atajo de teclado `C` o los botones `+` en la lista de issues.

```
┌─────────────────────────────────────────────────────────┐
│ [📁 CLIP] › New issue               [Save as draft] [↗] [×] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Issue title                                             │
│ ___________________________________________________     │
│                                                         │
│ Add a description...                                    │
│                                                         │
│                                                         │
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [○ Todo] [--- Priority] [👤 Assignee] [📁 Project]     │
│ [🏷 Labels] [···]                                       │
├─────────────────────────────────────────────────────────┤
│ [📎]                    [◻ Create more] [Create issue]  │
└─────────────────────────────────────────────────────────┘
```

**Barra superior:**
- Migas de pan mostrando contexto: clave de proyecto (o clave de empresa) `›` "New issue".
- Botón "Save as draft".
- Ícono de expandir (abrir como página completa en lugar de modal).
- Cerrar `×`.

**Cuerpo:**
- Campo de título: entrada grande, placeholder "Issue title". Autofoco al abrir.
- Descripción: editor de markdown debajo, placeholder "Add a description...". Expandible.

**Fichas de propiedades (barra inferior):**
- Fila compacta de botones de propiedades. Cada uno abre un desplegable para establecer esa propiedad.
- Fichas mostradas por defecto: Estado (por defecto Todo), Prioridad, Asignado, Proyecto, Etiquetas.
- Botón más `···` revela: Objetivo, Fecha de inicio, Fecha objetivo, Código de facturación, Issue padre.

**Pie:**
- Botón de adjunto (ícono de clip).
- Toggle "Create more" — cuando está activado, crear un issue limpia el formulario y lo mantiene abierto para entrada rápida.
- Botón primario "Create issue".

**Comportamiento:**
- `Cmd+Enter` envía el formulario.
- Si se abre desde un contexto de proyecto, el proyecto está prellenado.
- Si se abre desde el botón `+` de un grupo de estado específico, ese estado está prellenado.
- El slug/clave se autogenera a partir del prefijo del proyecto + número incremental (mostrado en las migas de pan).

### 5.5 Vista de panel de issues (Kanban)

Accesible vía desplegable de visualización → diseño de panel.

Las columnas representan estados: Backlog | Todo | In Progress | In Review | Done

Cada tarjeta muestra:
- Clave del issue (atenuada)
- Título (texto primario)
- Ícono de prioridad (abajo a la izquierda)
- Avatar del asignado (abajo a la derecha)

Las tarjetas se arrastran entre columnas. Arrastrar una tarjeta a una nueva columna cambia su estado (con validación de transición — las transiciones inválidas muestran un toast de error).

Cada encabezado de columna tiene un botón `+` para crear un nuevo issue en ese estado.

---

## 6. Proyectos

### 6.1 Vista de lista de proyectos

Similar a la lista de issues pero para proyectos.

```
┌─────────────────────────────────────────────────────────┐
│ Projects                                [+ New project] │
├─────────────────────────────────────────────────────────┤
│ [icon] Paperclip Auth     Backlog     CTO     Feb 20   │
│ [icon] Marketing Site     In Progress CMO     Mar 01   │
│ [icon] API v2             Planned     CTO     Mar 15   │
└─────────────────────────────────────────────────────────┘
```

Cada fila: ícono de proyecto (hexágono de color), nombre, insignia de estado, agente lead, fecha objetivo.

### 6.2 Vista de detalle de proyecto (tres paneles)

Usa el mismo diseño de tres paneles que el detalle de issue.

**Pestañas de migas de pan:** Overview | Updates | Issues | Settings

**Pestaña Overview (panel central):**
- Ícono de proyecto + nombre (editable)
- Descripción (markdown, editable)
- Barra de propiedades en línea: `[◌ Backlog] [--- No priority] [👤 Lead] [📅 Target date] [🏢 Team] [···]`
- Sección "Resources": documentos vinculados, URLs
- CTA "Write first project update" (para actualizaciones/publicaciones de estado del proyecto)
- Descripción (cuerpo markdown)
- Sección de hitos (colapsable): lista de marcadores de hito con fecha y estado

**Pestaña Issues:** lista de issues filtrada que muestra solo issues de este proyecto. Mismos controles que la vista principal de issues.

**Panel derecho (propiedades):** Estado, Prioridad, Lead, Miembros, Fecha de inicio, Fecha objetivo, Equipos, Etiquetas, Enlace de objetivo.

**Sección de actividad:** al final del panel de propiedades.

---

## 7. Objetivos

### 7.1 Vista de lista de objetivos

Los objetivos se muestran como un árbol jerárquico, ya que los objetivos tienen relaciones padre-hijo.

```
┌─────────────────────────────────────────────────────────┐
│ Goals                                    [+ New goal]   │
├─────────────────────────────────────────────────────────┤
│ ▼ 🎯 Build the #1 AI note-taking app    Company  Active│
│   ▼ 🎯 Grow signups to 10k              Team     Active│
│       🎯 Launch marketing campaign       Agent  Planned │
│       🎯 Optimize onboarding funnel      Agent  Planned │
│   ▼ 🎯 Ship v2.0 with AI features       Team     Active│
│       🎯 Implement smart search          Task   Planned │
│       🎯 Build auto-summarization        Task   Planned │
└─────────────────────────────────────────────────────────┘
```

Cada fila: chevron de expansión (si tiene hijos), ícono de objetivo, título, insignia de nivel (Empresa/Equipo/Agente/Tarea), insignia de estado.

La indentación refleja la jerarquía. Al hacer clic en un objetivo se abre su vista de detalle.

### 7.2 Vista de detalle de objetivo

Diseño de tres paneles. El panel central muestra título, descripción, objetivos hijos y proyectos vinculados. El panel derecho muestra propiedades (nivel, estado, agente dueño, objetivo padre) y actividad.

---

## 8. Panel

El panel es el resumen de salud de la empresa. Se muestra al hacer clic en "Dashboard" en la sección Empresa.

### 8.1 Diseño

```
┌──────────┬──────────────────────────────────────────────┐
│          │ Dashboard                                     │
│ Sidebar  │                                               │
│          │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐│
│          │ │ Agents   │ │ Tasks   │ │ Costs   │ │Apprvl││
│          │ │ 12 total │ │ 47 open │ │ $234.50 │ │ 3    ││
│          │ │ 8 active │ │ 12 prog │ │ 67% bud │ │pending│
│          │ │ 2 paused │ │ 3 block │ │         │ │      ││
│          │ │ 1 error  │ │ 28 done │ │         │ │      ││
│          │ └─────────┘ └─────────┘ └─────────┘ └──────┘│
│          │                                               │
│          │ ┌────────────────────┐ ┌─────────────────────┐│
│          │ │ Recent Activity    │ │ Stale Tasks          ││
│          │ │ ...                │ │ ...                   ││
│          │ └────────────────────┘ └─────────────────────┘│
└──────────┴──────────────────────────────────────────────┘
```

**Fila superior: tarjetas de métricas** (4 en fila)
1. **Agentes** — conteos total, activos, en ejecución, pausados, con error. Cada uno con puntos de color.
2. **Tareas** — conteos abiertas, en progreso, bloqueadas, terminadas.
3. **Costos** — gasto en dólares del mes a la fecha, porcentaje de utilización del presupuesto con una mini barra de progreso.
4. **Aprobaciones** — conteo pendiente (clicable para navegar a la bandeja de entrada, que es el punto de interacción primario de aprobaciones).

**Fila inferior: paneles de detalle** (2 en fila)
5. **Actividad reciente** — últimas ~10 entradas del log de actividad, formato de línea de tiempo compacta.
6. **Tareas estancadas** — tareas que llevan demasiado tiempo en progreso sin actualizaciones. Cada una muestra clave del issue, título, asignado, tiempo desde la última actividad.

Todas las tarjetas y paneles son clicables para navegar a sus respectivas páginas completas.

---

## 9. Organigrama

Visualización interactiva de la jerarquía de reportes de agentes.

### 9.1 Vista de árbol

```
                    ┌─────────┐
                    │ CEO     │
                    │ running │
                    └────┬────┘
            ┌────────────┼────────────┐
       ┌────┴────┐  ┌────┴────┐  ┌───┴─────┐
       │ CTO     │  │ CMO     │  │ CFO     │
       │ active  │  │ idle    │  │ paused  │
       └────┬────┘  └────┬────┘  └─────────┘
       ┌────┴────┐  ┌────┴────┐
       │ Dev-1   │  │ Mktg-1  │
       │ running │  │ idle    │
       └─────────┘  └─────────┘
```

Cada nodo muestra:
- Nombre del agente
- Rol/título (texto más pequeño)
- Punto de estado (coloreado según el estado del agente)
- Avatar del agente (ícono de bot con color único por agente)

Los nodos son clicables para navegar al detalle del agente.

### 9.2 Interacciones

- Zoom/paneo con la rueda del mouse y arrastrar.
- Clic en un nodo para seleccionarlo — muestra un tooltip breve con información clave (último latido, tarea actual, gasto).
- Doble clic en un nodo para navegar a la página de detalle del agente.
- Clic derecho en el nodo para menú contextual: Ver, Pausar, Reanudar, Invocar latido, Editar.

---

## 10. Agentes

### 10.1 Vista de lista de agentes

```
┌─────────────────────────────────────────────────────────────────┐
│ Agents                                          [+ New agent]   │
├─────────────────────────────────────────────────────────────────┤
│ [🤖] CEO           ceo        ● Running   $45.20/$100   2m ago │
│ [🤖] CTO           cto        ● Active    $23.10/$100   5m ago │
│ [🤖] Dev-1         engineer   ○ Idle      $12.40/$50   15m ago │
│ [🤖] DevOps        devops     ⚠ Paused    $31.00/$50    1h ago │
└─────────────────────────────────────────────────────────────────┘
```

Columnas: Avatar/ícono, Nombre, Rol, Estado (con punto de color), Costo (gastado/presupuesto este mes), Último latido (tiempo relativo).

Al hacer clic en una fila se navega al detalle del agente.

### 10.2 Vista de detalle de agente (tres paneles)

**Pestañas de migas de pan:** Overview | Heartbeats | Issues | Costs

**Overview (panel central):**
- Nombre del agente + rol
- Descripción de capacidades
- Tipo de adaptador + resumen de configuración
- Tarea actual (si hay)
- Reporta a: [nombre de agente clicable]
- Reportes directos: lista de agentes

**Pestaña Heartbeats:** tabla de ejecuciones de latido — hora, origen (manual/programador), estado, duración, error (si hay). Botón de invocar arriba.

**Pestaña Issues:** issues asignados a este agente.

**Pestaña Costs:** desglose de costos de este agente — por modelo, por período, con barra de progreso de presupuesto.

**Propiedades del panel derecho:** Estado, Rol, Título, Reporta a, Tipo de adaptador, Modo de contexto, Presupuesto (mensual), Gastado (mensual), Último latido.

**Acciones rápidas** en la barra de migas de pan: [Pause] [Resume] [Invoke Heartbeat] [···]

## 11. Aprobaciones (contextuales, no independientes)

Las aprobaciones son puertas de gobernanza — decisiones que el panel debe tomar (contratar un agente, aprobar una estrategia del CEO). NO son elementos de trabajo. Su modelo de datos permanece separado de los issues (máquina de estados diferente, disparadores de efectos secundarios, payload no estructurado). Pero no necesitan su propia entrada de navegación superior.

### 11.1 Dónde aparecen las aprobaciones

**1. Bandeja de entrada (primaria).** Las aprobaciones pendientes son los elementos de mayor prioridad de la bandeja. El operador del tablero las ve al frente y al centro con acciones de aprobar/rechazar en línea (ver Sección 14).

**2. Tarjeta de métrica del panel.** La tarjeta "Aprobaciones pendientes" muestra el conteo y enlaza a la lista completa de aprobaciones.

**3. En línea en páginas de entidades.** Cuando una entidad se creó vía una aprobación, la página de detalle muestra un banner contextual:
- Página de detalle de agente: `"Contratado vía aprobación — solicitado por el CEO el 15 feb"` con un enlace al registro de aprobación.
- Un agente en estado `pending` (aún no creado) podría mostrar: `"Aprobación pendiente — solicitada por el CEO"` con acciones de aprobar/rechazar en línea.

**4. Log de actividad.** Los eventos de aprobación (creada, aprobada, rechazada) aparecen en la línea de tiempo de actividad como cualquier otro evento.

### 11.2 Página de lista de aprobaciones (`/approvals`)

Esta página sigue existiendo — es el destino de "Ver todo" desde la bandeja de entrada y el panel. Pero no está en la barra lateral.

```
┌─────────────────────────────────────────────────────────┐
│ Approvals    [Pending] [Approved] [Rejected] [All]      │
├─────────────────────────────────────────────────────────┤
│ 🟡 Hire Agent: "Marketing Analyst"    CEO    2h ago     │
│ 🟡 CEO Strategy: "Q2 Growth Plan"    CEO    4h ago     │
│ 🟢 Hire Agent: "DevOps Engineer"     CTO    1d ago     │
└─────────────────────────────────────────────────────────┘
```

Las pestañas de estado filtran por estado de aprobación. Cada fila: punto de estado, tipo, título/resumen (del payload), solicitante, tiempo relativo.

### 11.3 Vista de detalle de aprobación

Diseño de tres paneles. El panel central renderiza el payload de la aprobación de forma agradable según el tipo:

Tipo **`hire_agent`:** Muestra el nombre propuesto del agente, rol, título, a quién reporta, capacidades, configuración del adaptador, presupuesto. Esencialmente una vista previa del agente que se creará.

Tipo **`approve_ceo_strategy`:** Muestra el texto de la estrategia, el desglose de objetivos propuesto, la estructura inicial de tareas.

Para aprobaciones pendientes, botones de acción prominentes en la parte superior del panel central:
```
┌─────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Decision note (optional): _________________________ │ │
│ │                          [✕ Reject]  [✓ Approve]    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Hire Agent Request                                      │
│ ─────────────────                                       │
│ Name: Marketing Analyst                                 │
│ Role: marketing                                         │
│ Reports to: CMO                                         │
│ Budget: $100/month                                      │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

Panel derecho: Tipo, Estado, Solicitado por, Solicitado el, Decidido por, Decidido el, Nota de decisión. Línea de tiempo de actividad debajo.

---

## 12. Costos

### 12.1 Panel de costos

```
┌─────────────────────────────────────────────────────────┐
│ Costs                               Feb 2026            │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐│
│ │ Month-to-date: $234.50 / $500.00  [====-------] 47% ││
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ By Agent                              By Project        │
│ ┌──────────────────────┐  ┌──────────────────────┐      │
│ │ CEO        $45.20    │  │ Auth       $67.30    │      │
│ │ CTO        $23.10    │  │ Marketing  $34.50    │      │
│ │ Dev-1      $12.40    │  │ API v2     $12.00    │      │
│ │ ...                  │  │ ...                  │      │
│ └──────────────────────┘  └──────────────────────┘      │
│                                                         │
│ Recent Cost Events                                      │
│ ┌──────────────────────────────────────────────────────┐│
│ │ CEO  openai/gpt-5  1,234 in / 567 out  $0.89  2m ago│
│ │ ...                                                   │
│ └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

Arriba: barra de progreso de presupuesto de toda la empresa (grande, prominente).

Dos tablas lado a lado: desglose por agente y por proyecto. Cada fila muestra el nombre de la entidad y el monto gastado.

Abajo: tabla de eventos de costo recientes con agente, proveedor/modelo, conteos de tokens, costo y marca de tiempo.

---

## 13. Log de actividad

Un registro de auditoría cronológico y filtrable.

```
┌─────────────────────────────────────────────────────────┐
│ Activity                            [Filter by type ▼]  │
├─────────────────────────────────────────────────────────┤
│ 🤖 CEO created issue CLIP-12 "Fix auth"      2 min ago │
│ 👤 Tablero approved hire "Marketing Analyst"    5 min ago │
│ 🤖 CTO changed CLIP-8 status → In Progress  10 min ago │
│ ⚙  System paused agent DevOps (budget limit) 15 min ago│
│ 🤖 Dev-1 commented on CLIP-5                30 min ago │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

Cada entrada: ícono del actor (bot para agente, usuario para panel, engranaje para sistema), nombre del actor, descripción de la acción con enlaces a entidades, marca de tiempo relativa.

Filtrable por: tipo de actor (agente/usuario/sistema), tipo de entidad (issue/agente/proyecto/etc), tipo de acción, rango de tiempo.

Scroll infinito con respaldo de "Load more".

---

## 14. Bandeja de entrada

La bandeja de entrada es el centro de acción principal del operador del tablero. Agrega todo lo que necesita atención humana, con las aprobaciones como la categoría de mayor prioridad.

### 14.1 Vista de lista de la bandeja de entrada

```
┌─────────────────────────────────────────────────────────┐
│ Inbox                               [Mark all read]     │
├─────────────────────────────────────────────────────────┤
│ APPROVALS                        See all approvals →    │
│ ● 🛡 Hire Agent: "Marketing Analyst"                    │
│ │  Requested by CEO · 2h ago                            │
│ │  Role: marketing · Reports to: CMO · Budget: $100/mo  │
│ │  [✕ Reject]  [✓ Approve]                              │
│ │                                                       │
│ ● 🛡 CEO Strategy: "Q2 Growth Plan"                     │
│ │  Requested by CEO · 4h ago                            │
│ │  [View details →]                                     │
│                                                         │
│ ALERTS                                                  │
│ ● 🔴 Agent Error: DevOps heartbeat failed       1h ago  │
│ ● ⚠  Budget Alert: CEO at 80% monthly budget   3h ago  │
│                                                         │
│ STALE WORK                                              │
│   ⏰ CLIP-3 "Set up CI pipeline" — no update in 24h     │
│   ⏰ CLIP-7 "Write tests" — no update in 36h            │
└─────────────────────────────────────────────────────────┘
```

### 14.2 Categorías de la bandeja de entrada

Los elementos se agrupan por categoría, con los más accionables primero:

**Aprobaciones pendientes** (máxima prioridad). Cada elemento de aprobación muestra:
- Ícono de escudo + tipo de aprobación + título
- Solicitante + marca de tiempo relativa
- Resumen clave del payload (1 línea — nombre/rol del agente para contrataciones, título del plan para estrategias)
- Botones en línea **[Approve]** y **[Reject]** para aprobaciones simples (hire_agent). Al hacer clic en Aprobar/Rechazar se muestra una breve confirmación con un campo opcional de nota de decisión.
- Enlace **[View details →]** para aprobaciones complejas (approve_ceo_strategy) que necesitan revisión completa antes de decidir.
- Enlace "See all approvals →" en el encabezado de la categoría navega a `/approvals`.

**Alertas.** Errores de agentes (latidos fallidos, estado de error) y alertas de presupuesto (agentes o empresa acercándose a los límites del 80% o 100%). Cada una enlaza a la página del agente o de costos relevante.

**Trabajo estancado.** Tareas en `in_progress` o `todo` sin actividad (sin comentarios, sin cambios de estado) más allá de un umbral configurable (por defecto: 24h). Cada una muestra clave del issue, título y tiempo desde la última actividad. Al hacer clic se navega al issue.

### 14.3 Comportamiento de la bandeja de entrada

- Los elementos no leídos tienen un indicador de punto azul relleno a la izquierda.
- Hacer clic en un elemento lo marca como leído.
- Las aprobaciones desaparecen de la bandeja una vez aprobadas/rechazadas (pasan al estado resuelto).
- Las alertas desaparecen cuando la condición subyacente se resuelve (agente reanudado, presupuesto aumentado).
- El conteo de insignia de la barra lateral refleja el total de elementos no resueltos de la bandeja.
- La bandeja se calcula a partir de datos en vivo (consulta de aprobaciones pendientes + condiciones de alerta), no de una tabla de notificaciones separada. Esto la mantiene simple para la V1.

---

## 15. Búsqueda (modal Cmd+K)

Búsqueda global accesible vía `Cmd+K` o el ícono de búsqueda de la barra lateral.

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Search issues, agents, projects...                   │
├─────────────────────────────────────────────────────────┤
│ Recent                                                  │
│   📋 CLIP-42 Fix user authentication bug                │
│   🤖 CEO                                                │
│   📁 Auth project                                       │
├─────────────────────────────────────────────────────────┤
│ Actions                                                 │
│   ✏️  Create new issue                         C        │
│   🤖 Create new agent                                   │
│   📁 Create new project                                 │
└─────────────────────────────────────────────────────────┘
```

- Búsqueda predictiva en todos los tipos de entidades (issues, agentes, proyectos, objetivos).
- Resultados agrupados por tipo con íconos.
- Elementos recientes mostrados cuando la entrada está vacía.
- Sección de acciones rápidas al final.
- Flechas para navegar, Enter para seleccionar, Escape para cerrar.

---

## 16. Atajos de teclado

| Atajo | Acción |
|----------|--------|
| `Cmd+K` | Abrir búsqueda |
| `C` | Crear nuevo issue |
| `Cmd+Enter` | Enviar formulario (en modales) |
| `Escape` | Cerrar modal / deseleccionar |
| `[` | Alternar barra lateral colapsada |
| `]` | Alternar panel de propiedades |
| `J` / `K` | Navegar arriba/abajo en listas |
| `Enter` | Abrir elemento seleccionado |
| `Backspace` | Volver atrás |
| `S` | Alternar estado en el issue seleccionado |
| `X` | Alternar selección de casilla |
| `Cmd+A` | Seleccionar todo (en contexto de lista) |

---

## 17. Comportamiento responsivo

- **>1400px:** Diseño completo de tres paneles (barra lateral + principal + propiedades).
- **1024-1400px:** Barra lateral colapsada a íconos. Panel de propiedades disponible vía toggle.
- **<1024px:** Barra lateral oculta (menú hamburguesa). Panel de propiedades oculto (toggle o pestaña).

El panel de propiedades siempre es descartable — nunca debe bloquear el contenido principal.

---

## 18. Estados vacíos

Cada vista de lista debe tener un estado vacío considerado:

- **Sin issues:** "Aún no hay issues. Crea tu primer issue para empezar a dar seguimiento al trabajo." con un botón `[Crear issue]`.
- **Sin agentes:** "No hay agentes en esta empresa. Crea un agente para empezar a formar tu equipo." con un botón `[Crear agente]`.
- **Sin empresa seleccionada:** "Selecciona una empresa para empezar." con un selector de empresa o botón `[Crear empresa]`.

Los estados vacíos deben usar una ilustración atenuada (arte de líneas simple, no caricaturas) y un solo llamado a la acción.

---

## 19. Estados de carga y error

- **Cargando:** Marcadores de posición esqueleto que coinciden con el diseño del contenido esperado (no spinners). Los bloques esqueleto se animan con un sutil brillo.
- **Error:** Mensaje de error en línea con un botón de reintentar. Nunca un error de página completa salvo que la app misma esté rota.
- **Conflicto (409):** Notificación toast: "Este issue fue actualizado por otro usuario. Actualiza para ver los cambios." con una acción [Actualizar].
- **Actualizaciones optimistas:** Los cambios de estado y ediciones de propiedades deben actualizarse de inmediato en la UI, con reversión ante fallo.

---

## 20. Biblioteca de componentes

Construida sobre componentes shadcn/ui con estas personalizaciones:

| Componente | Base | Personalización |
|-----------|------|---------------|
| StatusBadge | Badge | Punto de color + etiqueta, paletas específicas de entidad |
| PriorityIcon | custom | Círculos SVG con rellenos según prioridad |
| EntityRow | custom | Fila de lista estandarizada con estados de hover/selección |
| PropertyEditor | custom | Etiqueta + valor editable en línea con desplegable |
| CommentThread | custom | Avatar + autor + marca de tiempo + cuerpo en markdown |
| BreadcrumbBar | Breadcrumb | Integrada con el router, pestañas y acciones de entidad |
| CommandPalette | Dialog | Búsqueda Cmd+K con predictivo y acciones |
| FilterBar | custom | Fichas de filtro componibles con agregar/quitar |
| SidebarNav | custom | Navegación agrupada, colapsable, con insignias |

---

## 21. Estructura de URL

Todas las rutas tienen alcance de empresa después de la selección de empresa (contexto de empresa almacenado en el contexto de React, no en la URL):

```
/                           → redirects to /dashboard
/dashboard                  → company dashboard
/inbox                      → inbox / attention items
/my-issues                  → issues del operador del tablero
/issues                     → issue list
/issues/:issueId            → issue detail
/projects                   → project list
/projects/:projectId        → project detail (overview tab)
/projects/:projectId/issues → project issues
/goals                      → goal hierarchy
/goals/:goalId              → goal detail
/org                        → org chart
/agents                     → agent list
/agents/:agentId            → agent detail
/approvals                  → approval list
/approvals/:approvalId      → approval detail
/costs                      → cost dashboard
/activity                   → activity log
/companies                  → company management (list/create)
/settings                   → company settings
```

---

## 22. Prioridad de implementación

### Fase 1: Estructura y navegación
1. Rediseño de la barra lateral (secciones agrupadas, íconos, selector de empresa, insignias)
2. Componente de barra de migas de pan
3. Sistema de diseño de tres paneles
4. Modal de búsqueda Cmd+K
5. Instalar `lucide-react`

### Fase 2: Gestión de issues (núcleo)
6. Vista de lista de issues con agrupación, filtrado, círculos de estado
7. Vista de detalle de issue (tres paneles con panel de propiedades)
8. Modal de nuevo issue
9. Comentarios de issues
10. Selección múltiple y acciones masivas
11. Vista de panel kanban

### Fase 3: Vistas de detalle de entidades
12. Lista + vista de detalle de proyectos
13. Vista de jerarquía de objetivos
14. Lista + vista de detalle de agentes

### Fase 4: Vistas a nivel de empresa
15. Bandeja de entrada con acciones de aprobación en línea (UX primaria de aprobaciones)
16. Rediseño del panel con tarjetas de métricas
17. Visualización interactiva del organigrama
18. Panel de costos
19. Log de actividad con filtrado
20. Página de lista de aprobaciones (accesible vía "Ver todo" de la bandeja, no la barra lateral)

### Fase 5: Pulido
21. Atajos de teclado
22. Comportamiento responsivo
23. Estados vacíos y esqueletos de carga
24. Manejo de errores y toasts
25. Vistas guardadas (filtros personalizados)
