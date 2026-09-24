# ClipHub — El registro de empresas

**Descarga una empresa.**

ClipHub es el registro público donde las personas comparten, descubren y descargan configuraciones de empresas de Paperclip. Una plantilla de empresa es un artefacto portable que contiene una org entera — agentes, estructura de reporte, configuraciones de adaptadores, definiciones de roles, tareas semilla — lista para arrancar con un comando.

---

## Qué es

ClipHub es para Paperclip lo que un registro de paquetes es para un lenguaje de programación. Paperclip ya soporta configuraciones de org exportables (consulta [SPEC.md](./SPEC.md) §2). ClipHub es el directorio público donde viven esas exportaciones.

Un usuario construye una empresa funcional en Paperclip — una tienda de dev, una agencia de marketing, un laboratorio de investigación, un estudio de contenido — exporta la plantilla y la publica en ClipHub. Cualquiera puede explorar, buscar, descargar y arrancar esa empresa en su propia instancia de Paperclip.

El tagline: **literalmente puedes descargar una empresa.**

---

## Qué se publica

Un paquete de ClipHub es una **exportación de plantilla de empresa** — el formato de artefacto portable definido en la especificación de Paperclip. Contiene:

| Componente | Descripción |
|---|---|
| **Metadatos de empresa** | Nombre, descripción, caso de uso previsto, categoría |
| **Organigrama** | Jerarquía de reporte completa — quién reporta a quién |
| **Definiciones de agentes** | Cada agente: nombre, rol, título, descripción de capacidades |
| **Configuraciones de adaptadores** | Tipo de adaptador y configuración por agente (SOUL.md, HEARTBEAT.md, CLAUDE.md, comandos de proceso, URLs de webhook — lo que el adaptador necesite) |
| **Tareas semilla** | Tareas e iniciativas iniciales opcionales para arrancar la primera ejecución de la empresa |
| **Valores de presupuesto por defecto** | Presupuestos sugeridos de token/costo por agente y por empresa |

Las plantillas son **estructura, no estado.** Sin tareas en curso, sin datos históricos de costo, sin artefactos de runtime. Solo el blueprint.

### Subpaquetes

No todo caso de uso necesita una empresa entera. ClipHub también soporta publicar componentes individuales:

- **Plantillas de agente** — una sola configuración de agente (p. ej., "Senior TypeScript Engineer", "SEO Content Writer", "DevOps Agent")
- **Plantillas de equipo** — un subárbol del organigrama (p. ej., "Equipo de marketing: CMO + 3 reportes", "Pod de ingeniería: Tech Lead + 4 Engineers")
- **Configuraciones de adaptador** — configuraciones de adaptador reutilizables independientes de cualquier rol de agente específico

Estos pueden mezclarse en empresas existentes. Descarga un agente, colócalo en tu org, asígnale un manager, listo.

---

## Funciones centrales

### Explorar y descubrir

La homepage muestra empresas en varias dimensiones:

- **Destacadas** — plantillas de alta calidad curadas editorialmente
- **Populares** — rankeadas por descargas, estrellas y forks
- **Recientes** — últimas publicadas o actualizadas
- **Categorías** — explorables por caso de uso (consulta Categorías abajo)

Cada listado muestra: nombre, descripción corta, tamaño de org (conteo de agentes), categoría, tipos de adaptador usados, conteo de estrellas, conteo de descargas y una mini vista previa del organigrama.

### Búsqueda

La búsqueda es **semántica, no solo por palabras clave.** Impulsada por embeddings vectoriales para que puedas buscar por intención:

- "marketing agency that runs facebook ads" → encuentra plantillas de empresa relevantes aunque esas palabras exactas no estén en el título
- "small dev team for building APIs" → encuentra orgs de ingeniería ligeras
- "content pipeline with writers and editors" → encuentra estudios de contenido

También soporta filtrar por: categoría, rango de conteo de agentes, tipos de adaptador, conteo de estrellas, recencia.

### Página de detalle de empresa

Al hacer clic en una plantilla de empresa se muestra:

- **Descripción completa** — qué hace esta empresa, cómo opera, qué esperar
- **Organigrama interactivo** — árbol visual de cada agente con rol, título y capacidades
- **Lista de agentes** — detalles expandibles para cada agente (tipo de adaptador, resumen de configuración, descripción de rol)
- **Tareas semilla** — las iniciativas y tareas iniciales incluidas
- **Resumen de presupuesto** — estructura de costo sugerida
- **Comando de instalación** — comando CLI de una línea para descargar y crear
- **Historial de versiones** — changelog, semver, versiones anteriores disponibles
- **Comunidad** — estrellas, comentarios, conteo de forks

### Instalar y hacer fork

Dos formas de usar una plantilla:

**Instalar (empezar de cero):**
```
paperclip install cliphub:<publisher>/<company-slug>
```
Descarga la plantilla y crea una nueva empresa en tu instancia local de Paperclip. Agregas tus propias API keys, defines presupuestos, personalizas agentes y lo pones en marcha.

