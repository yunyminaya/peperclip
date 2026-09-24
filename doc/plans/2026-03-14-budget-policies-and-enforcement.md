# Políticas de presupuesto y cumplimiento

## Contexto

Paperclip ya trata los presupuestos como una responsabilidad central del plano de control:

- `doc/SPEC.md` otorga al tablero la autoridad para establecer presupuestos, pausar agentes, pausar trabajo y anular cualquier presupuesto.
- `doc/SPEC-implementation.md` dice que V1 debe admitir ventanas de presupuesto mensuales en UTC, alertas suaves y pausa automática dura.
- el código actual solo implementa parcialmente esa intención.

Hoy el sistema tiene un comportamiento estrecho de presupuesto de dinero:

- las empresas rastrean `budgetMonthlyCents` y `spentMonthlyCents`
- los agentes rastrean `budgetMonthlyCents` y `spentMonthlyCents`
- la ingesta de `cost_events` incrementa esos contadores
- cuando un agente excede su presupuesto mensual, el agente se pausa

Eso deja brechas importantes de producto:

- sin modelo de presupuesto de proyecto
- sin aprobación generada cuando se alcanza el presupuesto
- sin sistema genérico de políticas de presupuesto
- sin semántica de pausa de proyecto ligada al presupuesto
- sin seguimiento durable de incidentes para prevenir alertas duplicadas
- sin separación entre presupuestos de gasto exigibles y cuotas de uso de asesoría

Este plan define el modelo concreto de presupuesto que Paperclip debería implementar a continuación.

## Objetivos del producto

Paperclip debería permitir a los operadores:

1. Establecer presupuestos en agentes y proyectos.
2. Entender si un presupuesto se basa en dinero o en uso.
3. Ser advertidos antes de que se agote un presupuesto.
4. Pausar automáticamente el trabajo cuando se alcanza un presupuesto duro.
5. Aprobar, aumentar o reanudar desde una detención de presupuesto usando una UI obvia.
6. Ver el estado del presupuesto en el panel, `/costs` y las páginas de detalle de alcance.

El sistema debería dejar muy claro una cosa:

- los presupuestos son controles de política
- las cuotas son visibilidad de uso

Están relacionados, pero no son el mismo concepto.

## Decisiones de producto

### Valores predeterminados de presupuesto V1

Para el próximo pase de implementación, Paperclip debería aplicar estos valores predeterminados:

- los presupuestos de agentes son presupuestos mensuales recurrentes
- los presupuestos de proyectos son presupuestos totales de por vida
- el cumplimiento de detención dura usa dólares facturados, no tokens
- las ventanas mensuales usan meses calendario en UTC
- los presupuestos totales de proyecto no se reinician automáticamente

Esto da un modelo mental limpio:

- los agentes son trabajadores continuos, así que el presupuesto mensual recurrente es natural
- los proyectos son flujos de trabajo acotados, así que un tope de por vida es natural

### Métrica a exigir primero

La primera métrica exigible debería ser `billed_cents`.

Razonamiento:

- funciona entre proveedores, facturadores y modelos
- se mapea directamente al riesgo financiero real
- maneja el excedente y el uso medido de forma consistente
- evita problemas de normalización de tokens entre proveedores
- se aplica limpiamente incluso cuando futuros eventos financieros no estén basados en tokens

Los presupuestos de tokens no deberían ser la primera política de detención dura.
Deberían llegar después como controles de uso de asesoría una vez que el sistema basado en dinero sea sólido.

### Decisión de uso de suscripción

Paperclip debería separar el uso incluido en suscripción del gasto facturado:

- `subscription_included`
  - visible en informes
  - visible en resúmenes de uso
  - no cuenta contra el presupuesto de dinero
- `subscription_overage`
  - visible en informes
  - cuenta contra el presupuesto de dinero
- `metered_api`
  - visible en informes
  - cuenta contra el presupuesto de dinero

Esto mantiene honesto el sistema de presupuesto:

- los usuarios no deberían ver subir el "gasto" por uso que no incurrió costo facturado marginal
- los usuarios aún deberían ver el uso de tokens y el estado de cuota del proveedor

### Alerta suave vs detención dura

Paperclip debería tener dos clases de umbral:

- alerta suave
  - crea estado de notificación visible
  - no crea una aprobación
  - no pausa el trabajo
- detención dura
  - pausa automáticamente el alcance afectado
  - crea una aprobación que requiere resolución humana
  - impide latidos adicionales o toma de tareas en ese alcance

Umbrales predeterminados:

- alerta suave al `80%`
- detención dura al `100%`

Deberían ser configurables por política más adelante, pero son buenos valores predeterminados ahora.

## Modelo de alcance

### Tipos de alcance admitidos

Las políticas de presupuesto deberían admitir:

- `company`
- `agent`
- `project`

