---
title: Inicio rápido
summary: Pon Paperclip en marcha en minutos
---

Pon Paperclip en marcha localmente en menos de 5 minutos.

## Inicio rápido (recomendado)

```sh
npx paperclipai onboard --yes
```

Esto te guía por la configuración, configura tu entorno y pone Paperclip en marcha.

Para iniciar Paperclip de nuevo más tarde:

```sh
npx paperclipai run
```

> **Nota:** si usaste `npx` para la configuración, usa siempre `npx paperclipai` para ejecutar comandos. La forma `pnpm paperclipai` solo funciona dentro de una copia clonada del repositorio Paperclip (consulta Desarrollo local más abajo).

## Desarrollo local

Para colaboradores que trabajan en el propio Paperclip. Requisitos previos: Node.js 20+ y pnpm 9+.

Clona el repositorio y luego:

```sh
pnpm install
pnpm dev
```

Esto inicia el servidor de API y la interfaz en [http://localhost:3100](http://localhost:3100).

No se requiere base de datos externa: Paperclip usa una instancia PostgreSQL incorporada de forma predeterminada.

Cuando trabajas desde el repositorio clonado, también puedes usar:

```sh
pnpm paperclipai run
```

Esto se auto-incorpora si falta la configuración, ejecuta verificaciones de salud con auto-reparación e inicia el servidor.

## Qué sigue

Una vez que Paperclip esté en marcha:

1. Crea tu primera empresa en la interfaz web
2. Define un objetivo de la empresa
3. Crea un agente CEO y configura su adaptador
4. Construye el organigrama con más agentes
5. Establece presupuestos y asigna las tareas iniciales
6. Enciende todo: los agentes inician sus latidos y la empresa funciona

<Card title="Conceptos fundamentales" href="/start/core-concepts">
  Aprende los conceptos clave detrás de Paperclip
</Card>
