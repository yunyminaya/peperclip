---
title: Importar y exportar empresas
summary: Exporta empresas a paquetes portátiles e impórtalas desde rutas locales o GitHub
---

Las empresas de Paperclip se pueden exportar a paquetes markdown portátiles e importar desde directorios locales o repositorios GitHub. Esto permite compartir configuraciones de empresas, duplicar configuraciones y controlar por versiones tus equipos de agentes.

## Formato del paquete

Los paquetes exportados siguen la [especificación Agent Companies](/companies/companies-spec) y usan una estructura markdown-first:

```text
my-company/
├── COMPANY.md          # Company metadata
├── agents/
│   ├── ceo/AGENT.md    # Agent instructions + frontmatter
│   └── cto/AGENT.md
├── projects/
│   └── main/PROJECT.md
├── skills/
│   └── review/SKILL.md
├── tasks/
│   └── onboarding/TASK.md
└── .paperclip.yaml     # Adapter config, env inputs, routines
```

- **COMPANY.md** define el nombre, la descripción y los metadatos de la empresa.
- Los archivos **AGENT.md** contienen la identidad, el rol y las instrucciones del agente.
- Los archivos **SKILL.md** son compatibles con el ecosistema Agent Skills.
- **.paperclip.yaml** contiene configuración específica de Paperclip (tipos de adaptador, env inputs, presupuestos) como sidecar opcional.

## Exportar una empresa

Exporta una empresa a una carpeta portátil:

```sh
paperclipai company export <company-id> --out ./my-export
```

### Opciones

| Opción | Descripción | Predeterminado |
|--------|-------------|----------|
| `--out <path>` | Directorio de salida (requerido) | — |
| `--include <values>` | Conjunto separado por comas: `company`, `agents`, `projects`, `issues`, `tasks`, `skills` | `company,agents` |
| `--skills <values>` | Exportar solo slugs de habilidades específicos | all |
| `--projects <values>` | Exportar solo shortnames o IDs de proyectos específicos | all |
| `--issues <values>` | Exportar identificadores o IDs de issues específicos | none |
| `--project-issues <values>` | Exportar issues pertenecientes a proyectos específicos | none |
| `--expand-referenced-skills` | Vendorizar contenidos de archivos de habilidades en lugar de mantener referencias upstream | `false` |

### Ejemplos

```sh
# Export company with agents and projects
paperclipai company export abc123 --out ./backup --include company,agents,projects

# Export everything including tasks and skills
paperclipai company export abc123 --out ./full-export --include company,agents,projects,tasks,skills

# Export only specific skills
paperclipai company export abc123 --out ./skills-only --include skills --skills review,deploy
```

### Qué se exporta

- Nombre, descripción y metadatos de la empresa
- Nombres, roles, estructura de reportes e instrucciones de los agentes
- Definiciones de proyectos y configuración del workspace
- Descripciones de tareas/issues (cuando se incluyen)
- Paquetes de habilidades (como referencias o contenido vendorizado)
- Declaraciones de tipo de adaptador y env inputs en `.paperclip.yaml`

Los valores secretos, las rutas locales de máquina y los IDs de base de datos **nunca** se exportan.

## Importar una empresa

Importa desde un directorio local, una URL de GitHub o la abreviatura de GitHub:

```sh
# From a local folder
paperclipai company import ./my-export

# From a GitHub URL
paperclipai company import https://github.com/org/repo

# From a GitHub subfolder
paperclipai company import https://github.com/org/repo/tree/main/companies/acme

# From GitHub shorthand
paperclipai company import org/repo
paperclipai company import org/repo/companies/acme
```

### Opciones

| Opción | Descripción | Predeterminado |
|--------|-------------|----------|
| `--target <mode>` | `new` (crear una nueva empresa) u `existing` (fusionar en una existente) | inferido del contexto |
| `--company-id <id>` | ID de empresa destino para `--target existing` | contexto actual |
| `--new-company-name <name>` | Anular nombre de empresa para `--target new` | del paquete |
| `--include <values>` | Conjunto separado por comas: `company`, `agents`, `projects`, `issues`, `tasks`, `skills` | auto-detected |
| `--agents <list>` | Slugs de agentes separados por comas a importar, o `all` | `all` |
| `--collision <mode>` | Cómo manejar conflictos de nombre: `rename`, `skip` o `replace` | `rename` |
| `--ref <value>` | Git ref para importaciones de GitHub (rama, tag o commit) | default branch |
| `--dry-run` | Vista previa de lo que se importaría sin aplicar | `false` |
| `--yes` | Omitir el prompt de confirmación interactivo | `false` |
| `--json` | Generar resultado como JSON | `false` |