Este plan se enfoca en terminar `agent` y `project` primero mientras preserva el comportamiento actual de presupuesto de empresa.

### Preajustes de política V1.5 recomendados

- Empresa
  - métrica: `billed_cents`
  - ventana: `calendar_month_utc`
- Agente
  - métrica: `billed_cents`
  - ventana: `calendar_month_utc`
- Proyecto
  - métrica: `billed_cents`
  - ventana: `lifetime`

Extensiones futuras pueden agregar:

- políticas de asesoría de tokens
- ventanas de gasto diarias o semanales
- presupuestos con alcance de proveedor o facturador
- presupuestos delegados heredados por el organigrama

## Base de implementación actual

La base de código actual no parte de cero, pero la forma existente es demasiado ad hoc para extenderse con seguridad.

### Lo que existe hoy

- contadores mensuales de centavos de empresa y agente
- ingesta de costos que actualiza esos contadores
- pausa de detención dura del agente al exceder el presupuesto mensual

### Lo que falta

- presupuestos de proyecto
- persistencia genérica de políticas de presupuesto
- detección genérica de cruce de umbrales
- deduplicación de incidentes por alcance/ventana
- creación de aprobación en detención dura
- bloqueo de ejecución de proyecto
- UI de línea de tiempo e incidentes de presupuesto
- distinción entre cuota de asesoría y presupuesto exigible

## Modelo de datos propuesto

### 1. `budget_policies`

Crear una nueva tabla para definiciones canónicas de presupuesto.

Campos sugeridos:

- `id`
- `company_id`
- `scope_type`
- `scope_id`
- `metric`
- `window_kind`
- `amount`
- `warn_percent`
- `hard_stop_enabled`
- `notify_enabled`
- `is_active`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

Notas:

- `scope_type` es uno de `company | agent | project`
- `scope_id` es anulable solo para política a nivel de empresa si la empresa está implícita; de lo contrario mantenerlo explícito
- `metric` debería comenzar con `billed_cents`
- `window_kind` comienza con `calendar_month_utc | lifetime`
- `amount` se almacena en la unidad natural de la métrica

### 2. `budget_incidents`

Crear un registro durable de cruces de umbral.

Campos sugeridos:

- `id`
- `company_id`
- `policy_id`
- `scope_type`
- `scope_id`
- `metric`
- `window_kind`
- `window_start`
- `window_end`
- `threshold_type`
- `amount_limit`
- `amount_observed`
- `status`
- `approval_id` anulable
- `activity_id` anulable
- `resolved_at` anulable
- `created_at`
- `updated_at`

Notas:

- `threshold_type`: `soft | hard`
- `status`: `open | acknowledged | resolved | dismissed`
- un incidente abierto por política por umbral por ventana previene aprobaciones duplicadas y spam de alertas

### 3. Estado de pausa de proyecto

Los proyectos necesitan semántica de pausa explícita.

Enfoque recomendado:

- extender el estado del proyecto o agregar un campo de pausa para que un proyecto pueda bloquearse por presupuesto
- preservar si el proyecto está pausado por presupuesto vs pausado manualmente

Forma preferida:

- mantener el estado de flujo de trabajo del proyecto como está
- agregar campos de estado de ejecución:
  - `execution_status`: `active | paused | archived`
  - `pause_reason`: `manual | budget | system | null`

Si eso es demasiado grande para el pase inmediato, una versión más pequeña es:

- agregar `paused_at`
- agregar `pause_reason`

El requisito clave es conductual, no cosmético:
Paperclip debe saber que un proyecto está pausado por presupuesto y hacerlo cumplir.

### 4. Compatibilidad con columnas de presupuesto existentes

Las columnas mensuales de presupuesto existentes de empresa y agente deberían permanecer temporalmente por compatibilidad.

Plan de migración:

1. seguir leyendo las columnas existentes durante la transición
2. crear filas equivalentes de `budget_policies`
3. cambiar el cumplimiento y la UI a políticas
4. más adelante eliminar o marcar como obsoletas las columnas heredadas

## Motor de presupuesto

El cumplimiento de presupuesto debería moverse a un servicio dedicado.

La lógica actual está enterrada dentro de la ingesta de costos.
Eso es demasiado estrecho porque las verificaciones de presupuesto deben aplicarse en más de un límite de ejecución.

### Responsabilidades

Nuevo servicio: `budgetService`

Responsabilidades:

- resolver políticas aplicables para un evento de costo
- calcular totales de ventana actuales
- detectar cruces de umbral
- crear incidentes, actividades y aprobaciones
- pausar alcances afectados en detención dura
- proporcionar verificaciones previas de cumplimiento para puntos de entrada de ejecución

### Flujo canónico de evaluación

Cuando se escribe un nuevo `cost_event`:

1. persistir el `cost_event`
2. identificar alcances afectados
   - empresa
   - agente
   - proyecto
