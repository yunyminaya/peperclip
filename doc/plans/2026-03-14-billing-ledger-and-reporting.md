# Libro de facturación e informes

## Contexto

Paperclip actualmente almacena el gasto de modelos en `cost_events` y el estado operativo de ejecuciones en `heartbeat_runs`.
Esa división está bien, pero el código actual de informes intenta inferir la semántica de facturación mezclando ambas tablas:

- `cost_events` conoce proveedor, modelo, tokens y dólares
- `heartbeat_runs.usage_json` conoce algunos metadatos de facturación por ejecución
- `heartbeat_runs.usage_json` actualmente **no** lleva suficientes dimensiones de facturación normalizadas para admitir informes honestos a nivel de proveedor

Esto se vuelve incorrecto tan pronto como una empresa usa más de un proveedor, más de un canal de facturación o más de un modo de facturación.

Ejemplos:

- uso directo de la API de OpenAI
- uso de suscripción de Claude con cero dólares marginales
- excedente de suscripción con dólares y tokens
- facturación de OpenRouter donde el facturador es OpenRouter pero el proveedor upstream es Anthropic u OpenAI

El sistema necesita admitir:

- informes de dólares
- informes de tokens
- uso incluido en suscripción
- excedente de suscripción
- uso directo de API medida
- facturación futura de agregadores como OpenRouter

## Decisión de producto

`cost_events` se convierte en el libro canónico de facturación y uso para informes.

`heartbeat_runs` sigue siendo un registro operativo de ejecución. Puede mantener metadatos de facturación espejados para depuración y transcripciones, pero los informes no deben reconstruir la semántica de facturación desde `heartbeat_runs.usage_json`.

## Decisión: un libro o dos

**No** necesitamos dos tablas para resolver el problema del PR actual.
Para informes de inferencia a nivel de solicitud, `cost_events` es suficiente si lleva las dimensiones correctas:

- proveedor upstream
- facturador
- tipo de facturación
- modelo
- campos de tokens
- monto facturado

Por eso el primer pase de implementación extiende `cost_events` en lugar de introducir una segunda tabla de inmediato.

Sin embargo, si Paperclip necesita contabilizar toda la superficie de facturación de agregadores y plataformas de IA gestionadas, entonces `cost_events` solo no es suficiente.
Algunos cargos no se representan limpiamente como un solo evento de inferencia de modelo:

- recargas de cuenta y compras de créditos
- cargos de plataforma cobrados al momento de la compra
- cargos de plataforma BYOK que son a nivel de cuenta o basados en umbral
- vencimientos de créditos prepagados, reembolsos y ajustes
- compromisos de rendimiento provisionado
- ajuste fino, entrenamiento, importación de modelos y cargos de almacenamiento
- registro de gateway u otra sobrecarga de plataforma no atribuible a un par prompt/respuesta

Así que la decisión es:

- corto plazo: mantener `cost_events` como el libro de inferencia y uso
- próxima fase: agregar `finance_events` para eventos financieros no de inferencia

Esta es una división deliberada entre:

- contabilidad de uso e inferencia
- contabilidad financiera a nivel de cuenta y de plataforma

Esa separación mantiene honestos los informes de solicitudes sin forzarnos a fingir semántica de factura en filas que nunca tuvieron alcance de solicitud.

## Motivación externa y fuentes

La necesidad de este modelo no es teórica.
Sigue directamente de los sistemas de facturación de los proveedores y agregadores que Paperclip necesita admitir.

### OpenRouter

URLs de fuente:

- https://openrouter.ai/docs/faq#credit-and-billing-systems
- https://openrouter.ai/pricing

Comportamiento de facturación relevante al 14 de marzo de 2026:

- OpenRouter traslada el precio de inferencia subyacente y descuenta el costo de la solicitud de los créditos comprados.
- OpenRouter cobra un 5.5% de cargo con un mínimo de $0.80 al comprar créditos.
- Los pagos con cripto tienen un cargo del 5%.
- BYOK tiene su propio modelo de cargos tras un umbral de solicitudes gratuitas.
- La facturación de OpenRouter se agrega a nivel de cuenta de OpenRouter incluso cuando el proveedor upstream es Anthropic, OpenAI, Google u otro proveedor.

Implicación para Paperclip:

