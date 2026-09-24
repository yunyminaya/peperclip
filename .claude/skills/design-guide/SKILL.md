---
name: design-guide
description: >
  Paperclip UI design system guide for building consistent, reusable frontend
  components. Use when creating new UI components, modifying existing ones,
  adding pages or features to the frontend, styling UI elements, or when you
  need to understand the design language and conventions. Covers: component
  creation, design tokens, typography, status/priority systems, composition
  patterns, and the /design-guide showcase page. Always use this skill
  alongside the frontend-design skill (for visual quality) and the
  web-design-guidelines skill (for web best practices).
---

# Guía de diseño de Paperclip

La UI de Paperclip es un plano de control de nivel profesional: densa, centrada en el teclado y con tema oscuro por defecto. Cada píxel se gana su lugar.

**Usar siempre con:** `frontend-design` (pulido visual) y `web-design-guidelines` (buenas prácticas web).

---

## 1. Principios de diseño

- **Densa pero legible.** Máxima información sin clics para revelar. El espacio en blanco separa, no rellena.
- **Teclado primero.** Atajos globales (Cmd+K, C, [, ]). Los usuarios avanzados casi nunca tocan el mouse.
- **Contextual, no modal.** Edición en línea en vez de cuadros de diálogo. Desplegables en vez de navegaciones entre páginas.
- **Tema oscuro por defecto.** Grises neutros (OKLCH), no negro puro. Colores de acento solo para estado/prioridad. El texto es el elemento visual principal.
- **Orientada a componentes.** Preferir componentes reutilizables que capturen las convenciones de estilo. Construir con la abstracción adecuada: ni demasiado granular, ni demasiado monolítica.

---

## 2. Pila tecnológica

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS v4** con variables CSS (espacio de color OKLCH)
- **shadcn/ui** (estilo new-york, base neutra, variables CSS habilitadas)
- Primitivas de **Radix UI** (accesibilidad, gestión del foco)
- Iconos de **Lucide React** (16px en navegación, 14px en línea)
- **class-variance-authority** (CVA) para variantes de componentes
- **clsx + tailwind-merge** mediante la utilidad `cn()`

