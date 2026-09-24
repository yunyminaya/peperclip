---
title: Docker
summary: Inicio rápido con Docker Compose
---

Ejecuta Paperclip en Docker sin instalar Node ni pnpm localmente.

## Inicio rápido con Compose (recomendado)

```sh
docker compose -f docker-compose.quickstart.yml up --build
```

Abre [http://localhost:3100](http://localhost:3100).

Valores por defecto:

- Puerto del host: `3100`
- Directorio de datos: `./data/docker-paperclip`

Sobrescribe con variables de entorno:

```sh
PAPERCLIP_PORT=3200 PAPERCLIP_DATA_DIR=./data/pc \
  docker compose -f docker-compose.quickstart.yml up --build
```

## Construcción manual de Docker

```sh
docker build -t paperclip-local .
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

## Persistencia de datos

Todos los datos persisten bajo el montaje bind (`./data/docker-paperclip`):

- Datos de PostgreSQL embebido
- Recursos subidos
- Clave de secretos local
- Datos del espacio de trabajo del agente

## Adaptadores de Claude y Codex en Docker

La imagen de Docker preinstala:

- `claude` (CLI de Anthropic Claude Code)
- `codex` (CLI de OpenAI Codex)

Pasa claves de API para habilitar ejecuciones locales de adaptadores dentro del contenedor:

```sh
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-... \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

Sin claves de API, la app funciona normalmente: las comprobaciones de entorno de los adaptadores mostrarán los prerequisitos faltantes.
