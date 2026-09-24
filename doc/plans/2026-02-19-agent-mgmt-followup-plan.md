# Plan de seguimiento de gestión de agentes (parche CEO + rollback de configuración + enlace issue↔aprobación)

Estado: Propuesto  
Fecha: 2026-02-19  
Contexto: Seguimiento de la ejecución `faeab00e-7857-4acc-b2b2-86f6d078adb4`

## 1. Hallazgos de la investigación

## 1.1 Por qué falló el PATCH del CEO

La causa raíz es lógica explícita de la ruta:

- `server/src/routes/agents.ts` actualmente bloquea que cualquier agente parchee a otro agente:
  - `if (req.actor.type === "agent" && req.actor.agentId !== id) { ... "Agent can only modify itself" }`

Así que aunque el CEO tiene permiso de contratación, la ruta aún aplica el viejo comportamiento de parcheo solo-propios.

## 1.2 Por qué la calidad de los comentarios se sintió mal

- `skills/paperclip/SKILL.md` y `skills/paperclip/references/api-reference.md` actualmente no requieren calidad de formato markdown para comentarios de estado (enlaces, estructura, actualizaciones legibles).
- Por lo tanto, los agentes producen comentarios de prosa plana con IDs sin formato, no entidades enlazadas.

## 1.3 Brecha de enlace issue↔aprobación

- No existe hoy una relación directa en DB entre issues y aprobaciones.
- Los payloads de aprobación pueden incluir IDs contextuales, pero esto no es enlace canónico.
- Las páginas de UI no pueden enlazar de forma confiable issue/aprobación sin IDs de copiar-pegar manuales.

## 1.4 Brecha de rollback de configuración

- Las actualizaciones de configuración de agente actualmente sobrescriben el estado sin una tabla dedicada de historial de revisiones.
- Hay registro de actividad, pero no un libro de versiones de configuración de primera clase ni un endpoint de rollback.

## 2. Cambios de producto/comportamiento

## 2.1 Permitir que el CEO parchee otros agentes de la misma empresa

Comportamiento objetivo:

- Tablero: derechos completos de parcheo.
- CEO: puede parchear agentes de la misma empresa.
- Otros agentes: solo-propios a menos que se otorgue explícitamente un permiso futuro.

Nota:

- Mantener estrictas las verificaciones de límite de empresa.
- Mantener los campos privilegiados gobernados por separado.

## 2.2 Agregar libro de revisiones de configuración de agente de primera clase + rollback

Cada mutación que afecte la configuración debe crear un registro de revisión con:

- instantánea antes
- instantánea después
- info del actor (usuario/agente)
- motivo/comentario opcional
- ID de ejecución origen (si está disponible)

El rollback debe ser una sola llamada de API que restaure una revisión previa de forma atómica.

## 2.3 Aplicar markdown y enlaces para comentarios de issues en las habilidades

La guía de habilidades debería requerir:

- estructura markdown corta (`Summary`, `Actions`, `Next`)
- enlaces a entidades creadas/actualizadas cuando sea relevante
- evitar IDs sin formato sin enlaces

## 2.4 Agregar enlace explícito issue↔aprobación (muchos-a-muchos)

Implementar modelo de unión canónico para que un issue pueda enlazar muchas aprobaciones y una aprobación pueda enlazar muchos issues.

## 3. Plan del modelo de datos

## 3.1 Nueva tabla: `agent_config_revisions`

Columnas:

- `id` uuid pk
- `company_id` uuid fk
- `agent_id` uuid fk
- `revision_number` int (monotónico por agente)
- `reason` text null
- `changed_by_agent_id` uuid null
- `changed_by_user_id` text null
- `run_id` uuid null
- `before_snapshot` jsonb not null
- `after_snapshot` jsonb not null
- marcas de tiempo

Índices:

- `(company_id, agent_id, revision_number desc)`
- `(agent_id, created_at desc)`

## 3.2 Nueva tabla: `issue_approvals`

Columnas:

- `id` uuid pk
- `company_id` uuid fk
- `issue_id` uuid fk
- `approval_id` uuid fk
- `relationship` text por defecto `context`
- `linked_by_agent_id` uuid null
- `linked_by_user_id` text null
- marcas de tiempo

Restricciones:

- único `(company_id, issue_id, approval_id)`

Índices:

- `(company_id, issue_id)`
- `(company_id, approval_id)`

## 4. Plan de API

## 4.1 Corrección de authz del PATCH de agente

Actualizar la matriz de authz de `PATCH /api/agents/:id`:

- tablero: permitir
- rol de agente `ceo` en la misma empresa: permitir
- de lo contrario: solo-propios

## 4.2 Separar campos de parcheo privilegiados

Proteger estos del PATCH genérico por no-tablero/no-ceo:

- `permissions`
- transiciones de `status` fuera del alcance permitido

(Continuar usando la ruta dedicada de permisos para ediciones de permisos.)

## 4.3 APIs de revisión de configuración

Agregar:

- `GET /api/agents/:id/config-revisions`
- `GET /api/agents/:id/config-revisions/:revisionId`
- `POST /api/agents/:id/config-revisions/:revisionId/rollback`

Comportamiento:

- el rollback escribe una nueva entrada de revisión (no muta el historial)
- la respuesta del rollback incluye la configuración activa resultante

## 4.4 APIs de enlace issue↔aprobación

Agregar:

- `GET /api/issues/:id/approvals`
- `POST /api/issues/:id/approvals` (enlazar una aprobación existente)
- `DELETE /api/issues/:id/approvals/:approvalId`
- `GET /api/approvals/:id/issues`

## 4.5 Auto-enlace al crear la aprobación

Extender los payloads de creación para incluir opcionalmente contexto de issue:

- `POST /api/companies/:companyId/approvals` soporta `issueId` o `issueIds`
- `POST /api/companies/:companyId/agent-hires` soporta `sourceIssueId` o `sourceIssueIds`

Comportamiento del servidor:

- crear la aprobación primero
- insertar filas de enlace en `issue_approvals`

## 5. Plan de UI

## 5.1 Página de agente

Agregar panel de historial de configuración en `AgentDetail`:

- lista de revisiones
- vista previa de diff
- botón de rollback con confirmación

## 5.2 Enlaces cruzados de página de aprobación y página de issue

- En el detalle de aprobación: mostrar issues enlazados con enlaces
- En el detalle de issue: mostrar aprobaciones enlazadas con enlaces
- acciones de enlazar/desenlazar en contexto del tablero

## 5.3 Mejores señales UX para comentarios

Sin aplicación dura del editor inicialmente; actualizar el texto de ayuda y las plantillas para fomentar actualizaciones markdown enlazadas.

## 6. Actualizaciones de habilidades

## 6.1 `skills/paperclip/SKILL.md`

Agregar estándar de comentarios:

- Usar secciones markdown
- Incluir enlaces para entidades relacionadas:
  - aprobación: `/approvals/{id}`
  - agente: `/agents/{id}`
  - issue: `/issues/{id}`

## 6.2 `skills/paperclip-create-agent/SKILL.md`

Requerir:

- incluir `sourceIssueId` cuando la contratación se crea desde un issue
- comentar de vuelta al issue con markdown + enlaces a la aprobación y al agente pendiente

## 7. Fases de implementación

## Fase A: Authz + endurecimiento de seguridad

- Corregir authz del parcheo del CEO en la ruta de agentes
- Restringir campos de parcheo genérico privilegiados
- Agregar pruebas para la matriz de authz

## Fase B: Libro de revisiones de configuración

- Agregar `agent_config_revisions`
- Escritura-al-cambio para todas las mutaciones de agente relevantes
- endpoints de rollback + pruebas

## Fase C: Enlace issue↔aprobación

- Agregar `issue_approvals`
- agregar APIs de enlace + comportamiento de auto-enlace
- actualizar enlaces cruzados de UI de aprobaciones/issues

## Fase D: Guía de habilidades

- actualizar habilidades para expectativas de markdown/enlaces y enlace de sourceIssue

## 8. Criterios de aceptación

- El CEO puede parchear al CTO (misma empresa) con éxito.
- Cada cambio de configuración crea una revisión recuperable.
- El rollback restaura la configuración previa en una acción y crea un nuevo registro de revisión.
- Las páginas de issue y aprobación muestran enlaces bidireccionales estables desde la relación canónica de DB.
- Los comentarios de agentes en el flujo de contratación usan markdown e incluyen enlaces de entidades.

## 9. Riesgos y mitigaciones

- Riesgo: escalación de permisos vía PATCH genérico.
  - Mitigación: aislar campos privilegiados y validar el alcance del actor.
- Riesgo: corrupción del rollback.
  - Mitigación: instantánea-antes/instantánea-después + transacción + pruebas.
- Riesgo: semántica de enlace ambigua.
  - Mitigación: tabla de unión explícita + restricciones únicas + campo de relación tipado.
