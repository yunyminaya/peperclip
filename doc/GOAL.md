# Paperclip

**Paperclip es la columna vertebral de la economía autónoma.** Estamos construyendo la infraestructura sobre la que operan las empresas de IA autónomas. Nuestro objetivo es que las empresas impulsadas por Paperclip generen colectivamente una producción económica que rivalice con el PIB de los países más grandes del mundo. Cada decisión que tomamos debe servir a eso: hacer que las empresas autónomas sean más capaces, más gobernables, más escalables y más reales.

## La visión

Las empresas autónomas — fuerzas laborales de IA organizadas con estructura, gobernanza y rendición de cuentas reales — se convertirán en una fuerza importante en la economía global. No una empresa. Miles. Millones. Una capa económica entera que opera con trabajo de IA, coordinada a través de Paperclip.

Paperclip no es la empresa. Paperclip es lo que hace posibles a las empresas. Somos el plano de control, el sistema nervioso, la capa operativa. Cada empresa autónoma necesita estructura, gestión de tareas, control de costos, alineación de objetivos y gobernanza humana. Eso somos nosotros. Somos para las empresas autónomas lo que el sistema operativo corporativo es para las humanas — excepto que esta vez, el sistema operativo es software real, no metáfora.

La medida de nuestro éxito no es si una empresa funciona. Es si Paperclip se convierte en la base por defecto sobre la que se construyen las empresas autónomas — y si esas empresas, colectivamente, se convierten en una fuerza económica seria que rivalice con la producción de naciones.

## El problema

El software de gestión de tareas no llega lo suficientemente lejos. Cuando toda tu fuerza laboral son agentes de IA, necesitas más que una lista de pendientes — necesitas un **plano de control** para una empresa entera.

## Qué es esto

Paperclip es el plano de comando, comunicación y control para una empresa de agentes de IA. Es el lugar único donde:

- **Gestionas agentes como empleados** — contrata, organiza y sigue quién hace qué
- **Defines la estructura de org** — organigramas dentro de los cuales operan los propios agentes
- **Sigues el trabajo en tiempo real** — ve en cualquier momento en qué está trabajando cada agente
- **Controlas costos** — presupuestos salariales de tokens por agente, seguimiento de gasto, tasa de quema
- **Te alineas a objetivos** — los agentes ven cómo su trabajo sirve a la misión más grande
- **Almacenas el conocimiento de la empresa** — un cerebro compartido para la organización

## Arquitectura

Dos capas:

### 1. Plano de control (este software)

El sistema nervioso central. Gestiona:

- Registro de agentes y organigrama
- Asignación y estado de tareas
- Seguimiento de presupuesto y gasto de tokens
- Base de conocimiento de la empresa
- Jerarquía de objetivos (empresa → equipo → agente → tarea)
- Monitoreo de latidos — sabe cuándo los agentes están vivos, inactivos o atascados

### 2. Servicios de ejecución (adaptadores)

Los agentes se ejecutan externamente y reportan al plano de control. Un agente es solo código Python que se lanza y hace trabajo. Los adaptadores conectan distintos entornos de ejecución:

- **OpenClaw** — objetivo inicial de adaptador
- **Bucle de latido** — Python simple personalizado que entra en bucle, hace check-in, hace trabajo
- **Otros** — cualquier runtime que pueda llamar a una API

El plano de control no ejecuta agentes. Los orquesta. Los agentes se ejecutan donde se ejecuten y llaman a casa.

## Principio central

Deberías poder mirar Paperclip y entender toda tu empresa de un vistazo — quién hace qué, cuánto cuesta y si está funcionando.
