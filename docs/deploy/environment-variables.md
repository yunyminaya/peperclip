---
title: Variables de entorno
summary: Referencia completa de variables de entorno
---

Todas las variables de entorno que Paperclip usa para la configuración del servidor.

## Configuración del servidor

| Variable | Por defecto | Descripción |
|----------|---------|-------------|
| `PORT` | `3100` | Puerto del servidor |
| `HOST` | `127.0.0.1` | Enlace de host del servidor |
| `DATABASE_URL` | (embebida) | Cadena de conexión de PostgreSQL |
| `PAPERCLIP_HOME` | `~/.paperclip` | Directorio base para todos los datos de Paperclip |
| `PAPERCLIP_INSTANCE_ID` | `default` | Identificador de la instancia (para múltiples instancias locales) |
| `PAPERCLIP_DEPLOYMENT_MODE` | `local_trusted` | Sobrescritura del modo de ejecución |

## Secretos

| Variable | Por defecto | Descripción |
|----------|---------|-------------|
| `PAPERCLIP_SECRETS_MASTER_KEY` | (desde el archivo) | Clave de cifrado de 32 bytes (base64/hex/cruda) |
| `PAPERCLIP_SECRETS_MASTER_KEY_FILE` | `~/.paperclip/.../secrets/master.key` | Ruta al archivo de clave |
| `PAPERCLIP_SECRETS_STRICT_MODE` | `false` | Requiere referencias de secretos para variables de entorno sensibles |

## Tiempo de ejecución del agente (inyectadas en los procesos del agente)

El servidor las define automáticamente al invocar agentes:

| Variable | Descripción |
|----------|-------------|
| `PAPERCLIP_AGENT_ID` | ID único del agente |
| `PAPERCLIP_COMPANY_ID` | ID de la empresa |
| `PAPERCLIP_API_URL` | URL base de la API de Paperclip |
| `PAPERCLIP_API_KEY` | JWT de corta duración para autenticación de la API |
| `PAPERCLIP_RUN_ID` | ID de la ejecución actual del latido |
| `PAPERCLIP_TASK_ID` | Issue que activó este despertar |
| `PAPERCLIP_WAKE_REASON` | Motivo del disparador del despertar |
| `PAPERCLIP_WAKE_COMMENT_ID` | Comentario que activó este despertar |
| `PAPERCLIP_APPROVAL_ID` | ID de la aprobación resuelta |
| `PAPERCLIP_APPROVAL_STATUS` | Decisión de la aprobación |
| `PAPERCLIP_LINKED_ISSUE_IDS` | IDs de issues vinculados separados por comas |

## Claves de proveedores LLM (para adaptadores)

| Variable | Descripción |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Clave de API de Anthropic (para el adaptador local de Claude) |
| `OPENAI_API_KEY` | Clave de API de OpenAI (para el adaptador local de Codex) |
