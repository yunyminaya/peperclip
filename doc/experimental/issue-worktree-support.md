# Soporte de worktrees de issues

Estado: experimental, solo runtime, aún no se lanza como función de cara al usuario.

Esta rama contiene el trabajo de runtime y seeding necesario para worktrees con alcance de issue:

- soporte de política de workspace de ejecución de proyecto
- ajustes de workspace de ejecución a nivel de issue
- realización de worktrees de git para ejecución aislada de issues
- aprovisionamiento opcional de worktrees basado en comandos
- correcciones de worktrees sembrados para compatibilidad de clave de secretos
- rebinding de workspace de proyecto sembrado al worktree de git actual

Intencionalmente aún no lanzamos la UI para esto. El código de runtime permanece en su lugar, pero los entrypoints principales de UI están desactivados con gates duros por ahora.

## Qué funciona hoy

- los proyectos pueden llevar política de workspace de ejecución en el backend
- los issues pueden llevar ajustes de workspace de ejecución en el backend
- la ejecución de latidos puede realizar worktrees de git aislados
- el runtime puede ejecutar un comando de aprovisionamiento definido por el proyecto dentro del worktree derivado
- las instancias de worktree sembradas pueden mantener funcionando los secretos cifrados locales
- las instancias de worktree sembradas pueden rebindar rutas de workspace de proyecto del mismo repo al worktree de git actual

## Entrypoints de UI ocultos

Estas son las superficies actuales de UI de cara al usuario para la función, ahora intencionalmente deshabilitadas:

- ajustes de proyecto:
  - `ui/src/components/ProjectProperties.tsx`
  - controles de política de workspace de ejecución
  - ref base / plantilla de rama / directorio padre de worktree de git
  - entradas de comandos de aprovisionamiento / desmontaje

- creación de issue:
  - `ui/src/components/NewIssueDialog.tsx`
  - toggle de checkout aislado de issue
  - valores por defecto de ajustes de workspace de ejecución de issue desde la política del proyecto

- edición de issue:
  - `ui/src/components/IssueProperties.tsx`
  - toggle de modo de workspace a nivel de issue
  - valores por defecto de ajustes de workspace de ejecución de issue cuando cambia el proyecto

- ajustes de agente/runtime:
  - `ui/src/adapters/runtime-json-fields.tsx`
  - campo JSON de servicios de runtime, que es parte de la superficie más amplia de soporte workspace-runtime

## Por qué la UI está oculta

- el comportamiento de runtime aún se está validando
- el flujo de trabajo y la ergonomía del operador no son finales
- no queremos exponer una función parcialmente cocinada de cara al usuario en issues, proyectos o ajustes

## Plan de reactivación

Cuando esto esté listo para lanzar:

- reactiva las secciones de UI con gate en los archivos de arriba
- revisa redacción y valores por defecto para controles de proyecto e issue
- decide qué ajustes de agente/runtime deben permanecer solo avanzados
- agrega verificación de nivel de producto end-to-end para el flujo completo de UI