**Hacer fork:**
Hacer fork crea una copia de la plantilla bajo tu propia cuenta de ClipHub. Puedes modificarla, republicarla como tu propia variante, y el linaje del fork se rastrea. Esto permite mejora evolutiva — alguien publica una agencia de marketing, tú haces fork, agregas un equipo de redes sociales, republicas.

### Estrellas y comentarios

- **Estrellas** — marca y señala calidad. El conteo de estrellas es una señal de ranking principal.
- **Comentarios** — discusión hilada en cada listado. Haz preguntas, comparte resultados, sugiere mejoras.

### Conteos de descarga y señales

Cada instalación se cuenta. El registro rastrea:

- Descargas totales (todo el tiempo)
- Descargas por versión
- Conteo de forks
- Conteo de estrellas

Estas señales alimentan el ranking de búsqueda y el descubrimiento.

---

## Publicar

### Quién puede publicar

Cualquiera con una cuenta de GitHub puede publicar en ClipHub. La autenticación es vía GitHub OAuth.

### Cómo publicar

Desde Paperclip, exporta tu empresa como plantilla, luego publica:

```
paperclip export --template my-company
paperclip publish cliphub my-company
```

O usa la UI web para subir una exportación de plantilla directamente.

### Qué provees

Al publicar, especificas:

| Campo | Requerido | Descripción |
|---|---|---|
| `slug` | sí | Identificador seguro para URL (p. ej., `lean-dev-shop`) |
| `name` | sí | Nombre visible |
| `description` | sí | Qué hace esta empresa y para quién es |
| `category` | sí | Categoría principal (ver abajo) |
| `tags` | no | Tags adicionales para descubrimiento |
| `version` | sí | Semver (p. ej., `1.0.0`) |
| `changelog` | no | Qué cambió en esta versión |
| `readme` | no | Documentación extendida (markdown) |
| `license` | no | Términos de uso |

### Versionado

Las plantillas usan versionado semántico. Cada publicación crea una versión inmutable. Los usuarios pueden instalar cualquier versión o usar `latest` por defecto. El historial de versiones y los changelogs son visibles en la página de detalle.

### El comando `sync`

Para usuarios avanzados que mantienen múltiples plantillas:

```
paperclip cliphub sync
```

Escanea tus plantillas exportadas locales y publica las que sean nuevas o estén actualizadas. Útil para mantener un portafolio de plantillas de empresa desde un solo repo.

---

## Categorías

Las plantillas de empresa se organizan por caso de uso:

| Categoría | Ejemplos |
|---|---|
| **Desarrollo de software** | Tienda de dev full-stack, equipo de desarrollo de APIs, estudio de apps móviles |
| **Marketing y crecimiento** | Agencia de marketing de performance, equipo de marketing de contenido, tienda de SEO |
| **Contenido y medios** | Estudio de contenido, producción de podcast, operación de newsletter |
| **Investigación y análisis** | Firma de investigación de mercado, inteligencia competitiva, análisis de datos |
| **Operaciones** | Org de soporte al cliente, equipo de ops interno, tienda de QA/testing |
| **Ventas** | Equipo de ventas outbound, generación de leads, gestión de cuentas |
| **Finanzas y legal** | Servicio de contabilidad, monitoreo de cumplimiento, análisis financiero |
| **Creativo** | Agencia de diseño, estudio de copywriting, desarrollo de marca |
| **Propósito general** | Plantillas iniciales, orgs mínimas, configuraciones de un solo agente |

Las categorías no son exclusivas — una plantilla puede tener una categoría principal más tags para preocupaciones transversales.

---

## Moderación y confianza

### Publicadores verificados

Los publicadores que cumplen ciertos umbrales (antigüedad de cuenta, plantillas publicadas con buenas señales) ganan una insignia de verificado. Las plantillas verificadas rankean más alto en búsqueda.

### Revisión de seguridad

Las plantillas de empresa contienen configuraciones de adaptador, que pueden incluir comandos ejecutables (adaptador de proceso) o URLs de webhook (adaptador HTTP). El sistema de moderación:

1. **Escaneo automatizado** — revisa configuraciones de adaptador en busca de patrones sospechosos (ejecución arbitraria de código, URLs de exfiltración, cosecha de credenciales)
2. **Reporte comunitario** — cualquier usuario con sesión iniciada puede marcar una plantilla. Auto-oculta después de múltiples reportes pendiente de revisión.
3. **Revisión manual** — los moderadores pueden aprobar, rechazar o solicitar cambios

### Puerta de cuenta

Las cuentas nuevas tienen un período de espera antes de poder publicar. Esto evita spam oportunista.

---

## Arquitectura

ClipHub es un **servicio separado** de Paperclip mismo. Paperclip es autoalojado; ClipHub es un registro alojado con el que hablan las instancias de Paperclip.

### Puntos de integración

