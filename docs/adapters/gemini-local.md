---
title: Gemini Local
summary: Configuración e instalación del adaptador local del CLI de Gemini
---

El adaptador `gemini_local` ejecuta el CLI de Gemini de Google localmente. Admite persistencia de sesión con `--resume`, inyección de habilidades y análisis estructurado de la salida `stream-json`.

## Requisitos previos

- CLI de Gemini instalado (comando `gemini` disponible)
- `GEMINI_API_KEY` o `GOOGLE_API_KEY` configurada, o autenticación local del CLI de Gemini configurada

## Campos de configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|----------|-------------|
| `cwd` | string | Sí | Directorio de trabajo del proceso del agente (ruta absoluta; se crea automáticamente si falta cuando los permisos lo permiten) |
| `model` | string | No | Modelo de Gemini a usar. Por defecto `auto`. |
| `promptTemplate` | string | No | Prompt usado en todas las ejecuciones |
| `instructionsFilePath` | string | No | Archivo de instrucciones en Markdown antepuesto al prompt |
| `env` | object | No | Variables de entorno (admite referencias a secretos) |
| `timeoutSec` | number | No | Tiempo de espera del proceso (0 = sin tiempo de espera) |
| `graceSec` | number | No | Período de gracia antes de forzar la terminación |
| `yolo` | boolean | No | Pasar `--approval-mode yolo` para operación desatendida |

## Persistencia de sesión

El adaptador conserva los ID de sesión de Gemini entre latidos. En la siguiente activación, reanuda la conversación existente con `--resume` para que el agente conserve el contexto.

La reanudación de sesión depende del directorio de trabajo: si el directorio de trabajo cambió desde la última ejecución, se inicia una sesión nueva.

Si la reanudación falla con un error de sesión desconocida, el adaptador reintenta automáticamente con una sesión nueva.

## Inyección de habilidades

El adaptador crea enlaces simbólicos de las habilidades de Paperclip en el directorio global de habilidades de Gemini (`~/.gemini/skills`). Las habilidades existentes del usuario no se sobrescriben.

## Prueba de entorno

Usa el botón "Probar entorno" en la UI para validar la configuración del adaptador. Verifica:

- El CLI de Gemini está instalado y accesible
- El directorio de trabajo es absoluto y está disponible (se crea automáticamente si falta y está permitido)
- Pistas de clave de API o autenticación (`GEMINI_API_KEY` o `GOOGLE_API_KEY`)
- Una prueba en vivo de saludo (`gemini --output-format json "Respond with hello."`) para verificar que el CLI esté listo
