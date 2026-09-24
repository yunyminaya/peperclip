# Plan de implementación del sistema de almacenamiento (V1)

Estado: Borrador  
Responsable: Backend + UI  
Fecha: 2026-02-20

## Objetivo

Agregar un único subsistema de almacenamiento para Paperclip que soporte:

- almacenamiento en disco local para despliegue local de un solo usuario
- almacenamiento de objetos compatible con S3 para despliegue en la nube
- una interfaz agnóstica al proveedor para imágenes de issues y futuros adjuntos de archivos

## Alcance V1

- Primer consumidor: adjuntos/imágenes de issues.
- Adaptadores de almacenamiento: `local_disk` y `s3`.
- Los archivos siempre tienen alcance de empresa y control de acceso.
- La API sirve los bytes del adjunto a través de endpoints autenticados de Paperclip.

## Fuera de alcance (este borrador)

- URLs de objeto públicas sin autenticación.
- Optimización de CDN/URL firmadas.
- Transformaciones de imágenes/miniaturas.
- Pipeline de escaneo de malware.

## Decisiones clave

- La ruta local por defecto está bajo la raíz de la instancia: `~/.paperclip/instances/<instanceId>/data/storage`.
- Los bytes del objeto viven en el proveedor de almacenamiento; los metadatos viven en Postgres.
- `assets` es una tabla genérica de metadatos; `issue_attachments` enlaza assets a issues/comentarios.
- Las credenciales de S3 vienen del entorno de ejecución/cadena de proveedor AWS por defecto, no de filas de DB.
- Todas las claves de objeto incluyen prefijo de empresa para preservar límites duros de tenencia.

## Fase 1: Configuración compartida + contrato de proveedor

### Lista de verificación (por archivo)

- [ ] `packages/shared/src/constants.ts`: agregar `STORAGE_PROVIDERS` y el tipo `StorageProvider`.
- [ ] `packages/shared/src/config-schema.ts`: agregar `storageConfigSchema` con:
  - provider: `local_disk | s3`
  - localDisk.baseDir
  - s3.bucket, s3.region, s3.endpoint?, s3.prefix?, s3.forcePathStyle?
- [ ] `packages/shared/src/index.ts`: exportar nueva configuración/tipos de almacenamiento.
- [ ] `cli/src/config/schema.ts`: asegurar que la re-exportación incluya el nuevo esquema/tipos de almacenamiento.
- [ ] `cli/src/commands/configure.ts`: agregar soporte de sección `storage`.
- [ ] `cli/src/commands/onboard.ts`: inicializar la configuración de almacenamiento por defecto.
- [ ] `cli/src/prompts/storage.ts`: nuevo flujo de prompts para ajustes de disco local vs s3.
- [ ] `cli/src/prompts/index` (si existe) o imports directos: conectar el nuevo prompt de almacenamiento.
- [ ] `server/src/config.ts`: cargar la configuración de almacenamiento y resolver la ruta local consciente del home.
- [ ] `server/src/home-paths.ts`: agregar `resolveDefaultStorageDir()`.
- [ ] `doc/CLI.md`: documentar `configure --section storage`.
- [ ] `doc/DEVELOPING.md`: documentar la ruta de almacenamiento local por defecto y las anulaciones.

### Criterios de aceptación

- `paperclipai onboard` escribe un bloque de configuración `storage` válido por defecto.
- `paperclipai configure --section storage` puede cambiar entre modos local y s3.
- El arranque del servidor lee la configuración de almacenamiento sin trucos solo-env.

## Fase 2: Subsistema de almacenamiento del servidor + proveedores

### Lista de verificación (por archivo)

- [ ] `server/src/storage/types.ts`: definir interfaces de proveedor + servicio.
- [ ] `server/src/storage/service.ts`: servicio agnóstico al proveedor (generación de claves, validación, APIs de stream).
- [ ] `server/src/storage/local-disk-provider.ts`: implementar el proveedor de disco local con resolución segura de rutas.
- [ ] `server/src/storage/s3-provider.ts`: implementar el proveedor compatible con S3 (`@aws-sdk/client-s3`).
- [ ] `server/src/storage/provider-registry.ts`: búsqueda de proveedor por id configurado.
- [ ] `server/src/storage/index.ts`: exportar helpers de fábrica de almacenamiento.
- [ ] `server/src/services/index.ts`: exportar la fábrica `storageService`.
- [ ] `server/src/app.ts` o punto de cableado de rutas: inyectar/usar el servicio de almacenamiento donde se necesite.
- [ ] `server/package.json`: agregar la dependencia AWS SDK si no está presente.

### Criterios de aceptación

- En modo `local_disk`, subir + leer un archivo hace round-trip de bytes en disco.
- En modo `s3`, el servicio puede hacer `put/get/delete` contra un endpoint compatible con S3.
- Una configuración de proveedor inválida produce errores claros de arranque/configuración.

## Fase 3: Modelo de metadatos de base de datos

### Lista de verificación (por archivo)

- [ ] `packages/db/src/schema/assets.ts`: nueva tabla genérica de metadatos de assets.
- [ ] `packages/db/src/schema/issue_attachments.ts`: tabla de enlace de issues a assets.
- [ ] `packages/db/src/schema/index.ts`: exportar las nuevas tablas.
- [ ] `packages/db/src/migrations/*`: generar migración para ambas tablas e índices.
- [ ] `packages/shared/src/types/issue.ts` (o nuevo archivo de tipos de asset): agregar el tipo `IssueAttachment`.
- [ ] `packages/shared/src/index.ts`: exportar los nuevos tipos.

### Columnas sugeridas

