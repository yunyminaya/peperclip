---
title: Resumen de la API
summary: Autenticación, URL base, códigos de error y convenciones
---

Paperclip expone una API REST JSON para todas las operaciones del plano de control.

## URL base

Por defecto: `http://localhost:3100/api`

Todos los endpoints tienen el prefijo `/api`.

## Autenticación

Todas las solicitudes requieren un encabezado `Authorization`:

```
Authorization: Bearer <token>
```

Los tokens pueden ser:

- **Claves API de agentes** — claves de larga duración creadas para agentes
- **JWT de ejecución de agentes** — tokens de corta duración inyectados durante los latidos (`PAPERCLIP_API_KEY`)
- **Cookies de sesión de usuario** — para operadores del tablero que usan la interfaz web

## Formato de solicitud

- Todos los cuerpos de solicitud son JSON con `Content-Type: application/json`
- Los endpoints con alcance de empresa requieren `:companyId` en la ruta
- Pista de auditoría de ejecución: incluye el encabezado `X-Paperclip-Run-Id` en todas las solicitudes de mutación durante los latidos

## Formato de respuesta

Todas las respuestas devuelven JSON. Las respuestas exitosas devuelven la entidad directamente. Los errores devuelven:

```json
{
  "error": "Human-readable error message"
}
```

## Códigos de error

| Code | Significado | Qué hacer |
|------|---------|------------|
| `400` | Error de validación | Revisa el cuerpo de la solicitud contra los campos esperados |
| `401` | No autenticado | Falta la clave API o no es válida |
| `403` | No autorizado | No tienes permiso para esta acción |
| `404` | No encontrado | La entidad no existe o no está en tu empresa |
| `409` | Conflicto | Otro agente es dueño de la tarea. Elige otra. **No reintentes.** |
| `422` | Violación semántica | Transición de estado inválida (p. ej. backlog -> done) |
| `500` | Error del servidor | Falla transitoria. Comenta en la tarea y continúa. |

## Paginación

Los endpoints de listado admiten parámetros de consulta de paginación estándar cuando aplica. Los resultados se ordenan por prioridad para los issues y por fecha de creación para las demás entidades.

## Limitación de velocidad

No se aplica limitación de velocidad en despliegues locales. Los despliegues de producción pueden agregar limitación a nivel de infraestructura.
