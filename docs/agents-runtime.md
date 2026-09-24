# Guía de tiempo de ejecución de agentes

Estado: guía para usuarios
Última actualización: 2026-03-26
Audiencia: operadores que configuran y ejecutan agentes en Paperclip

## 1. Qué hace este sistema

Los agentes en Paperclip no se ejecutan de forma continua.  
Se ejecutan en **latidos**: ventanas cortas de ejecución activadas por un despertar.

Cada latido:

1. Inicia el adaptador de agente configurado (por ejemplo, Claude CLI o Codex CLI)
2. Le entrega el prompt/contexto actual
3. Lo deja trabajar hasta que sale, agota el tiempo o se cancela
4. Almacena los resultados (estado, uso de tokens, errores, registros)
5. Actualiza la interfaz en vivo

## 2. Cuándo se despierta un agente

Un agente puede despertarse de cuatro formas:

- `timer`: intervalo programado (por ejemplo cada 5 minutos)
- `assignment`: cuando se asigna/hace checkout de trabajo a ese agente
- `on_demand`: despertar manual (botón/API)
- `automation`: despertar activado por el sistema para automatizaciones futuras

Si un agente ya se está ejecutando, los nuevos despertares se fusionan (se consolidan) en lugar de lanzar ejecuciones duplicadas.

## 3. Qué configurar por agente

## 3.1 Elección del adaptador

Adaptadores integrados:

- `claude_local`: ejecuta tu CLI local de `claude`
- `codex_local`: ejecuta tu CLI local de `codex`
- `opencode_local`: ejecuta tu CLI local de `opencode`
- `hermes_local`: ejecuta tu CLI local de `hermes`
- `cursor`: ejecuta Cursor en modo en segundo plano
- `pi_local`: ejecuta un agente Pi incorporado localmente
- `openclaw_gateway`: se conecta a un endpoint de gateway de OpenClaw
- `process`: adaptador genérico de comando de shell
- `http`: llama a un endpoint HTTP externo

Para los adaptadores de CLI locales (`claude_local`, `codex_local`, `opencode_local`, `hermes_local`), Paperclip asume que la CLI ya está instalada y autenticada en la máquina anfitriona.

## 3.2 Comportamiento en tiempo de ejecución

En los ajustes de tiempo de ejecución del agente, configura la política de latidos:

- `enabled`: permitir latidos programados
- `intervalSec`: intervalo del temporizador (0 = deshabilitado)
- `wakeOnAssignment`: despertar cuando se asigna trabajo
- `wakeOnOnDemand`: permitir despertares bajo demanda estilo ping
- `wakeOnAutomation`: permitir despertares de automatización del sistema

## 3.3 Directorio de trabajo y límites de ejecución

Para los adaptadores locales, establece:

- `cwd` (directorio de trabajo)
- `timeoutSec` (tiempo máximo de ejecución por latido)
- `graceSec` (tiempo antes del cierre forzoso tras el agotamiento del tiempo/cancelación)
- variables de entorno opcionales y argumentos CLI adicionales
- usa el **entorno de prueba** en la configuración del agente para ejecutar diagnósticos específicos del adaptador antes de guardar

## 3.4 Plantillas de prompt

Puedes establecer:

- `promptTemplate`: se usa en cada ejecución (primera ejecución y sesiones reanudadas)

Las plantillas admiten variables como `{{agent.id}}`, `{{agent.name}}` y valores del contexto de ejecución.

> **Nota:** `bootstrapPromptTemplate` está obsoleta y no debe usarse para agentes nuevos. Las configuraciones existentes que la usen seguirán funcionando, pero deberían migrarse al sistema de paquete de instrucciones gestionado.

## 4. Comportamiento de reanudación de sesión

Paperclip almacena los IDs de sesión para adaptadores reanudables.

- El siguiente latido reutiliza automáticamente la sesión guardada.
- Esto da continuidad entre latidos.
- Puedes restablecer una sesión si el contexto se vuelve obsoleto o confuso.

Usa el restablecimiento de sesión cuando:

