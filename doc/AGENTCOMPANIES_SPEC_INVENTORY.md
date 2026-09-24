# Inventario de especificación de empresas de agentes

Este documento indexa cada parte del código de Paperclip que toca la [Especificación de empresas de agentes](docs/companies/companies-spec.md) (`agentcompanies/v1-draft`).

Úsalo cuando necesites:

1. **Actualizar la especificación** — saber qué código de implementación debe cambiar en conjunto.
2. **Cambiar código que involucra la especificación** — encontrar todos los archivos relacionados rápidamente.
3. **Mantener todo alineado** — auditar si la implementación coincide con la especificación.

---

## 1. Documentos de especificación y diseño

| Archivo | Rol |
|---|---|
| `docs/companies/companies-spec.md` | **Especificación normativa** — define el formato de paquete markdown-first (COMPANY.md, TEAM.md, AGENTS.md, PROJECT.md, TASK.md, SKILL.md), archivos reservados, esquemas de frontmatter y convenciones de extensiones de proveedor (`.paperclip.yaml`). |
| `doc/plans/2026-03-13-company-import-export-v2.md` | Plan de implementación para el corte al modelo de paquete markdown-first — fases, cambios de API, plan de UI y estrategia de lanzamiento. |
| `doc/SPEC-implementation.md` | Contrato de implementación V1; referencia el sistema de portabilidad y el formato sidecar `.paperclip.yaml`. |
| `docs/specs/cliphub-plan.md` | Plan anterior de bundle blueprint; parcialmente reemplazado por la especificación markdown-first (notado en el plan v2). |
| `doc/plans/2026-02-16-module-system.md` | Plan del sistema de módulos; secciones de plantilla de empresa solo JSON reemplazadas por el modelo markdown-first. |
| `doc/plans/2026-03-14-skills-ui-product-plan.md` | Plan de UI de habilidades; referencia archivos de habilidad portables y `.paperclip.yaml`. |
| `doc/plans/2026-03-14-adapter-skill-sync-rollout.md` | Lanzamiento de sincronización de habilidades de adaptadores; compañero del plan v2 de import/export. |

## 2. Tipos compartidos y validadores

Estos definen el contrato entre servidor, CLI y UI.

| Archivo | Qué define |
|---|---|
| `packages/shared/src/types/company-portability.ts` | Interfaces TypeScript: `CompanyPortabilityManifest`, `CompanyPortabilityFileEntry`, `CompanyPortabilityEnvInput`, tipos de solicitud y resultado de export/import/preview, tipos de entradas de manifiesto para agentes, habilidades, proyectos, issues, rutinas recurrentes, empresas. |
| `packages/shared/src/validators/company-portability.ts` | Esquemas Zod para todas las formas de solicitud/respuesta de portabilidad — usados tanto por rutas de servidor como por el CLI. |
| `packages/shared/src/types/index.ts` | Re-exporta tipos de portabilidad. |
| `packages/shared/src/validators/index.ts` | Re-exporta validadores de portabilidad. |

## 3. Servidor — Servicios

| Archivo | Responsabilidad |
|---|---|
| `server/src/services/company-portability.ts` | **Servicio central de portabilidad.** Export (generación de manifiesto, emisión de archivos markdown, sidecars `.paperclip.yaml`), import (resolución de grafo, manejo de colisiones, creación de entidades), preview (resumen de acciones planificadas). Maneja derivación de clave de habilidad, mapeo tarea recurrente <-> rutina, migración de recurrencia legacy y generación de README del paquete. Referencia la cadena de versión `agentcompanies/v1`. |
| `server/src/services/routines.ts` | Servicio de runtime de rutinas de Paperclip. La portabilidad ahora exporta rutinas como entradas `TASK.md` recurrentes e importa tareas recurrentes de vuelta a través de este servicio. |
| `server/src/services/company-export-readme.ts` | Genera `README.md` y organigrama Mermaid para paquetes de empresa exportados. |
| `server/src/services/index.ts` | Re-exporta `companyPortabilityService`. |

## 4. Servidor — Rutas

| Archivo | Endpoints |
|---|---|
| `server/src/routes/companies.ts` | `POST /api/companies/:companyId/export` — bundle de export legacy<br>`POST /api/companies/:companyId/exports/preview` — vista previa de export<br>`POST /api/companies/:companyId/exports` — paquete de export<br>`POST /api/companies/import/preview` — vista previa de import<br>`POST /api/companies/import` — ejecutar import |

El registro de rutas vive en `server/src/app.ts` vía `companyRoutes(db, storage)`.

## 5. Servidor — Pruebas

| Archivo | Cobertura |
|---|---|
| `server/src/__tests__/company-portability.test.ts` | Pruebas unitarias del servicio de portabilidad (export, import, preview, forma de manifiesto, versión `agentcompanies/v1`). |
| `server/src/__tests__/company-portability-routes.test.ts` | Pruebas de integración de los endpoints HTTP de portabilidad. |

