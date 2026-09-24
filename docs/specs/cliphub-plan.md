# ClipHub: Marketplace para configuraciones de equipos de Paperclip

> Nota de reemplazo: este plan de marketplace es anterior a la dirección de paquetes de empresa markdown-first. Para el plan actual de despliegue del formato de paquete e importación/exportación, ver `doc/plans/2026-03-13-company-import-export-v2.md` y `docs/companies/companies-spec.md`.

> La "tienda de aplicaciones" para equipos de IA de empresas completas: configuraciones prearmadas de Paperclip, blueprints de agentes, habilidades y plantillas de gobernanza que producen trabajo real desde el día uno.

## 1. Visión y posicionamiento

**ClipHub** vende **configuraciones de equipos completos** — organigramas, roles de agentes, flujos de trabajo entre agentes, reglas de gobernanza y plantillas de proyectos — para empresas gestionadas por Paperclip.

| Dimensión | ClipHub |
|---|---|
| Unidad de venta | Blueprint de equipo (organización multiagente) |
| Comprador | Fundador / líder de equipo creando una empresa de IA |
| Objetivo de instalación | Empresa de Paperclip (agentes, proyectos, gobernanza) |
| Propuesta de valor | "Omite el diseño de la organización: obtén un equipo productivo en minutos" |
| Rango de precios | $0–$499 por blueprint (+ complementos individuales) |

---

## 2. Taxonomía de producto

### 2.1 Blueprints de equipo (producto principal)

Una configuración completa de empresa de Paperclip:

- **Organigrama**: agentes con roles, títulos, cadenas de reporte, capacidades
- **Configuraciones de agentes**: tipo de adaptador, modelo, plantillas de prompt, rutas de instrucciones
- **Reglas de gobernanza**: flujos de aprobación, límites de presupuesto, cadenas de escalamiento
- **Plantillas de proyectos**: proyectos preconfigurados con ajustes de workspace
- **Habilidades e instrucciones**: AGENTS.md / archivos de habilidad incluidos por agente

**Ejemplos:**
- "SaaS Startup Team" — CEO, CTO, Engineer, CMO, Designer ($199)
- "Content Agency" — Editor-in-Chief, 3 Writers, SEO Analyst, Social Manager ($149)
- "Dev Shop" — CTO, 2 Engineers, QA, DevOps ($99)
- "Solo Founder + Crew" — CEO agent + 3 ICs across eng/marketing/ops ($79)

### 2.2 Blueprints de agentes (agentes individuales dentro de un contexto de equipo)

Configuraciones de un solo agente diseñadas para conectarse a una organización de Paperclip:

- Definición de rol, plantilla de prompt, configuración del adaptador
- Expectativas de cadena de reporte (a quién reportan)
- Paquetes de habilidades incluidos
- Valores por defecto de gobernanza (presupuesto, permisos)

**Ejemplos:**
- "Staff Engineer" — ships production code, manages PRs ($29)
- "Growth Marketer" — content pipeline, SEO, social ($39)
- "DevOps Agent" — CI/CD, deployment, monitoring ($29)

### 2.3 Habilidades (capacidades modulares)

Archivos de habilidad portables que cualquier agente de Paperclip puede usar:

- Archivos de habilidad markdown con instrucciones
- Configuraciones de herramientas y scripts de shell
- Compatible con el sistema de carga de habilidades de Paperclip

**Ejemplos:**
- "Git PR Workflow" — creación y revisión estandarizada de PR (gratis)
- "Deployment Pipeline" — habilidad de deploy para Cloudflare/Vercel ($9)
- "Customer Support Triage" — clasificación y enrutamiento de tickets ($19)

### 2.4 Plantillas de gobernanza

Flujos de aprobación y políticas prearmadas:

- Umbrales de presupuesto y cadenas de aprobación
- Reglas de delegación entre equipos
- Procedimientos de escalamiento
- Estructuras de códigos de facturación

