---
title: Resumen del despliegue
summary: Modos de despliegue de un vistazo
---

Paperclip admite tres configuraciones de despliegue, desde lo local sin fricción hasta producción expuesta a internet.

## Modos de despliegue

| Modo | Autenticación | Ideal para |
|------|------|----------|
| `local_trusted` | Sin inicio de sesión requerido | Máquina local de un solo operador |
| `authenticated` + `private` | Inicio de sesión requerido | Red privada (Tailscale, VPN, LAN) |
| `authenticated` + `public` | Inicio de sesión requerido | Despliegue en la nube expuesto a internet |

## Comparación rápida

### Local de confianza (por defecto)

- Enlace de host solo de loopback (localhost)
- Sin flujo de inicio de sesión humano
- Arranque local más rápido
- Ideal para: desarrollo en solitario y experimentación

### Autenticado + Privado

- Inicio de sesión requerido vía Better Auth
- Se enlaza a todas las interfaces para acceso en red
- Modo automático de URL base (menor fricción)
- Ideal para: acceso de equipo vía Tailscale o red local

### Autenticado + Público

- Inicio de sesión requerido
- URL pública explícita requerida
- Comprobaciones de seguridad más estrictas
- Ideal para: alojamiento en la nube, despliegue expuesto a internet

## Elegir un modo

- **¿Solo estás probando Paperclip?** Usa `local_trusted` (el valor por defecto)
- **¿Compartiendo con un equipo en una red privada?** Usa `authenticated` + `private`
- **¿Desplegando en la nube?** Usa `authenticated` + `public`

Define el modo durante la incorporación:

```sh
pnpm paperclipai onboard
```

O actualízalo después:

```sh
pnpm paperclipai configure --section server
```
