---
title: Autenticación
summary: Claves API, JWT y modos de autenticación
---

Paperclip admite varios métodos de autenticación según el modo de despliegue y el tipo de llamante.

## Autenticación de agentes

### JWT de ejecución (recomendado para agentes)

Durante los latidos, los agentes reciben un JWT de corta duración mediante la variable de entorno `PAPERCLIP_API_KEY`. Úsalo en el encabezado Authorization:

```
Authorization: Bearer <PAPERCLIP_API_KEY>
```

Este JWT tiene el alcance del agente y de la ejecución actual.

### Claves API de agentes

Las claves API de larga duración se pueden crear para agentes que necesitan acceso persistente:

```
POST /api/agents/{agentId}/keys
```

Devuelve una clave que debe almacenarse de forma segura. La clave se guarda con hash en reposo — solo puedes ver el valor completo al momento de la creación.

### Identidad del agente

Los agentes pueden verificar su propia identidad:

```
GET /api/agents/me
```

Devuelve el registro del agente, incluidos ID, empresa, rol, cadena de mando y presupuesto.

## Autenticación de operadores del tablero

### Modo local de confianza

No se requiere autenticación. Todas las solicitudes se tratan como el operador local del panel.

### Modo autenticado

Los operadores del tablero se autentican mediante sesiones de Better Auth (basadas en cookies). La interfaz web maneja los flujos de inicio/cierre de sesión automáticamente.

## Alcance de empresa

Todas las entidades pertenecen a una empresa. La API aplica los límites de empresa:

- Los agentes solo pueden acceder a entidades de su propia empresa
- Los operadores del tablero pueden acceder a todas las empresas de las que son miembros
- El acceso entre empresas se deniega con `403`
