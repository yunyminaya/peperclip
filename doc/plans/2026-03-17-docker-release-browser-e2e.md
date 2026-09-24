# Plan de E2E de navegador en Docker para versiones

## Contexto

Hoy las pruebas de humo de versión para paquetes publicados de Paperclip son manuales y basadas en shell:

```sh
HOST_PORT=3232 DATA_DIR=./data/release-smoke-canary PAPERCLIPAI_VERSION=canary ./scripts/docker-onboard-smoke.sh
HOST_PORT=3233 DATA_DIR=./data/release-smoke-stable PAPERCLIPAI_VERSION=latest ./scripts/docker-onboard-smoke.sh
```

Eso es útil porque ejercita la misma superficie pública de instalación que los usuarios usan:

- Docker
- `npx paperclipai@canary`
- `npx paperclipai@latest`
- flujo de bootstrap autenticado

Pero aún deja las preguntas más importantes de la versión a un humano con un navegador:

- ¿puedo iniciar sesión con las credenciales de prueba?
- ¿aterrizo en la incorporación?
- ¿puedo completar la incorporación?
- ¿el agente CEO inicial realmente se crea y ejecuta?

El repositorio ya tiene dos piezas adyacentes:

- `tests/e2e/onboarding.spec.ts` cubre el asistente de incorporación contra el árbol de fuentes local
- `scripts/docker-onboard-smoke.sh` arranca una instalación publicada de Docker y auto-bootstrap el modo autenticado, pero solo verifica la capa de API/sesión

Lo que falta es una prueba de navegador determinista que una esas dos rutas.

## Objetivo

Agregar un E2E de navegador respaldado por Docker de nivel de versión que valide las instalaciones publicadas de `canary` y `latest` de extremo a extremo:

1. arrancar el paquete publicado en Docker
2. iniciar sesión con credenciales de prueba conocidas
3. verificar que el usuario es dirigido a la incorporación
4. completar la incorporación en el navegador
5. verificar que existe el primer agente CEO
6. verificar que la ejecución inicial del CEO se activó y alcanzó un estado terminal o activo

Luego conectar esa prueba en GitHub Actions para que la validación de versiones ya no sea solo manual.

## Recomendación en una oración

Convertir el actual script de humo de Docker en un arnés de pruebas apto para máquinas, agregar un spec dedicado de Playwright de prueba de humo de versión que impulse el flujo de navegador autenticado contra instalaciones publicadas de Docker, y ejecutarlo en GitHub Actions tanto para `canary` como para `latest`.

## Lo que tenemos hoy

### Cobertura existente de navegador local

`tests/e2e/onboarding.spec.ts` ya demuestra que el asistente de incorporación puede:

- crear una empresa
- crear un agente CEO
- crear un issue inicial
- opcionalmente observar el progreso de la tarea

Esa es una buena base, pero no valida el paquete público de npm, la ruta de Docker, el flujo de inicio de sesión autenticado ni los dist-tags de versión.

### Cobertura existente de humo de Docker

`scripts/docker-onboard-smoke.sh` ya hace trabajo útil de configuración:

- construye `Dockerfile.onboard-smoke`
- ejecuta `paperclipai@${PAPERCLIPAI_VERSION}` dentro de Docker
- espera la salud
- registra o inicia sesión de un usuario administrador de prueba
- genera y acepta la invitación bootstrap del CEO en modo autenticado
- verifica una sesión de tablero y `/api/companies`

Eso significa que el difícil problema de bootstrap ya está mayormente resuelto. La brecha principal es que el script está orientado a humanos y nunca entrega el control a una prueba de navegador.

### Forma actual de CI

El repositorio ya tiene:

- `.github/workflows/e2e.yml` para ejecuciones manuales de Playwright contra la fuente local
- `.github/workflows/release.yml` para publicación canary en `master` y promoción manual estable

Así que el movimiento correcto es extender el sistema actual de pruebas/versiones, no crear uno paralelo.

## Decisión de producto

### 1. La prueba de humo de versión debería seguir siendo determinista y sin tokens

La primera versión no debería requerir credenciales de agentes externos de OpenAI, Anthropic ni de agentes externos.

Usar el flujo de incorporación con un adaptador determinista que pueda ejecutarse en un runner estándar de GitHub y dentro de la instalación publicada de Docker. El adaptador `process` existente con un comando trivial es la ruta base correcta para esta puerta de versión.

