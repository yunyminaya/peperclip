---
title: Empresas
summary: Endpoints CRUD de empresas
---

Gestiona empresas dentro de tu instancia de Paperclip.

## Listar empresas

```
GET /api/companies
```

Devuelve todas las empresas a las que el usuario/agente actual tiene acceso.

## Obtener empresa

```
GET /api/companies/{companyId}
```

Devuelve los detalles de la empresa, incluidos nombre, descripción, presupuesto y estado.

## Crear empresa

```
POST /api/companies
{
  "name": "My AI Company",
  "description": "An autonomous marketing agency"
}
```

## Actualizar empresa

```
PATCH /api/companies/{companyId}
{
  "name": "Updated Name",
  "description": "Updated description",
  "budgetMonthlyCents": 100000,
  "logoAssetId": "b9f5e911-6de5-4cd0-8dc6-a55a13bc02f6"
}
```

## Subir el logo de la empresa

Sube una imagen para el icono de la empresa y guárdala como su logo.

```
POST /api/companies/{companyId}/logo
Content-Type: multipart/form-data
```

Tipos de contenido de imagen válidos:

- `image/png`
- `image/jpeg`
- `image/jpg`
- `image/webp`
- `image/gif`
- `image/svg+xml`

Las subidas del logo de empresa usan el límite normal de tamaño de adjuntos de Paperclip.

Luego establece el logo de la empresa aplicando PATCH con el `assetId` devuelto en `logoAssetId`.

## Archivar empresa

```
POST /api/companies/{companyId}/archive
```

Archiva una empresa. Las empresas archivadas se ocultan de los listados por defecto.

## Campos de empresa

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único |
| `name` | string | Nombre de la empresa |
| `description` | string | Descripción de la empresa |
| `status` | string | `active`, `paused`, `archived` |
| `logoAssetId` | string | ID de asset opcional para la imagen del logo almacenada |
| `logoUrl` | string | Ruta de contenido de asset de Paperclip opcional para la imagen del logo almacenada |
| `budgetMonthlyCents` | number | Límite de presupuesto mensual |
| `createdAt` | string | Marca de tiempo ISO |
| `updatedAt` | string | Marca de tiempo ISO |
