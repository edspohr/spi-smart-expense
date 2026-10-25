# 0005 — PIN por acción verificado server-side

**Estado:** Aceptada
**Fecha:** 2026-10-24
**Ola:** 4

## Contexto

Se quiere un segundo factor liviano (PIN de 4 dígitos) para autorizar
acciones importantes: aprobar sobre un umbral, cambiar roles, borrar,
exportar masivo, cambiar settings. Debe poder activarse o desactivarse por
tenant desde el superadmin, y SPI no debe percibir fricción nueva.

## Decisión

PIN **por acción**, no al abrir la app. Verificación exclusivamente
server-side portando `functions/src/pin.ts` de Comandas: hash scrypt con
salt en `userPins/{uid}` (sin acceso cliente), comparación
`timingSafeEqual`, rechazo de PINs obvios, 5 fallos → bloqueo 15 min,
10 → desactivado hasta reautenticar, `pinLog` de auditoría. Las callables
sensibles llaman `checkPin(req, action)`; el cliente usa
`withPin(reason, fn)` que reintenta pidiendo el PIN y lo cachea 2 minutos.

`security.pinEnabled` es un toggle de tenant: **apagado por defecto en SPI**; el
superadmin lo activa desde `/admin/settings` junto con el umbral y la lista
de acciones protegidas.

## Alternativas consideradas

- **PIN al abrir la app (AppLock) además de por acción.** Más estricto pero
  más fricción diaria; queda en backlog como opción por tenant.
- **PIN solo al abrir.** No protege las operaciones críticas, que es el
  objetivo.
- **Hash en cliente / PIN en Firestore legible.** Inaceptable: el hash sería
  verificable offline por cualquier usuario autenticado.
- **Re-autenticación con password** en vez de PIN. Más seguro en teoría,
  pero inusable en móvil para aprobaciones frecuentes.

## Consecuencias

- Depende de Functions (ADR 0003) y de settings del tenant (Ola 3).
- Con el toggle apagado no existe ninguna UI de PIN: cero cambio para SPI.
- Un PIN de 4 dígitos no sustituye la contraseña: el lockout y la
  verificación server-side son lo que lo hace razonable.

## Estado de implementación (2026-10-25, Ola 4)

- `functions/src/pin.ts` + `pin.logic.ts` (puro, con tests). Acciones
  protegibles: `approve`, `reject`, `delete`, `export`, `users`,
  `settings`, cada una activable en `settings/tenant.security.pinActions`,
  más `pinApprovalThreshold` para aprobar/rechazar.
- No se portó `pinLogin` ni `AppLock` (backlog).
- Declaración versionada `v1-2026-10-25`; cambiar el texto exige subir la
  versión en `pin.logic.ts` y `src/lib/pin.ts`.