Eso mantiene esta prueba enfocada en:

- empaquetado de versión
- autenticación/bootstrap
- enrutamiento de UI
- contrato de incorporación
- creación de agente
- plomería de invocación de latido

Luego podemos agregar un segundo carril de humo con credenciales para agentes reales respaldados por modelos.

### 2. Las credenciales de prueba se convierten en un contrato explícito de pruebas

Los valores predeterminados actuales en `scripts/docker-onboard-smoke.sh` deberían tratarse como fixtures estables de prueba:

- correo: `smoke-admin@paperclip.local`
- contraseña: `paperclip-smoke-password`

La prueba de navegador debería iniciar sesión con esos valores exactos a menos que variables de entorno los sobrescriban.

### 3. La prueba de humo de paquete publicado y el E2E del árbol de fuentes siguen separados

Mantener dos carriles:

- E2E del árbol de fuentes para desarrollo de funciones
- prueba de humo de versión Docker publicada para confianza de versión

Se traslapan en aserciones de incorporación, pero protegen diferentes clases de falla.

## Diseño propuesto

## 1. Agregar un arnés de humo de Docker apto para CI

Refactorizar `scripts/docker-onboard-smoke.sh` para que pueda ejecutarse en dos modos:

- modo interactivo
  - comportamiento actual
  - transmite registros y espera en primer plano para inspección manual
- modo CI
  - inicia el contenedor
  - espera salud y bootstrap autenticado
  - imprime metadatos legibles por máquina
  - sale dejando el contenedor en ejecución para Playwright

Forma recomendada:

- mantener `scripts/docker-onboard-smoke.sh` como punto de entrada público
- agregar un modo `SMOKE_DETACH=true` o `--detach`
- emitir un blob JSON o archivo `.env` que contenga:
  - `SMOKE_BASE_URL`
  - `SMOKE_ADMIN_EMAIL`
  - `SMOKE_ADMIN_PASSWORD`
  - `SMOKE_CONTAINER_NAME`
  - `SMOKE_DATA_DIR`

El flujo de trabajo y las pruebas de Playwright pueden entonces consumir los metadatos emitidos en lugar de analizar registros.

### Por qué esto importa

El script actual siempre sigue los registros y luego se bloquea en `wait "$LOG_PID"`. Eso es conveniente para pruebas de humo manuales, pero es la forma incorrecta para orquestación de CI.

## 2. Agregar un spec dedicado de Playwright de prueba de humo de versión

Crear un segundo punto de entrada de Playwright específicamente para instalaciones publicadas de Docker, por ejemplo:

- `tests/release-smoke/playwright.config.ts`
- `tests/release-smoke/docker-auth-onboarding.spec.ts`

Esta suite no debería usar `webServer` de Playwright, porque el servidor de la app ya estará en ejecución dentro de Docker.

### Escenario de navegador

El primer escenario de prueba de humo de versión debería validar:

1. abrir `/`
2. el usuario no autenticado es redirigido a `/auth`
3. iniciar sesión usando las credenciales de prueba
4. el usuario autenticado aterriza en la incorporación cuando no existen empresas
5. el asistente de incorporación aparece con las etiquetas de paso esperadas
6. crear una empresa
7. crear el primer agente usando `process`
8. crear el issue inicial
9. terminar la incorporación y abrir el issue creado
10. verificar vía API:
    - la empresa existe
    - el agente CEO existe
    - el issue existe y está asignado al CEO
11. verificar que la primera ejecución de latido se activó:
    - ya sea verificando que el estado del issue cambió desde el estado inicial, o
    - verificando que la API de agente/ejecuciones muestra una ejecución para el CEO, o
    - ambos

La prueba debería tolerar que la ejecución se complete rápidamente. Por esta razón, la aserción debería aceptar:

- `queued`
- `running`
- `succeeded`

y de forma similar para la progresión del issue si el estado del issue cambia antes de que se ejecute la aserción.

### Por qué un spec separado en lugar de reutilizar `tests/e2e/onboarding.spec.ts`

La prueba de fuente local y la prueba de humo de versión tienen diferentes supuestos:

