# Lista de verificación de auditoría de mantenimiento de la documentación

Usar esta lista al auditar cada documento objetivo. Para cada elemento, comparar con el resumen de cambios del historial de git.

## README.md

### Tabla de funciones
- [ ] Cada tarjeta de función refleja una capacidad ya publicada
- [ ] Sin tarjetas de funciones para cosas que aún no existen
- [ ] Sin funciones principales publicadas ausentes de la tabla

### Hoja de ruta
- [ ] Nada listado como «planned» o «coming soon» que ya se haya publicado
- [ ] Sin elementos eliminados/cancelados aún listados
- [ ] Los elementos reflejan las prioridades actuales (contrastar con PR recientes)

### Inicio rápido
- [ ] El comando `npx paperclipai onboard` es correcto
- [ ] Los pasos de instalación manual son correctos (URL de clonación, comandos)
- [ ] Los requisitos previos (versión de Node, versión de pnpm) están actualizados
- [ ] La URL del servidor y el puerto son correctos

### Sección «Qué es Paperclip»
- [ ] La descripción general es precisa
- [ ] La tabla de pasos (Define goal / Hire team / Approve and run) es correcta

### Tabla «Funciona con»
- [ ] Todos los adaptadores/runtimes soportados están listados
- [ ] Sin adaptadores eliminados aún listados
- [ ] Los logos y etiquetas coinciden con los nombres actuales de los adaptadores

### «Paperclip es para ti si»
- [ ] Los casos de uso siguen siendo precisos
- [ ] Sin afirmaciones sobre capacidades que no existen

### «Por qué Paperclip es especial»
- [ ] Las afirmaciones técnicas son precisas (ejecución atómica, gobernanza, etc.)
- [ ] Sin funciones listadas que se hayan eliminado o cambiado significativamente

### FAQ
- [ ] Las respuestas siguen siendo correctas
- [ ] Sin referencias a funciones eliminadas o comportamientos obsoletos

### Sección de desarrollo
- [ ] Los comandos son correctos (`pnpm dev`, `pnpm build`, etc.)
- [ ] El enlace a DEVELOPING.md es correcto

## doc/SPEC.md

### Modelo de empresa
- [ ] Los campos coinciden con el esquema actual
- [ ] La descripción del modelo de gobernanza es precisa

### Modelo de agente
- [ ] Los tipos de adaptador coinciden con lo realmente soportado
- [ ] La descripción de la configuración del agente es precisa
- [ ] Sin funciones descritas como «not supported» o «not V1» que ya se hayan publicado

### Modelo de tareas
- [ ] La descripción de la jerarquía de tareas es precisa
- [ ] Los valores de estado coinciden con la implementación actual

### Extensiones / Plugins
- [ ] Si los plugins están publicados, sin lenguaje de «not in V1» o «future»
- [ ] La descripción del modelo de plugins coincide con la implementación

### Preguntas abiertas
- [ ] Las preguntas resueltas se eliminaron o actualizaron
- [ ] Sin elementos «TBD» ya decididos

## doc/PRODUCT.md

### Conceptos principales
- [ ] Descripciones de Company, Employees, Task Management precisas
- [ ] Modos de Agent Execution descritos correctamente
- [ ] Sin conceptos principales faltantes

### Principios
- [ ] Los principios no han sido contradichos por funciones publicadas
- [ ] Sin principios que referencien capacidades eliminadas

### Flujo de usuario
- [ ] El escenario ideal aún refleja la incorporación real
- [ ] Los pasos son alcanzables con las funciones actuales