- el uso de solicitudes pertenece a `cost_events`
- las compras de créditos, cargos de compra, cargos BYOK, reembolsos y vencimientos pertenecen a `finance_events`
- `biller=openrouter` debe seguir siendo distinto de `provider=anthropic|openai|google|...`

### Facturación unificada de Cloudflare AI Gateway

URL de fuente:

- https://developers.cloudflare.com/ai-gateway/features/unified-billing/

Comportamiento de facturación relevante al 14 de marzo de 2026:

- la Facturación unificada permite a los usuarios llamar a múltiples proveedores upstream recibiendo una sola factura de Cloudflare.
- El uso se paga con créditos cargados de Cloudflare.
- Cloudflare admite recargas manuales y umbrales de recarga automática.
- Los límites de gasto pueden detener el procesamiento de solicitudes en límites diarios, semanales o mensuales.
- El tráfico de Facturación unificada puede usar credenciales gestionadas por Cloudflare en lugar de la clave directa del proveedor del usuario.

Implicación para Paperclip:

- el uso de solicitudes necesita `biller=cloudflare`
- el proveedor upstream aún necesita conservarse por separado
- las cargas de créditos de Cloudflare y eventos relacionados a nivel de cuenta no son filas de inferencia y no deberían forzarse en `cost_events`
- los informes de cuota y límites deben admitir controles a nivel de facturador, no solo límites de proveedor upstream

### Amazon Bedrock

URL de fuente:

- https://aws.amazon.com/bedrock/pricing/

Comportamiento de facturación relevante al 14 de marzo de 2026:

- Bedrock admite precios bajo demanda y por lotes.
- Los precios de Bedrock varían por región.
- algunos niveles de precios agregan primas o descuentos relativos al precio estándar
- el rendimiento provisionado es basado en compromiso en lugar de basado en solicitud
- la importación de modelos personalizados usa Custom Model Units facturadas por minuto, con cargos mensuales de almacenamiento
- las copias de modelos importados se facturan en ventanas de 5 minutos una vez activas
- la personalización y el ajuste fino introducen cargos de entrenamiento y de modelos alojados más allá de la inferencia normal

Implicación para Paperclip:

- la inferencia normal con tokens encaja en `cost_events`
- el rendimiento provisionado, los cargos de Custom Model Units, el entrenamiento y los cargos de almacenamiento requieren `finance_events`
- la región y el nivel de precios necesitan ser dimensiones de primera clase en el modelo financiero

## Límite del libro

Para mantener el sistema coherente, el límite de la tabla debería ser explícito.

### `cost_events`

Usar `cost_events` para uso con alcance de solicitud y cargos de inferencia:

- una fila por evento de ejecución facturable o con uso
- proveedor/modelo/facturador/tipo de facturación/tokens/costo
- opcionalmente ligado a `heartbeat_run_id`
- admite API directas, suscripciones, excedente, inferencia enrutada por OpenRouter, inferencia enrutada por Cloudflare e inferencia bajo demanda de Bedrock

### `finance_events`

Usar `finance_events` para eventos financieros con alcance de cuenta o de plataforma:

- compra de créditos
- recarga
- reembolso
- cargo
- vencimiento
- capacidad provisionada
- entrenamiento
- importación de modelo
- almacenamiento
- ajuste de factura

Estas filas pueden o no tener un modelo, proveedor o id de ejecución relacionado.
Intentar forzarlas en `cost_events` crearía filas de solicitud falsas o filas pesadas en nulos que significan algo fundamentalmente distinto del uso de inferencia.

## Dimensiones canónicas de facturación

Cada evento de facturación persistido debería modelar cuatro ejes separados:

1. Proveedor de uso
   El proveedor upstream cuyo modelo realizó el trabajo.
   Ejemplos: `openai`, `anthropic`, `google`.

2. Facturador
   El sistema que cobró por el uso.
   Ejemplos: `openai`, `anthropic`, `openrouter`, `cursor`, `chatgpt`.

3. Tipo de facturación
   El modo de precio aplicado al evento.
   Valores canónicos iniciales:
   - `metered_api`
   - `subscription_included`
   - `subscription_overage`
   - `credits`
   - `fixed`
   - `unknown`

4. Medidas
   El uso y la facturación deben ser ambos almacenables:
   - `input_tokens`
   - `output_tokens`
   - `cached_input_tokens`
   - `cost_cents`