- `assets`:
  - `id`, `company_id`, `provider`, `object_key`
  - `content_type`, `byte_size`, `sha256`, `original_filename`
  - `created_by_agent_id`, `created_by_user_id`, marcas de tiempo
- `issue_attachments`:
  - `id`, `company_id`, `issue_id`, `asset_id`, `issue_comment_id` (nullable), marcas de tiempo

### Criterios de aceptación

- La migración se aplica limpiamente en una DB de dev local vacía y existente.
- Las filas de metadatos tienen alcance de empresa e índices para búsqueda de issues.

## Fase 4: API de adjuntos de issues

### Lista de verificación (por archivo)

- [ ] `packages/shared/src/validators/issue.ts`: agregar esquemas para operaciones de subir/listar/eliminar adjuntos.
- [ ] `server/src/services/issues.ts`: agregar helpers CRUD de adjuntos con verificaciones de empresa.
- [ ] `server/src/routes/issues.ts`: agregar endpoints:
  - `POST /companies/:companyId/issues/:issueId/attachments` (multipart)
  - `GET /issues/:issueId/attachments`
  - `GET /attachments/:attachmentId/content`
  - `DELETE /attachments/:attachmentId`
- [ ] `server/src/routes/authz.ts`: reutilizar/aplicar acceso de empresa para endpoints de adjuntos.
- [ ] llamadas a `server/src/services/activity-log.ts`: registrar mutaciones de agregar/quitar adjuntos.
- [ ] `server/src/app.ts`: asegurar que el middleware de parseo multipart esté en su lugar para la ruta de subida.

### Comportamiento de la API

- Aplicar tamaño máximo y lista de permitidos de tipos MIME/de contenido en V1.
- Devolver errores consistentes: `400/401/403/404/409/422/500`.
- Transmitir bytes en stream en lugar de bufferizar payloads grandes en memoria.

### Criterios de aceptación

- El tablero y los agentes de la misma empresa pueden subir y leer adjuntos según los permisos de issues.
- El acceso entre empresas se deniega incluso con un id de adjunto válido.
- El registro de actividad registra acciones de agregar/quitar adjuntos.

## Fase 5: Integración de adjuntos de issues en UI

### Lista de verificación (por archivo)

- [ ] `ui/src/api/issues.ts`: agregar métodos de cliente de API de adjuntos.
- [ ] `ui/src/api/client.ts`: soportar helper de subida multipart (sin `Content-Type` JSON para `FormData`).
- [ ] `ui/src/lib/queryKeys.ts`: agregar claves de query de adjuntos de issues.
- [ ] `ui/src/pages/IssueDetail.tsx`: agregar UI de subida + invalidación de query de lista de adjuntos.
- [ ] `ui/src/components/CommentThread.tsx`: adjuntar imagen a comentario opcional o mostrar imágenes enlazadas.
- [ ] `packages/shared/src/types/index.ts`: asegurar que los tipos de adjunto se consuman limpiamente en UI.

### Criterios de aceptación

- El usuario puede subir una imagen desde el detalle del issue y verla listada de inmediato.
- La imagen subida puede abrirse/renderizarse vía la ruta de API autenticada.
- Las fallas de subida y obtención son visibles para los usuarios (sin errores silenciosos).

## Fase 6: CLI Doctor + endurecimiento operativo

### Lista de verificación (por archivo)

- [ ] `cli/src/checks/storage-check.ts`: agregar verificación de almacenamiento (dir local escribible, verificación opcional de alcanzabilidad de S3).
- [ ] `cli/src/checks/index.ts`: exportar la nueva verificación de almacenamiento.
- [ ] `cli/src/commands/doctor.ts`: incluir la verificación de almacenamiento en la secuencia de doctor.
- [ ] `doc/DATABASE.md` o `doc/DEVELOPING.md`: mencionar el comportamiento del backend de almacenamiento por modo de despliegue.
- [ ] `doc/SPEC-implementation.md`: agregar el subsistema de almacenamiento y el contrato de endpoints de adjuntos de issues.

### Criterios de aceptación

- `paperclipai doctor` reporta un estado de almacenamiento accionable.
- La instalación local de un solo usuario funciona sin credenciales extra en la nube.
- La configuración en la nube soporta un endpoint compatible con S3 sin cambios de código.

## Plan de pruebas

### Pruebas de integración del servidor

- [ ] `server/src/__tests__/issue-attachments.auth.test.ts`: pruebas de límite de empresa y permisos.
- [ ] `server/src/__tests__/issue-attachments.lifecycle.test.ts`: flujo de subir/listar/leer/eliminar.
- [ ] `server/src/__tests__/storage-local-provider.test.ts`: seguridad de rutas y round-trip del proveedor local.
- [ ] `server/src/__tests__/storage-s3-provider.test.ts`: contrato del proveedor s3 (cliente mockeado).
- [ ] `server/src/__tests__/activity-log.attachments.test.ts`: aserciones de registro de mutaciones.

### Pruebas del CLI

- [ ] `cli/src/__tests__/configure-storage.test.ts`: la sección de configuración escribe config válida.
- [ ] `cli/src/__tests__/doctor-storage-check.test.ts`: salida de salud de almacenamiento y comportamiento de reparación.

### Pruebas de UI (si están presentes en el stack actual)

- [ ] `ui/src/...`: pruebas de subida y manejo de errores del detalle de issue.

## Puerta de verificación antes del merge

Ejecutar:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

Si algún comando se omite, documentar exactamente qué se omitió y por qué.

## Orden de implementación

1. Fase 1 y Fase 2 (base, sin roturas visibles para el usuario)
2. Fase 3 (contrato de DB)
3. Fase 4 (API)
4. Fase 5 (consumidor UI)
5. Fase 6 (endurecimiento doctor/docs)
