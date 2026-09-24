# Crear una empresa desde un repositorio existente

Cuando un usuario proporciona un repositorio git (URL, ruta local o tuit con enlace a un repositorio), analízalo y crea un paquete de empresa que envuelva su contenido.

## Pasos de análisis

1. **Clona o lee el repositorio** — usa `git clone` para URLs, lee directamente para rutas locales
2. **Busca archivos existentes de agentes/habilidades** — busca SKILL.md, AGENTS.md, CLAUDE.md, directorios .claude/ o configuraciones de agente similares
3. **Comprende el propósito del repositorio** — lee README, package.json y los archivos fuente principales para entender qué hace el proyecto
4. **Identifica roles naturales de agentes** — según la estructura y el propósito del repositorio, determina qué agentes serían útiles

## Manejo de habilidades existentes

Muchos repositorios ya contienen habilidades (archivos SKILL.md). Cuando las encuentres:

**Comportamiento predeterminado: usa referencias, no copias.**

En lugar de copiar el contenido de las habilidades en tu paquete de empresa, crea una referencia de fuente:

```yaml
metadata:
  sources:
    - kind: github-file
      repo: owner/repo
      path: path/to/SKILL.md
      commit: <get the current HEAD commit SHA>
      attribution: <repo owner or org name>
      license: <from repo's LICENSE file>
      usage: referenced
```

Para obtener el SHA del commit:
```bash
git ls-remote https://github.com/owner/repo HEAD
```

Incluye (vendor) habilidades solo cuando:
- El usuario pide explícitamente copiarlas
- La habilidad es muy pequeña y está estrechamente acoplada a la empresa
- El repositorio fuente es privado o puede dejar de estar disponible

## Manejo de configuraciones de agente existentes

Si el repositorio tiene configuraciones de agente (CLAUDE.md, directorios .claude/, configuraciones de codex, etc.):
- Úsalas como inspiración para las instrucciones de AGENTS.md
- No las copies textualmente: adáptalas al formato de Agent Companies
- Preserva la intención y las instrucciones clave

## Habilidades solo de repositorio (sin agentes)

Cuando un repositorio contiene solo habilidades y ningún agente:
- Crea agentes que usarían naturalmente esas habilidades
- Los agentes deben ser mínimos: lo suficiente para dar a las habilidades un contexto de ejecución
- Un solo agente puede usar varias habilidades del repositorio
- Nombra a los agentes según el dominio que cubren las habilidades

Ejemplo: un repositorio con habilidades `code-review`, `testing` y `deployment` podría convertirse en:
- Un agente "Lead Engineer" con las tres habilidades
- O agentes separados "Reviewer", "QA Engineer" y "DevOps" si las habilidades son lo suficientemente distintas

## Patrones comunes de repositorios

### Repositorios de herramientas de desarrollo / CLI
- Crea agentes para los casos de uso principales de la herramienta
- Referencia cualquier habilidad existente
- Agrega un agente encargado del proyecto o un agente líder

### Repositorios de bibliotecas / frameworks
- Crea agentes para desarrollo, pruebas y documentación
- Las habilidades del repositorio se convierten en capacidades de los agentes

### Repositorios de aplicaciones completas
- Mapea a departamentos: ingeniería, producto, QA
- Crea una estructura de equipo ligera apropiada al tamaño del proyecto

### Repositorios de colecciones de habilidades (p. ej., repositorios de skills.sh)
- Cada habilidad o grupo de habilidades obtiene un agente
- Crea un envoltorio ligero de empresa o equipo
- Mantén la cantidad de agentes proporcional a la diversidad de habilidades
