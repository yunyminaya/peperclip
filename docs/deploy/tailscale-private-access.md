---
title: Acceso privado con Tailscale
summary: Ejecuta Paperclip con enlace de host compatible con Tailscale y conéctate desde otros dispositivos
---

Úsalo cuando quieras acceder a Paperclip vía Tailscale (o una LAN/VPN privada) en lugar de solo `localhost`.

## 1. Inicia Paperclip en modo autenticado privado

```sh
pnpm dev --tailscale-auth
```

Esto configura:

- `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- `PAPERCLIP_DEPLOYMENT_EXPOSURE=private`
- `PAPERCLIP_AUTH_BASE_URL_MODE=auto`
- `HOST=0.0.0.0` (enlaza en todas las interfaces)

Opción equivalente:

```sh
pnpm dev --authenticated-private
```

## 2. Encuentra tu dirección Tailscale alcanzable

Desde la máquina que ejecuta Paperclip:

```sh
tailscale ip -4
```

También puedes usar tu nombre de host MagicDNS de Tailscale (por ejemplo `my-macbook.tailnet.ts.net`).

## 3. Abre Paperclip desde otro dispositivo

Usa la IP de Tailscale o el host MagicDNS con el puerto de Paperclip:

```txt
http://<tailscale-host-or-ip>:3100
```

Ejemplo:

```txt
http://my-macbook.tailnet.ts.net:3100
```

## 4. Permite nombres de host privados personalizados cuando sea necesario

Si accedes a Paperclip con un nombre de host privado personalizado, agrégalo a la lista de permitidos:

```sh
pnpm paperclipai allowed-hostname my-macbook.tailnet.ts.net
```

## 5. Verifica que el servidor sea alcanzable

Desde un dispositivo remoto conectado a Tailscale:

```sh
curl http://<tailscale-host-or-ip>:3100/api/health
```

Resultado esperado:

```json
{"status":"ok"}
```

## Resolución de problemas

- Errores de inicio de sesión o redirección en un nombre de host privado: agrégalo con `paperclipai allowed-hostname`.
- La app solo funciona en `localhost`: asegúrate de haber iniciado con `--tailscale-auth` (o define `HOST=0.0.0.0` en modo privado).
- Puedes conectar localmente pero no de forma remota: verifica que ambos dispositivos estén en la misma red Tailscale y que el puerto `3100` sea alcanzable.
