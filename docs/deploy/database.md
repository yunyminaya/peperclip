---
title: Base de datos
summary: PGlite embebido frente a Postgres en Docker frente a alojado
---

Paperclip usa PostgreSQL vía Drizzle ORM. Hay tres formas de ejecutar la base de datos.

## 1. PostgreSQL embebido (por defecto)

Cero configuración. Si no defines `DATABASE_URL`, el servidor inicia automáticamente una instancia de PostgreSQL embebido.

```sh
pnpm dev
```

En el primer inicio, el servidor:

1. Crea `~/.paperclip/instances/default/db/` para el almacenamiento
2. Asegura que la base de datos `paperclip` exista
3. Ejecuta las migraciones automáticamente
4. Empieza a atender solicitudes

Los datos persisten entre reinicios. Para restablecer: `rm -rf ~/.paperclip/instances/default/db`.

El inicio rápido con Docker también usa PostgreSQL embebido por defecto.

## 2. PostgreSQL local (Docker)

Para un servidor PostgreSQL completo en local:

```sh
docker compose up -d
```

Esto inicia PostgreSQL 17 en `localhost:5432`. Define la cadena de conexión:

```sh
cp .env.example .env
# DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
```

Aplica el esquema:

```sh
DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip \
  npx drizzle-kit push
```

## 3. PostgreSQL alojado (Supabase)

Para producción, usa un proveedor alojado como [Supabase](https://supabase.com/).

1. Crea un proyecto en [database.new](https://database.new)
2. Copia la cadena de conexión en Ajustes del proyecto > Base de datos
3. Define `DATABASE_URL` en tu `.env`

Usa la **conexión directa** (puerto 5432) para las migraciones y la **conexión agrupada** (puerto 6543) para la aplicación.

Si usas agrupación de conexiones, deshabilita las sentencias preparadas:

```ts
// packages/db/src/client.ts
export function createDb(url: string) {
  const sql = postgres(url, { prepare: false });
  return drizzlePg(sql, { schema });
}
```

## Cambiar entre modos

| `DATABASE_URL` | Modo |
|----------------|------|
| No definida | PostgreSQL embebido |
| `postgres://...localhost...` | PostgreSQL local en Docker |
| `postgres://...supabase.com...` | Supabase alojado |

El esquema de Drizzle (`packages/db/src/schema/`) es el mismo sin importar el modo.
