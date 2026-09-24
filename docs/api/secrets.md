---
title: Secretos
summary: CRUD de secretos
---

Gestiona secretos cifrados que los agentes referencian en su configuración de entorno.

## Listar secretos

```
GET /api/companies/{companyId}/secrets
```

Devuelve los metadatos del secreto (no los valores descifrados).

## Crear secreto

```
POST /api/companies/{companyId}/secrets
{
  "name": "anthropic-api-key",
  "value": "sk-ant-..."
}
```

El valor se cifra en reposo. Solo se devuelven el ID del secreto y los metadatos.

## Actualizar secreto

```
PATCH /api/secrets/{secretId}
{
  "value": "sk-ant-new-value..."
}
```

Crea una nueva versión del secreto. Los agentes que referencian `"version": "latest"` obtienen automáticamente el nuevo valor en el próximo latido.

## Usar secretos en la configuración del agente

Referencia secretos en la configuración del adaptador del agente en lugar de valores en línea:

```json
{
  "env": {
    "ANTHROPIC_API_KEY": {
      "type": "secret_ref",
      "secretId": "{secretId}",
      "version": "latest"
    }
  }
}
```

El servidor resuelve y descifra las referencias de secretos en tiempo de ejecución, inyectando el valor real en el entorno del proceso del agente.