- diferente ciclo de vida del servidor
- diferente ruta de autenticación
- diferente modo de despliegue
- paquete npm publicado en lugar de código local del espacio de trabajo

Intentar forzar ambas a través de un spec las empeorará a ambas.

## 3. Agregar un flujo de trabajo de prueba de humo de versión en GitHub Actions

Agregar un flujo de trabajo dedicado a esta superficie, idealmente reutilizable:

- `.github/workflows/release-smoke.yml`

Activadores recomendados:

- `workflow_dispatch`
- `workflow_call`

Entradas recomendadas:

- `paperclip_version`
  - `canary` o `latest`
- `host_port`
  - opcional, puerto seguro para el runner por defecto
- `artifact_name`
  - opcional para subidas más claras

### Esquema del job

1. checkout del repositorio
2. instalar Node/pnpm
3. instalar dependencias de navegador de Playwright
4. lanzar el arnés de humo de Docker en modo separado con el dist-tag elegido
5. ejecutar la suite de Playwright de prueba de humo de versión contra la URL base devuelta
6. siempre recolectar diagnósticos:
   - reporte de Playwright
   - capturas de pantalla
   - traza
   - `docker logs`
   - archivo de metadatos del arnés
7. detener y eliminar el contenedor

### Por qué un flujo de trabajo reutilizable

Esto nos permite:

- ejecutar la prueba de humo manualmente bajo demanda
- llamarlo desde `release.yml`
- reutilizar el mismo job tanto para `canary` como para `latest`

## 4. Integrarlo en la automatización de versiones incrementalmente

### Fase A: Solo flujo de trabajo manual

Primero entregar el flujo de trabajo solo como manual para que el arnés y la prueba puedan estabilizarse sin bloquear versiones.

### Fase B: Ejecutar automáticamente tras la publicación canary

Después de que `publish_canary` tenga éxito en `.github/workflows/release.yml`, llamar al flujo de trabajo reutilizable de prueba de humo de versión con:

- `paperclip_version=canary`

Esto demuestra que la canary pública recién publicada realmente arranca y se incorpora.

### Fase C: Ejecutar automáticamente tras la publicación estable

Después de que `publish_stable` tenga éxito, llamar al mismo flujo de trabajo con:

- `paperclip_version=latest`

Esto nos da confirmación posterior a la publicación de que el dist-tag estable está saludable.

### Matiz importante

Probar `latest` desde npm no puede ocurrir antes de la publicación estable, porque el paquete bajo prueba aún no existe bajo `latest`. Así que la prueba de humo de `latest` es una verificación posterior a la publicación, no una puerta previa a la publicación.

Si más adelante queremos una verdadera puerta previa a la publicación estable, eso debería ser un job separado de prueba de humo de paquete construido localmente o con referencia de fuente.

## 5. Hacer los diagnósticos de primera clase

Este flujo de trabajo solo es valioso si las fallas son rápidas de depurar.

Siempre capturar:

- reporte HTML de Playwright
- traza de Playwright en falla
- captura de pantalla final en falla
- salida completa de `docker logs`
- metadatos de prueba emitidos
- instantánea opcional de `curl /api/health`

Sin eso, la prueba se convertirá en una caja negra inestable y la gente dejará de confiar en ella.

## Plan de implementación

## Fase 1: Refactorización del arnés

Archivos:

- `scripts/docker-onboard-smoke.sh`
- opcionalmente `scripts/lib/docker-onboard-smoke.sh` o ayudante similar
- `doc/DOCKER.md`
- `doc/RELEASING.md`

Tareas:

1. Agregar modo separado/CI al script de humo de Docker.
2. Hacer que el script emita metadatos de conexión legibles por máquina.
3. Mantener intacto el modo manual interactivo actual.
4. Agregar comandos de limpieza confiables para CI.

Aceptación:

- una invocación del script puede iniciar la app Docker publicada, auto-bootstrap, y devolver el control al llamador con suficientes metadatos para automatización de navegador

## Fase 2: Suite de navegador de prueba de humo de versión

Archivos:

- `tests/release-smoke/playwright.config.ts`
- `tests/release-smoke/docker-auth-onboarding.spec.ts`
- `package.json` raíz

Tareas:

1. Agregar una configuración dedicada de Playwright para pruebas de servidor externo.
2. Implementar flujo de inicio de sesión + incorporación + creación de CEO.
3. Afirmar que se creó o completó una ejecución de CEO.
4. Agregar un script raíz como:
   - `test:release-smoke`

