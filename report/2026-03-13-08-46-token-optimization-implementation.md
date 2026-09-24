# Informe de implementación de optimización de tokens

Se implementó el plan de optimización de tokens en la orquestación de latidos, las APIs de contexto de issues, la construcción de prompts de adaptadores, la exposición de habilidades y la UX de configuración de agentes.

Los principales cambios de comportamiento son:

- La telemetría de latidos ahora normaliza el uso de adaptadores locales con sesión como deltas por ejecución en vez de confiar ciegamente en los totales acumulados de la sesión.
- Los despertares por temporizador y manuales ahora conservan las sesiones de tarea por defecto; las sesiones nuevas solo se fuerzan para despertares explícitos `forceFreshSession` o despertares de asignación de issue nuevo.
- La rotación de sesiones de latido ahora está dirigida por políticas en el plano de control, con una nota de traspaso inyectada cuando una sesión se compacta y reinicia.
- El contexto de issues de Paperclip ahora tiene APIs incrementales: `GET /api/agents/me/inbox-lite`, `GET /api/issues/:id/heartbeat-context` y consultas de deltas de comentarios mediante `GET /api/issues/:id/comments?after=...&order=asc`.
- La habilidad `paperclip` ahora enseña a los agentes a usar primero esas APIs compactas/incrementales, manteniendo las recuperaciones de hilo completo como alternativa de arranque en frío.
- Todos los adaptadores locales ahora separan los prompts de arranque de la primera sesión de las plantillas de prompt por latido, y emiten métricas de tamaño de prompt en los metadatos de invocación.
- Los flujos de creación de adaptadores ahora persisten `bootstrapPromptTemplate` correctamente.
- La UI de configuración del agente ahora explica la diferencia entre prompts de arranque y prompts de latido, y advierte sobre la rotación de prompts.
- Los valores por defecto de habilidades en tiempo de ejecución ahora incluyen `paperclip`, `para-memory-files` y `paperclip-create-agent`. `create-agent-adapter` se movió a `.agents/skills/create-agent-adapter`.

Hallazgo importante de seguimiento de la revisión de ejecuciones reales:

- `codex_local` actualmente inyecta habilidades de Paperclip en el directorio compartido de habilidades de Codex (`$CODEX_HOME/skills` o `~/.codex/skills`) en vez de montar un directorio de habilidades local al worktree.
- Si un symlink de habilidad propiedad de Paperclip ya apunta a otro checkout activo, el adaptador actualmente lo omite en vez de redirigirlo.
- En la práctica, esto significa que un worktree puede contener guía más nueva de `skills/paperclip/SKILL.md` mientras Codex sigue el contenido de habilidad de un checkout anterior.
- Esto probablemente explica por qué PAP-507 seguía mostrando comportamiento de recarga completa de issue/comentarios aunque el trabajo de contexto incremental ya estaba implementado en esta rama.
- Esto debe tratarse como un elemento de seguimiento separado para el aislamiento de habilidades de `codex_local` o la reparación de symlinks.

Archivos con el trabajo de implementación más importante:

- `server/src/services/heartbeat.ts`
- `server/src/services/issues.ts`
- `server/src/routes/issues.ts`
- `server/src/routes/agents.ts`
- `server/src/routes/access.ts`
- `skills/paperclip/SKILL.md`
- `packages/adapters/*/src/server/execute.ts`
- `packages/adapters/*/src/ui/build-config.ts`
- `ui/src/components/AgentConfigForm.tsx`

Verificación completada con éxito:

- `pnpm -r typecheck`
- `pnpm test:run`
- `pnpm build`

Durante la verificación, también corregí dos desajustes de tipos existentes de embedded-postgres para que `typecheck` y `build` pasen de nuevo en todo el repo:

- `packages/db/src/migration-runtime.ts`
- `cli/src/commands/worktree.ts`

El siguiente seguimiento útil es medir el efecto antes/después en ejecuciones reales, ahora que la telemetría es menos engañosa y el comportamiento de reutilización de prompt/sesión es consistente entre adaptadores.
