---
title: Arquitectura
summary: Descripción general del stack, flujo de solicitudes y modelo de adaptadores
---

Paperclip es un monorepo con cuatro capas principales.

## Descripción general del stack

```
┌─────────────────────────────────────┐
│  React UI (Vite)                    │
│  Dashboard, org management, tasks   │
├─────────────────────────────────────┤
│  Express.js REST API (Node.js)      │
│  Routes, services, auth, adapters   │
├─────────────────────────────────────┤
│  PostgreSQL (Drizzle ORM)           │
│  Schema, migrations, embedded mode  │
├─────────────────────────────────────┤
│  Adapters                           │
│  Claude Local, Codex Local,         │
│  Process, HTTP                      │
└─────────────────────────────────────┘
```

## Stack tecnológico

| Capa | Tecnología |
|-------|-----------|
| Frontend | React 19, Vite 6, React Router 7, Radix UI, Tailwind CSS 4, TanStack Query |
| Backend | Node.js 20+, Express.js 5, TypeScript |
| Base de datos | PostgreSQL 17 (o PGlite incorporado), Drizzle ORM |
| Autenticación | Better Auth (sesiones + claves API) |
| Adaptadores | Claude Code CLI, Codex CLI, shell process, HTTP webhook |
| Package manager | pnpm 9 con workspaces |

## Estructura del repositorio

```
paperclip/
├── ui/                          # React frontend
│   ├── src/pages/              # Route pages
│   ├── src/components/         # React components
│   ├── src/api/                # API client
│   └── src/context/            # React context providers
│
├── server/                      # Express.js API
│   ├── src/routes/             # REST endpoints
│   ├── src/services/           # Business logic
│   ├── src/adapters/           # Agent execution adapters
│   └── src/middleware/         # Auth, logging
│
├── packages/
│   ├── db/                      # Drizzle schema + migrations
│   ├── shared/                  # API types, constants, validators
│   ├── adapter-utils/           # Adapter interfaces and helpers
│   └── adapters/
│       ├── claude-local/        # Claude Code adapter
│       └── codex-local/         # OpenAI Codex adapter
│
├── skills/                      # Agent skills
│   └── paperclip/               # Core Paperclip skill (heartbeat protocol)
│
├── cli/                         # CLI client
│   └── src/                     # Setup and control-plane commands
│
└── doc/                         # Internal documentation
```

## Flujo de solicitudes

Cuando se activa un latido:

1. **Activación**: el programador, una invocación manual o un evento (asignación, mención) activa un latido
2. **Invocación del adaptador**: el servidor llama a la función `execute()` del adaptador configurado
3. **Proceso del agente**: el adaptador genera el agente (p. ej., Claude Code CLI) con las variables de entorno y el prompt de Paperclip
4. **Trabajo del agente**: el agente llama a la API REST de Paperclip para revisar asignaciones, hacer checkout de tareas, trabajar y actualizar el estado
5. **Captura del resultado**: el adaptador captura stdout, analiza los datos de uso/costo y extrae el estado de la sesión
6. **Registro de ejecución**: el servidor registra el resultado de la ejecución, los costos y cualquier estado de sesión para el siguiente latido

## Modelo de adaptador

Los adaptadores son el puente entre Paperclip y los tiempos de ejecución de agentes. Cada adaptador es un paquete con tres módulos:

- **Módulo de servidor**: función `execute()` que genera/llama al agente, más diagnósticos de entorno
- **Módulo de interfaz**: analizador de stdout para el visor de ejecuciones, campos del formulario de configuración para la creación de agentes
- **Módulo de CLI**: formateador de terminal para `paperclipai run --watch`

Adaptadores integrados: `claude_local`, `codex_local`, `process`, `http`. Puedes crear adaptadores personalizados para cualquier tiempo de ejecución.

## Decisiones clave de diseño

- **Plano de control, no plano de ejecución**: Paperclip orquesta agentes; no los ejecuta
- **Con alcance de empresa**: todas las entidades pertenecen exactamente a una empresa; límites de datos estrictos
- **Tareas de un solo responsable**: el checkout atómico evita el trabajo concurrente en la misma tarea
- **Agnóstico de adaptadores**: cualquier tiempo de ejecución que pueda llamar a una API HTTP funciona como agente
- **Incorporado de forma predeterminada**: modo local sin configuración con PostgreSQL incorporado
