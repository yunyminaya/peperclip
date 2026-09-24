# UI de configuración y actividad de agentes

## Contexto

Los agentes son los empleados de una empresa de Paperclip. Cada agente tiene un tipo de adaptador (`claude_local`, `codex_local`, `process`, `http`) que determina cómo se ejecuta, una posición en el organigrama (a quién reporta), una política de latido (cómo/cuándo se despierta) y un presupuesto. La UI en `/agents` debe admitir crear y configurar agentes, ver su jerarquía organizativa e inspeccionar lo que han estado haciendo: su historial de ejecuciones, registros en vivo y costos acumulados.

Esta especificación cubre tres superficies:

1. **Diálogo de creación de agente**: el flujo "Nuevo agente"
2. **Página de detalle de agente**: configuración, actividad y registros
3. **Página de lista de agentes**: mejoras a la lista existente

---

## 1. Diálogo de creación de agente

Sigue el patrón existente de `NewIssueDialog` / `NewProjectDialog`: un componente `Dialog` con alternador de expandir/minimizar, breadcrumb de insignia de empresa y envío con Cmd+Enter.

### Campos

**Identidad (siempre visible):**

| Campo | Control | Obligatorio | Valor por defecto | Notas |
|-------|---------|----------|---------|-------|
| Nombre | Entrada de texto (grande, con autofoco) | Sí | -- | p. ej. "Alice", "Build Bot" |
| Título | Entrada de texto (estilo subtítulo) | No | -- | p. ej. "VP of Engineering" |
| Rol | Chip popover (selección) | No | `general` | Valores de `AGENT_ROLES`: ceo, cto, cmo, cfo, engineer, designer, pm, qa, devops, researcher, general |
| Reporta a | Chip popover (selección de agente) | No | -- | Desplegable de agentes existentes en la empresa. Si este es el primer agente, establecer automáticamente el rol a `ceo` y atenuar Reporta a. De lo contrario, obligatorio a menos que el rol sea `ceo`. |
| Capacidades | Entrada de texto | No | -- | Descripción en texto libre de lo que este agente puede hacer |

**Adaptador (sección plegable, abierta por defecto):**

| Campo | Control | Valor por defecto | Notas |
|-------|---------|---------|-------|
| Tipo de adaptador | Chip popover (selección) | `claude_local` | `claude_local`, `codex_local`, `process`, `http` |
| Probar entorno | Botón | -- | Ejecuta diagnósticos específicos del adaptador y devuelve verificaciones pass/warn/fail para la configuración actual sin guardar |
| CWD | Entrada de texto | -- | Directorio de trabajo para adaptadores locales |
| Plantilla de prompt | Área de texto | -- | Admite `{{ agent.id }}`, `{{ agent.name }}`, etc. |
| Modelo | Entrada de texto | -- | Reemplazo opcional del modelo |

**Campos específicos del adaptador (mostrados/ocultos según el tipo de adaptador):**

*claude_local:*
| Campo | Control | Valor por defecto |
|-------|---------|---------|
| Máx. turnos por ejecución | Entrada numérica | 80 |
| Omitir permisos | Interruptor | true |

*codex_local:*
| Campo | Control | Valor por defecto |
|-------|---------|---------|
| Búsqueda | Interruptor | false |
| Omitir sandbox | Interruptor | true |

*process:*
| Campo | Control | Valor por defecto |
|-------|---------|---------|
| Comando | Entrada de texto | -- |
| Args | Entrada de texto (separados por comas) | -- |

*http:*
| Campo | Control | Valor por defecto |
|-------|---------|---------|
| URL | Entrada de texto | -- |
| Método | Selector | POST |
| Encabezados | Pares clave-valor | -- |

**Runtime (sección plegable, colapsada por defecto):**

| Campo | Control | Valor por defecto |
|-------|---------|---------|
| Modo de contexto | Chip popover | `thin` |
| Presupuesto mensual (centavos) | Entrada numérica | 0 |
| Timeout (s) | Entrada numérica | 900 |
| Período de gracia (s) | Entrada numérica | 15 |
| Args extra | Entrada de texto | -- |
| Vars de entorno | Editor de pares clave-valor | -- |

**Política de latido (sección plegable, colapsada por defecto):**

| Campo | Control | Valor por defecto |
|-------|---------|---------|
| Habilitado | Interruptor | true |
| Intervalo (s) | Entrada numérica | 300 |
| Despertar al asignar | Interruptor | true |
| Despertar a demanda | Interruptor | true |
| Despertar por automatización | Interruptor | true |
| Enfriamiento (s) | Entrada numérica | 10 |

### Comportamiento

- Al enviar, llama a `agentsApi.create(companyId, data)` donde `data` agrupa los campos de identidad en el nivel superior, los campos específicos del adaptador en `adapterConfig` y latido/runtime en `runtimeConfig`.
- Después de la creación, navegar a la página de detalle del nuevo agente.
- Si la empresa no tiene agentes, prellenar el rol como `ceo` y deshabilitar Reporta a.
- La sección de configuración del adaptador actualiza sus campos visibles cuando cambia el tipo de adaptador, preservando los valores de campos compartidos (cwd, promptTemplate, etc.).