3. obtener políticas activas para esos alcances
4. calcular el monto observado actual para cada ventana de política
5. comparar con umbrales
6. crear incidente suave si el umbral suave se cruza por primera vez en la ventana
7. crear incidente duro si el umbral duro se cruza por primera vez en la ventana
8. si hay incidente duro:
   - pausar el alcance
   - crear aprobación
   - crear evento de actividad
   - emitir estado de notificación

### Verificaciones previas de cumplimiento

El cumplimiento de presupuesto no puede depender solo de la ingesta posterior de costos.

Paperclip también debe bloquear la ejecución antes de que comience nuevo trabajo.

Agregar verificaciones de presupuesto a:

- despacho de latido del programador
- endpoints de invocación manual
- activaciones impulsadas por asignación
- promoción de ejecuciones en cola
- rutas de checkout o toma de issues donde aplique

Si un alcance está pausado por presupuesto:

- no iniciar un nuevo latido
- no dejar que el agente tome trabajo adicional
- presentar una razón clara en API y UI

### Comportamiento de ejecución activa

Cuando se activa una detención dura mientras una ejecución ya está activa:

- marcar el alcance pausado de inmediato para trabajo futuro
- solicitar cancelación elegante de la ejecución actual
- permitir el comportamiento normal de tiempo de espera de cancelación
- escribir actividad explicando que la pausa vino del cumplimiento de presupuesto

Esto refleja la semántica general de pausa ya esperada por el producto.

## Modelo de aprobación

Las detenciones duras de presupuesto deberían crear una aprobación de primera clase.

### Nuevo tipo de aprobación

Agregar tipo de aprobación:

- `budget_override_required`

La carga útil debería incluir:

- `scopeType`
- `scopeId`
- `scopeName`
- `metric`
- `windowKind`
- `thresholdType`
- `budgetAmount`
- `observedAmount`
- `windowStart`
- `windowEnd`
- `topDrivers`
- `paused`

### Acciones de resolución

La UI de aprobación debería admitir:

- aumentar presupuesto y reanudar
- reanudar una vez sin cambiar la política
- mantener pausado

Acción opcional posterior:

- deshabilitar política de presupuesto

### Las alertas suaves no necesitan aprobación

Las alertas suaves deberían crear:

- evento de actividad
- alerta de panel
- notificación de bandeja de entrada o señal similar visible del tablero

No deberían crear una aprobación por defecto.

## Modelo de notificación y actividad

Los eventos de presupuesto necesitan visibilidad obvia del operador.

Salidas requeridas:

- entrada de registro de actividad en cruces de umbral
- superficie de panel para incidentes de presupuesto activos
- banner de página de detalle en agente o proyecto pausado
- resumen en `/costs` de incidentes activos y salud de políticas

Canales posteriores:

- correo
- webhook
- Slack u otras integraciones

## Plan de API

### Gestión de políticas

Agregar rutas para:

- listar políticas de presupuesto de empresa
- crear política de presupuesto
- actualizar política de presupuesto
- archivar o deshabilitar política de presupuesto

### Superficies de incidentes

Agregar rutas para:

- listar incidentes de presupuesto activos
- listar historial de incidentes
- obtener detalle de incidente para un alcance

### Resolución de aprobación

Las aprobaciones de presupuesto deberían usar el sistema de aprobaciones existente una vez agregado el nuevo tipo de aprobación.

Flujos esperados:

- crear aprobación en detención dura
- resolver aprobación cambiando la política y reanudando
- resolver aprobación reanudando una vez

### Errores de ejecución

Cuando el trabajo es bloqueado por presupuesto, la API debería retornar errores explícitos.

Ejemplos:

- invocación de agente bloqueada porque el presupuesto del agente está pausado
- ejecución de issue bloqueada porque el presupuesto del proyecto está pausado

No hacer no-op silencioso.

## Plan de UI

El presupuesto debería ser visible en los lugares donde los operadores toman decisiones.

### `/costs`

Agregar una sección de presupuesto que incluya:

- incidentes de presupuesto activos
- lista de políticas con alcance, ventana, métrica y estado de umbral
- barras de progreso para el periodo actual o total
- distinción clara entre:
  - presupuesto de gasto
  - cuota de suscripción
- acciones rápidas:
  - aumentar presupuesto
  - abrir aprobación
  - reanudar alcance si está permitido

La página debería hacer obvia esta distinción visual:

- Presupuesto
  - política de gasto exigible
- Cuota
  - ventana de uso de proveedor o suscripción

### Detalle de agente

Agregar una tarjeta de presupuesto de agente:

- monto de presupuesto mensual
- gasto del mes actual
- gasto restante
- estado
- banner de advertencia o pausa
- enlace a la aprobación si está bloqueado

### Detalle de proyecto

