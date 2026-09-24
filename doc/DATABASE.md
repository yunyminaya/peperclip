# Base de datos

Paperclip usa PostgreSQL vía [Drizzle ORM](https://orm.drizzle.team/). Hay tres formas de ejecutar la base de datos, de la más simple a la más lista para producción.

## 1. PostgreSQL embebido — cero configuración

Si no defines `DATABASE_URL`, el servidor inicia automáticamente una instancia PostgreSQL embebida y gestiona un directorio local de datos.

```sh
pnpm dev
```

Eso es todo. En el primer arranque el servidor:

1. Crea un directorio `~/.paperclip/instances/default/db/` para almacenamiento
2. Asegura que exista la base de datos `paperclip`
3. Ejecuta migraciones automáticamente para bases de datos vacías
4. Empieza a servir solicitudes

Los datos persisten entre reinicios en `~/.paperclip/instances/default/db/`. Para reiniciar los datos locales de dev, elimina ese directorio.

Si necesitas aplicar migraciones pendientes manualmente, ejecuta:

```sh
pnpm db:migrate
```

Cuando `DATABASE_URL` no está definida, este comando apunta a la instancia PostgreSQL embebida actual para tu configuración/instancia activa de Paperclip.

Este modo es ideal para desarrollo local e instalaciones de un solo comando.

Nota de Docker: la imagen de inicio rápido de Docker también usa PostgreSQL embebido por defecto. Persiste `/paperclip` para mantener el estado de la BD entre reinicios del contenedor (consulta `doc/DOCKER.md`).

## 2. PostgreSQL local (Docker)

Para un servidor PostgreSQL completo en local, usa la configuración incluida de Docker Compose:

```sh
docker compose up -d
```

Esto inicia PostgreSQL 17 en `localhost:5432`. Luego define la cadena de conexión:

```sh
cp .env.example .env
# .env ya contiene:
# DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
```

Ejecuta migraciones (una vez que el problema de generación de migraciones esté corregido) o usa `drizzle-kit push`:

```sh
DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip \
  npx drizzle-kit push
```

Inicia el servidor:

```sh
pnpm dev
```

## 3. PostgreSQL alojado (Supabase)

Para producción, usa un proveedor de PostgreSQL alojado. [Supabase](https://supabase.com/) es una buena opción con un plan gratuito.

### Configuración

1. Crea un proyecto en [database.new](https://database.new)
2. Ve a **Project Settings > Database > Connection string**
3. Copia el URI y reemplaza el marcador de contraseña con tu contraseña de base de datos

### Cadena de conexión

Supabase ofrece dos modos de conexión:

**Conexión directa** (puerto 5432) — úsala para migraciones y scripts de una sola vez:

```
postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

**Agrupación de conexiones vía Supavisor** (puerto 6543) — úsala para la aplicación:

```
postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

### Configurar

Define `DATABASE_URL` en tu `.env`:

```sh
DATABASE_URL=postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

Si usas agrupación de conexiones (puerto 6543), el cliente `postgres` debe deshabilitar prepared statements. Actualiza `packages/db/src/client.ts`:

```ts
export function createDb(url: string) {
  const sql = postgres(url, { prepare: false });
  return drizzlePg(sql, { schema });
}
```

### Sube el esquema

```sh
# Usa la conexión directa (puerto 5432) para cambios de esquema
DATABASE_URL=postgres://postgres.[PROJECT-REF]:[PASSWORD]@...5432/postgres \
  npx drizzle-kit push
```

### Límites del plan gratuito

- 500 MB de almacenamiento de base de datos
- 200 conexiones concurrentes
- Los proyectos se pausan después de 1 semana de inactividad

Consulta [precios de Supabase](https://supabase.com/pricing) para detalles actuales.

## Cambiar entre modos

El modo de base de datos se controla con `DATABASE_URL`:

| `DATABASE_URL` | Modo |
|---|---|
| No definida | PostgreSQL embebido (`~/.paperclip/instances/default/db/`) |
| `postgres://...localhost...` | PostgreSQL local en Docker |
| `postgres://...supabase.com...` | Supabase alojado |

Tu esquema Drizzle (`packages/db/src/schema/`) sigue igual sin importar el modo.

## Almacenamiento de secretos

Paperclip almacena metadatos y versiones de secretos en:

- `company_secrets`
- `company_secret_versions`

Para instalaciones locales/por defecto, el proveedor activo es `local_encrypted`:

- El material de secretos se cifra en reposo con una clave maestra local.
- Archivo de clave por defecto: `~/.paperclip/instances/default/secrets/master.key` (se autocrea si falta).
- Ubicación de configuración del CLI: `~/.paperclip/instances/default/config.json` bajo `secrets.localEncrypted.keyFilePath`.

Overrides opcionales:

- `PAPERCLIP_SECRETS_MASTER_KEY` (clave de 32 bytes como base64, hex o cadena cruda de 32 caracteres)
- `PAPERCLIP_SECRETS_MASTER_KEY_FILE` (ruta personalizada del archivo de clave)

Modo estricto para bloquear nuevos valores sensibles de env inline:

```sh
PAPERCLIP_SECRETS_STRICT_MODE=true
```

Puedes definir el modo estricto y los valores por defecto del proveedor vía:

```sh
pnpm paperclipai configure --section secrets
```

Comando de migración de secretos inline:

```sh
pnpm secrets:migrate-inline-env --apply
```