### Modos de destino

- **`new`** — Crea una empresa nueva desde el paquete. Útil para duplicar una plantilla de empresa.
- **`existing`** — Fusiona el paquete en una empresa existente. Usa `--company-id` para especificar el destino.

Si no se especifica `--target`, Paperclip lo infiere: si se proporciona un `--company-id` (o existe uno en contexto), por defecto es `existing`; de lo contrario, `new`.

### Estrategias de colisión

Al importar en una empresa existente, los nombres de agentes o proyectos pueden entrar en conflicto con los existentes:

- **`rename`** (por defecto) — Añade un sufijo para evitar conflictos (p. ej. `ceo` pasa a ser `ceo-2`).
- **`skip`** — Omite entidades que ya existen.
- **`replace`** — Sobrescribe entidades existentes. Solo disponible para importaciones no seguras (no disponible a través de la API del CEO).

### Selección interactiva

Al ejecutar interactivamente (sin flags `--yes` o `--json`), el comando de importación muestra un selector antes de aplicar. Puedes elegir exactamente qué agentes, proyectos, habilidades y tareas importar usando una interfaz de casillas de verificación.

### Vista previa antes de aplicar

Siempre haz una vista previa con `--dry-run`:

```sh
paperclipai company import org/repo --target existing --company-id abc123 --dry-run
```

La vista previa muestra:
- **Contenidos del paquete** — Cuántos agentes, proyectos, tareas y habilidades hay en la fuente
- **Plan de importación** — Qué se creará, renombrará, omitirá o reemplazará
- **Env inputs** — Variables de entorno que pueden necesitar valores después de la importación
- **Advertencias** — Problemas potenciales como habilidades faltantes o referencias sin resolver

Los agentes importados siempre llegan con los latidos de temporizador deshabilitados. El comportamiento de activación por asignación/bajo demanda del paquete se conserva, pero las ejecuciones programadas permanecen apagadas hasta que un operador del tablero las rehabilite.

### Flujos de trabajo comunes

**Clonar una plantilla de empresa desde GitHub:**

```sh
paperclipai company import org/company-templates/engineering-team \
  --target new \
  --new-company-name "My Engineering Team"
```

**Agregar agentes desde un paquete a tu empresa existente:**

```sh
paperclipai company import ./shared-agents \
  --target existing \
  --company-id abc123 \
  --include agents \
  --collision rename
```

**Importar una rama o tag específico:**

```sh
paperclipai company import org/repo --ref v2.0.0 --dry-run
```

**Importación no interactiva (CI/scripts):**

```sh
paperclipai company import ./package \
  --target new \
  --yes \
  --json
```

## Endpoints de API

Los comandos CLI usan estos endpoints de API internamente:

| Acción | Endpoint |
|--------|----------|
| Exportar empresa | `POST /api/companies/{companyId}/export` |
| Vista previa de importación (empresa existente) | `POST /api/companies/{companyId}/imports/preview` |
| Aplicar importación (empresa existente) | `POST /api/companies/{companyId}/imports/apply` |
| Vista previa de importación (nueva empresa) | `POST /api/companies/import/preview` |
| Aplicar importación (nueva empresa) | `POST /api/companies/import` |

Los agentes CEO también pueden usar las rutas de importación segura (`/imports/preview` e `/imports/apply`) que aplican reglas no destructivas: `replace` se rechaza, las colisiones se resuelven con `rename` o `skip`, y los issues siempre se crean como nuevos.

## Fuentes de GitHub

Paperclip admite varios formatos de URL de GitHub:

- URL completa: `https://github.com/org/repo`
- URL de subcarpeta: `https://github.com/org/repo/tree/main/path/to/company`
- Abreviatura: `org/repo`
- Abreviatura con ruta: `org/repo/path/to/company`

Usa `--ref` para fijar una rama, tag o hash de commit específico al importar desde GitHub.
