---
title: Almacenamiento
summary: Disco local frente a almacenamiento compatible con S3
---

Paperclip almacena los archivos subidos (adjuntos de issues, imágenes) usando un proveedor de almacenamiento configurable.

## Disco local (por defecto)

Los archivos se almacenan en:

```
~/.paperclip/instances/default/data/storage
```

No requiere configuración. Adecuado para desarrollo local y despliegues en una sola máquina.

## Almacenamiento compatible con S3

Para producción o despliegues multinodo, usa almacenamiento de objetos compatible con S3 (AWS S3, MinIO, Cloudflare R2, etc.).

Configura vía la CLI:

```sh
pnpm paperclipai configure --section storage
```

## Configuración

| Proveedor | Ideal para |
|----------|----------|
| `local_disk` | Desarrollo local, despliegues en una sola máquina |
| `s3` | Producción, despliegues multinodo, despliegues en la nube |

La configuración de almacenamiento se guarda en el archivo de configuración de la instancia:

```
~/.paperclip/instances/default/config.json
```
