# Validación — Ola 6: Offline, push y compartir

**Fecha:** 2026-10-25
**Impacto en SPI:** visible positivo y opcional. Rendir sin señal deja de
fallar; aparece un indicador "Sin conexión / N sin enviar" en el
encabezado solo cuando aplica; push y compartir son opt-in.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Rendir sin conexión

**Qué cambió:** `src/lib/offlineQueue.ts` (IndexedDB con `idb`). Si al
enviar no hay red (o la subida/escritura falla por red), la rendición
completa queda en el dispositivo: fotos como Blob y los documentos finales
con IDs pre-generados. `src/lib/offlineSync.ts` la envía sola al abrir la
app, al volver la conexión y cada minuto mientras queden pendientes. El
envío normal y el diferido usan el mismo código, así producen documentos
idénticos; los IDs fijos evitan duplicados y la URL de cada foto subida se
guarda para no subirla dos veces.

- Encabezado: "Sin conexión", "N sin enviar" o ambos (lleva a Mi Espacio).
- Mi Espacio: lista de pendientes con último error, "Enviar ahora" y
  "Descartar".
- Un error que no es de red (p. ej. permisos) queda marcado en el ítem y no
  bloquea a los demás.

**Cómo probarlo:** en el teléfono, modo avión → Nueva Rendición con foto →
Confirmar → aviso "Sin conexión: la rendición quedó guardada…" → quitar
modo avión.

**Estado esperado:** en segundos aparece "Se envió 1 rendición guardada sin
conexión" y el admin la ve en Aprobaciones. ☐

**Límite:** no usa Background Sync del service worker (el SDK de Firebase y
la sesión viven en la página); el envío ocurre con la app abierta.

## 2. Compartir una foto a la app

**Qué cambió:** `share_target` en el manifest (POST multipart, imágenes y
PDF) y `public/sw-extras.js`, importado por el service worker: guarda el
archivo en Cache Storage y abre `/dashboard/new-expense?shared=1`;
`ExpenseForm` lo carga como recibo y limpia el caché.

**Cómo probarlo:** con la app instalada en Android, Galería → Compartir →
SPI Expense.

**Estado esperado:** se abre Nueva Rendición con la foto cargada lista para
"Analizar documentos". ☐ (iOS no soporta Web Share Target.)

## 3. Notificaciones push

**Qué cambió:** `functions/src/push.ts` envía un push de datos a cada
dispositivo del usuario en **cada** notificación de la app (solicitud de
aprobación, aprobada, rechazada, recordatorios, PIN creado o restablecido) y
poda tokens inválidos. `sw-extras.js` muestra el aviso y al tocarlo abre la
pantalla correcta. Cliente: tarjeta en Mi Espacio para activarlas en este
dispositivo; el permiso del navegador se pide solo ahí.

**Requisito:** clave pública VAPID del proyecto en `VITE_FCM_VAPID_KEY`
(consola de Firebase → Configuración → Cloud Messaging → Certificados push
web). Sin ella la tarjeta no aparece. Ver `docs/pendientes.md`.

**Estado esperado:** tras activarlas, aprobar una rendición genera un aviso
del sistema en el teléfono del profesional aunque la app esté cerrada. ☐

## 4. Tests

`src/lib/offlineQueue.test.ts` (5, con `fake-indexeddb`): orden y
separación por usuario, envío con URL subida, reintento sin re-subir tras
fallo de red, un error no bloquea al resto, clasificación de errores de
red. Total 83 unitarios, 20 de rules.

## Verificado en emuladores (2026-10-25)

Con conexión simulada como caída: Nueva Rendición manual → aviso de guardado
offline, encabezado "Sin conexión · 1 sin enviar". Al recargar con red, la
cola se envió sola: la rendición "Peaje Ruta 5" (12.500 COP) quedó en
Firestore y el trigger actualizó el saldo. Foto compartida simulada en
Cache Storage → el formulario la cargó como recibo y limpió el caché. Push
no probado (requiere la clave VAPID y un dispositivo real).

## Estado del deploy

- 2026-10-25: Functions (push en `notifyUser`, avisos de PIN) y hosting
  desplegados. Verificado por HTTP: `sw-extras.js` servido e importado por
  `sw.js`; el manifest publica `share_target`. Push oculto hasta configurar
  `VITE_FCM_VAPID_KEY` (ver `docs/pendientes.md`).
