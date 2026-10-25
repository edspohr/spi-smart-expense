# Validación — Ola 4: PIN por acción

**Fecha:** 2026-10-25
**Impacto en SPI:** transparente mientras el PIN esté apagado (por defecto).
Ninguna pantalla cambia hasta que un superadmin lo active en Ajustes. Única
diferencia visible con el PIN apagado: nada.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Servidor (`functions/src/pin.ts`, `pin.logic.ts`)

**Qué cambió:** portado de Comandas. `userPins/{uid}` guarda hash scrypt +
salt (solo servidor; las rules lo niegan a todos, incluido superadmin),
comparación `timingSafeEqual`, rechazo de PINs obvios (repetidos,
correlativos, años, 2580…). 5 fallos → bloqueo 15 min; 10 → desactivado
hasta que la persona cree uno nuevo. `pinLog` registra cada intento y cada
alta/restablecimiento.

Callables: `setOwnPin` (con declaración de responsabilidad versionada
`v1-2026-10-25`), `verifyPin` (para acciones del navegador: exportar),
`adminResetPin` y `adminListPinLog` (solo superadmin). Helper
`requirePinFor(req, action, { amount })` usado en:

| Acción protegida | Callable | Cuándo pide PIN |
|---|---|---|
| Aprobar / reabrir | `reviewExpense` | monto ≥ umbral (moneda base; FX usa `amountCOP`, sin tasa = siempre) |
| Rechazar | `reviewExpense` | ídem |
| Eliminar rendición de otro | `deleteExpense` (nuevo) | siempre que esté protegida; borrar la propia pendiente no pide PIN |
| Exportar | `verifyPin` desde Reportes y Aprobaciones | siempre que esté protegida |
| Usuarios | `adminInviteUser`, `adminUpdateUser` (rol, permisos, activo), `adminDeleteUser`, `adminResetPin` | siempre que esté protegida |
| Ajustes | `adminUpdateSettings` | solo si el PIN ya está activo |

Activar el PIN exige que el superadmin tenga su propio PIN (si no, se
bloquearía a sí mismo).

## 2. Cliente

- `src/lib/pin.ts`: `withPin(reason, call)` reintenta cuando el servidor
  responde `details.pin = required | invalid`; caché en memoria 2 min;
  llamadas concurrentes (aprobación masiva) comparten un solo diálogo.
- `PinPrompt` global (montado en `main.jsx`): campo de 4 dígitos, motivo de
  la acción, error del servidor sin cerrar el diálogo.
- **Mi Espacio → Seguridad** (`PinSecurityCard`): crear o cambiar el PIN con
  la declaración. Oculta mientras el PIN esté apagado y la persona no tenga
  uno.
- **Aviso** (`PinSetupBanner`) para admins, superadmins y asistentes sin PIN
  cuando el tenant lo activa.
- **Ajustes → PIN de seguridad**: activar, acciones protegidas, umbral para
  aprobar/rechazar y registro de uso (últimos 100 eventos).
- **Usuarios**: botón "Restablecer PIN" (rojo si quedó desactivado).
- Los borrados de rendiciones ajenas (Aprobaciones, detalle de usuario)
  pasan por `deleteExpense`; las rules ya no permiten a un admin borrar
  directo, así el PIN no se puede saltar.

## 3. Cómo probarlo (producción, cuando decidas activarlo)

1. Mi Espacio → Seguridad → Crear PIN.
2. Ajustes → activar "Exigir PIN"; opcional: umbral, p. ej. 500000.
3. Aprobar una rendición sobre el umbral → aparece el diálogo; PIN errado
   muestra "Te quedan 4 intentos"; el correcto aprueba. Aprobar otra antes de
   2 min no vuelve a pedirlo.
4. Un admin sin PIN ve el aviso amarillo para crearlo.
5. Ajustes → Ver registro de uso del PIN.

**Estado esperado:** como arriba; con el PIN apagado, ningún diálogo ni
tarjeta. ☐

## 4. Tests

- `functions/src/pin.test.ts`: formato, PINs débiles, bloqueo a 5,
  desactivación a 10, PIN correcto rechazado mientras está bloqueado,
  política (umbral, acciones apagadas).
- `src/lib/pin.test.ts`: `withPin` sin PIN, con `required`, con `invalid`,
  cancelado, diálogo compartido entre llamadas concurrentes, errores
  `locked` sin diálogo.
- Rules: `userPins` y `pinLog` ilegibles para todos; nadie se marca
  `hasPin`; admin no borra rendiciones ajenas directo.
- Total: 65 unitarios, 18 de rules.

## Verificado en emuladores (2026-10-25)

API: activar sin PIN propio rechazado; PIN débil rechazado; con PIN activo,
cambiar ajustes pide PIN; aprobar bajo umbral no pide, sobre umbral pide
(`unset` si no tiene, `required`, `invalid`, OK); USD con `amountCOP` bajo el
umbral no pide; borrar rendición ajena pide; 5 errores bloquean y el PIN
correcto no entra durante el bloqueo; restablecer PIN ajeno pide PIN del
superadmin; admin no puede leer el registro.
UI: rechazo sobre umbral abre el diálogo "Para rechazar la rendición", PIN
errado muestra el error, el correcto completa; tarjeta de Seguridad muestra
"Activo desde…"; Ajustes muestra umbral, acciones y registro.

## Estado del deploy

- 2026-10-25: 15 Functions desplegadas (nuevas: `setOwnPin`, `verifyPin`,
  `adminResetPin`, `adminListPinLog`, `deleteExpense`), hosting + rules
  liberados. El PIN queda apagado (`settings/tenant` aún no existe en
  producción; defaults de `tenants/spi.json`).
- Hallazgo en la verificación: `verifyPin` respondía `ok` sin sesión cuando
  el PIN no era requerido (sin datos expuestos). Corregido exigiendo sesión
  antes de evaluar la política y redeployado; ahora devuelve
  `UNAUTHENTICATED`.
- Pendiente: prueba con sesión real cuando se active (ver `docs/pendientes.md`).
