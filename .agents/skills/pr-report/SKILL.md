---
name: pr-report
description: >
  Review a pull request or contribution deeply, explain it tutorial-style for a
  maintainer, and produce a polished report artifact such as HTML or Markdown.
  Use when asked to analyze a PR, explain a contributor's design decisions,
  compare it with similar systems, or prepare a merge recommendation.
---

# Habilidad de informe de PR

Producir una revisión de calidad de mantenedor de un PR, rama o contribución grande.

Postura predeterminada:

- entender el cambio antes de juzgarlo
- explicar el sistema tal como fue construido, no solo el diff
- separar los problemas arquitectónicos de las objeciones de alcance del producto
- dar una recomendación concreta, no una impresión vaga

## Cuándo usar

Usar esta habilidad cuando el usuario pida cosas como:

- «revisa este PR a fondo»
- «explícame esta contribución»
- «hazme un informe o una página web de este PR»
- «compara este diseño con sistemas similares»
- «¿debería fusionarlo?»

## Salidas

Salidas comunes:

- informe HTML independiente en `tmp/reports/...`
- informe Markdown en `report/` u otra carpeta solicitada
- resumen breve de mantenedor en el chat

Si el usuario pide una página web, construir un artefacto HTML independiente pulido con secciones claras y jerarquía visual legible.

Recursos incluidos con esta habilidad:

- `references/style-guide.md` para dirección visual y reglas de presentación del informe
- `assets/html-report-starter.html` como base reutilizable de HTML/CSS independiente

## Flujo de trabajo

### 1. Adquirir y encuadrar el objetivo

Trabajar desde el código local cuando sea posible, no solo desde la página del PR en GitHub.

Recopilar:

- rama objetivo o worktree
- tamaño del diff y subsistemas modificados
- documentación del repo, especificaciones e invariantes relevantes
- intención del contribuidor si está documentada en el texto del PR o en documentos de diseño

Comenzar respondiendo: ¿en qué está *intentando* convertirse este cambio?

### 2. Construir un modelo mental del sistema

No detenerse en notas archivo por archivo. Reconstruir el diseño:

- qué runtime o contrato nuevo existe
- qué capas cambiaron: db, tipos compartidos, servidor, UI, CLI, documentación
- ciclo de vida: instalación, arranque, ejecución, UI, fallos, deshabilitación
- límite de confianza: qué código se ejecuta dónde y con qué autoridad

Para contribuciones grandes, incluir una sección estilo tutorial que enseñe el sistema desde los primeros principios.

### 3. Revisar como un mantenedor

Los hallazgos primero. Ordenar por severidad.

Priorizar:

- regresiones de comportamiento
- brechas de confianza o seguridad
- abstracciones engañosas
- riesgos de ciclo de vida y operativos
- acoplamiento difícil de deshacer
- pruebas faltantes o afirmaciones no verificables

Citar siempre referencias concretas de archivos cuando sea posible.

### 4. Distinguir el tipo de objeción

Ser explícito sobre si una preocupación es de:

- dirección del producto
- arquitectura
- calidad de implementación
- estrategia de despliegue
- honestidad de la documentación

No ocultar una objeción arquitectónica dentro de una objeción de alcance.

### 5. Comparar con precedentes externos cuando sea necesario

Si la contribución introduce un concepto de framework o plataforma, compararlo con sistemas open source similares.

Al comparar:

- preferir la documentación oficial o la fuente
- enfocarse en los límites de extensión, el paso de contexto, el modelo de confianza y la propiedad de la UI
- extraer lecciones, no solo similitudes

Buenas preguntas de comparación:

- ¿Quién es dueño del ciclo de vida?
- ¿Quién es dueño de la composición de la UI?
- ¿El contexto es explícito o ambiental?
- ¿Los plugins son código confiable o código aislado (sandbox)?
- ¿Los puntos de extensión tienen nombre y tipo?

### 6. Hacer la recomendación accionable

No detenerse en «fusionar» o «no fusionar».

Elegir una:

- fusionar tal cual
- fusionar tras un rediseño específico
- rescatar piezas específicas
- conservar como investigación de diseño

Si se rechaza o se reduce, indicar qué se debe conservar.

Categorías útiles de recomendación:

- conservar el modelo de protocolo/tipos
- rediseñar el límite de la UI
- reducir la superficie inicial
- posponer la ejecución de terceros
- publicar primero un modelo de puntos de extensión propiedad del host

### 7. Construir el artefacto

Estructura sugerida del informe:

1. Resumen ejecutivo
2. Lo que el PR realmente agrega
3. Tutorial: cómo funciona el sistema
4. Fortalezas
5. Hallazgos principales
6. Comparaciones
7. Recomendación

Para informes HTML:

- usar tipografía y color intencionales
- facilitar la navegación en informes largos
- preferir encabezados de sección fuertes y etiquetas de referencia pequeñas
- evitar estilos genéricos de panel

Antes de construir desde cero, leer `references/style-guide.md`.
Si una base pulida rápida es útil, comenzar desde `assets/html-report-starter.html` y reemplazar el contenido de marcador con el informe real.

### 8. Verificar antes de entregar

Verificar:

- la ruta del artefacto existe
- los hallazgos aún coinciden con el código real
- cualquier cadena prohibida solicitada está ausente de la salida generada
- si no se ejecutaron pruebas, decirlo explícitamente

## Heurísticas de revisión

### Trabajo de plugins y plataformas

Vigilar de cerca:

- documentación que afirma aislamiento (sandboxing) mientras el runtime ejecuta procesos confiables del host
- estado global de módulo usado para contrabandear contexto de React
- dependencia oculta del orden de renderizado
- plugins que acceden a internos del host en lugar de usar APIs explícitas
- «capabilities» que en realidad son etiquetas de política sobre código totalmente confiable

### Buenas señales

- contratos tipados compartidos entre capas
- puntos de extensión explícitos
- ciclo de vida propiedad del host
- modelo de confianza honesto
- primer despliegue reducido con espacio para crecer

## Respuesta final

En el chat, resumir:

- dónde está el informe
- tu decisión general
- la una o dos razones principales
- si se omitieron la verificación o las pruebas

Mantener el resumen del chat más corto que el informe.
