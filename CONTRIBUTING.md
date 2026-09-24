# Guía de contribución

¡Gracias por querer contribuir!

Apreciamos mucho tanto las correcciones pequeñas como los cambios grandes bien pensados.

## Dos caminos para que tu pull request sea aceptado

### Camino 1: Cambios pequeños y enfocados (la forma más rápida de hacer merge)

- Elige **una** cosa clara para corregir/mejorar
- Toca la **menor cantidad posible de archivos**
- Asegúrate de que el cambio sea muy específico y fácil de revisar
- Todos los checks automatizados pasan (incluidos los comentarios de Greptile)
- Sin nuevas fallas de lint/pruebas

Estos casi siempre se hacen merge rápido cuando están limpios.

### Camino 2: Cambios grandes o de impacto

- **Primero** háblalo en Discord → canal #dev  
  → Describe lo que intentas resolver  
  → Comparte ideas / enfoque aproximados
- Una vez haya un acuerdo aproximado, constrúyelo
- En tu PR incluye:
  - Capturas de pantalla Antes / Después (o video corto si cambia la UI/el comportamiento)
  - Descripción clara del qué y el por qué
  - Prueba de que funciona (notas de pruebas manuales)
  - Todas las pruebas pasando
  - Todos los comentarios de Greptile y demás PR abordados

Los PR que siguen este camino tienen **mucha** más probabilidad de ser aceptados, incluso cuando son grandes.

## Reglas generales (ambos caminos)

- Escribe mensajes de commit claros
- Mantén el título + la descripción del PR significativos
- Un PR = un cambio lógico (a menos que sea un grupo pequeño relacionado)
- Ejecuta las pruebas en local primero
- Sé amable en las discusiones 😄

## Cómo escribir un buen mensaje de PR

Incluye un "camino de pensamiento" (thinking path) al inicio de tu mensaje de PR que explique desde lo alto del proyecto hasta lo que corregiste. P. ej.:

### Ejemplo 1 de camino de pensamiento:

> - Paperclip orquesta agentes de IA para empresas sin humanos
> - Hay muchos tipos de adaptadores para cada proveedor de modelos LLM
> - Pero los LLM tienen un límite de contexto y no todos los agentes pueden compactar su contexto automáticamente
> - Así que necesitamos una configuración específica por adaptador para cuáles adaptadores pueden y no pueden compactar su contexto automáticamente
> - Este pull request agrega configuración de compactación por adaptador, ya sea auto o gestionada por Paperclip
> - De esa forma obtenemos el rendimiento óptimo de cualquier adaptador/proveedor en Paperclip

### Ejemplo 2 de camino de pensamiento:

> - Paperclip orquesta agentes de IA para empresas sin humanos
> - Pero los humanos quieren ver a los agentes y supervisar su trabajo
> - Los usuarios humanos también operan en equipos y por eso necesitan sus propios logins, perfiles, vistas, etc.
> - Así que tenemos un sistema multiusuario para humanos
> - Pero los humanos quieren poder actualizar su propia foto de perfil y avatar
> - Pero el formulario de subida de avatar no guardaba el avatar en el sistema de almacenamiento de archivos
> - Así que este PR corrige el formulario de subida de avatar para que use el servicio de almacenamiento de archivos
> - El beneficio es que no tenemos un almacenamiento de archivos de un solo uso para solo un aspecto del sistema, lo que causaría confusión y configuración extra

Luego incluye el resto de tu mensaje de PR normal después del camino de pensamiento.

Esto debe incluir detalles sobre lo que hiciste, por qué lo hiciste, por qué importa y los beneficios, cómo podemos verificar que funciona y cualquier riesgo.

Incluye capturas de pantalla si es posible si tienes un cambio visible. (usa algo como la [habilidad agent-browser](https://github.com/vercel-labs/agent-browser/blob/main/skills/agent-browser/SKILL.md) o similar para tomar capturas). Idealmente, incluye capturas de antes y después.

¿Preguntas? Solo pregunta en #dev — estamos felices de ayudar.

¡Feliz hacking!
