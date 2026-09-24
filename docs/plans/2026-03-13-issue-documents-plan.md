# Plan de documentos de issue

Estado: Borrador  
Responsable: Backend + UI + Protocolo de agente  
Fecha: 2026-03-13  
Issue principal: `PAP-448`

## Resumen

Agregar **documentos** de primera clase a Paperclip como artefactos de texto editables, con revisiones y alcance de empresa, que puedan vincularse a issues.

La primera convención requerida es un documento con la clave `plan`.

Esto resuelve el problema inmediato del flujo de trabajo en `PAP-448`:

- los planes deben dejar de estar dentro de las descripciones de los issues como bloques `<plan>`
- los agentes y los usuarios del panel deben poder crear y actualizar documentos de issues directamente
- `GET /api/issues/:id` debe incluir el documento `plan` completo y exponer los demás documentos disponibles
- el detalle del issue debe mostrar los documentos debajo de la descripción

Esto debe construirse como la **parte de documentos de texto** del sistema de artefactos más amplio, no como un reemplazo de adjuntos/assets.

## Forma de producto recomendada

### Documentos vs adjuntos vs artefactos

- **Documentos**: contenido de texto editable con claves estables e historial de revisiones.
- **Adjuntos**: archivos opacos subidos o generados, respaldados por almacenamiento (`assets` + `issue_attachments`).
- **Artefactos**: paraguas/read-model posterior que puede unificar documentos, adjuntos, vistas previas y archivos del workspace.

Recomendación:

- implementar **documentos de issue ahora**
- mantener los adjuntos existentes tal cual
- posponer la unificación completa de artefactos hasta que haya un segundo consumidor real además de documentos de issue + adjuntos

Esto mantiene `PAP-448` enfocado y a la vez encaja en la dirección más amplia de artefactos.

## Objetivos

1. Dar a los issues documentos con clave de primera clase, empezando por `plan`.
2. Hacer que los documentos sean editables por usuarios del panel y por agentes de la misma empresa con acceso al issue.
3. Preservar el historial de cambios con revisiones de solo agregado.
4. Hacer que el documento `plan` esté disponible automáticamente en la obtención normal de issues usada por agentes/latidos.
5. Reemplazar la convención actual de `<plan>` en la descripción en habilidades/documentos.
6. Mantener el diseño compatible con una futura capa de artefactos/entregables.

## No objetivos

- edición colaborativa completa de documentos
- historial de versiones de archivos binarios
- IDE en el navegador o editor del workspace
- implementación completa del sistema de artefactos en el mismo cambio
- relaciones polimórficas generalizadas para cada tipo de entidad desde el día uno

## Decisiones de producto

### 1. Documentos de issue con clave

Cada issue puede tener múltiples documentos. Cada relación de documento tiene una clave estable:

- `plan`
- `design`
- `notes`
- `report`
- claves personalizadas más adelante

Reglas de claves:

- única por issue, sin distinción de mayúsculas y minúsculas
- normalizada a forma de slug en minúsculas
- orientada a máquinas y estable
- el título es separado y visible al usuario

La clave `plan` es convencional y está reservada por el flujo de trabajo y la documentación de Paperclip.

### 2. V1 con texto primero

Los documentos V1 deberían ser texto primero, no blobs arbitrarios.

Formatos admitidos recomendados:

- `markdown`
- `plain_text`
- `json`
- `html`

Recomendación:

- optimizar la UI para `markdown`
- permitir edición cruda para los demás
- mantener PDF/imágenes/CSV/etc. como adjuntos/artefactos, no como documentos editables

### 3. Modelo de revisiones

Cada actualización de un documento crea una nueva revisión inmutable.

La fila actual del documento almacena la instantánea más reciente para lecturas rápidas.

### 4. Modelo de concurrencia

No usar last-write-wins silencioso.

Las actualizaciones deben incluir `baseRevisionId`:

- crear: no se requiere revisión base
- actualizar: `baseRevisionId` debe coincidir con la revisión más reciente actual
- discrepancia: devolver `409 Conflict`

Esto es importante porque tanto los usuarios del panel como los agentes pueden editar el mismo documento.

### 5. Comportamiento de obtención de issues

`GET /api/issues/:id` debe incluir:

- `planDocument` completo cuando exista un documento `plan`
- `documentSummaries` para todos los documentos vinculados

No debe incluir en línea cada cuerpo de documento por defecto.

Esto mantiene las obtenciones de issues útiles para los agentes sin hacer que cada payload de issue sea ilimitado.

### 6. Compatibilidad con `<plan>` heredado

Si un issue no tiene un documento `plan` pero su descripción contiene un bloque `<plan>` heredado:

- exponerlo como un fallback heredado de solo lectura en API/UI
- marcarlo como heredado/sintético
- preferir un documento `plan` real cuando existan ambos

Recomendación:

- no reescribir automáticamente las descripciones de issues antiguas en el primer despliegue
- proveer una ruta explícita de importación/migración más adelante
## Modelo de datos propuesto

Recomendación: hacer que los documentos sean de primera clase, pero mantener el vínculo con el issue explícito mediante una tabla de unión.

Esto preserva las claves foráneas hoy y da una ruta limpia a futuras tablas `project_documents` o `company_documents` más adelante.

## Tablas

### `documents`

Registro canónico de documento de texto.

Columnas sugeridas:

- `id`
- `company_id`
- `title`
- `format`
- `latest_body`
- `latest_revision_id`
- `latest_revision_number`
- `created_by_agent_id`
- `created_by_user_id`
- `updated_by_agent_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

### `document_revisions`

Historial de solo agregado.

Columnas sugeridas:

- `id`
- `company_id`
- `document_id`
- `revision_number`
- `body`
- `change_summary`
- `created_by_agent_id`
- `created_by_user_id`
- `created_at`

Restricciones:

- unique `(document_id, revision_number)`

### `issue_documents`

Relación de issue + clave de flujo de trabajo.

Columnas sugeridas:

- `id`
- `company_id`
- `issue_id`
- `document_id`
- `key`
- `created_at`
- `updated_at`

Restricciones:

- unique `(company_id, issue_id, key)`
- unique `(document_id)` para mantener una relación de issue por documento en la V1

## ¿Por qué no usar `assets` para esto?

Porque `assets` resuelve almacenamiento de blobs, no:

- semántica con clave estable como `plan`
- edición de texto en línea
- historial de revisiones
- concurrencia optimista
- inclusión barata en `GET /issues/:id`

Los documentos y los adjuntos deben seguir siendo primitivas separadas, y luego encontrarse en un read-model de entregables/artefactos.

## Tipos compartidos y contrato de API

## Nuevos tipos compartidos

Agregar:

- `DocumentFormat`
- `IssueDocument`
- `IssueDocumentSummary`
- `DocumentRevision`

Forma recomendada de `IssueDocument`:

```ts
type DocumentFormat = "markdown" | "plain_text" | "json" | "html";