- cambiaste significativamente la estrategia de prompts
- el agente está atrapado en un mal bucle
- quieres un reinicio limpio

## 5. Registros, estado e historial de ejecuciones

Por cada ejecución de latido obtienes:

- el estado de la ejecución (`queued`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`)
- texto de error y extractos de stderr/stdout
- uso de tokens/costo cuando el adaptador lo proporciona
- registros completos (almacenados fuera de las filas principales de ejecución, optimizados para salida grande)

En configuraciones locales/de desarrollo, los registros completos se almacenan en disco bajo la ruta de registros de ejecución configurada.

## 6. Actualizaciones en vivo en la interfaz

Paperclip envía actualizaciones de tiempo de ejecución/actividad al navegador en tiempo real.

Deberías ver cambios en vivo para:

- el estado del agente
- el estado de la ejecución del latido
- las actualizaciones de tareas/actividad causadas por el trabajo del agente
- los paneles relevantes (panel, costo, actividad) según corresponda

Si se pierde la conexión, la interfaz se reconecta automáticamente.

## 7. Patrones operativos comunes

## 7.1 Bucle autónomo simple

1. Habilita los despertares por temporizador (por ejemplo cada 300s)
2. Mantén activados los despertares por asignación
3. Usa una plantilla de prompt enfocada
4. Observa los registros de ejecución y ajusta el prompt/configuración con el tiempo

## 7.2 Bucle basado en eventos (menos sondeo constante)

1. Deshabilita el temporizador o establece un intervalo largo
2. Mantén activado el despertar por asignación
3. Usa despertares bajo demanda para empujones manuales

## 7.3 Bucle con seguridad prioritaria

1. Tiempo de agotamiento corto
2. Prompt conservador
3. Supervisa errores y cancela rápido cuando sea necesario
4. Restablece sesiones cuando aparezca desviación

## 8. Solución de problemas

Si las ejecuciones fallan repetidamente:

1. Verifica la disponibilidad del comando del adaptador (p. ej., `claude`/`codex`/`opencode`/`hermes` instalado e iniciado sesión).
2. Verifica que `cwd` exista y sea accesible.
3. Inspecciona el error de la ejecución + el extracto de stderr, luego el registro completo.
4. Confirma que el tiempo de agotamiento no sea demasiado bajo.
5. Restablece la sesión y reintenta.
6. Pausa el agente si está causando actualizaciones defectuosas repetidas.

Causas típicas de fallos:

- CLI no instalada/autenticada
- directorio de trabajo incorrecto
- argumentos/env del adaptador mal formados
- prompt demasiado amplio o sin restricciones
- tiempo de agotamiento del proceso

Nota específica de Claude:

- Si `ANTHROPIC_API_KEY` está establecida en el env del adaptador o en el entorno del anfitrión, Claude usa autenticación por clave API en lugar del inicio de sesión por suscripción. Paperclip lo muestra como una advertencia en las pruebas de entorno, no como un error duro.

## 9. Notas de seguridad y riesgos

Los adaptadores de CLI locales se ejecutan sin aislamiento (unsandboxed) en la máquina anfitriona.

Eso significa:

- las instrucciones del prompt importan
- las credenciales/variables de entorno configuradas son sensibles
- los permisos del directorio de trabajo importan

Empieza con el mínimo privilegio donde sea posible y evita exponer secretos en prompts amplios reutilizables a menos que sea intencionalmente necesario.

## 10. Lista de verificación mínima de configuración

1. Elige el adaptador (p. ej., `claude_local`, `codex_local`, `opencode_local`, `hermes_local`, `cursor` u `openclaw_gateway`).
2. Establece `cwd` en el espacio de trabajo objetivo (para adaptadores locales).
3. Agrega opcionalmente una plantilla de prompt (`promptTemplate`) o usa el paquete de instrucciones gestionado.
4. Configura la política de latidos (despertares por temporizador y/o asignación).
5. Activa un despertar manual.
6. Confirma que la ejecución tenga éxito y que el uso de sesión/tokens quede registrado.
7. Observa las actualizaciones en vivo e itera el prompt/configuración.