Estas dimensiones son independientes.
Por ejemplo, un evento puede ser:

- proveedor: `anthropic`
- facturador: `openrouter`
- tipo de facturación: `metered_api`
- tokens: distintos de cero
- centavos de costo: distintos de cero

O:

- proveedor: `anthropic`
- facturador: `anthropic`
- tipo de facturación: `subscription_included`
- tokens: distintos de cero
- centavos de costo: `0`

## Cambios de esquema

Extender `cost_events` con:

- `heartbeat_run_id uuid null references heartbeat_runs.id`
- `biller text not null default 'unknown'`
- `billing_type text not null default 'unknown'`
- `cached_input_tokens int not null default 0`

Mantener `provider` como el proveedor de uso upstream.
No sobrecargar `provider` para que signifique facturador.

Agregar una futura tabla `finance_events` para eventos financieros a nivel de cuenta con campos en esta línea:

- `company_id`
- `occurred_at`
- `event_kind`
- `direction`
- `biller`
- `provider nullable`
- `execution_adapter_type nullable`
- `pricing_tier nullable`
- `region nullable`
- `model nullable`
- `quantity nullable`
- `unit nullable`
- `amount_cents`
- `currency`
- `estimated`
- `related_cost_event_id nullable`
- `related_heartbeat_run_id nullable`
- `external_invoice_id nullable`
- `metadata_json nullable`

Agregar índices:

- `(company_id, biller, occurred_at)`
- `(company_id, provider, occurred_at)`
- `(company_id, heartbeat_run_id)` si los informes distintos por ejecución siguen siendo comunes

## Cambios de contrato compartido

### Tipos compartidos

Agregar una unión de tipo de facturación compartida y enriquecer los tipos de costo con:

- `heartbeatRunId`
- `biller`
- `billingType`
- `cachedInputTokens`

Actualizar los tipos de respuesta de informes para que el desglose por proveedor refleje el libro directamente en lugar de metadatos de ejecución inferidos.

### Validadores

Extender `createCostEventSchema` para aceptar:

- `heartbeatRunId`
- `biller`
- `billingType`
- `cachedInputTokens`

Valores predeterminados:

- `biller` usa por defecto `provider`
- `billingType` usa por defecto `unknown`
- `cachedInputTokens` usa por defecto `0`

## Cambios de contrato del adaptador

Extender los resultados de ejecución del adaptador para que puedan reportar:

- `biller`
- valores de tipo de facturación más ricos

Compatibilidad con versiones anteriores:

- los valores existentes de adaptador `api` y `subscription` se tratan como alias heredados
- mapear `api -> metered_api`
- mapear `subscription -> subscription_included`

Los futuros adaptadores pueden emitir los valores canónicos directamente.

El soporte de OpenRouter usará:

- `provider` = proveedor upstream cuando se conozca
- `biller` = `openrouter`
- `billingType` = `metered_api` a menos que OpenRouter exponga más adelante otro modo de facturación

El soporte de Facturación unificada de Cloudflare usará:

- `provider` = proveedor upstream cuando se conozca
- `biller` = `cloudflare`
- `billingType` = `credits` o `metered_api` según el contrato normalizado de facturación de solicitud

El soporte de Bedrock usará:

- `provider` = proveedor upstream o `aws_bedrock` según la forma del adaptador
- `biller` = `aws_bedrock`
- `billingType` = modo con alcance de solicitud para filas de inferencia
- `finance_events` para cargos provisionados, de entrenamiento, de importación y de almacenamiento

## Cambios de ruta de escritura

### Eventos creados por latido

Cuando una ejecución de latido produce uso o gasto:

1. normalizar los metadatos de facturación del adaptador
2. escribir una fila del libro en `cost_events`
3. adjuntar `heartbeat_run_id`
4. establecer `provider`, `biller`, `billing_type`, campos de tokens y `cost_cents`

La ruta de escritura ya no debería depender de inferencia posterior desde `heartbeat_runs`.

### Eventos creados manualmente por API

La creación manual de eventos de costo sigue admitida.
Estos eventos pueden tener `heartbeatRunId = null`.

Reglas:

- `provider` sigue siendo requerido
- `biller` usa por defecto `provider`
- `billingType` usa por defecto `unknown`

## Cambios de informes

### Servidor

