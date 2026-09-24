# Índice de componentes de Paperclip

Inventario completo de todos los componentes de la UI. Actualizar este archivo al agregar componentes reutilizables nuevos.

---

## Índice

1. [Primitivas de shadcn/ui](#primitivas-de-shadcni)
2. [Componentes personalizados](#componentes-personalizados)
3. [Componentes de layout](#componentes-de-layout)
4. [Componentes de diálogo y formularios](#componentes-de-diálogo-y-formularios)
5. [Componentes del panel de propiedades](#componentes-del-panel-de-propiedades)
6. [Configuración del agente](#configuración-del-agente)
7. [Utilidades y hooks](#utilidades-y-hooks)

---

## Primitivas de shadcn/ui

Ubicación: `ui/src/components/ui/`

Son componentes base de shadcn/ui. No modificarlos directamente; extender mediante composición.

| Componente | Archivo | Props clave | Notas |
|-----------|------|-----------|-------|
| Button | `button.tsx` | `variant` (default, secondary, outline, ghost, destructive, link), `size` (xs, sm, default, lg, icon, icon-xs, icon-sm, icon-lg) | Elemento interactivo principal. Usa CVA. |
| Card | `card.tsx` | CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter | Componente compuesto. Padding por defecto `py-6`. |
| Input | `input.tsx` | `disabled` | Entrada de texto estándar. |
| Badge | `badge.tsx` | `variant` (default, secondary, outline, destructive, ghost) | Etiqueta genérica. Para estado, usar StatusBadge en su lugar. |
| Label | `label.tsx` | — | Etiqueta de formulario, envuelve Radix Label. |
| Select | `select.tsx` | Trigger, Content, Item, etc. | Select desplegable basado en Radix. |
| Separator | `separator.tsx` | `orientation` (horizontal, vertical) | Línea divisoria. |
| Checkbox | `checkbox.tsx` | `checked`, `onCheckedChange` | Checkbox de Radix con indicador. |
| Textarea | `textarea.tsx` | props estándar de textarea | Entrada multilínea. |
| Avatar | `avatar.tsx` | `size` (sm, default, lg). Incluye AvatarGroup, AvatarGroupCount | Imagen o iniciales de respaldo. |
| Breadcrumb | `breadcrumb.tsx` | BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage | Migas de pan de navegación. |
| Command | `command.tsx` | CommandInput, CommandList, CommandGroup, CommandItem | Paleta de comandos / búsqueda. Basado en cmdk. |
| Dialog | `dialog.tsx` | DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter | Superposición modal. |
| DropdownMenu | `dropdown-menu.tsx` | Trigger, Content, Item, Separator, etc. | Menús de contexto/acción. |
| Popover | `popover.tsx` | PopoverTrigger, PopoverContent | Panel flotante de contenido. |
| Tabs | `tabs.tsx` | `variant` (pill, line). TabsList, TabsTrigger, TabsContent | Navegación por pestañas. Píldora = por defecto, línea = estilo subrayado. |
| Tooltip | `tooltip.tsx` | TooltipTrigger, TooltipContent | Tooltips de hover. La app está envuelta en TooltipProvider. |
| ScrollArea | `scroll-area.tsx` | — | Contenedor desplazable personalizado. |
| Collapsible | `collapsible.tsx` | CollapsibleTrigger, CollapsibleContent | Secciones expandibles/plegables. |
| Skeleton | `skeleton.tsx` | className para dimensionar | Marcador de carga con brillo. |
| Sheet | `sheet.tsx` | SheetTrigger, SheetContent, SheetHeader, etc. | Superposición de panel lateral. |

---

## Componentes personalizados

Ubicación: `ui/src/components/`

### StatusBadge

**Archivo:** `StatusBadge.tsx`
**Props:** `status: string`
**Uso:** píldora de color que muestra el estado de la entidad. Soporta más de 20 estados con colores mapeados.

```tsx
<StatusBadge status="in_progress" />
```

Usar para mostrar el estado en paneles de propiedades, filas de entidad y vistas de lista. Nunca codificar colores de estado; usar siempre este componente.

### StatusIcon

**Archivo:** `StatusIcon.tsx`
**Props:** `status: string`, `onChange?: (status: string) => void`
**Uso:** icono circular que representa el estado del issue. Cuando se proporciona `onChange`, abre un selector popover.

```tsx
<StatusIcon status="todo" onChange={setStatus} />
```

Soporta: backlog, todo, in_progress, in_review, done, cancelled, blocked. Usar en los slots iniciales de filas de entidad y en encabezados de listas agrupadas.

### PriorityIcon

**Archivo:** `PriorityIcon.tsx`
**Props:** `priority: string`, `onChange?: (priority: string) => void`
**Uso:** icono indicador de prioridad. Interactivo cuando se proporciona `onChange`.

```tsx
<PriorityIcon priority="high" onChange={setPriority} />
```

Soporta: critical, high, medium, low. Usar junto a StatusIcon en los slots iniciales de filas de entidad.

### EntityRow

**Archivo:** `EntityRow.tsx`
**Props:** `leading`, `identifier`, `title`, `subtitle?`, `trailing?`, `onClick?`, `selected?`
**Uso:** fila de lista estándar para issues, agentes y proyectos. Soporta resaltado de hover y estado seleccionado.

```tsx
<EntityRow
  leading={<><StatusIcon status="todo" /><PriorityIcon priority="medium" /></>}
  identifier="PAP-003"
  title="Write API documentation"
  trailing={<StatusBadge status="todo" />}
  onClick={() => navigate(`/issues/${id}`)}
/>
```

Envolver varios EntityRow en un contenedor `border border-border rounded-md`.

### MetricCard

**Archivo:** `MetricCard.tsx`
**Props:** `icon: LucideIcon`, `value: string | number`, `label: string`, `description?: string`
**Uso:** tarjeta de estadística del panel con icono, valor grande, etiqueta y descripción opcional.

```tsx
<MetricCard icon={Bot} value={12} label="Active Agents" description="+3 this week" />
```

Usar siempre en una cuadrícula responsiva: `grid md:grid-cols-2 xl:grid-cols-4 gap-4`.

### EmptyState

**Archivo:** `EmptyState.tsx`
**Props:** `icon: LucideIcon`, `message: string`, `action?: string`, `onAction?: () => void`
**Uso:** marcador de lista vacía con icono, mensaje y botón CTA opcional.

```tsx
<EmptyState icon={Inbox} message="No items yet." action="Create Item" onAction={handleCreate} />
```

### FilterBar

**Archivo:** `FilterBar.tsx`
**Props:** `filters: FilterValue[]`, `onRemove: (key) => void`, `onClear: () => void`
**Tipo:** `FilterValue = { key: string; label: string; value: string }`
**Uso:** visualización de chips de filtro con botones para quitar y limpiar todo.

```tsx
<FilterBar filters={filters} onRemove={handleRemove} onClear={() => setFilters([])} />
```

### Identity

**Archivo:** `Identity.tsx`
**Props:** `name: string`, `avatarUrl?: string`, `initials?: string`, `size?: "sm" | "default" | "lg"`
**Uso:** visualización de avatar + nombre para usuarios y agentes. Deriva las iniciales del nombre automáticamente. Tres tamaños que coinciden con los de Avatar.

```tsx
<Identity name="Agent Alpha" size="sm" />
<Identity name="CEO Agent" />
<Identity name="Backend Service" size="lg" avatarUrl="/img/bot.png" />
```

Usar en filas de propiedad, encabezados de comentarios, visualizaciones de asignado y en cualquier lugar donde se muestre una referencia de usuario/agente.

### InlineEditor

**Archivo:** `InlineEditor.tsx`
**Props:** `value: string`, `onSave: (val: string) => void`, `as?: string`, `className?: string`
**Uso:** texto de clic para editar. Se muestra como texto; al hacer clic entra en modo edición. Enter guarda, Escape cancela.

```tsx
<InlineEditor value={title} onSave={updateTitle} as="h2" className="text-xl font-bold" />
```

### PageSkeleton

**Archivo:** `PageSkeleton.tsx`
**Props:** `variant: "list" | "detail"`
**Uso:** esqueleto de carga de página completa que coincide con el layout de lista o detalle.

```tsx
<PageSkeleton variant="list" />
```

### CommentThread

**Archivo:** `CommentThread.tsx`
**Uso:** lista de comentarios con formulario para agregar comentarios. Se usa en vistas de detalle de issue y entidad.

### GoalTree

**Archivo:** `GoalTree.tsx`
**Uso:** árbol jerárquico de objetivos con expandir/plegar. Se usa en la página de objetivos.

### CompanySwitcher

**Archivo:** `CompanySwitcher.tsx`
**Uso:** desplegable selector de empresa en el encabezado de la barra lateral.

---

## Componentes de layout

### Layout

**Archivo:** `Layout.tsx`
**Uso:** shell principal de la app. Layout de tres zonas: barra lateral + contenido principal + panel de propiedades. Envuelve todas las rutas.

### Sidebar

**Archivo:** `Sidebar.tsx`
**Uso:** barra lateral de navegación izquierda (`w-60`). Contiene CompanySwitcher, botón de búsqueda, botón de nuevo issue y SidebarSections.

### SidebarSection

**Archivo:** `SidebarSection.tsx`
**Uso:** grupo plegable de la barra lateral con etiqueta de encabezado e interruptor de chevrón.

### SidebarNavItem

**Archivo:** `SidebarNavItem.tsx`
**Props:** Icon, label, recuento opcional de insignia
**Uso:** elemento de navegación individual dentro de un SidebarSection.

### BreadcrumbBar

**Archivo:** `BreadcrumbBar.tsx`
**Uso:** navegación de migas de pan superior que abarca el contenido principal + el panel de propiedades.

### PropertiesPanel

**Archivo:** `PropertiesPanel.tsx`
**Uso:** panel de propiedades del lado derecho (`w-80`). Se puede cerrar. Visible en vistas de detalle.

### CommandPalette

**Archivo:** `CommandPalette.tsx`
**Uso:** modal de búsqueda global Cmd+K. Busca issues, proyectos y agentes.

---

## Componentes de diálogo y formularios

### NewIssueDialog

**Archivo:** `NewIssueDialog.tsx`
**Uso:** crear issue nuevo con selección de proyecto/asignado/prioridad. Soporta guardado de borradores.

### NewProjectDialog

**Archivo:** `NewProjectDialog.tsx`
**Uso:** diálogo para crear proyecto nuevo.

### NewAgentDialog

**Archivo:** `NewAgentDialog.tsx`
**Uso:** diálogo para crear agente nuevo.

### OnboardingWizard

**Archivo:** `OnboardingWizard.tsx`
**Uso:** flujo de incorporación de varios pasos para usuarios/empresas nuevos.

---

## Componentes del panel de propiedades

Se muestran dentro del PropertiesPanel para distintos tipos de entidad:

| Componente | Archivo | Entidad |
|-----------|------|--------|
| IssueProperties | `IssueProperties.tsx` | Issues |
| AgentProperties | `AgentProperties.tsx` | Agentes |
| ProjectProperties | `ProjectProperties.tsx` | Proyectos |
| GoalProperties | `GoalProperties.tsx` | Objetivos |

Todos siguen el patrón de fila de propiedad: etiqueta `text-xs text-muted-foreground` a la izquierda, valor a la derecha, espaciado `py-1.5`.

---

## Configuración del agente

### agent-config-primitives

**Archivo:** `agent-config-primitives.tsx`
**Exports:** Field, ToggleField, ToggleWithNumber, CollapsibleSection, AutoExpandTextarea, DraftInput
**Uso:** primitivas de campos de formulario reutilizables para formularios de configuración de agentes.

### AgentConfigForm

**Archivo:** `AgentConfigForm.tsx`
**Uso:** formulario completo de creación/edición de agentes con selección de tipo de adaptador.

---

## Utilidades y hooks

### cn() — Combinador de nombres de clase

**Archivo:** `ui/src/lib/utils.ts`
**Uso:** combina nombres de clase con clsx + tailwind-merge. Usar en cada componente.

```tsx
import { cn } from "@/lib/utils";
<div className={cn("base-classes", conditional && "extra", className)} />
```

### Utilidades de formato

**Archivo:** `ui/src/lib/utils.ts`

| Función | Uso |
|----------|-------|
| `formatCents(cents)` | Visualización de dinero: `$12.34` |
| `formatDate(date)` | Visualización de fecha: `Jan 15, 2025` |
| `relativeTime(date)` | Tiempo relativo: `2m ago`, `Jan 15` |
| `formatTokens(count)` | Conteos de tokens: `1.2M`, `500k` |

### useKeyboardShortcuts

**Archivo:** `ui/src/hooks/useKeyboardShortcuts.ts`
**Uso:** manejador global de atajos de teclado. Registra Cmd+K, C, [, ], Cmd+Enter.

### Claves de consulta

**Archivo:** `ui/src/lib/queryKeys.ts`
**Uso:** fábricas estructuradas de claves de React Query para gestión de caché.

### groupBy

**Archivo:** `ui/src/lib/groupBy.ts`
**Uso:** utilidad genérica de agrupación de arreglos.
