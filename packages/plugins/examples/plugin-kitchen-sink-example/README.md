# @paperclipai/plugin-kitchen-sink-example

Kitchen Sink es el plugin de referencia propio que demuestra casi toda la superficie de plugins de Paperclip actualmente implementada en un solo paquete.

Es intencionalmente amplio:

- página completa del plugin
- widget del panel
- superficies de proyecto e issue
- superficies de comentarios
- superficies de la barra lateral
- página de ajustes
- puente de datos/acciones del worker
- eventos, jobs, webhooks, herramientas, streams
- estado, entidades, assets, métricas, actividad
- demos locales de workspace y procesos

Este plugin es para desarrollo local, incorporación de colaboradores y pruebas de regresión del runtime. No está pensado como plantilla de plugin de producción para distribuir sin cambios.

## Instalación

```sh
pnpm --filter @paperclipai/plugin-kitchen-sink-example build
pnpm paperclipai plugin install ./packages/plugins/examples/plugin-kitchen-sink-example
```

O instálalo desde el gestor de plugins de Paperclip como un ejemplo incluido una vez que este repositorio esté compilado.

## Notas

- Las demos locales de workspace y procesos son solo de confianza y por defecto usan comandos seguros y curados.
- La página de ajustes del plugin permite activar/desactivar superficies de demo opcionales y el comportamiento del runtime local.
- Algunas superficies del host definidas por el SDK aún dependen de que el host de Paperclip las conecte de forma visible; este paquete busca ejercitar las actualmente montadas y dejar obvias las demás.