Refactorizar las consultas de informes para usar solo `cost_events`.

#### `summary`

- sumar `cost_cents`

#### `by-agent`

- sumar costos y campos de tokens desde `cost_events`
- usar `count(distinct heartbeat_run_id)` filtrado por tipo de facturación para conteos de ejecuciones
- usar sumas de tokens filtradas por tipo de facturación para uso de suscripción

#### `by-provider`

- agrupar por `provider`, `model`
- sumar costos y campos de tokens directamente desde el libro
- derivar segmentos de tipo de facturación desde `cost_events.billing_type`
- nunca prorratear desde `heartbeat_runs` no relacionados

#### futuro `by-biller`

- agrupar por `biller`
- esta es la vista correcta para responsabilidad de facturas y suscripciones

#### `window-spend`

- seguir usando `cost_events`

#### atribución de proyecto

Mantener por ahora la lógica actual de atribución de proyecto, pero preferir `cost_events.heartbeat_run_id` como ancla de unión cuando sea posible.

## Cambios de UI

### Principios

- Gasto, uso y cuota están relacionados pero son distintos
- una obtención de cuota faltante no es lo mismo que "sin cuota"
- proveedor y facturador son dimensiones diferentes

### Cambios inmediatos de UI

1. Mantener la estructura actual de la página de costos.
2. Hacer precisas las tarjetas de proveedor leyendo solo valores respaldados por el libro.
3. Mostrar explícitamente los errores de obtención de cuota de proveedor en lugar de descartarlos.

### Dirección futura de UI

La UI de tablero a largo plazo debería exponer:

- Gasto
  Dólares por facturador, proveedor, modelo, agente, proyecto
- Uso
  Tokens por proveedor, modelo, agente, proyecto
- Cuotas
  Límites vivos de proveedor o facturador, créditos y ventanas de reinicio
- Eventos financieros
  Compras de créditos, recargas, cargos, reembolsos, compromisos, almacenamiento y otros cargos no de inferencia

## Plan de migración

Comportamiento de migración:

- agregar nuevas columnas no destructivas con valores predeterminados
- rellenar filas existentes:
  - `biller = provider`
  - `billing_type = 'unknown'`
  - `cached_input_tokens = 0`
  - `heartbeat_run_id = null`

**No** intentar rellenar la atribución histórica de suscripción a nivel de proveedor desde `heartbeat_runs`.
Esos datos nunca se almacenaron con las dimensiones requeridas.

## Plan de pruebas

Agregar o actualizar pruebas para:

1. las filas del libro creadas por latido persisten `heartbeatRunId`, `biller`, `billingType` y tokens en caché
2. los valores heredados de facturación del adaptador se mapean correctamente
3. los informes de proveedor usan solo datos del libro
4. las empresas con múltiples proveedores no atribuyen uso de suscripción cruzado
5. el uso de suscripción de cero dólares aún aparece en informes de tokens
6. las fallas de obtención de cuota renderizan estado explícito de UI
7. los eventos de costo manuales aún se validan y escriben correctamente
8. los informes de facturador mantienen separados los desgloses de proveedor upstream
9. las filas estilo OpenRouter pueden mostrar `biller=openrouter` con proveedores upstream no OpenRouter
10. las filas estilo Cloudflare pueden mostrar `biller=cloudflare` con identidad de proveedor upstream preservada
11. la futura agregación de `finance_events` maneja cargos no de solicitud sin requerir un modelo o id de ejecución

## Plan de entrega

### Paso 1

- aterrizar el contrato del libro y la reescritura de consultas
- hacer correcta la página actual de costos

### Paso 2

- agregar endpoints de informes orientados a facturador y UI

### Paso 3

- conectar OpenRouter y cualquier adaptador agregador futuro al mismo contrato

### Paso 4

- agregar `executionAdapterType` al informe de costos persistido si la agrupación a nivel de adaptador se convierte en un requisito de producto

### Paso 5

- introducir `finance_events`
- agregar endpoints de contabilidad no de inferencia
- agregar UI para cargos de plataforma/cuenta junto al gasto y uso de inferencia

## No objetivos de este cambio

- soporte multimoneda
- conciliación de facturas
- estimación de costos específica de proveedor más allá del costo facturado persistido
- reemplazar `heartbeat_runs` como el registro operativo de ejecución
