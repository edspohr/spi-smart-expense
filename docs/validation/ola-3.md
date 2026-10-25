# Validación — Ola 3: Superadmin, usuarios y ajustes

**Fecha:** 2026-10-25
**Impacto en SPI:** transparente para profesionales y asistentes. Los admins
siguen aprobando, viendo reportes y finanzas igual; dejan de editar los
permisos finos de otros usuarios (pasa a superadmin). Edmundo es el único
superadmin inicial.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Rol superadmin

**Qué cambió:** `superadmin > admin > assistant > professional`
(`src/lib/roles.ts`). Requerir `admin` en una ruta también admite
superadmin. El sidebar muestra la sección **Configuración** (Usuarios,
Ajustes) solo a superadmins y la etiqueta de rol "Superadministrador".

**Cómo probarlo:** entrar como admin y abrir `/admin/users`.

**Estado esperado:** redirige a `/admin` con el aviso "No tienes permiso
para ver esa sección". Como superadmin, la página carga. ☐

## 2. Gestión de usuarios (`/admin/users`)

**Qué cambió:** reemplaza a `AdminUserSeeder` (eliminado, ya no existe
`/admin/users-seeder`). Callables `adminListUsers`, `adminInviteUser`,
`adminUpdateUser`, `adminDeleteUser` (solo superadmin, `functions/src/users.ts`,
validación pura en `users.logic.ts` con tests).

- **Invitar:** crea la cuenta en el servidor y el navegador envía el correo
  nativo de Firebase "restablecer contraseña", que sirve para crearla. Nunca
  se comparte una contraseña. La invitación no puede otorgar superadmin.
- **Rol:** cualquier rol, incluido promover a superadmin. Nadie puede
  degradarse a sí mismo y siempre queda al menos un superadmin activo.
- **Responsable (manager):** base para la aprobación por jerarquía (Ola 5).
- **Activo:** desactivar deshabilita la cuenta en Auth, revoca tokens y la
  sesión abierta se cierra sola en segundos con un aviso en el login.
- **Correo:** reenviar invitación o enviar restablecimiento de contraseña.
- **Eliminar:** solo si el usuario no tiene rendiciones ni asignaciones; si
  las tiene, el sistema pide desactivarlo.
- Filtros por estado (activo, invitación pendiente, desactivado) y búsqueda.
- El detalle del usuario (`/admin/users/:id`) sigue igual; la tarjeta de
  permisos finos solo la ve el superadmin.

**Cómo probarlo:** invitar un correo propio de prueba como Asistente;
revisar el correo, crear la contraseña, entrar. Desactivar a un usuario de
prueba con su sesión abierta en otro navegador.

**Estado esperado:** el invitado entra con el rol elegido; la sesión
desactivada vuelve al login con "Tu cuenta fue desactivada". ☐

## 3. Ajustes del tenant (`/admin/settings`)

**Qué cambió:** documento `settings/tenant` (rules: lectura para cualquier
usuario activo, escritura solo superadmin; los cambios pasan por el callable
`adminUpdateSettings` que valida claves). Los valores de
`tenants/<id>.json` son el default. `SettingsProvider` se suscribe en vivo.

- **PIN de seguridad:** toggle guardado; la exigencia real llega con la Ola 4.
  Apagado por defecto en SPI.
- **Módulos:** carga masiva, reportes, conciliación y finanzas. Apagar uno lo
  oculta del menú y la ruta redirige con aviso, para todas las sesiones al
  instante.
- **IA:** límite diario por persona y por organización; `extractReceipt` lo
  lee de `settings/tenant` y usa los parámetros de Functions como respaldo.

**Cómo probarlo:** apagar "Conciliación" con un admin conectado en otra
ventana.

**Estado esperado:** desaparece de su menú sin recargar; volver a encenderlo
la restaura. ☐

## 4. Scripts

- `npm run superadmin:bootstrap -- --email <correo> --apply --prod`: promueve
  (o crea) al primer superadmin. Reemplaza `bootstrap-admins.mjs` y el campo
  `auth.bootstrapAdminEmails` de `tenants/*.json`, que se eliminaron.
- `npm run migrate:003 -- --dry-run --prod` / `--apply --prod`: agrega
  `active: true`, `tenantId` y `managerUid: null` a quien no los tenga.

## 5. Rules y tests

`firestore.rules`: `isSuperadmin()`; en `users`, los campos de privilegio
(`role`, `permissions`, `active`, `managerUid`, `requiresApproval`,
`tenantId`) solo los cambia un superadmin y nunca sobre sí mismo; los admins
siguen editando lo demás (p. ej. saldo por asignaciones); borrar usuarios,
solo superadmin. Nueva colección `settings`. 17 tests de rules, 51 unitarios.

---

## Verificado en emuladores (2026-10-25)

- Callables: admin recibe `PERMISSION_DENIED` al listar o cambiar ajustes;
  superadmin lista, invita (con responsable), no puede degradarse; desactivar
  devuelve `USER_DISABLED` al intentar entrar; borrar a alguien con
  rendiciones se rechaza; los claims del invitado se asignan por trigger.
- UI: admin bloqueado en `/admin/users` y en un módulo apagado; superadmin ve
  la tabla y filtros, invita desde el formulario, cambia ajustes y el menú
  responde al instante; una sesión de profesional abierta se cerró sola a los
  ~4 s de desactivarla, con el aviso en el login.

## Estado del deploy

- Pendiente. Ver `docs/runbooks/deploy-ola-3.md`.
