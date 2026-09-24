# Guía de runtime de agentes

Estado: Guía orientada al usuario
Última actualización: 2026-02-17
Audiencia: Operadores que configuran y ejecutan agentes en Paperclip

## 1. Qué hace este sistema

Los agentes en Paperclip no corren continuamente.
Se ejecutan en **latidos**: ventanas cortas de ejecución activadas por un despertar.

Cada latido:

1. Inicia el adaptador de agente configurado (por ejemplo, el CLI de Claude o el CLI de Codex)
2. Le entrega el prompt/contexto actual
3. Lo deja trabajar hasta que sale, expira el timeout o se cancela
4. Almacena los resultados (estado, uso de tokens, errores, logs)
5. Actualiza la UI en vivo

## 2. Cuándo se despierta un agente

Un agente puede despertarse de cuatro formas:

- `timer`: intervalo programado (por ejemplo cada 5 minutos)
- `assignment`: cuando se le asigna/asigna trabajo a ese agente
- `on_demand`: despertar manual (botón/API)
- `automation`: despertar activado por el sistema para futuras automatizaciones

Si un agente ya está en ejecución, los nuevos despertares se combinan (se coalescan) en lugar de lanzar ejecuciones duplicadas.

## 3. Qué configurar por agente

## 3.1 Elección del adaptador

Opciones comunes:

- `claude_local`: ejecuta tu CLI `claude` local
- `codex_local`: ejecuta tu CLI `codex` local
- `process`: adaptador genérico de comando shell
- `http`: llama a un endpoint HTTP externo

Para `claude_local` y `codex_local`, Paperclip asume que el CLI ya está instalado y autenticado en la máquina anfitriona.

## 3.2 Comportamiento de runtime

En los ajustes de runtime del agente, configura la política de latido:

- `enabled`: permitir latidos programados
- `intervalSec`: intervalo del temporizador (0 = deshabilitado)
- `wakeOnAssignment`: despertar cuando se le asigne trabajo
- `wakeOnOnDemand`: permitir despertares bajo demanda estilo ping
- `wakeOnAutomation`: permitir despertares de automatización del sistema

## 3.3 Directorio de trabajo y límites de ejecución

Para adaptadores locales, establece:

- `cwd` (directorio de trabajo)
- `timeoutSec` (runtime máximo por latido)
- `graceSec` (tiempo antes de forzar la terminación después de timeout/cancelación)
- variables de entorno opcionales y args extra del CLI

## 3.4 Plantillas de prompt

Puedes establecer:

- `promptTemplate`: usado para cada ejecución (primera ejecución y sesiones reanudadas)

Las plantillas admiten variables como `{{agent.id}}`, `{{agent.name}}` y valores de contexto de la ejecución.

## 4. Comportamiento de reanudación de sesión

Paperclip almacena el estado de sesión resumible por `(agent, taskKey, adapterType)`.
`taskKey` se deriva del contexto de despertar (`taskKey`, `taskId` o `issueId`).

- Un latido para la misma clave de tarea reutiliza la sesión anterior de esa tarea.
- Diferentes claves de tarea para el mismo agente mantienen estado de sesión separado.
- Si la restauración falla, los adaptadores deben reintentar una vez con una sesión fresca y continuar.
- Puedes restablecer todas las sesiones de un agente o restablecer una sesión de tarea por clave de tarea.

Usa el restablecimiento de sesión cuando:

- cambiaste significativamente la estrategia de prompt
- el agente está atascado en un bucle malo
- quieres un reinicio limpio

## 5. Logs, estado e historial de ejecuciones

Para cada ejecución de latido obtienes:

- estado de la ejecución (`queued`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`)
- texto de error y extractos de stderr/stdout
- uso de tokens/costo cuando el adaptador lo provee
- logs completos (almacenados fuera de las filas principales de ejecución, optimizados para salida grande)

En configuraciones locales/dev, los logs completos se almacenan en disco bajo la ruta de logs de ejecución configurada.

## 6. Actualizaciones en vivo en la UI

Paperclip envía actualizaciones de runtime/actividad al navegador en tiempo real.

Deberías ver cambios en vivo para:

- estado del agente
- estado de la ejecución del latido
- actualizaciones de tareas/actividad causadas por el trabajo del agente
- paneles de panel/costo/actividad según corresponda

Si la conexión se cae, la UI se reconecta automáticamente.

## 7. Patrones operativos comunes

## 7.1 Bucle autónomo simple

1. Habilita despertares por temporizador (por ejemplo cada 300s)
2. Mantén los despertares por asignación encendidos
3. Usa una plantilla de prompt enfocada
4. Observa los logs de ejecución y ajusta el prompt/config con el tiempo

## 7.2 Bucle dirigido por eventos (menos polling constante)

1. Deshabilita el temporizador o establece un intervalo largo
2. Mantén habilitado el despertar al asignar
3. Usa despertares bajo demanda para empujes manuales

## 7.3 Bucle con seguridad primero

1. Timeout corto
2. Prompt conservador
3. Monitorea errores + cancela rápido cuando sea necesario
4. Restablece sesiones cuando aparezca deriva

## 8. Solución de problemas

Si las ejecuciones fallan repetidamente:

1. Comprueba la disponibilidad del comando del adaptador (`claude`/`codex` instalado e iniciado sesión).
2. Verifica que `cwd` exista y sea accesible.
3. Inspecciona el error de la ejecución + el extracto de stderr, luego el log completo.
4. Confirma que el timeout no sea demasiado bajo.
5. Restablece la sesión y reintenta.
6. Pausa el agente si está causando actualizaciones malas repetidas.

Causas típicas de fallo:

- CLI no instalado/autenticado
- directorio de trabajo incorrecto
- args/env del adaptador malformados
- prompt demasiado amplio o sin restricciones
- timeout del proceso

## 9. Notas de seguridad y riesgo

Los adaptadores CLI locales corren sin sandbox en la máquina anfitriona.

Eso significa:

- las instrucciones del prompt importan
- las credenciales/variables de entorno configuradas son sensibles
- los permisos del directorio de trabajo importan

Empieza con el menor privilegio posible donde sea factible, y evita exponer secretos en prompts amplios reutilizables salvo que sea intencionalmente requerido.

## 10. Lista de verificación de configuración mínima

1. Elige el adaptador (`claude_local` o `codex_local`).
2. Establece `cwd` al workspace objetivo.
3. Agrega las plantillas de prompt de arranque + normal.
4. Configura la política de latido (despertares por temporizador y/o asignación).
5. Activa un despertar manual.
6. Confirma que la ejecución tiene éxito y que se registra el uso de sesión/tokens.
7. Observa las actualizaciones en vivo e itera el prompt/config.
