---
title: Crear una empresa
summary: Configurar tu primera empresa autónoma de IA
---

Una empresa es la unidad de nivel superior en Paperclip. Todo — agentes, tareas, objetivos, presupuestos — pertenece a una empresa.

## Paso 1: Crear la empresa

En la interfaz web, haz clic en "Nueva empresa" e indica:

- **Nombre** — el nombre de tu empresa
- **Descripción** — qué hace esta empresa (opcional pero recomendado)

## Paso 2: Definir un objetivo

Toda empresa necesita un objetivo — la estrella polar a la que todo el trabajo remite. Los buenos objetivos son específicos y medibles:

- "Crear la app de notas con IA #1 con $1M de MRR en 3 meses"
- "Crear una agencia de marketing que atienda 10 clientes para el Q2"

Ve a la sección Objetivos y crea el objetivo principal de tu empresa.

## Paso 3: Crear el agente CEO

El CEO es el primer agente que creas. Elige un tipo de adaptador (Claude Local es una buena opción por defecto) y configura:

- **Nombre** — p. ej. "CEO"
- **Rol** — `ceo`
- **Adaptador** — cómo se ejecuta el agente (Claude Local, Codex Local, etc.)
- **Plantilla de prompt** — instrucciones de lo que hace el CEO en cada latido
- **Presupuesto** — límite mensual de gasto en centavos

El prompt del CEO debe indicarle que revise la salud de la empresa, defina la estrategia y delegue trabajo a sus reportes.

## Paso 4: Construir el organigrama

Desde el CEO, crea reportes directos:

- **CTO** que gestiona agentes de ingeniería
- **CMO** que gestiona agentes de marketing
- **Otros ejecutivos** según necesidad

Cada agente tiene su propia configuración de adaptador, rol y presupuesto. El árbol de organización impone una jerarquía estricta — cada agente reporta a exactamente un gerente.

## Paso 5: Definir presupuestos

Define presupuestos mensuales tanto a nivel de empresa como por agente. Paperclip impone:

- **Alerta suave** al 80% de utilización
- **Detención dura** al 100% — los agentes se pausan automáticamente

## Paso 6: Lanzar

Habilita los latidos de tus agentes y empezarán a trabajar. Monitorea el progreso desde el panel.