Config: `ui/components.json` (alias: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`)

---

## 3. Tokens de diseño

Todos los tokens se definen como variables CSS en `ui/src/index.css`. Tanto el tema claro como el oscuro usan OKLCH.

### Colores

Usar nombres de tokens semánticos, nunca valores de color crudos:

| Token | Uso |
|-------|-----|
| `--background` / `--foreground` | Fondo de página y texto principal |
| `--card` / `--card-foreground` | Superficies de tarjetas |
| `--primary` / `--primary-foreground` | Acciones principales, énfasis |
| `--secondary` / `--secondary-foreground` | Superficies secundarias |
| `--muted` / `--muted-foreground` | Texto atenuado, etiquetas |
| `--accent` / `--accent-foreground` | Estados de hover, elementos de navegación activos |
| `--destructive` | Acciones destructivas |
| `--border` | Todos los bordes |
| `--ring` | Anillos de foco |
| `--sidebar-*` | Variantes específicas de la barra lateral |
| `--chart-1` a `--chart-5` | Visualización de datos |

### Radio

Una sola variable `--radius` (0.625rem) con tamaños derivados:

- `rounded-sm` — entradas pequeñas, píldoras
- `rounded-md` — botones, entradas, componentes pequeños
- `rounded-lg` — tarjetas, diálogos
- `rounded-xl` — contenedores de tarjetas, componentes grandes
- `rounded-full` — insignias, avatares, puntos de estado

### Sombras

Sombras mínimas: `shadow-xs` (botones con contorno), `shadow-sm` (tarjetas). Sin sombras pesadas.

---

## 4. Escala tipográfica

Usar estos patrones exactos; no inventar nuevos:

| Patrón | Clases | Uso |
|---------|---------|-------|
| Título de página | `text-xl font-bold` | Parte superior de las páginas |
| Título de sección | `text-lg font-semibold` | Secciones principales |
| Encabezado de sección | `text-sm font-semibold text-muted-foreground uppercase tracking-wide` | Encabezados de sección en la guía de diseño, barra lateral |
| Título de tarjeta | `text-sm font-medium` o `text-sm font-semibold` | Encabezados de tarjetas, títulos de elementos de lista |
| Cuerpo | `text-sm` | Texto de cuerpo por defecto |
| Atenuado | `text-sm text-muted-foreground` | Descripciones, texto secundario |
| Etiqueta pequeña | `text-xs text-muted-foreground` | Metadatos, marcas de tiempo, etiquetas de propiedades |
| Identificador mono | `text-xs font-mono text-muted-foreground` | Claves de issue (PAP-001), variables CSS |
| Estadística grande | `text-2xl font-bold` | Valores de métricas del panel |
| Código/registro | `font-mono text-xs` | Salida de registros, fragmentos de código |

---

## 5. Sistemas de estado y prioridad

### Colores de estado (consistentes en todas las entidades)

Definidos en `StatusBadge.tsx` y `StatusIcon.tsx`:

| Estado | Color | Tipos de entidad |
|--------|-------|-------------|
| active, achieved, completed, succeeded, approved, done | Tonos de verde | Agentes, objetivos, issues, aprobaciones |
| running | Cian | Agentes |
| paused | Naranja | Agentes |
| idle, pending | Amarillo | Agentes, aprobaciones |
| failed, error, rejected, blocked | Tonos de rojo | Ejecuciones, agentes, aprobaciones, issues |
| archived, planned, backlog, cancelled | Gris neutro | Varios |
| todo | Azul | Issues |
| in_progress | Índigo | Issues |
| in_review | Violeta | Issues |

### Iconos de prioridad

Definidos en `PriorityIcon.tsx`: critical (rojo/AlertTriangle), high (naranja/ArrowUp), medium (amarillo/Minus), low (azul/ArrowDown).

### Puntos de estado del agente

Puntos de colores en línea: running (cian, animate-pulse), active (verde), paused (amarillo), error (rojo), offline (neutro).

---

## 6. Jerarquía de componentes

Tres niveles:

1. **Primitivas de shadcn/ui** (`ui/src/components/ui/`) — Button, Card, Input, Badge, Dialog, Tabs, etc. No modificarlas directamente; extender mediante composición.
2. **Compuestos personalizados** (`ui/src/components/`) — StatusBadge, EntityRow, MetricCard, etc. Capturan el lenguaje de diseño específico de Paperclip.
3. **Componentes de página** (`ui/src/pages/`) — combinan primitivas y compuestos en vistas completas.

**Ver [references/component-index.md](references/component-index.md) para el inventario completo de componentes con guía de uso.**

### Cuándo crear un componente nuevo

Crear un componente reutilizable cuando:
- El mismo patrón visual aparece en 2 o más lugares
- El patrón tiene comportamiento interactivo (cambio de estado, edición en línea)
- El patrón codifica lógica de dominio (colores de estado, iconos de prioridad)

NO crear un componente para:
- Diseños únicos específicos de una sola página
- Combinaciones simples de className (usar Tailwind directamente)
- Envoltorios delgados que no agregan valor semántico

---

## 7. Patrones de composición

Estos patrones describen cómo funcionan los componentes juntos. Pueden no ser un componente propio, pero deben usarse de forma consistente en toda la app.

### Fila de entidad con estado + prioridad

El elemento de lista estándar para issues y entidades similares:

```tsx
<EntityRow
  leading={<><StatusIcon status="in_progress" /><PriorityIcon priority="high" /></>}
  identifier="PAP-001"
  title="Implement authentication flow"
  subtitle="Assigned to Agent Alpha"
  trailing={<StatusBadge status="in_progress" />}
  onClick={() => {}}
/>
```

El slot inicial siempre: StatusIcon primero, luego PriorityIcon. El slot final: StatusBadge o marca de tiempo.

### Lista agrupada

Issues agrupados por encabezado de estado + filas de entidad:

```tsx
<div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-t-md">
  <StatusIcon status="in_progress" />
  <span className="text-sm font-medium">In Progress</span>
  <span className="text-xs text-muted-foreground ml-1">2</span>
</div>
<div className="border border-border rounded-b-md">
  <EntityRow ... />
  <EntityRow ... />
</div>
```

### Fila de propiedad

Pares clave-valor en paneles de propiedades:

```tsx
<div className="flex items-center justify-between py-1.5">
  <span className="text-xs text-muted-foreground">Status</span>
  <StatusBadge status="active" />
</div>
```

La etiqueta siempre es `text-xs text-muted-foreground`, el valor a la derecha. Envolver en un contenedor con `space-y-1`.

### Cuadrícula de tarjetas de métricas

Métricas del panel en una cuadrícula responsiva:

```tsx
<div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
  <MetricCard icon={Bot} value={12} label="Active Agents" description="+3 this week" />
  ...
</div>
```

### Barra de progreso (presupuesto)

Color según el umbral: verde (<60%), amarillo (60-85%), rojo (>85%):

```tsx
<div className="w-full h-2 bg-muted rounded-full overflow-hidden">
  <div className="h-full rounded-full bg-green-400" style={{ width: `${pct}%` }} />
</div>
```

### Hilo de comentarios

Encabezado del autor (nombre + marca de tiempo) y luego el cuerpo, en tarjetas con borde con `space-y-3`. Agregar área de texto para comentar + botón debajo.

### Tabla de costos

`<table>` estándar con `text-xs`, fila de encabezado con `bg-accent/20`, `font-mono` para valores numéricos.

### Visor de registros

Contenedor `bg-neutral-950 rounded-lg p-3 font-mono text-xs`. Colorear líneas por nivel: por defecto (foreground), WARN (yellow-400), ERROR (red-400), SYS (blue-300). Incluir punto indicador en vivo al transmitir.

---

## 8. Patrones interactivos

### Estados de hover

- Filas de entidad: `hover:bg-accent/50`
- Elementos de navegación: `hover:bg-accent/50 hover:text-accent-foreground`
- Navegación activa: `bg-accent text-accent-foreground`

### Foco

`focus-visible:ring-ring focus-visible:ring-[3px]` — anillo focus-visible estándar de Tailwind.

### Deshabilitado

`disabled:opacity-50 disabled:pointer-events-none`

### Edición en línea

Usar el componente `InlineEditor`: clic en el texto para editar, Enter guarda, Escape cancela.

### Selectores popover

StatusIcon y PriorityIcon usan Radix Popover para selección en línea. Seguir este patrón para cualquier propiedad clicable que abra un selector.

---

## 9. Sistema de layout

Layout de tres zonas definido en `Layout.tsx`:

```
┌──────────┬──────────────────────────────┬──────────────────────┐
│ Sidebar  │  Breadcrumb bar              │                      │
│ (w-60)   ├──────────────────────────────┤  Properties panel    │
│          │  Main content (flex-1)       │  (w-80, optional)    │
└──────────┴──────────────────────────────┴──────────────────────┘
```

- Barra lateral: `w-60`, plegable, contiene CompanySwitcher + SidebarSections
- Panel de propiedades: `w-80`, visible en vistas de detalle, oculto en listas
- Contenido principal: desplazable, `flex-1`

---

## 10. La página /design-guide

**Ubicación:** `ui/src/pages/DesignGuide.tsx`
**Ruta:** `/design-guide`

Es la vitrina viva de cada componente y patrón de la app. Es la fuente de verdad de cómo se ven las cosas.

### Reglas

1. **Al agregar un componente reutilizable nuevo, DEBES agregarlo a la página de la guía de diseño.** Mostrar todas las variantes, tamaños y estados.
2. **Al modificar la API de un componente existente, actualizar su sección de la guía de diseño.**
3. **Al agregar un patrón de composición nuevo, agregar una sección que lo demuestre.**
4. Seguir la estructura existente: envoltorio `<Section title="...">` con `<SubSection>` para agrupar.
5. Mantener las secciones ordenadas lógicamente: primero las fundamentales (colores, tipografía), luego las primitivas, luego los compuestos y después los patrones.

### Agregar una sección nueva

```tsx
<Section title="My New Component">
  <SubSection title="Variants">
    {/* Show all variants */}
  </SubSection>
  <SubSection title="Sizes">
    {/* Show all sizes */}
  </SubSection>
  <SubSection title="States">
    {/* Show interactive/disabled states */}
  </SubSection>
</Section>
```

---

## 11. Índice de componentes

**Ver [references/component-index.md](references/component-index.md) para el inventario completo de componentes.**

Al crear un componente reutilizable nuevo:
1. Agregarlo al archivo de referencia del índice de componentes
2. Agregarlo a la página /design-guide
3. Seguir las convenciones de nombres y archivos existentes

---

## 12. Convenciones de archivos

- **Primitivas de shadcn:** `ui/src/components/ui/{component}.tsx` — minúsculas, kebab-case
- **Componentes personalizados:** `ui/src/components/{ComponentName}.tsx` — PascalCase
- **Páginas:** `ui/src/pages/{PageName}.tsx` — PascalCase
- **Utilidades:** `ui/src/lib/{name}.ts`
- **Hooks:** `ui/src/hooks/{useName}.ts`
- **Módulos de API:** `ui/src/api/{entity}.ts`
- **Proveedores de contexto:** `ui/src/context/{Name}Context.tsx`

Todos los componentes usan `cn()` de `@/lib/utils` para combinar className. Todos los componentes usan CVA para las definiciones de variantes cuando tienen múltiples variantes visuales.

---

## 13. Errores comunes a evitar

- Usar colores hex/rgb crudos en vez de tokens de variables CSS
- Crear estilos tipográficos ad hoc en vez de usar la escala establecida
- Codificar colores de estado en vez de usar StatusBadge/StatusIcon
- Construir elementos con estilo único cuando ya existe un componente reutilizable
- Agregar componentes sin actualizar la página de la guía de diseño
- Usar `shadow-md` o más pesadas: mantener las sombras mínimas (solo xs, sm)
- Usar `rounded-2xl` o más grandes: el máximo es `rounded-xl` (excepto `rounded-full` para píldoras)
- Olvidar el modo oscuro: usar siempre tokens semánticos, nunca codificar valores claros/oscuros