Agregar una tarjeta de presupuesto de proyecto:

- monto de presupuesto total
- gasto total a la fecha
- gasto restante
- estado de pausa
- enlace de aprobación

El detalle de proyecto también debería mostrar si la ejecución de issues está bloqueada porque el proyecto está pausado por presupuesto.

### Panel

Agregar una sección de presupuesto de alta señal:

- brechas de presupuesto activas
- próximas alertas suaves
- conteos de agentes pausados y proyectos pausados por presupuesto

El operador no debería tener que visitar `/costs` para saber que el trabajo se detuvo.

## Matemática de presupuesto

### Qué cuenta hacia el presupuesto

Para el cumplimiento V1.5, incluir:

- eventos de costo `metered_api`
- eventos de costo `subscription_overage`
- cualquier futuro evento de costo con alcance de solicitud con centavos facturados distintos de cero

No incluir:

- eventos de costo `subscription_included` con cero centavos facturados
- filas de cuota de asesoría
- eventos financieros a nivel de cuenta a menos que y hasta que se agreguen explícitamente presupuestos financieros a nivel de empresa

### Por qué no tokens primero

Los presupuestos de tokens no deberían ser la primera detención dura porque:

- los proveedores cuentan tokens de forma diferente
- los tokens en caché complican los totales simples
- algunos cargos futuros no están basados en tokens
- los tokens de suscripción no implican necesariamente gasto
- el dinero sigue siendo la métrica de cumplimiento más limpia entre proveedores

### Métricas futuras de presupuesto

Las métricas futuras de política pueden incluir:

- `total_tokens`
- `input_tokens`
- `output_tokens`
- `requests`
- `finance_amount_cents`

Pero deberían entrar solo después de que la ruta de presupuesto de dinero esté estable.

## Plan de migración

### Fase 1: Base

- agregar `budget_policies`
- agregar `budget_incidents`
- agregar nuevo tipo de aprobación
- agregar metadatos de pausa de proyecto

### Fase 2: Compatibilidad

- rellenar políticas desde las columnas mensuales de presupuesto existentes de empresa y agente
- mantener legibles las columnas heredadas durante la migración

### Fase 3: Cumplimiento

- mover la lógica de presupuesto a un servicio dedicado
- agregar creación de incidentes de detención dura
- agregar creación de actividad y aprobación
- agregar protecciones de ejecución en rutas de latido e invocación

### Fase 4: UI

- sección de presupuesto en `/costs`
- tarjeta de presupuesto en detalle de agente
- tarjeta de presupuesto en detalle de proyecto
- resumen de incidentes en panel

### Fase 5: Limpieza

- mover todas las lecturas/escrituras a `budget_policies`
- reducir la dependencia de columnas heredadas
- decidir si eliminar las columnas antiguas de presupuesto

## Pruebas

Cobertura requerida:

- alerta suave de presupuesto mensual de agente al 80%
- detención dura de presupuesto mensual de agente al 100%
- alerta suave de presupuesto de por vida de proyecto
- detención dura de presupuesto de por vida de proyecto
- el uso `subscription_included` no consume presupuesto de dinero
- el `subscription_overage` sí consume presupuesto de dinero
- la detención dura crea un incidente por umbral por ventana
- la detención dura crea aprobación y pausa el alcance correcto
- el proyecto pausado bloquea nueva ejecución de issues
- el agente pausado bloquea nuevo despacho de latido
- la actualización de política y reanudación limpia o resuelve correctamente el incidente activo
- el panel y `/costs` muestran incidentes activos

## Preguntas abiertas

Deberían diferirse explícitamente a menos que bloqueen la implementación:

- ¿Los presupuestos de proyecto también deberían admitir modo mensual, o es suficiente de por vida para la primera versión?
- ¿Los presupuestos a nivel de empresa deberían eventualmente incluir `finance_events` como cargos de recarga de OpenRouter y cargos provisionados de Bedrock?
- ¿La edición delegada de presupuestos debería limitarse por jerarquía de organización en V1, o permanecer solo del tablero en la UI aunque el modelo de datos pueda admitir delegación más adelante?
- ¿Necesitamos "reanudar una vez" de inmediato, o la primera resolución de aprobación puede ser "aumentar presupuesto y reanudar" más "mantener pausado"?

## Recomendación

Implementar el primer sistema de presupuesto coherente con estas reglas:

- Presupuesto de agente = dólares facturados mensuales
- Presupuesto de proyecto = dólares facturados de por vida
- Detención dura = pausa automática + aprobación
- Alerta suave = advertencia visible, sin aprobación
- Uso de suscripción = cuota visible e informes de tokens, no cumplimiento de presupuesto de dinero

Esto resuelve el problema real del operador sin mezclar el control de gasto, las ventanas de cuota de proveedor y la contabilidad de tokens.