interface IssueDocument {
  id: string;
  companyId: string;
  issueId: string;
  key: string;
  title: string | null;
  format: DocumentFormat;
  body: string;
  latestRevisionId: string;
  latestRevisionNumber: number;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  updatedByAgentId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Forma recomendada de `IssueDocumentSummary`:

```ts
interface IssueDocumentSummary {
  id: string;
  key: string;
  title: string | null;
  format: DocumentFormat;
  latestRevisionId: string;
  latestRevisionNumber: number;
  updatedAt: Date;
}
```

## Enriquecimiento del tipo Issue

Extender `Issue` con:

```ts
interface Issue {
  ...
  planDocument?: IssueDocument | null;
  documentSummaries?: IssueDocumentSummary[];
  legacyPlanDocument?: {
    key: "plan";
    body: string;
    source: "issue_description";
  } | null;
}
```

Esto satisface directamente el requisito de `PAP-448` para las obtenciones de issues de latido/API.

## Endpoints de API

Endpoints recomendados:

- `GET /api/issues/:issueId/documents`
- `GET /api/issues/:issueId/documents/:key`
- `PUT /api/issues/:issueId/documents/:key`
- `GET /api/issues/:issueId/documents/:key/revisions`
- `DELETE /api/issues/:issueId/documents/:key` opcionalmente solo para el panel en la V1

Cuerpo `PUT` recomendado:

```ts
{
  title?: string | null;
  format: "markdown" | "plain_text" | "json" | "html";
  body: string;
  changeSummary?: string | null;
  baseRevisionId?: string | null;
}
```

Comportamiento:

- documento faltante + sin `baseRevisionId`: crear
- documento existente + `baseRevisionId` coincidente: actualizar
- documento existente + `baseRevisionId` obsoleto: `409`

## Autorización e invariantes

- todos los registros de documentos tienen alcance de empresa
- la relación de issue debe pertenecer a la misma empresa
- el acceso del panel sigue las reglas existentes de acceso a issues
- el acceso de agentes sigue las reglas existentes de acceso a issues de la misma empresa
- cada mutación escribe entradas en el registro de actividad

Regla de eliminación recomendada para la V1:

- el panel puede eliminar documentos
- los agentes pueden crear/actualizar, pero no eliminar

Esto evita que los sistemas automatizados eliminen documentos canónicos con demasiada facilidad.
## Plan de UI

## Detalle de issue

Agregar una nueva sección **Documentos** directamente debajo de la descripción del issue.

Comportamiento recomendado:

- mostrar `plan` primero cuando esté presente
- mostrar los demás documentos debajo
- mostrar un encabezado estilo gist:
  - clave
  - título
  - metadatos de última actualización
  - número de revisión
- admitir edición en línea
- admitir crear un nuevo documento por clave
- admitir un cajón u hoja de historial de revisiones

Orden de presentación recomendado:

1. Descripción
2. Documentos
3. Adjuntos
4. Comentarios / actividad / sub-issues

Esto coincide con la solicitud de que los documentos vivan debajo de la descripción y a la vez mantener los adjuntos disponibles.

## UX de edición

Recomendación:

- usar vista previa de markdown + alternador de edición cruda para documentos markdown
- usar editor de textarea crudo para documentos no markdown en la V1
- mostrar conflictos de guardado explícitos en `409`
- mostrar un estado vacío claro: "No hay documentos todavía"

## Renderizado de plan heredado

Si no hay un documento `plan` almacenado pero existe un `<plan>` heredado:

- mostrarlo en la sección Documentos
- marcarlo como "Plan heredado de la descripción"
- ofrecer crear/importar en una pasada posterior

## Protocolo de agente y habilidades

Actualizar el flujo de trabajo del agente de Paperclip para que la planificación ya no edite la descripción del issue.

Cambios requeridos:

- actualizar `skills/paperclip/SKILL.md`
- reemplazar las instrucciones de `<plan>` con instrucciones de creación/actualización de documentos
- documentar los nuevos endpoints en `docs/api/issues.md`
- actualizar cualquier documento interno de planificación que aún enseñe bloques `<plan>` en línea

Nueva regla:

- cuando se pida hacer un plan para un issue, crear o actualizar el documento del issue con la clave `plan`
- dejar un comentario de que el documento de plan se creó o actualizó
- no marcar el issue como terminado

## Relación con el plan de artefactos

Este trabajo debe alimentar explícitamente la dirección más amplia de artefactos/entregables.

Recomendación:

- mantener los documentos como su propia primitiva en este cambio
- agregar `document` a cualquier futuro `ArtifactKind`
- luego construir un read-model de entregables que agregue:
  - documentos de issue
  - adjuntos de issue
  - URLs de vista previa
  - referencias a archivos del workspace

La propuesta de artefactos actualmente no tiene un tipo `document` explícito. Debería tenerlo.

Forma futura recomendada:

```ts
type ArtifactKind =
  | "document"
  | "attachment"
  | "workspace_file"
  | "preview"
  | "report_link";
```

## Fases de implementación

## Fase 1: Contrato compartido y esquema

Archivos:

- `packages/db/src/schema/documents.ts`
- `packages/db/src/schema/document_revisions.ts`
- `packages/db/src/schema/issue_documents.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/migrations/*`
- `packages/shared/src/types/issue.ts`
- `packages/shared/src/validators/issue.ts` o un nuevo archivo de validador de documentos
- `packages/shared/src/index.ts`

Aceptación:

- el esquema impone una clave por issue
- las revisiones son de solo anexado (append-only)
- los tipos compartidos exponen los campos de plan/documento en la obtención de issues

## Fase 2: Servicios y rutas del servidor

Archivos:

- `server/src/services/issues.ts` o `server/src/services/documents.ts`
- `server/src/routes/issues.ts`
- puntos de llamada de `server/src/services/activity.ts`

Comportamiento:

- listar, obtener, upsert y eliminar documentos
- listado de revisiones
- `GET /issues/:id` devuelve `planDocument` + `documentSummaries`
- las verificaciones de límites de empresa coinciden con las rutas de issues

Aceptación:

- los agentes y el panel pueden obtener y actualizar documentos de issues de la misma empresa
- las ediciones obsoletas devuelven `409`
- la línea de tiempo de actividad muestra los cambios de documentos

## Fase 3: Superficie de documentos de issue en la UI

Archivos:

- `ui/src/api/issues.ts`
- `ui/src/lib/queryKeys.ts`
- `ui/src/pages/IssueDetail.tsx`
- nuevo componente de UI de documento reutilizable si es necesario

Comportamiento:

- mostrar plan + documentos debajo de la descripción
- crear/actualizar por clave
- abrir el historial de revisiones
- mostrar conflictos y errores con claridad

Aceptación:

- el panel puede crear un documento `plan` desde el detalle del issue
- el plan actualizado aparece de inmediato
- el detalle del issue ya no depende del `<plan>` incrustado en la descripción

## Fase 4: Migración de habilidades y documentación

Archivos:

- `skills/paperclip/SKILL.md`
- `docs/api/issues.md`
- `doc/SPEC-implementation.md`
- planes/documentos relevantes que mencionen `<plan>`

Aceptación:

- la guía de planificación referencia documentos de issue, no etiquetas en línea en la descripción del issue
- la documentación de la API describe los nuevos endpoints de documentos y las adiciones al payload de issues

## Fase 5: Compatibilidad heredada y seguimiento

Comportamiento:

- leer bloques `<plan>` heredados como fallback
- opcionalmente agregar un comando explícito de importación/migración más adelante

Seguimiento, no requerido para el primer merge:

- read-model de entregables/artefactos
- documentos de proyecto/empresa
- documentos vinculados a comentarios
- vista de diff entre revisiones

## Plan de pruebas

### Servidor

- ciclo de vida de crear/leer/actualizar/eliminar documentos
- numeración de revisiones
- manejo de conflictos de `baseRevisionId`
- aplicación de límites de empresa
- autorización de agente vs panel
- la obtención de issues incluye `planDocument` y resúmenes de documentos
- comportamiento de fallback de `<plan>` heredado
- cobertura de mutaciones en el registro de actividad

### UI

- el detalle del issue muestra el documento de plan
- los flujos de creación/actualización invalidan las consultas correctamente
- los errores de conflicto y validación se exponen
- el fallback de plan heredado se muestra correctamente

### Verificación

Ejecutar antes de declarar completa la implementación:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

## Preguntas abiertas

1. ¿Deben los documentos de la V1 ser solo markdown, con `json/html/plain_text` pospuestos?
   Recomendación: permitir los cuatro en la API, optimizar la UI solo para markdown.

2. ¿Se debe permitir a los agentes crear claves arbitrarias, o solo claves convencionales?
   Recomendación: permitir claves arbitrarias con validación normalizada; reservar `plan` solo como comportamiento especial.

3. ¿Debe existir la eliminación en la V1?
   Recomendación: sí, pero solo para el panel.

4. ¿Deben los bloques `<plan>` heredados migrarse automáticamente alguna vez?
   Recomendación: sin mutación automática en el primer despliegue.

5. ¿Deben los documentos aparecer dentro de una futura sección Entregables o seguir siendo una sección de Issue de nivel superior?
   Recomendación: mantener ahora una sección Documentos dedicada; más adelante también exponerlos en Entregables si se agrega una vista de artefactos agregada.

## Recomendación final

Lanzar **documentos de issue** ahora como una primitiva enfocada y text-first.

No intentar resolver la unificación completa de artefactos en la misma implementación.

Usar:

- tablas de documentos de primera clase
- vínculo con clave a nivel de issue
- revisiones de solo anexado (append-only)
- `planDocument` incrustado en las obtenciones normales de issues
- fallback de `<plan>` heredado
- migración de habilidades/documentación para alejarse de los planes incrustados en la descripción

Esto aborda el problema real del flujo de trabajo de planificación de inmediato y deja al sistema de artefactos espacio para crecer limpiamente después.
