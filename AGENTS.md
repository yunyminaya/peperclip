# AGENTS.md

Guía para contribuyentes humanos y de IA que trabajan en este repositorio.

## 1. Propósito

Paperclip es un plano de control para empresas de agentes de IA.
El objetivo de implementación actual es V1 y está definido en `doc/SPEC-implementation.md`.

## 2. Lee esto primero

Antes de hacer cambios, lee en este orden:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` es contexto de producto de largo plazo.
`doc/SPEC-implementation.md` es el contrato concreto de construcción de V1.

## 3. Mapa del repo

- `server/`: API REST Express y servicios de orquestación
- `ui/`: UI de tablero React + Vite
- `packages/db/`: esquema Drizzle, migraciones, clientes de BD
- `packages/shared/`: tipos compartidos, constantes, validadores, constantes de rutas de API
- `packages/adapters/`: implementaciones de adaptadores de agentes (Claude, Codex, Cursor, etc.)
- `packages/adapter-utils/`: utilidades compartidas de adaptadores
- `packages/plugins/`: paquetes del sistema de plugins
- `doc/`: documentos operativos y de producto

## 4. Configuración de dev (BD automática)

Usa PGlite embebido en dev dejando `DATABASE_URL` sin definir.

```sh
pnpm install
pnpm dev
```

Esto inicia:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (servida por el servidor API en modo middleware de dev)

Chequeos rápidos:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reiniciar la BD local de dev:

```sh
rm -rf data/pglite
pnpm dev
```

## 5. Reglas centrales de ingeniería

1. Mantén los cambios con alcance de empresa.
Cada entidad de dominio debe tener alcance de empresa y los límites de empresa deben aplicarse en rutas/servicios.

2. Mantén los contratos sincronizados.
Si cambias el comportamiento de esquema/API, actualiza todas las capas impactadas:
- esquema y exports de `packages/db`
- tipos/constantes/validadores de `packages/shared`
- rutas/servicios de `server`
- clientes de API y páginas de `ui`

3. Preserva las invariantes del plano de control.
- Modelo de tarea con un solo asignado
- Semántica atómica de checkout de issues
- Puertas de aprobación para acciones gobernadas
- Comportamiento de pausa automática por tope duro de presupuesto
- Registro de actividad para acciones que mutan

4. No reemplaces documentos estratégicos por completo a menos que se pida.
Prefiere actualizaciones aditivas. Mantén `doc/SPEC.md` y `doc/SPEC-implementation.md` alineados.

5. Mantén los documentos de plan fechados y centralizados.
Los nuevos documentos de plan van en `doc/plans/` y deben usar nombres de archivo `YYYY-MM-DD-slug.md`.

## 6. Flujo de trabajo de cambios de base de datos

Al cambiar el modelo de datos:

1. Edita `packages/db/src/schema/*.ts`
2. Asegúrate de que las nuevas tablas se exporten desde `packages/db/src/schema/index.ts`
3. Genera la migración:

```sh
pnpm db:generate
```

4. Valida la compilación:

```sh
pnpm -r typecheck
```

Notas:
- `packages/db/drizzle.config.ts` lee el esquema compilado desde `dist/schema/*.js`
- `pnpm db:generate` compila primero `packages/db`

## 7. Verificación antes de entregar

Ejecuta este chequeo completo antes de decir que terminaste:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

Si algo no se puede ejecutar, reporta explícitamente qué no se ejecutó y por qué.

## 8. Expectativas de API y autenticación

- Ruta base: `/api`
- El acceso al tablero se trata como contexto de operador con control total
- El acceso de agentes usa API keys bearer (`agent_api_keys`), hasheadas en reposo
- Las keys de agentes no deben acceder a otras empresas

Al agregar endpoints:

- aplica chequeos de acceso de empresa
- aplica permisos de actor (tablero vs agente)
- escribe entradas de registro de actividad para mutaciones
- retorna errores HTTP consistentes (`400/401/403/404/409/422/500`)

## 9. Expectativas de UI

- Mantén rutas y navegación alineadas con la superficie de API disponible
- Usa el contexto de selección de empresa para páginas con alcance de empresa
- Muestra las fallas con claridad; no ignores errores de API en silencio

## 10. Definición de terminado

Un cambio está terminado cuando todo esto es cierto:

1. El comportamiento coincide con `doc/SPEC-implementation.md`
2. Typecheck, pruebas y build pasan
3. Los contratos están sincronizados entre db/shared/server/ui
4. Documentos actualizados cuando el comportamiento o los comandos cambian
