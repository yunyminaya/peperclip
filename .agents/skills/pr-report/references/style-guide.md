# Guía de estilo de informes de PR

Usar esta guía cuando el usuario quiera un artefacto de informe, especialmente una página web.

## Objetivo

Lograr que el informe se sienta como una reseña editorial, no como un panel de administración interno. La página debe hacer que un argumento técnico largo sea fácil de escanear sin verse genérico ni sobrediseñado.

## Dirección visual

Tono preferido:

- editorial
- cálido
- serio
- de alto contraste
- artesanal, no SaaS corporativo

Evitar:

- diseños app-shell predeterminados
- degradados púrpura sobre blanco
- paneles genéricos de tarjetas
- páginas apretadas con jerarquía débil
- fuentes novedosas que dañan la legibilidad

## Tipografía

Patrón recomendado:

- una serif expresiva o fuente display para los encabezados principales
- una sans-serif robusta para el cuerpo del texto y las etiquetas de la UI

Buenas combinaciones:

- Newsreader + IBM Plex Sans
- Source Serif 4 + Instrument Sans
- Fraunces + Public Sans
- Libre Baskerville + Work Sans

Reglas:

- los encabezados deben sentirse deliberados y grandes
- el cuerpo del texto debe mantenerse cómodo para lecturas largas
- las etiquetas de referencia y las insignias deben usar texto sans más pequeño y denso

## Diseño

Estructura recomendada:

- una navegación lateral o superior fija para informes largos
- un resumen hero fuerte al inicio
- secciones tipo panel o papel para cada tema principal
- cuadrículas de tarjetas multicolumna para comparaciones y fortalezas
- texto de cuerpo en una sola columna para hallazgos y recomendaciones

Usar espaciado generoso. Los informes técnicos extensos necesitan aire.

## Color

Preferir fondos apagados tipo papel con un acento cálido y un contrapeso frío.

Categorías de tokens sugeridas:

- `--bg`
- `--paper`
- `--ink`
- `--muted`
- `--line`
- `--accent`
- `--good`
- `--warn`
- `--bad`

El acento debe resaltar la navegación, las insignias y las etiquetas importantes. No dejar que los colores de acento dominen el cuerpo del texto.

## Elementos de UI útiles

Incluir estilos pequeños reutilizables para:

- métricas de resumen
- insignias
- citas o llamadas de atención
- tarjetas de hallazgos
- etiquetas de severidad
- etiquetas de referencia
- tarjetas de comparación
- secciones responsivas de dos columnas

## Movimiento

Mantener el movimiento sobrio.

Bien:

- fundido/deslizamiento suave en la primera carga
- respuesta al hover en elementos de navegación o tarjetas

Mal:

- animación constante
- manchas flotantes
- movimiento decorativo sin beneficio de lectura

## Presentación del contenido

Incluso cuando el usuario quiera pulido de diseño, la claridad sigue siendo lo principal.

Buena estructura para informes largos:

1. resumen ejecutivo
2. qué cambió
3. explicación tutorial
4. fortalezas
5. hallazgos
6. comparaciones
7. recomendación

Los encabezados exactos pueden cambiar. Lo importante es separar la explicación del juicio.

## Referencias

Las etiquetas de referencia deben ser visualmente discretas pero fáciles de identificar.

Buen patrón:

- texto pequeño apagado
- monoespaciada o sans compacta
- mantenerlas cerca del párrafo al que acompañan

## Uso del starter

Si se necesita una base pulida rápida, comenzar desde:

- `assets/html-report-starter.html`

Personalizar:

- fuentes
- tokens de color
- texto hero
- orden de secciones
- densidad de tarjetas

No conservar las secciones de marcador si no encajan con el informe real.