Aceptación:

- la suite pasa localmente contra ambos:
  - `PAPERCLIPAI_VERSION=canary`
  - `PAPERCLIPAI_VERSION=latest`

## Fase 3: Flujo de trabajo de GitHub Actions

Archivos:

- `.github/workflows/release-smoke.yml`

Tareas:

1. Agregar puntos de entrada de flujo de trabajo manuales y reutilizables.
2. Instalar Chromium y dependencias del runner.
3. Iniciar la prueba de humo de Docker en modo separado.
4. Ejecutar la suite de Playwright de prueba de humo de versión.
5. Subir artefactos de diagnóstico.

Aceptación:

- un mantenedor puede ejecutar el flujo de trabajo manualmente para `canary` o `latest`

## Fase 4: Integración del flujo de trabajo de versión

Archivos:

- `.github/workflows/release.yml`
- `doc/RELEASING.md`

Tareas:

1. Activar la prueba de humo de versión automáticamente tras la publicación canary.
2. Activar la prueba de humo de versión automáticamente tras la publicación estable.
3. Documentar el comportamiento esperado y el manejo de fallas.

Aceptación:

- las versiones canary producen automáticamente un resultado de prueba de humo de navegador del paquete publicado
- las versiones estables producen automáticamente un resultado de prueba de humo de navegador de `latest`

## Fase 5: Extensión futura para validación de agentes reales respaldados por modelos

No forma parte de la primera implementación, pero esta debería ser la siguiente capa después de que el carril determinista esté estable.

Posibles adiciones:

- un segundo proyecto de Playwright controlado por secretos del repositorio
- validación de adaptador real `claude_local` o `codex_local` en entornos con capacidad Docker
- aserción de que el CEO publica un artefacto real de tarea/comentario
- retención de versión estable hasta que pase el carril con credenciales

Esto debería seguir siendo opcional hasta que el carril sin tokens sea confiable.

## Criterios de aceptación

El plan está completo cuando el sistema implementado puede demostrar todo lo siguiente:

1. Una instalación Docker publicada de `paperclipai@canary` puede probarse con humo por Playwright en CI.
2. Una instalación Docker publicada de `paperclipai@latest` puede probarse con humo por Playwright en CI.
3. La prueba inicia sesión en modo autenticado con las credenciales de prueba.
4. La prueba ve la incorporación para una instancia nueva.
5. La prueba completa la incorporación en el navegador.
6. La prueba verifica que se creó el agente CEO inicial.
7. La prueba verifica que se activó al menos una ejecución de latido del CEO.
8. Las fallas producen artefactos accionables en lugar de solo un job rojo.

## Riesgos y decisiones a tomar

### 1. Las ejecuciones rápidas de process pueden terminar antes de que la UI se actualice visiblemente

Eso es esperado. Las aserciones deberían preferir sondeo de API para existencia/estado de ejecución en lugar de solo indicadores visuales.

### 2. La prueba de humo de `latest` es posterior a la publicación, no preventiva

Esta es una limitación real de probar el dist-tag publicado mismo. Sigue siendo valiosa, pero no debería confundirse con una puerta previa a la publicación.

### 3. No deberíamos acoplar demasiado la prueba al texto cosmético de la incorporación

El contrato importante es el éxito del flujo, las entidades creadas y la creación de ejecución. Usar etiquetas visibles con moderación y preferir selectores semánticos estables donde sea posible.

### 4. Mantener aburrida la ruta del adaptador de prueba

Para seguridad de versión, la primera prueba debería usar el adaptador ejecutable más aburrido posible. Este no es el lugar para validar cada adaptador.

## Primer corte recomendado

Si queremos la ruta más rápida al valor, entregar en este orden:

1. agregar modo separado a `scripts/docker-onboard-smoke.sh`
2. agregar un spec de Playwright para inicio de sesión autenticado + incorporación + verificación de ejecución de CEO
3. agregar `release-smoke.yml` manual
4. una vez estable, conectar canary en `release.yml`
5. después, conectar la prueba de humo estable de `latest` en `release.yml`

Eso da confianza de versión rápidamente sin convertir la primera versión en un gran rediseño de CI.
