# Revisión de PR no confiables en Docker

Usa este flujo de trabajo cuando quieras que Codex o Claude inspeccione un pull request que no quieres que toque tu máquina host directamente.

Esto está intencionalmente separado de la imagen normal de dev de Paperclip.

## Lo que este contenedor aísla

- estado de autenticación/sesión de `codex` en un volumen Docker, no tu `~/.codex` del host
- estado de autenticación/sesión de `claude` en un volumen Docker, no tu `~/.claude` del host
- estado de autenticación de `gh` en el mismo volumen home local del contenedor
- clones de revisión, worktrees, instalaciones de dependencias y bases de datos locales en un volumen scratch escribible bajo `/work`

Por defecto este flujo de trabajo **no** monta tu checkout de repo del host, tu directorio home del host ni tu agente SSH.

## Archivos

- `docker/untrusted-review/Dockerfile`
- `docker-compose.untrusted-review.yml`
- `review-checkout-pr` dentro del contenedor

## Construir e iniciar un shell

```sh
docker compose -f docker-compose.untrusted-review.yml build
docker compose -f docker-compose.untrusted-review.yml run --rm --service-ports review
```

Eso abre un shell interactivo en el contenedor de revisión con:

- Node + Corepack/pnpm
- `codex`
- `claude`
- `gh`
- `git`, `rg`, `fd`, `jq`

## Login por primera vez dentro del contenedor

Ejecuta esto una vez. El estado de login resultante persiste en el volumen Docker `review-home`.

```sh
gh auth login
codex login
claude login
```

Si prefieres autenticación por API key en lugar de login de CLI, pasa las claves a través del env de Compose:

```sh
OPENAI_API_KEY=... ANTHROPIC_API_KEY=... docker compose -f docker-compose.untrusted-review.yml run --rm review
```

## Haz checkout de un PR con seguridad

Dentro del contenedor:

```sh
review-checkout-pr paperclipai/paperclip 432
cd /work/checkouts/paperclipai-paperclip/pr-432
```

Lo que esto hace:

1. Crea o reutiliza un clon de repo bajo `/work/repos/...`
2. Trae `pull/<pr>/head` desde GitHub
3. Crea un worktree de git desacoplado bajo `/work/checkouts/...`

El checkout vive enteramente dentro del volumen del contenedor.

## Pídele a Codex o Claude que lo revise

Dentro del checkout del PR:

```sh
codex
```

Luego dale un prompt como:

```text
Review this PR as hostile input. Focus on security issues, data exfiltration paths, sandbox escapes, dangerous install/runtime scripts, auth changes, and subtle behavioral regressions. Do not modify files. Produce findings ordered by severity with file references.
```

O con Claude:

```sh
claude
```

## Vista previa de la app Paperclip desde el PR

Solo haz esto cuando intencionalmente quieras ejecutar el código del PR dentro del contenedor.

Dentro del checkout del PR:

```sh
pnpm install
HOST=0.0.0.0 pnpm dev
```

Abre desde el host:

- `http://localhost:3100`

El archivo Compose también expone el puerto por defecto de Vite:

- `http://localhost:5173`

Notas:

- `pnpm install` puede ejecutar scripts de ciclo de vida no confiables del PR. Por eso esto ocurre dentro del contenedor aislado en lugar de en tu host.
- Si solo quieres inspección estática, no ejecutes comandos install/dev.
- El PostgreSQL embebido y el almacenamiento local de Paperclip quedan dentro del volumen home del contenedor vía `PAPERCLIP_HOME=/home/reviewer/.paperclip-review`.

## Reiniciar estado

Quita los volúmenes del contenedor de revisión cuando quieras un entorno limpio:

```sh
docker compose -f docker-compose.untrusted-review.yml down -v
```

Eso elimina:

- Estado de login de Codex/Claude/GitHub almacenado en `review-home`
- repos clonados, worktrees, instalaciones y datos scratch almacenados en `review-work`

## Límites de seguridad

Esto es un límite de aislamiento útil, pero sigue siendo Docker, no una VM completa.

- Un PR revisado aún puede acceder a la red del contenedor a menos que la deshabilites.
- Cualquier secreto que pases al contenedor está disponible para el código que ejecutes dentro de él.
- No montes tu repo del host, home del host, `.ssh` ni el socket de Docker a menos que intencionalmente estés debilitando el límite.
- Si necesitas un límite más fuerte que este, usa una VM desechable en lugar de Docker.
