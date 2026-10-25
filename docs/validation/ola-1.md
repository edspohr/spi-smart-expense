# Validación — Ola 1: PWA instalable

**Fecha:** 2026-10-25
**Impacto en SPI:** visible positivo. Botón "Instalar app" nuevo, íconos
cuadrados correctos, toast de actualización tras cada deploy. Ningún flujo de
negocio cambia.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Botón "Instalar app" siempre visible

**Qué cambió:** `src/lib/install.ts` (store con `useSyncExternalStore`, modos
`hidden | prompt | ios | manual`) captura `beforeinstallprompt` como primer
import de `main.jsx`. `InstallButton.tsx` se monta en el header (pill, desde
`sm`), en el sidebar (fila "Instalar app en este dispositivo", sobre Cerrar
Sesión) y en el login (pill bajo "Regístrate aquí"). Reemplaza el banner de 7
días (`InstallPwaPrompt.jsx` y `src/lib/pwa.js` eliminados).

**Cómo probarlo:**
- Chrome/Edge escritorio o Android sobre `https://spi-smart-expense.web.app`:
  tocar el botón → prompt nativo de instalación.
- iPhone Safari: tocar el botón → modal con los pasos Compartir → Agregar a
  inicio.
- Dentro de la app ya instalada (standalone): el botón no aparece en ningún
  lugar.
- Rechazar el prompt nativo: el botón sigue visible y pasa a mostrar los pasos
  manuales.

**Estado esperado:** nunca se "descarta"; solo desaparece instalada. ☐

## 2. Service worker y toast de actualización

**Qué cambió:** `vite-plugin-pwa` 2.x con `registerType: 'prompt'`, precache
del app shell (`js,css,html,ico,svg,webmanifest` + íconos del tenant),
`navigateFallback` y `cleanupOutdatedCaches`. `UpdateToast.tsx` (montado en
`main.jsx`) muestra "Actualización disponible → Recargar" cuando hay un build
nuevo esperando; nada cambia hasta que el usuario recarga. `firebase.json`
sirve `sw.js` y el manifest con `Cache-Control: no-cache` y los assets con
hash como `immutable`.

**Cómo probarlo:**
1. Abrir la app en producción y dejar la pestaña abierta.
2. Hacer un deploy nuevo.
3. Esperar ~1 min o navegar dentro de la app.

**Estado esperado:** aparece el toast; "Recargar" carga la versión nueva sin
errores de assets viejos; "Ahora no" lo oculta hasta el próximo build. ☐

## 3. Manifest e íconos por tenant

**Qué cambió:** el manifest se genera en build desde `tenants/<id>.json`
(nombre, `short_name`, descripción, `lang`, `theme_color`). Íconos
192/512/512-maskable/apple-touch-180 en `public/icons/<id>/`, generados con
`scripts/generate-icons.py` (Pillow) y commiteados; `npm run icons` los
regenera para `spi` y `demo`. `index.html` apunta favicon y apple-touch-icon al
tenant. Cierra TD-025 y el ítem de íconos estirados.

**Cómo probarlo:**
```bash
npm run build && cat dist/manifest.webmanifest
npm run build:demo && cat dist/manifest.webmanifest
```
En Android, instalar y revisar el ícono adaptativo (maskable); en iOS, el ícono
de pantalla de inicio.

**Estado esperado:** manifest con datos de cada tenant; íconos cuadrados sin
deformación, con margen en el maskable. ☐

## 4. Caché offline de Firestore

**Qué cambió:** `firebase.js` usa `initializeFirestore` con
`persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.

**Cómo probarlo:** abrir "Mis Rendiciones" con red, activar modo avión (o
"Offline" en DevTools → Network), recargar dentro de la app instalada.

**Estado esperado:** la lista ya cargada se muestra desde IndexedDB
(solo lectura); al volver la red, sincroniza. Crear un gasto offline todavía
no está soportado (Ola 6). ☐

## 5. Tests y build

**Qué cambió:** `src/lib/install.test.ts` (5 casos: manual, prompt consumido
una vez, appinstalled, iPhone/iPadOS, standalone iOS).

**Cómo probarlo:** `npm run lint && npm run typecheck && npm test -- --run && npm run build`

**Estado esperado:** 5 archivos / 24 tests en verde; `dist/` contiene `sw.js`,
`workbox-*.js` y `manifest.webmanifest`. ☐

---

## Verificado en desarrollo (2026-10-25)

- Login en `localhost:5173`: pill "Instalar app" visible; clic abre el modal
  "Instalar SPI Expense" con los pasos manuales (modo `manual` porque el dev
  server no registra service worker); "Entendido" lo cierra. Sin errores de
  consola.
- Header y sidebar: verificados con sesión en el entorno de emuladores
  (`docs/runbooks/emulators.md`): pill en el header y fila "Instalar app"
  sobre "Cerrar Sesión" en el sidebar.

## Pruebas funcionales con emuladores (2026-10-25)

Entorno: Firebase Emulator Suite + cuentas seed (ver runbook). Flujos
probados: login profesional → nueva rendición manual → login admin →
aprobar y rechazar → notificaciones del profesional.

Corregido en esta misma entrega:

- `ExpenseForm.jsx` consultaba **toda** la colección `expenses` para sugerir
  nombres de evento; las rules lo rechazan para no-admins y quedaba como
  promesa sin manejar. Ahora filtra por `userId` salvo admin y captura el
  error.
- `UserDashboard.jsx`: warning de React por `key` faltante en el fragmento
  de filas por centro de costo.
- `AdminApprovals.jsx`: aprobar/rechazar no dejaban rastro de quién ni
  cuándo. Ahora escriben `reviewedAt/reviewedByUid/reviewedByName` y una
  entrada en `expenses/{id}/movements` (TD-016 parcial).
- `InstallButton`: etiqueta del sidebar acortada a "Instalar app" (la larga
  se partía en dos líneas).

Detectado y registrado sin corregir (requiere decisión de modelo de datos):

- TD-026: `projects.expenses` y `users.balance` mezclan monedas (un gasto
  de 42.50 USD sumó 42.5 al acumulado en COP).

## Estado del deploy

- 2026-10-25: commit `f2ff128` pusheado a `main` y `firebase deploy --only
  hosting` ejecutado contra `spi-smart-expense`. Verificado por HTTP:
  `index.html` enlaza manifest e íconos del tenant, `sw.js` y
  `manifest.webmanifest` se sirven con `Cache-Control: no-cache`, los assets
  con hash como `immutable`, y los íconos 192/512/maskable responden 200.
- Pendiente de verificación manual en dispositivos: prompt nativo en
  Chrome/Android, modal iOS, toast de actualización en el próximo deploy
  (puntos 1 y 2 de este documento).