**Ejemplos:**
- "Startup Governance" — ligera, el CEO aprueba > $50 (gratis)
- "Enterprise Governance" — aprobación multinivel, registro de auditoría ($49)

---

## 3. Esquemas de datos

### 3.1 Listing

```typescript
interface Listing {
  id: string;
  slug: string;                    // URL-friendly identifier
  type: 'team_blueprint' | 'agent_blueprint' | 'skill' | 'governance_template';
  title: string;
  tagline: string;                 // Short pitch (≤120 chars)
  description: string;             // Markdown, full details

  // Pricing
  price: number;                   // Cents (0 = free)
  currency: 'usd';

  // Creator
  creatorId: string;
  creatorName: string;
  creatorAvatar: string | null;

  // Categorization
  categories: string[];            // e.g. ['saas', 'engineering', 'marketing']
  tags: string[];                  // e.g. ['claude', 'startup', '5-agent']
  agentCount: number | null;       // For team blueprints

  // Content
  previewImages: string[];         // Screenshots / org chart visuals
  readmeMarkdown: string;          // Full README shown on detail page
  includedFiles: string[];         // List of files in the bundle

  // Compatibility
  compatibleAdapters: string[];    // ['claude_local', 'codex_local', ...]
  requiredModels: string[];        // ['claude-opus-4-6', 'claude-sonnet-4-6']
  paperclipVersionMin: string;     // Minimum Paperclip version

  // Social proof
  installCount: number;
  rating: number | null;           // 1.0–5.0
  reviewCount: number;

  // Metadata
  version: string;                 // Semver
  publishedAt: string;
  updatedAt: string;
  status: 'draft' | 'published' | 'archived';
}
```

### 3.2 Team Blueprint Bundle

```typescript
interface TeamBlueprint {
  listingId: string;

  // Org structure
  agents: AgentBlueprint[];
  reportingChain: { agentSlug: string; reportsTo: string | null }[];

  // Governance
  governance: {
    approvalRules: ApprovalRule[];
    budgetDefaults: { role: string; monthlyCents: number }[];
    escalationChain: string[];     // Agent slugs in escalation order
  };

  // Projects
  projects: ProjectTemplate[];

  // Company-level config
  companyDefaults: {
    name: string;
    defaultModel: string;
    defaultAdapter: string;
  };
}

interface AgentBlueprint {
  slug: string;                     // e.g. 'cto', 'engineer-1'
  name: string;
  role: string;
  title: string;
  icon: string;
  capabilities: string;
  promptTemplate: string;
  adapterType: string;
  adapterConfig: Record<string, any>;
  instructionsPath: string | null;  // Path to AGENTS.md or similar
  skills: SkillBundle[];
  budgetMonthlyCents: number;
  permissions: {
    canCreateAgents: boolean;
    canApproveHires: boolean;
  };
}

interface ProjectTemplate {
  name: string;
  description: string;
  workspace: {
    cwd: string | null;
    repoUrl: string | null;
  } | null;
}

interface ApprovalRule {
  trigger: string;                  // e.g. 'hire_agent', 'budget_exceed'
  threshold: number | null;
  approverRole: string;
}
```

### 3.3 Creator / Seller

```typescript
interface Creator {
  id: string;
  userId: string;                   // Auth provider ID
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  website: string | null;
  listings: string[];               // Listing IDs
  totalInstalls: number;
  totalRevenue: number;             // Cents earned
  joinedAt: string;
  verified: boolean;
  payoutMethod: 'stripe_connect';
  stripeAccountId: string | null;
}
```

### 3.4 Purchase / Install

```typescript
interface Purchase {
  id: string;
  listingId: string;
  buyerUserId: string;
  buyerCompanyId: string | null;    // Target Paperclip company
  pricePaidCents: number;
  paymentIntentId: string | null;   // Stripe
  installedAt: string | null;       // When deployed to company
  status: 'pending' | 'completed' | 'refunded';
  createdAt: string;
}
```

