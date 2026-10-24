# 0004 — Roles y custom claims

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 2 (claims), 3 (superadmin)

## Contexto

Hoy existen `admin`, `assistant` y `professional`, más flags en
`users/{uid}.permissions`. Las rules hacen `get()` de `users/{uid}` en cada
chequeo (lento y con costo de lecturas). Los admins iniciales están
hardcodeados por email en `AuthContext.jsx`, lo que impide una versión
genérica. No hay quien gestione usuarios ni configuración del tenant.

## Decisión

Jerarquía `superadmin > admin > assistant > professional`. `superadmin`
hereda `admin` y además gestiona usuarios, settings del tenant, PIN global
y puede promover a otros superadmins; **nunca puede degradarse ni
desactivarse a sí mismo** (chequeo server-side). Los admins actuales pasan
a `admin` sin perder nada de lo que hacen hoy.

`role` y `tenantId` se guardan como custom claims y se espejan en
`users/{uid}`. Un trigger en Functions mantiene el espejo; las rules leen
`request.auth.token` sin `get()`. Los `permissions` granulares existentes se
conservan. El primer superadmin se crea con `scripts/bootstrap-superadmin.ts`,
reemplazando la lista hardcodeada (patrón ETFA `user_invitations` +
`active`).

## Alternativas consideradas

- **Superadmin solo como flag `permissions.isSuperadmin`.** Más flexible
  pero confuso: mezcla jerarquía con permisos puntuales.
- **Mantener `get()` en rules.** Simple, pero más lento y 1 lectura
  facturada por operación; con App Check y schema validation las rules
  crecen y el costo se nota.
- **Admin mantiene gestión de usuarios.** Cualquier admin podría crear
  cuentas: mal encaje con el modelo de servicio administrado.

## Consecuencias

- Migración única: backfill de claims y refresh forzado de token
  (`getIdToken(true)`) para no pedir re-login manual.
- `AdminUserSeeder` desaparece en favor de `/admin/users`.
- Desactivar un usuario (`active: false`) cierra su sesión al instante.
- Tests de rules deben cubrir cada rol x colección x operación.