---

## 2. Página de detalle de agente

Reestructurar el diseño de pestañas existente. Mantener el encabezado (nombre, rol, título, insignia de estado, botones de acción) y agregar pestañas más ricas.

### Encabezado

```
[StatusBadge]  Agent Name                    [Invoke] [Pause/Resume] [...]
               Role / Title
```

El menú de desbordamiento `[...]` contiene: Terminar, Restablecer sesión, Crear clave de API.

### Pestañas

#### Pestaña Resumen

Diseño de dos columnas: la columna izquierda es una tarjeta de resumen, la derecha es la posición en el organigrama.

**Tarjeta de resumen:**
- Tipo de adaptador + modelo (si está establecido)
- Intervalo de latido (p. ej. "cada 5 min") o "Deshabilitado"
- Hora del último latido (relativa, p. ej. "hace 3 min")
- Estado de la sesión: "Activa (sesión abc123...)" o "Sin sesión"
- Gasto del mes actual / presupuesto con barra de progreso

**Tarjeta de posición en el organigrama:**
- Reporta a: nombre de agente clicable (enlaza a su página de detalle)
- Reportes directos: lista de agentes que reportan a este agente (clicable)

#### Pestaña Configuración

Formulario editable con las mismas secciones que el diálogo de creación (Adaptador, Runtime, Política de latido) pero precargado con los valores actuales. Usa edición en línea: clic en un valor para editar, Enter o perder el foco para guardar vía `agentsApi.update()`.

Secciones:
- **Identidad**: nombre, título, rol, reporta a, capacidades
- **Configuración del adaptador**: todos los campos específicos del adaptador para el tipo de adaptador actual
- **Política de latido**: habilitar/deshabilitar, intervalo, disparadores de despertar, enfriamiento
- **Runtime**: modo de contexto, presupuesto, timeout, gracia, vars de entorno, args extra

Cada sección es una tarjeta plegable. El guardado ocurre por campo (PATCH al perder el foco/Enter), no un solo envío de formulario. Los errores de validación se muestran en línea.

#### Pestaña Ejecuciones

Esta es la vista principal de actividad/historial. Muestra una lista paginada de ejecuciones de latido, las más recientes primero.

**Elemento de lista de ejecución:**
```
[StatusIcon] #run-id-short   source: timer     2 min ago     1.2k tokens   $0.03
             "Reviewed 3 PRs and filed 2 issues"
```

Campos por fila:
- Ícono de estado (check verde = succeeded, X roja = failed, spinner amarillo = running, reloj gris = queued, timeout naranja = timed_out, barra = cancelled)
- ID de ejecución (corto, primeros 8 caracteres)
- Chip de fuente de invocación (timer, assignment, on_demand, automation)
- Marca de tiempo relativa
- Resumen de uso de tokens (total entrada + salida)
- Costo
- Resumen del resultado (primera línea del resultado o del error)

**Hacer clic en una ejecución** abre el detalle de la ejecución en línea (expansión de acordeón) o un panel deslizante que muestra:

- Línea de tiempo completa de estado (queued -> running -> outcome) con marcas de tiempo
- Sesión antes/después
- Desglose de tokens: entrada, salida, entrada en caché
- Desglose de costos
- Mensaje de error y código de error (si falló)
- Código de salida y señal (si aplica)

**Visor de registros** dentro del detalle de la ejecución:
- Transmite `heartbeat_run_events` de la ejecución, ordenados por `seq`
- Cada evento se muestra como una línea de registro con marca de tiempo, nivel (con código de color) y mensaje
- Los eventos de tipo `stdout`/`stderr` se muestran en monoespaciado
- Los eventos del sistema se muestran con un estilo distinto
- Para ejecuciones en curso, desplazamiento automático y anexado en vivo vía eventos WebSocket (`heartbeat.run.event`, `heartbeat.run.log`)
- El enlace "Ver registro completo" obtiene de `heartbeatsApi.log(runId)` y muestra en un contenedor monoespaciado con desplazamiento
- Truncado: mostrar los últimos 200 eventos por defecto, botón "Cargar más" para obtener eventos anteriores

#### Pestaña Issues

Mantener tal cual: lista de issues asignados a este agente con estado, clicable para navegar al detalle del issue.

#### Pestaña Costos

Expandir la pestaña de costos existente:

- **Totales acumulados** de `agent_runtime_state`: tokens de entrada totales, tokens de salida totales, tokens en caché totales, costo total
- Barra de progreso de **presupuesto mensual** (gasto del mes actual vs presupuesto)
- **Tabla de costos por ejecución**: fecha, ID de ejecución, tokens entrada/salida/en caché, costo — ordenable por fecha o costo
- **Gráfico** (extra): gráfico de barras simple del gasto diario en los últimos 30 días

### Panel de propiedades (barra lateral derecha)