### 3.5 Review

```typescript
interface Review {
  id: string;
  listingId: string;
  authorUserId: string;
  authorDisplayName: string;
  rating: number;                   // 1–5
  title: string;
  body: string;                     // Markdown
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Páginas y rutas

### 4.1 Páginas públicas

| Ruta | Página | Descripción |
|---|---|---|
| `/` | Página principal | Hero, blueprints destacados, habilidades populares, cómo funciona |
| `/browse` | Explorar marketplace | Cuadrícula filtrable de todos los listings |
| `/browse?type=team_blueprint` | Blueprints de equipo | Filtrado a configuraciones de equipo |
| `/browse?type=agent_blueprint` | Blueprints de agentes | Configuraciones de un solo agente |
| `/browse?type=skill` | Habilidades | Listings de habilidades |
| `/browse?type=governance_template` | Gobernanza | Plantillas de políticas |
| `/listings/:slug` | Detalle de listing | Página de producto completa |
| `/creators/:slug` | Perfil de creador | Bio, todos los listings, estadísticas |
| `/about` | Acerca de ClipHub | Misión, cómo funciona |
| `/pricing` | Precios y tarifas | Participación en ingresos del creador, información para compradores |

### 4.2 Páginas autenticadas

| Ruta | Página | Descripción |
|---|---|---|
| `/dashboard` | Panel de comprador | Artículos comprados, blueprints instalados |
| `/dashboard/purchases` | Historial de compras | Todas las transacciones |
| `/dashboard/installs` | Instalaciones | Blueprints desplegados con estado |
| `/creator` | Panel de creador | Gestión de listings, analítica |
| `/creator/listings/new` | Crear listing | Asistente de creación de listings de varios pasos |
| `/creator/listings/:id/edit` | Editar listing | Modificar un listing existente |
| `/creator/analytics` | Analítica | Ingresos, instalaciones, vistas |
| `/creator/payouts` | Pagos | Historial de pagos de Stripe Connect |

### 4.3 Rutas de API

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/listings` | Explorar listings (filtros: tipo, categoría, rango de precios, orden) |
| `GET` | `/api/listings/:slug` | Obtener detalle de listing |
| `POST` | `/api/listings` | Crear listing (autenticación de creador) |
| `PATCH` | `/api/listings/:id` | Actualizar listing |
| `DELETE` | `/api/listings/:id` | Archivar listing |
| `POST` | `/api/listings/:id/purchase` | Comprar listing (checkout de Stripe) |
| `POST` | `/api/listings/:id/install` | Instalar en empresa de Paperclip |
| `GET` | `/api/listings/:id/reviews` | Obtener reseñas |
| `POST` | `/api/listings/:id/reviews` | Enviar reseña |
| `GET` | `/api/creators/:slug` | Perfil de creador |
| `GET` | `/api/creators/me` | Perfil de creador actual |
| `POST` | `/api/creators` | Registrarse como creador |
| `GET` | `/api/purchases` | Historial de compras del comprador |
| `GET` | `/api/analytics` | Analítica del creador |

---

## 5. Flujos de usuario

### 5.1 Comprador: explorar → comprar → instalar

```
Homepage → Browse marketplace → Filter by type/category
  → Click listing → Read details, reviews, preview org chart
  → Click "Buy" → Stripe checkout (or free install)
  → Post-purchase: "Install to Company" button
  → Select target Paperclip company (or create new)
  → ClipHub API calls Paperclip API to:
      1. Create agents with configs from blueprint
      2. Set up reporting chains
      3. Create projects with workspace configs
      4. Apply governance rules
      5. Deploy skill files to agent instruction paths
  → Redirect to Paperclip dashboard with new team running
```

### 5.2 Creador: crear → publicar → ganar

