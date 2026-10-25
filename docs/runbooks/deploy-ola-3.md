# Runbook — Deploy de la Ola 3 (superadmin, usuarios, ajustes)

Requiere la Ola 2 en producción. Sin ventana de mantenimiento: ningún flujo
de dinero cambia.

## 1. Functions

```bash
firebase deploy --only functions --project spi-smart-expense
```

Agrega `adminListUsers`, `adminInviteUser`, `adminUpdateUser`,
`adminDeleteUser`, `adminUpdateSettings` y actualiza `extractReceipt`
(límites desde `settings/tenant`).

## 2. Migración de usuarios y primer superadmin

```bash
npm run migrate:003 -- --dry-run --prod
npm run migrate:003 -- --apply --prod
npm run superadmin:bootstrap -- --email edmundo@spohr.cl --dry-run --prod
npm run superadmin:bootstrap -- --email edmundo@spohr.cl --apply --prod
```

El trigger `onUserWritten` actualiza los claims; la sesión abierta de
Edmundo refresca el token sola.

## 3. Hosting + rules

```bash
npm run build
firebase deploy --only hosting,firestore:rules --project spi-smart-expense
```

Juntos porque las rules nuevas quitan a los admins la edición de permisos
finos y el build nuevo oculta esa tarjeta.

## 4. Verificación

1. Edmundo: el sidebar muestra Configuración → Usuarios y Ajustes.
2. Un admin de SPI no ve esa sección y `/admin/users` lo redirige.
3. `/admin/users` lista a los usuarios reales con su último ingreso.
4. Invitar una cuenta de prueba propia, completar el correo, entrar, y luego
   eliminarla (no tiene rendiciones).
5. Marcar la Ola 3 como deployada en `docs/implementation-plan.md`,
   `docs/README.md` y `docs/validation/ola-3.md`.

## Rollback

Hosting: revertir la release en la consola. Rules: desplegar las de la
versión anterior desde git. Las Functions nuevas pueden quedar; sin la UI
nadie las llama.