| Capa | Rol |
|---|---|
| **ClipHub Web** | Explorar, buscar, descubrir, comentar, dar estrellas — el sitio web |
| **ClipHub API** | API de registro para publicar, descargar, buscar programáticamente |
| **Paperclip CLI** | `paperclipai install`, `paperclipai publish`, `paperclipai cliphub sync` — integrados en Paperclip |
| **Paperclip UI** | Panel "Explorar ClipHub" en la UI web de Paperclip para descubrir plantillas sin salir de la app |

### Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite (consistente con Paperclip) |
| Backend | TypeScript + Hono (consistente con Paperclip) |
| Base de datos | PostgreSQL |
| Búsqueda | Embeddings vectoriales para búsqueda semántica |
| Autenticación | GitHub OAuth |
| Almacenamiento | Zips de plantillas almacenados en almacenamiento de objetos (S3 o equivalente) |

### Modelo de datos (bosquejo)

```
Publisher
  id, github_id, username, display_name, verified, created_at

Template
  id, publisher_id, slug, name, description, category,
  tags[], readme, license, created_at, updated_at,
  star_count, download_count, fork_count,
  forked_from_id (nullable)

Version
  id, template_id, version (semver), changelog,
  artifact_url (zip), agent_count, adapter_types[],
  created_at

Star
  id, publisher_id, template_id, created_at

Comment
  id, publisher_id, template_id, body, parent_id (nullable),
  created_at, updated_at

Report
  id, reporter_id, template_id, reason, created_at
```

---

## Flujos de usuario

### "Quiero iniciar una empresa"

1. Abre ClipHub, explora por categoría o busca "dev shop for building SaaS"
2. Encuentra una plantilla que encaje — "Lean SaaS Dev Shop (CEO + CTO + 3 Engineers)"
3. Lee la descripción, inspecciona el organigrama, revisa los comentarios
4. Ejecuta `paperclipai install cliphub:acme/lean-saas-shop`
5. Paperclip crea la empresa en local con todos los agentes preconfigurados
6. Define tus API keys, ajusta presupuestos, agrega tus tareas iniciales
7. Ponlo en marcha

### "Construí algo genial y quiero compartirlo"

1. Construye e itera en una empresa en Paperclip hasta que funcione bien
2. Exporta: `paperclipai export --template my-agency`
3. Publica: `paperclipai publish cliphub my-agency`
4. Completa descripción, categoría, tags en la UI web
5. La plantilla está en vivo — otros pueden encontrarla e instalarla

### "Quiero mejorar la empresa de alguien más"

1. Encuentra una plantilla en ClipHub cercana a lo que necesitas
2. Haz fork a tu cuenta
3. Instala tu fork en local, modifica la org (agrega agentes, cambia configuraciones, reestructura equipos)
4. Exporta y republica como tu propia variante
5. Linaje de fork visible tanto en la original como en tu versión

### "Solo necesito un gran agente, no una empresa entera"

1. Busca plantillas de agente en ClipHub: "senior python engineer"
2. Encuentra una configuración de agente bien estrellada
3. Instala solo ese agente: `paperclipai install cliphub:acme/senior-python-eng --agent`
4. Asígnalo a un manager en tu empresa existente
5. Listo

---

## Relación con Paperclip

ClipHub **no es requerido** para usar Paperclip. Puedes construir empresas enteramente desde cero sin tocar nunca ClipHub. Pero ClipHub baja dramáticamente la barrera de entrada:

- **Usuarios nuevos** obtienen una empresa funcional en minutos en lugar de horas
- **Usuarios experimentados** comparten configuraciones probadas con la comunidad
- **El ecosistema** se compone — cada buena plantilla hace la siguiente empresa más fácil de construir

ClipHub es para Paperclip lo que un registro de paquetes es para un runtime de lenguaje: opcional, pero transformador.

---

## Alcance V1

### Debe tener

- [ ] Publicación de plantillas (subida vía CLI o web)
- [ ] Exploración de plantillas (lista, filtro por categoría)
- [ ] Página de detalle de plantilla (descripción, organigrama, lista de agentes, comando de instalación)
- [ ] Búsqueda semántica (embeddings vectoriales)
- [ ] Comando CLI `paperclipai install cliphub:<publisher>/<slug>`
- [ ] Autenticación GitHub OAuth
- [ ] Estrellas
- [ ] Conteos de descarga
- [ ] Versionado (semver, historial de versiones)
- [ ] Moderación básica (reporte comunitario, auto-ocultado)

### V2

- [ ] Comentarios / discusión hilada
- [ ] Forking con seguimiento de linaje
- [ ] Subpaquetes de agente y equipo
- [ ] Insignias de publicador verificado
- [ ] Escaneo automatizado de seguridad de configuraciones de adaptador
- [ ] Panel "Explorar ClipHub" en la UI web de Paperclip
- [ ] `paperclipai cliphub sync` para publicación masiva
- [ ] Perfiles y portafolios de publicador

### Fuera de alcance

- Plantillas pagadas / premium (todo es gratis y público, al menos inicialmente)
- Registros privados (puede ser una futura función empresarial)
- Ejecutar empresas en ClipHub (es un registro, no un runtime — consistente con la propia filosofía de Paperclip)