```
Sign up as creator → Connect Stripe
  → "New Listing" wizard:
      Step 1: Type (team/agent/skill/governance)
      Step 2: Basic info (title, tagline, description, categories)
      Step 3: Upload bundle (JSON config + skill files + README)
      Step 4: Preview & org chart visualization
      Step 5: Pricing ($0–$499)
      Step 6: Publish
  → Live on marketplace immediately
  → Track installs, revenue, reviews on creator dashboard
```

### 5.3 Creador: exportar desde Paperclip → publicar

```
Running Paperclip company → "Export as Blueprint" (CLI or UI)
  → Paperclip exports:
      - Agent configs (sanitized — no secrets)
      - Org chart / reporting chains
      - Governance rules
      - Project templates
      - Skill files
  → Upload to ClipHub as new listing
  → Edit details, set price, publish
```

---

## 6. Dirección de diseño de UI

### 6.1 Lenguaje visual

- **Paleta de colores**: tinta oscura primaria, fondos arena cálidos, color de acento para CTAs (azul/morado de la marca Paperclip)
- **Tipografía**: sans-serif limpia, jerarquía fuerte, monoespaciado para detalles técnicos
- **Tarjetas**: esquinas redondeadas, sombras sutiles, insignias de precio claras
- **Visuales de organigrama**: árbol/grafo interactivo que muestra las relaciones de agentes en blueprints de equipo

### 6.2 Elementos clave de diseño

| Elemento | ClipHub |
|---|---|
| Tarjeta de producto | Mini-vista previa de organigrama + insignia de conteo de agentes |
| Página de detalle | Organigrama interactivo + desglose por agente |
| Flujo de instalación | Despliegue en un clic a la empresa de Paperclip |
| Prueba social | "X empresas ejecutando este blueprint" |
| Vista previa | Sandbox de demo en vivo (objetivo extra) |

### 6.3 Diseño de tarjeta de listing

```
┌─────────────────────────────────────┐
│  [Org Chart Mini-Preview]           │
│  ┌─CEO─┐                            │
│  ├─CTO─┤                            │
│  └─ENG──┘                           │
│                                     │
│  SaaS Startup Team                  │
│  "Ship your MVP with a 5-agent      │
│   engineering + marketing team"      │
│                                     │
│  👥 5 agents  ⬇ 234 installs       │
│  ★ 4.7 (12 reviews)                │
│                                     │
│  By @masinov          $199  [Buy]   │
└─────────────────────────────────────┘
```

### 6.4 Secciones de la página de detalle

1. **Hero**: título, tagline, precio, botón de instalación, información del creador
2. **Organigrama**: visualización interactiva de la jerarquía de agentes
3. **Desglose de agentes**: tarjetas expandibles por agente: rol, capacidades, modelo, habilidades
4. **Gobernanza**: flujos de aprobación, estructura de presupuesto, cadena de escalamiento
5. **Proyectos incluidos**: plantillas de proyectos con configuraciones de workspace
6. **README**: documentación markdown completa
7. **Reseñas**: calificaciones con estrellas + reseñas escritas
8. **Blueprints relacionados**: venta cruzada de configuraciones de equipo similares
9. **Perfil de creador**: mini bio, otros listings
## 7. Mecánica de instalación

### 7.1 Flujo de API de instalación

Cuando un comprador hace clic en "Instalar en la empresa":

```
POST /api/listings/:id/install
{
  "targetCompanyId": "uuid",         // Existing Paperclip company
  "overrides": {                      // Optional customization
    "agentModel": "claude-sonnet-4-6", // Override default model
    "budgetScale": 0.5,               // Scale budgets
    "skipProjects": false
  }
}
```

El manejador de instalación:

1. Valida que el comprador sea dueño de la compra
2. Valida el acceso a la empresa objetivo
3. Para cada agente en el blueprint:
   - `POST /api/companies/:id/agents` (si `paperclip-create-agent` lo admite, o vía flujo de aprobación)
   - Establece la configuración del adaptador, la plantilla de prompt, la ruta de instrucciones