## 6. CLI

| Archivo | Comandos |
|---|---|
| `cli/src/commands/client/company.ts` | `company export` — exporta un paquete de empresa a disco (flags: `--out`, `--include`, `--projects`, `--issues`, `--projectIssues`).<br>`company import <fromPathOrUrl>` — importa un paquete de empresa desde un archivo o carpeta (flags: ruta/URL fuente posicional o shorthand de GitHub, `--include`, `--target`, `--companyId`, `--newCompanyName`, `--agents`, `--collision`, `--ref`, `--dryRun`).<br>Lee/escribe entradas de archivo portable y maneja filtrado de `.paperclip.yaml`. |

## 7. UI — Páginas

| Archivo | Rol |
|---|---|
| `ui/src/pages/CompanyExport.tsx` | UI de export: vista previa, visualización de manifiesto, visualización de árbol de archivos, creación y descarga de archivo ZIP. Filtra `.paperclip.yaml` según selección. Muestra manifiesto y README en editor. |
| `ui/src/pages/CompanyImport.tsx` | UI de import: entrada de fuente (subida/carpeta/URL de GitHub/URL genérica), lectura de ZIP, panel de vista previa con árbol de dependencias, checkboxes de selección de entidades, advertencias de confianza/licencia, requisitos de secretos, estrategia de colisiones, configuración de adaptador. |

## 8. UI — Componentes

| Archivo | Rol |
|---|---|
| `ui/src/components/PackageFileTree.tsx` | Componente de árbol de archivos reutilizable para import y export. Construye el árbol desde ítems `CompanyPortabilityFileEntry`, parsea frontmatter, muestra indicadores de acción (crear/actualizar/omitir) y mapea etiquetas de campos de frontmatter. |

## 9. UI — Librerías

| Archivo | Rol |
|---|---|
| `ui/src/lib/portable-files.ts` | Helpers para entradas de archivo portable: `getPortableFileText`, `getPortableFileDataUrl`, `getPortableFileContentType`, `isPortableImageFile`. |
| `ui/src/lib/zip.ts` | Creación de archivos ZIP (`createZipArchive`) y lectura (`readZipArchive`) — implementa el formato ZIP desde cero para paquetes de empresa. CRC32, codificación de fecha/hora DOS. |
| `ui/src/lib/zip.test.ts` | Pruebas de utilidades ZIP; ejercita round-trip con entradas de archivo de portabilidad y contenido `.paperclip.yaml`. |

## 10. UI — Cliente de API

| Archivo | Funciones |
|---|---|
| `ui/src/api/companies.ts` | `companiesApi.exportBundle`, `companiesApi.exportPreview`, `companiesApi.exportPackage`, `companiesApi.importPreview`, `companiesApi.importBundle` — wrappers fetch tipados para los endpoints de portabilidad. |

## 11. Habilidades e instrucciones de agente

| Archivo | Relevancia |
|---|---|
| `skills/paperclip/references/company-skills.md` | Documento de referencia para el flujo de trabajo de la biblioteca de habilidades de empresa — instalar, inspeccionar, actualizar, asignar. Los paquetes de habilidades son un subconjunto de la especificación de empresas de agentes. |
| `server/src/services/company-skills.ts` | Servicio de gestión de habilidades de empresa — maneja imports basados en SKILL.md y la biblioteca de habilidades a nivel de empresa. |
| `server/src/services/agent-instructions.ts` | Servicio de instrucciones de agente — resuelve rutas AGENTS.md para la carga de instrucciones de agente. |

## 12. Referencia cruzada rápida por concepto de especificación

| Concepto de especificación | Archivos principales de implementación |
|---|---|
| `COMPANY.md` frontmatter y cuerpo | `company-portability.ts` (emisor de export + parser de import) |
| `AGENTS.md` frontmatter y cuerpo | `company-portability.ts`, `agent-instructions.ts` |
| `PROJECT.md` frontmatter y cuerpo | `company-portability.ts` |
| `TASK.md` frontmatter y cuerpo | `company-portability.ts` |
| Paquetes `SKILL.md` | `company-portability.ts`, `company-skills.ts` |
| Sidecar de proveedor `.paperclip.yaml` | `company-portability.ts`, `routines.ts`, `CompanyExport.tsx`, `company.ts` (CLI) |
| `manifest.json` | `company-portability.ts` (generación), tipos compartidos (esquema) |
| Formato de paquete ZIP | `zip.ts` (UI), `company.ts` (E/S de archivos del CLI) |
| Resolución de colisiones | `company-portability.ts` (servidor), `CompanyImport.tsx` (UI) |
| Declaraciones de env/secretos | tipos compartidos (`CompanyPortabilityEnvInput`), `CompanyImport.tsx` (UI) |
| README + organigrama | `company-export-readme.ts` |