El panel `AgentProperties` existente sigue mostrando la información de un vistazo. Agregar:
- ID de sesión (truncado, con botón de copiar)
- Último error (si hay, en rojo)
- Enlace a "Ver configuración" (desplaza a / cambia a la pestaña Configuración)

---

## 3. Página de lista de agentes

### Estado actual

Muestra una lista plana de agentes con insignia de estado, nombre, rol, título y barra de presupuesto.

### Mejoras

**Agregar botón "Nuevo agente"** en el encabezado (ícono Plus + "Nuevo agente"), abre el diálogo de creación.

**Agregar alternador de vista**: vista de lista (actual) y vista de organigrama.

**Vista de organigrama:**
- Diseño de árbol que muestra la jerarquía de reportes
- Cada nodo muestra: nombre del agente, rol, insignia de estado
- CEO arriba, reportes directos debajo, etc.
- Usa el endpoint `agentsApi.org(companyId)` que ya devuelve `OrgNode[]`
- Hacer clic en un nodo navega al detalle del agente

**Mejoras de la vista de lista:**
- Agregar el tipo de adaptador como un chip/etiqueta pequeño en cada fila
- Agregar marca de tiempo relativa de "última actividad"
- Agregar indicador de ejecución (punto animado) si el agente tiene actualmente un latido en ejecución

**Filtrado:**
- Filtros de pestaña: Todos, Activo, Pausado, Error (similar al patrón de la página de Issues)

---

## 4. Inventario de componentes

Nuevos componentes necesarios:

| Componente | Propósito |
|-----------|---------|
| `NewAgentDialog` | Diálogo de formulario de creación de agente |
| `AgentConfigForm` | Secciones de formulario compartidas para crear + editar (adaptador, latido, runtime) |
| `AdapterConfigFields` | Campos condicionales según el tipo de adaptador |
| `HeartbeatPolicyFields` | Campos de configuración del latido |
| `EnvVarEditor` | Editor de pares clave-valor para variables de entorno |
| `RunListItem` | Fila única de ejecución en la lista de ejecuciones |
| `RunDetail` | Detalle de ejecución expandido con visor de registros |
| `LogViewer` | Visor de registros en streaming con desplazamiento automático |
| `OrgChart` | Visualización de árbol de la jerarquía de agentes |
| `AgentSelect` | Selector de agentes reutilizable (para Reporta a, etc.) |

Componentes existentes reutilizados:
- `StatusBadge`, `EntityRow`, `EmptyState`, `PropertyRow`
- shadcn: `Dialog`, `Tabs`, `Button`, `Popover`, `Command`, `Separator`, `Toggle`

---

## 5. Superficie de API

Todos los endpoints ya existen. No se necesita nuevo trabajo de servidor para la V1.

| Acción | Endpoint | Usado por |
|--------|----------|---------|
| Listar agentes | `GET /companies/:id/agents` | Página de lista |
| Obtener árbol de la organización | `GET /companies/:id/org` | Vista de organigrama |
| Crear agente | `POST /companies/:id/agents` | Diálogo de creación |
| Actualizar agente | `PATCH /agents/:id` | Pestaña de configuración |
| Pausar/Reanudar/Terminar | `POST /agents/:id/{action}` | Acciones del encabezado |
| Restablecer sesión | `POST /agents/:id/runtime-state/reset-session` | Menú de desbordamiento |
| Crear clave de API | `POST /agents/:id/keys` | Menú de desbordamiento |
| Obtener estado del runtime | `GET /agents/:id/runtime-state` | Pestaña de resumen, panel de propiedades |
| Invocar/Despertar | `POST /agents/:id/heartbeat/invoke` | Botón de invocar del encabezado |
| Listar ejecuciones | `GET /companies/:id/heartbeat-runs?agentId=X` | Pestaña de ejecuciones |
| Cancelar ejecución | `POST /heartbeat-runs/:id/cancel` | Detalle de ejecución |
| Eventos de ejecución | `GET /heartbeat-runs/:id/events` | Visor de registros |
| Registro de ejecución | `GET /heartbeat-runs/:id/log` | Vista de registro completo |

---

## 6. Orden de implementación

1. **Diálogo Nuevo agente** — desbloquea la creación de agentes desde la UI
2. **Mejoras de la lista de agentes** — agregar botón Nuevo agente, filtros de pestaña, chip de adaptador, indicador de ejecución
3. **Detalle de agente: pestaña Configuración** — configuración editable de adaptador/latido/runtime
4. **Detalle de agente: pestaña Ejecuciones** — lista de historial de ejecuciones con estado, tokens, costo
5. **Detalle de agente: detalle de ejecución + visor de registros** — detalle de ejecución expandible con registros en streaming
6. **Detalle de agente: pestaña Resumen** — tarjeta de resumen, posición en el organigrama
7. **Detalle de agente: pestaña Costos** — desglose de costos expandido
8. **Vista de organigrama** — visualización de árbol en la página de lista
9. **Actualizaciones del panel de propiedades** — ID de sesión, último error

Los pasos 1-5 son el núcleo. Los pasos 6-9 son pulido.