4. Establece las cadenas de reporte
5. Crea proyectos y workspaces
6. Aplica las reglas de gobernanza
7. Despliega los archivos de habilidad a las rutas configuradas
8. Devuelve un resumen de los recursos creados

### 7.2 Resolución de conflictos

- **Colisión de nombre de agente**: agregar sufijo `-2`, `-3`
- **Colisión de nombre de proyecto**: pedir al comprador que renombre u omita
- **Adaptador incompatible**: advertir si el blueprint requiere un adaptador no disponible localmente
- **Disponibilidad del modelo**: advertir si el modelo requerido no está configurado

---

## 8. Modelo de ingresos

| Tarifa | Monto | Notas |
|---|---|---|
| Participación en ingresos del creador | 90% del precio de venta | Menos el procesamiento de Stripe (~2.9% + $0.30) |
| Tarifa de plataforma | 10% del precio de venta | La parte de ClipHub |
| Listings gratis | $0 | Sin tarifas para listings gratis |
| Stripe Connect | Tarifas estándar | Gestionado por Stripe |

---

## 9. Arquitectura técnica

### 9.1 Stack

- **Frontend**: Next.js (React), Tailwind CSS, mismo framework de UI que Paperclip
- **Backend**: API de Node.js (o extender el servidor de Paperclip)
- **Base de datos**: Postgres (puede compartir la BD de Paperclip o ser separada)
- **Pagos**: Stripe Connect (modo marketplace)
- **Almacenamiento**: S3/R2 para paquetes de listing e imágenes
- **Auth**: compartida con la autenticación de Paperclip (u OAuth2)

### 9.2 Integración con Paperclip

ClipHub puede ser:
- **Opción A**: una app separada que llama a la API de Paperclip para instalar blueprints
- **Opción B**: una sección integrada de la UI de Paperclip (ruta `/marketplace`)

La opción B es más simple para el MVP: agrega rutas a la UI y API existentes de Paperclip.

### 9.3 Formato de paquete

Los paquetes de listing son archivos ZIP/tar que contienen:

```
blueprint/
├── manifest.json          # Listing metadata + agent configs
├── README.md              # Documentation
├── org-chart.json         # Agent hierarchy
├── governance.json        # Approval rules, budgets
├── agents/
│   ├── ceo/
│   │   ├── prompt.md      # Prompt template
│   │   ├── AGENTS.md      # Instructions
│   │   └── skills/        # Skill files
│   ├── cto/
│   │   ├── prompt.md
│   │   ├── AGENTS.md
│   │   └── skills/
│   └── engineer/
│       ├── prompt.md
│       ├── AGENTS.md
│       └── skills/
└── projects/
    └── default/
        └── workspace.json  # Project workspace config
```

---

## 10. Alcance del MVP

### Fase 1: Fundación
- [ ] Esquema de listing y API CRUD
- [ ] Página de exploración con filtros (tipo, categoría, precio)
- [ ] Página de detalle de listing con visualización de organigrama
- [ ] Registro de creador y asistente de creación de listings
- [ ] Solo instalaciones gratis (sin pagos todavía)
- [ ] Flujo de instalación: blueprint → empresa de Paperclip

### Fase 2: Pagos y social
- [ ] Integración con Stripe Connect
- [ ] Flujo de compra
- [ ] Sistema de reseñas
- [ ] Panel de analítica de creador
- [ ] Comando CLI "Export from Paperclip"

### Fase 3: Crecimiento
- [ ] Búsqueda con ranking de relevancia
- [ ] Listings destacados/en tendencia
- [ ] Programa de verificación de creadores
- [ ] Versionado de blueprints y notificaciones de actualización
- [ ] Sandbox de demo en vivo
- [ ] API para publicación programática
