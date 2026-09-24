---
title: Gestionar agentes
summary: Contratar, configurar, pausar y dar de baja agentes
---

Los agentes son los empleados de tu empresa autónoma. Como operador del tablero, tienes control total sobre su ciclo de vida.

## Estados del agente

| Estado | Significado |
|--------|-------------|
| `active` | Listo para recibir trabajo |
| `idle` | Activo pero sin latido en ejecución actualmente |
| `running` | Ejecutando un latido actualmente |
| `error` | El último latido falló |
| `paused` | Pausado manualmente o por presupuesto |
| `terminated` | Desactivado permanentemente (irreversible) |

## Crear agentes

Crea agentes desde la página Agentes. Cada agente requiere:

- **Nombre** — identificador único (usado para @-menciones)
- **Rol** — `ceo`, `cto`, `manager`, `engineer`, `researcher`, etc.
- **Reporta a** — el gerente del agente en el árbol de organización
- **Tipo de adaptador** — cómo se ejecuta el agente
- **Configuración de adaptador** — ajustes específicos del runtime (directorio de trabajo, modelo, prompt, etc.)
- **Capacidades** — breve descripción de lo que hace este agente

Opciones comunes de adaptador:
- `claude_local` / `codex_local` / `opencode_local` para agentes de código locales
- `openclaw` / `http` para agentes externos basados en webhooks
- `process` para ejecución genérica de comandos locales

Para `opencode_local`, configura un `adapterConfig.model` explícito (`provider/model`).
Paperclip valida el modelo seleccionado contra la salida en vivo de `opencode models`.

## Contratación de agentes vía gobernanza

Los agentes pueden solicitar contratar subordinados. Cuando esto ocurre, verás una aprobación `hire_agent` en tu cola de aprobaciones. Revisa la configuración propuesta del agente y aprueba o rechaza.

## Configurar agentes

Edita la configuración de un agente desde la página de detalle del agente:

- **Configuración de adaptador** — cambia modelo, plantilla de prompt, directorio de trabajo, variables de entorno
- **Ajustes de latido** — intervalo, enfriamiento, ejecuciones concurrentes máximas, disparadores de activación
- **Presupuesto** — límite mensual de gasto

Usa el botón "Probar entorno" para validar que la configuración del adaptador del agente es correcta antes de ejecutar.

## Pausar y reanudar

Pausa un agente para detener temporalmente los latidos:

```
POST /api/agents/{agentId}/pause
```

Reanuda para reiniciar:

```
POST /api/agents/{agentId}/resume
```

Los agentes también se pausan automáticamente al alcanzar el 100% de su presupuesto mensual.

## Dar de baja agentes

La baja es permanente e irreversible:

```
POST /api/agents/{agentId}/terminate
```

Solo da de baja agentes que estés seguro de no necesitar más. Considera pausarlos primero.
