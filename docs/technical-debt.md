# Technical Debt

Items logged here are known issues, workarounds, and sub-optimal patterns that should be addressed in future sprints.

---

## TD-001 — Firebase Storage CORS not configured on the GCS bucket

**Severity:** High  
**Discovered:** Stage 1 (Task 63)  
**Status:** Mitigated in code; infra fix still pending

**Problem:** Firebase Storage does not emit `Access-Control-Allow-Origin` headers by default. Any `fetch()` call from the browser to `firebasestorage.googleapis.com` fails with a CORS error, making ZIP downloads impossible.

**Workaround applied:** `AdminReports.jsx` now uses the Firebase Storage SDK's `getBytes(ref(storage, path))` which bypasses CORS entirely (uses the SDK auth channel).

**Permanent fix (run once, requires GCP IAM):**
```bash
# From project root — replace YOUR-BUCKET with actual bucket name from .env
gsutil cors set cors.json gs://YOUR-BUCKET.appspot.com
# Verify:
gsutil cors get gs://YOUR-BUCKET.appspot.com
```
The `cors.json` config is in the project root.

---

## TD-002 — Client-side Gemini API key exposure

**Status:** ✅ Resuelto en Ola 2 (2026-10-25). Gemini se llama desde el callable
`extractReceipt` con la key como secreto de Functions; `@google/generative-ai`
salió del bundle. Se detectó además que `validateEnv(import.meta.env)` hacía
incrustar todas las `VITE_*` (corregido). Pendiente operativo: rotar la key,
que estuvo pública (runbook `deploy-ola-2.md`, paso 7).

**Severity:** Medium  
**File:** `src/lib/gemini.js` (line 7)

**Problem:** `VITE_GEMINI_API_KEY` is embedded in the client bundle and visible to anyone who inspects the app. Noted in gemini.js as a comment but not resolved.

**Recommended fix:** Proxy Gemini calls through a Firebase Cloud Function so the key never leaves the server.

---

## TD-003 — Full Firestore collection scans

**Plan v4:** se resuelve en la Ola 9.

**Severity:** Medium (scalability)  
**Files:** `AdminReports.jsx`, `AdminApprovals.jsx`, `BulkUpload.jsx`, `ExpenseForm.jsx`

**Problem:** `getDocs(collection(db, 'expenses'))` loads all documents client-side, then filters in JavaScript. At scale (10k+ expenses) this will be slow and expensive.

**Recommended fix:** Migrate filters to Firestore compound queries with proper indexes, or move aggregation to Cloud Functions.

---

## TD-004 — `window.confirm()` for destructive-action gates

**Severity:** Low (UX)  
**Files:** `AdminReports.jsx` (bulk download confirmation), `ExpenseForm.jsx`

**Problem:** `window.confirm()` is synchronous, blocks the main thread, and cannot be styled. It also doesn't match the app's design system.

**Recommended fix:** Replace all `window.confirm()` calls with the existing `ConfirmDialog` component.

---

## TD-005 — No test suite

**Severity:** Medium  
**Status:** Acknowledged from project start (noted in CLAUDE.md)

**Problem:** Zero automated tests. Any refactor or new feature risks silent regressions.

**Recommended fix:** Add Vitest + React Testing Library for unit/component tests, and Playwright for critical user flows (login → submit expense → approve).

---

## TD-006 — TRM not fetched for USD expenses in bulk upload

**Severity:** Low (deferred by design)  
**File:** `src/pages/BulkUpload.jsx`  
**Discovered:** Stage 1 (Task 56)

**Problem:** Bulk-uploaded USD expenses are stored without TRM / `amountCOP` fields because fetching TRM per-row during OCR would add latency and API calls.

**Recommended fix:** After OCR, fetch TRM once for the current date and apply it to all USD rows in the review table (Stage 2 / Task 39).

---

## TD-007 — EUR→COP has no official historical series

**Severity:** Low (accepted)  
**File:** `src/lib/exchangeRate.js`  
**Discovered:** Adding EUR as first-class currency (2026-09-17)

**Problem:** Banco de la República publishes an official historical TRM only for USD→COP. EUR→COP rates are fetched from `open.er-api.com` at the moment of the request, so past EUR expenses capture the spot rate at edit time rather than the value that was in effect on the expense date.

**Recommended fix:** If accounting requires historical accuracy for EUR, switch to a paid API with historical EUR/COP series (e.g. exchangerate.host, currencylayer) and mirror the USD BanRep/fallback pattern.

---

# Items registered from full-app review (2026-09-17)

The three high-priority findings from that review (secrets/PIN in `AdminUserSeeder`,
non-transactional balance updates, empty catches) were fixed in the same commit
that created this section. The items below are the deferred ones — logged here
so nothing gets lost.

## TD-008 — Full historical trail of TRM per expense

**Severity:** Medium (auditoría)  
**Impact:** Medium · **Effort:** Low  
**File:** `src/lib/exchangeRate.js` + expense docs

**Problem:** Foreign-currency expenses store `trm` and `trmSource` but not the
capture timestamp nor whether the rate is historical (BanRep) or live (fallback).
Accounting audits need to reconstruct which rate was applied and why.

**Recommended fix:** Add `trmCapturedAt` (ISO), `trmDate` (fecha del gasto usada
para la consulta), and `trmType: 'historical' | 'live'` to every expense that
has a non-null `trm`. Backfill for existing rows is optional.

---

## TD-009 — Bounded queries + paginación cursor en pantallas admin

**Severity:** High (rendimiento/costo)  
**Impact:** High · **Effort:** Medium  
**Files:** `src/pages/AdminApprovals.jsx` (limit 500 arbitrario),
`src/pages/AdminDashboard.jsx` (`getDocs(collection(db,'expenses'))` sin límite),
`src/pages/UserExpenses.jsx:31` (falta índice, se ordena en cliente)

**Problem:** Con "cientos de gastos/mes" el crecimiento es lineal. Ya recorremos
la colección entera en varios lugares — costo Firestore + memoria del cliente.

**Recommended fix:** Definir índices compuestos (`status + createdAt DESC`,
`userId + createdAt DESC`) y añadir `orderBy` + `limit(50)` + cursor pagination.
Para KPIs del dashboard, calcular agregados en Cloud Function on-write y leer
un solo doc `stats/monthly-YYYY-MM`.

---

## TD-010 — Lazy-load de rutas + auditar peso de `framer-motion`

**Severity:** Medium (rendimiento inicial)  
**Impact:** Medium · **Effort:** Low  
**File:** `src/App.jsx`, `package.json`

**Problem:** Todas las páginas se importan eagerly; el bundle admin viaja al
login. `framer-motion` (~40kb gzip) se usa solo en un par de sitios (motion.div
en `BulkActionBar`, transitions puntuales).

**Recommended fix:** Migrar rutas a `React.lazy(() => import('./pages/X'))` +
`Suspense` con `TableSkeleton` como fallback. Auditar con `vite-bundle-visualizer`
y considerar CSS transitions donde `framer-motion` es overkill.

---

## TD-011 — Memoización de cálculos pesados en AdminDashboard

**Severity:** Medium  
**Impact:** Medium · **Effort:** Low  
**File:** `src/pages/AdminDashboard.jsx` (detección de anomalías, agregados por proyecto)

**Problem:** Solo hay ~36 usos de `useMemo`/`useCallback`/`memo` en toda la
app. Los cálculos de anomalías (outliers, weekend spend, over-budget) corren
en cada render sin memoización.

**Recommended fix:** Envolver los `useMemo` con dependencias explícitas por
cada agregación pesada. Perfilar con React DevTools antes/después.

---

## TD-012 — ErrorBoundary por ruta (no un solo global)

**Severity:** Low-Medium  
**Impact:** Low · **Effort:** Low  
**File:** `src/main.jsx`, `src/App.jsx`

**Problem:** Un solo `ErrorBoundary` en `main.jsx` envuelve toda la app. Un
crash en `/admin/reports` tumba la navegación completa.

**Recommended fix:** Añadir un `ErrorBoundary` por `Route` (o al menos uno para
admin y otro para dashboard) que muestre fallback local y permita "reintentar".

---

## TD-013 — Test suite (Vitest + emulador Firebase)

**Plan v4:** se resuelve en la Ola 16.

**Severity:** High (calidad)  
**Impact:** High · **Effort:** High  
**Status:** consolidates TD-005

**Problem:** Cero tests. La lógica de dinero (aprobar, rechazar, editar
allocation, currency conversion) no tiene red de seguridad.

**Recommended fix:** Vitest + `@firebase/rules-unit-testing` para arrancar
emulador. Suites objetivo: `fixBalances` con datasets sintéticos, aprobar →
verificar balance/project.expenses/movements, currency conversion USD/EUR/COP.
Cobertura mínima 60% en `src/lib/` y `src/utils/`, 100% de flujos
aprobar/rechazar/editar.

---

## TD-014 — Refactor de componentes monolíticos

**Plan v4:** se resuelve en la Ola 16.

**Severity:** Medium (mantenibilidad)  
**Impact:** Medium · **Effort:** High  
**Files:** `AdminApprovals.jsx` (1292 loc), `ExpenseForm.jsx` (1164 loc),
`BulkUpload.jsx` (877 loc)

**Problem:** Componentes gigantes acumulan responsabilidades y hacen cualquier
cambio arriesgado.

**Recommended fix:** Descomponer por responsabilidad, no por líneas.
`AdminApprovals` → `useApprovalsQuery` (data), `useApprovalsFilters` (state),
`<ApprovalsTable/>` (render), `<BulkActionsController/>` (mutations).
`ExpenseForm` → `UploadStep`, `ReviewStep`, `ClassifyStep` + hook
`useReceiptExtraction`.

---

## TD-015 — Reporte de variación presupuestaria

**Severity:** Medium (valor negocio)  
**Impact:** High · **Effort:** Medium

**Gap:** `AdminReports.jsx` es un exporte crudo; no hay vista "presupuesto vs.
ejecutado" por proyecto/usuario/mes.

**Recommended fix:** Nueva ruta `/admin/analytics/budget-variance`. Tabla
pivote (filas = proyecto/usuario, columnas = meses, celdas = allocated / spent
/ variance %). Alertas cuando variance > 80% o < -20%. Reutilizar
`DonutCategories`, `LineChartMonthly`, `AlertsPanel`, `format.js`.

---

## TD-016 — Historial de aprobaciones enriquecido en modal de detalle

**Status:** ✅ Resuelto en Ola 5 (2026-10-25). `AuditTimeline` en el detalle
muestra acción, actor, comentario y overrides; los eventos de revisión los
escribe el servidor.

**Status:** Parcial (2026-10-25). El callable `reviewExpense` escribe
`reviewedAt`, `reviewedByUid`, `reviewedByName` y las entradas de `movements`
(`status`, `rejectionReason`) en la misma transacción server-side, para
aprobar, rechazar y reabrir desde cualquier pantalla. Falta el componente
`AuditTimeline` y el comentario opcional de aprobación (Ola 5).

**Severity:** Medium (auditoría)  
**Impact:** Medium · **Effort:** Medium  
**Files:** `src/lib/audit.js`, `src/components/ExpenseDetailsModal.jsx`

**Gap:** `audit.js` registra movimientos en subcolección `expenses/{id}/movements`
pero no hay UI que los muestre; tampoco se captura `actorUid`/`actorName` ni
comentario opcional de aprobación.

**Recommended fix:** Extender `movements` con `{actorUid, actorName, action,
comment, timestamp, previousStatus, newStatus}`. Nuevo componente
`AuditTimeline` renderizado dentro de `ExpenseDetailsModal`. Campo opcional
"comentario de aprobación" en `AdminApprovals`.

---

## TD-017 — Virtualización de tabla de aprobaciones

**Severity:** Medium (rendimiento con datos grandes)  
**Impact:** Medium · **Effort:** Medium  
**File:** `src/pages/AdminApprovals.jsx`

**Problem:** Con paginación (TD-009) puede no ser urgente. Reevaluar si tablas
alcanzan >200 filas en pantalla.

**Recommended fix:** `@tanstack/react-virtual` (más ligero que `react-window`).

---

## TD-018 — Cloud Function para recalcular balances (cron semanal + alerta)

**Plan v4:** se resuelve en la Ola 9.

**Severity:** Medium (integridad)  
**Impact:** Medium · **Effort:** Medium  
**File:** `src/utils/fixBalances.js`

**Gap:** El reconciliador existe pero solo corre manual. Si un día una
transacción falla parcialmente o se hace una escritura por script sin pasar
por la app, no hay detección.

**Recommended fix:** Cloud Function `scheduled` (Cloud Scheduler) que corra
`recalculateAllUserBalances` semanalmente en modo dry-run, compare con
`user.balance` actual, y dispare notificación (email + Notification bell) si
detecta drift > 100 COP.

---

## TD-019 — Integrar Sentry sobre `logger.js`

**Plan v4:** se resuelve en la Ola 9.

**Severity:** Medium (observabilidad)  
**Impact:** Medium · **Effort:** Low  
**File:** `src/lib/logger.js`

**Gap:** El logger centralizado ya existe pero solo delega en `console`.

**Recommended fix:** Añadir `@sentry/react` con DSN por env (`VITE_SENTRY_DSN`),
enviar `logger.error` (y opcionalmente `warn`) a Sentry solo en producción,
scrub PII (email, nombre). Wrap `ErrorBoundary` con `Sentry.ErrorBoundary`.

---

## TD-020 — Validar variables de entorno al arranque

**Status:** ✅ Resuelto en Ola 0 (2026-10-24). `src/lib/env.ts` valida todas las
`VITE_*` requeridas y `main.jsx` renderiza `EnvError.jsx` con la lista exacta
de variables faltantes antes de montar la app.

**Severity:** Low  
**Impact:** Low · **Effort:** Low  
**File:** `src/lib/firebase.js`

**Problem:** `isConfigured` solo verifica `apiKey`; si falta cualquier otra
var, la app arranca y falla en runtime con mensajes crípticos.

**Recommended fix:** Al arrancar, validar la presencia de todas las vars
`VITE_FIREBASE_*` y `VITE_GEMINI_API_KEY`. Mostrar pantalla de error clara si
falta alguna.

---

## TD-021 — Índice Firestore + `orderBy` en UserExpenses

**Plan v4:** se resuelve en la Ola 9.

**Status:** Parcial (Ola 0). El índice `userId ASC + createdAt DESC` ya está
declarado en `firestore.indexes.json`. Falta deployarlo (`firebase deploy
--only firestore:indexes`) y luego añadir el `orderBy` a la query.

**Severity:** Low  
**Impact:** Low · **Effort:** Low  
**File:** `src/pages/UserExpenses.jsx:31`

**Problem:** Comentario del propio autor indica falta de índice; se ordena en
cliente.

**Recommended fix:** Definir índice compuesto `userId + createdAt DESC`,
añadir `orderBy('createdAt', 'desc')` a la query, quitar sort cliente.

---

## TD-022 — Proxy de Gemini vía Cloud Function

**Status:** ✅ Resuelto en Ola 2 (2026-10-25). `functions/src/extractReceipt.ts`:
Gemini vía Vertex AI con IAM (sin API key, ADR 0011), fallback de modelo con reintentos, rate limit diario
por usuario (60) y por tenant (1500) en `rateLimits/`, `mode: 'health'`.
Verificado en emuladores con un recibo sintético.

**Severity:** High (seguridad/costo)  
**Impact:** High · **Effort:** High  
**Status:** consolidates TD-002 with more detail

**Problem:** `VITE_GEMINI_API_KEY` viaja en el bundle. Cualquier autenticado
(o alguien que decompile) puede consumir cuota.

**Recommended fix:** Cloud Function `POST /extractReceipt` que reciba imagen
(base64 o Storage path), valide auth, llame Gemini con secret server-side,
aplique rate-limit por UID (ej. 30/día). Frontend consume vía `httpsCallable` —
`src/lib/gemini.js` pasa a ser thin client. Secret en Secret Manager.

---

# Items registered in Ola 0 (2026-10-24)

## TD-023 — Reglas React Compiler de `eslint-plugin-react-hooks` desactivadas

**Severity:** Medium (calidad)  
**Impact:** Medium · **Effort:** Medium  
**File:** `eslint.config.js`

**Problem:** `eslint-plugin-react-hooks` 7.x añadió `set-state-in-effect` (11
hallazgos), `refs` (6) e `immutability` (1), todos en páginas monolíticas
(`ExpenseForm`, `AdminApprovals`, `AdminReports`, `AdminBalances`, etc.). Los
errores existían antes de Ola 0 pero la caché de ESLint los ocultaba. Para que
CI pase sin tocar lógica de negocio en una ola "sin cambio funcional", las
tres reglas quedaron en `off`.

**Recommended fix:** Reactivar las reglas al descomponer cada componente en
Ola 9 (TD-014). Mientras tanto, cualquier componente nuevo debe cumplirlas
aunque la regla esté apagada.

---

## TD-024 — Índice compuesto de `notifications` ausente en producción

**Status:** Índice deployado el 2026-10-25 (confirmado con `firebase
firestore:indexes`: antes del deploy producción tenía cero índices
compuestos). Falta verificar la campana con un usuario real y añadir el
`logger.error` en el callback de error de `onSnapshot`.

**Severity:** High (bug latente)  
**Impact:** High · **Effort:** Low  
**Files:** `src/lib/notifications.js:36-38`, `firestore.indexes.json`

**Problem:** `firebase firestore:indexes` devolvió `[]` para el proyecto de
SPI, pero `subscribeNotifications` usa `where('toUid','==') +
orderBy('createdAt','desc')`, que exige un índice compuesto. Sin él, Firestore
rechaza la suscripción con `failed-precondition` y la campana queda vacía en
silencio.

**Recommended fix:** El índice ya está declarado en `firestore.indexes.json`
(Ola 0). Ejecutar `firebase deploy --only firestore:indexes`, esperar a que el
índice quede `READY` en la consola y verificar que la campana muestra
notificaciones. Añadir `logger.error` en el callback de error de `onSnapshot`
para que este tipo de fallo no vuelva a pasar desapercibido.

---

## TD-025 — Manifest e íconos PWA no son por tenant

**Status:** ✅ Resuelto en Ola 1 (2026-10-25). Manifest generado por
`vite-plugin-pwa` desde el tenant; íconos en `public/icons/<id>/` vía
`scripts/generate-icons.py`.

**Severity:** Low (hasta Ola 1)  
**Impact:** Low · **Effort:** Low  
**Files:** `public/manifest.webmanifest`, `public/logo.png`

**Problem:** `index.html` ya se personaliza por tenant en build (título,
descripción, `theme-color`, `lang`), pero el manifest y los íconos siguen
siendo estáticos de SPI. Un build con `VITE_TENANT=demo` instala con nombre e
ícono de SPI.

**Recommended fix:** Ola 1 (`vite-plugin-pwa`) genera el manifest desde
`tenants/<id>.json` y los íconos 192/512/maskable desde `branding.logo`.

---

## TD-026 — `projects.expenses` y `users.balance` suman montos de distintas monedas

**Plan v4:** se resuelve en la Ola 11 (prerrequisito de la integración contable).

**Severity:** High (integridad financiera)  
**Impact:** High · **Effort:** Medium  
**Files:** `src/pages/AdminApprovals.jsx` (approve: `increment(expense.amount)`),
`src/pages/ExpenseForm.jsx` (submit: `balance: increment(item.amount)`),
`src/pages/AdminApprovals.jsx` (reject: `increment(-amount)`)

**Problem:** Reproducido en emuladores (2026-10-25): aprobar un gasto de
42.50 USD dejó `projects/proj-mision-miami.expenses = 42.5`, sumado al mismo
campo donde se acumulan pesos. Lo mismo ocurre con `users.balance` al enviar
o rechazar gastos en USD/EUR/CLP. Los dashboards mitigan esto recalculando
por moneda desde los gastos, pero los campos agregados están corruptos para
cualquier tenant con gasto en moneda extranjera.

**Recommended fix:** En Ola 5, cuando aprobar/rechazar pasen a callables
server-side, acumular siempre en moneda base del tenant usando `amountCOP`
(o el equivalente que defina `country.ts`) y rechazar la aprobación si un
gasto FX no tiene tasa. Script de migración `recalculate-aggregates` con
dry-run para corregir los acumulados históricos.

**Update 2026-10-25 (Ola 2):** la regla vive ahora en un solo lugar
(`functions/src/aggregates.logic.ts`, ADR 0010), así que el fix es un cambio
en esa función pura más la migración de recálculo.

**Update 2026-10-25 (Ola 7):** los gastos nuevos guardan `amountBase` en la
moneda base del tenant (CLP en el demo), así que el fix ya tiene su dato:
sumar `amountBase ?? amountCOP ?? (currency === base ? amount : rechazar)`.
En el demo, aprobar el gasto en USD sembrado reproduce el problema.

---

# Items registered in Ola 2 (2026-10-25)

## TD-027 — Actualizar `firebase-functions` 6.x → 7.x

**Severity:** Low  
**Impact:** Low · **Effort:** Low-Medium  
**File:** `functions/package.json`

**Problem:** El emulador avisa "package.json indicates an outdated version of
firebase-functions". La 7.x trae breaking changes (Comandas ya la usa); no se
hizo en Ola 2 para no mezclarlo con la primera salida a producción del backend.

**Recommended fix:** Subir a `firebase-functions@^7` con los emuladores
andando, revisar `onCall`/`onDocumentWritten` y `params`, correr los tests de
`functions/` y `test:rules`.

---

## TD-028 — El saldo del dashboard puede llegar ~1 s tarde tras enviar

**Severity:** Low (UX)  
**Impact:** Low · **Effort:** Low  
**Files:** `src/pages/UserDashboard.jsx`, `src/pages/AdminUserDetails.jsx`

**Problem:** `users.balance` lo escribe el trigger `onExpenseWritten` (ADR
0010). Tras enviar una rendición la app navega al dashboard y lee el saldo con
`getDoc`; si llega antes que el trigger muestra el valor anterior hasta la
próxima carga. En emuladores la latencia fue < 1 s; en producción con cold
start puede ser mayor.

**Recommended fix:** Suscribir el saldo con `onSnapshot` en `UserDashboard`
(y en `AdminUserDetails`), lo que además encaja con el modo offline de Ola 6.

---

## TD-029 — Rutas desconocidas muestran una página en blanco

**Severity:** Low  
**Impact:** Low · **Effort:** Low  
**Files:** `src/App.jsx`

**Problem:** No hay ruta comodín: `/dashboard/new` (o un enlace viejo)
deja la pantalla en blanco sin mensaje. Detectado al probar el demo.

**Recommended fix:** `<Route path="*" element={<Navigate to="/" replace />} />`
o una página 404 simple con enlace al inicio.

---

## TD-030 — "Listo para terreno" solo vive en Mi Espacio

**Severity:** Low (UX)  
**Impact:** Medium · **Effort:** Low  
**Files:** `src/components/FieldReadyCard.tsx`, `src/pages/MiEspacio.jsx`, `src/pages/UserDashboard.jsx`

**Problem:** La tarjeta está en `/dashboard/mi-espacio`, que el menú llama
"Notificaciones". Quien rinde aterriza en Mi Resumen y puede no descubrirla.
El plan pedía además un aviso al instalar la app (Ola 8, punto 5), que no se
hizo.

**Recommended fix:** Versión compacta en Mi Resumen ("Listo para terreno ·
hace 2 h" o "Prepara tu teléfono") y un aviso tras `appinstalled` cuando el
lector está activo.

---

## TD-031 — Panel de precisión sin casos fallidos

**Status:** Parcial en Ola 8b (2026-10-26): contadores diarios `ocrStats`,
tendencia semanal del monto y desglose por modo. Falta la lista de casos
fallidos (por diseño no hay valores; requiere el opt-in de imágenes de la
Ola 8d) y el desglose por tipo de documento y versión del lector (están en
`ocrEval`, no en los contadores).

**Severity:** Low  
**Impact:** Medium · **Effort:** Medium  
**Files:** `src/components/OfflineReaderCard.tsx`, `src/lib/ocrStats.ts`, `functions/src/offline.ts`

**Problem:** El panel calcula en el navegador sobre los últimos 500
`ocrEval`: no muestra la evolución en el tiempo ni por tipo de documento, y
por diseño (ADR 0015) no hay valores para revisar casos fallidos.

**Recommended fix:** Agregado diario en una Function (`ocrEvalDaily/{fecha}`)
con aciertos por campo, motor y tipo de documento; gráfico de 30 días. Para
casos fallidos, opt-in del tenant que guarde la foto en una carpeta de
corpus con retención corta.

---

## TD-032 — Reglas OCR: comercio por primera línea y sin corrección de giro

**Severity:** Low  
**Impact:** Medium · **Effort:** Medium  
**Files:** `src/lib/localReader/rules.ts`, `src/lib/localReader/ocr.ts`

**Problem:** Sin diccionario, el comercio es la primera línea con letras
("ESTACION DE SERVICIO" en vez de "COPEC S.A."). El OCR no corrige fotos
giradas 90°/180° (sin OSD) y el preprocesado es solo grises + contraste.
El corpus actual es sintético: la precisión real se conocerá con las
boletas del responsable (`docs/pendientes.md`).

**Recommended fix:** Con el corpus real: preferir la línea con forma
societaria (S.A., SpA, Ltda) o junto al RUT; probar `tessedit_pageseg_mode`
y umbral adaptativo; detectar orientación por la confianza de 4 giros si el
resultado es pobre.


---

## TD-033 — Candidatos de monto con ruido (cantidades y porcentajes)

**Severity:** Low  
**Impact:** Low · **Effort:** Low  
**Files:** `src/lib/localReader/rules.ts`

**Problem:** `amountCandidates` incluye cantidades ("2 MENU EJECUTIVO") y
porcentajes ("PROPINA 10%") como montos. No afecta el voto (solo cuenta la
etiqueta cuyo valor coincide exactamente con el confirmado, y si dos
etiquetas coinciden no se vota), pero infla el payload.

**Recommended fix:** Descartar números seguidos de `%`, enteros < 10 al
inicio de la línea y valores menores al 1 % del mayor monto.

---

## TD-034 — El aprendizaje por emisor solo cubre la etiqueta del total

**Severity:** Low  
**Impact:** Medium · **Effort:** Medium  
**Files:** `functions/src/offline.ts`, `src/lib/localReader/rules.ts`

**Problem:** `readerProfiles` aprende qué etiqueta marca el total. La fecha,
el folio y el comercio por emisor aún no se aprenden (el comercio sí, vía
diccionario de aprobados). Con el corpus real se verá qué campo falla más.

**Recommended fix:** Mismo patrón de votos para el formato de fecha y la
etiqueta del folio por emisor; llevarlo a la capa general en la Ola 8c.

---

## TD-035 — Envío al hub sin prueba de punta a punta

**Severity:** Medium  
**Impact:** Medium · **Effort:** Low  
**Files:** `functions/src/learning.ts`, `functions/src/hub.ts`

**Problem:** La verificación del ID token de Google en `ingestContribution`
y el `POST` con `getIdTokenClient` no se pueden probar en el emulador (los
tokens de cuenta de servicio reales solo existen en GCP). Probado: esquema,
filtros, outbox, consentimiento.

**Recommended fix:** Al crear el proyecto central, conectar el demo
(runbook §2) y verificar `lastResult.destination = "hub"` y
`envIssuers/<envId>`; luego, una prueba de humo que llame a
`ingestContribution` sin token (403) y con un cuerpo con un campo extra
(400).

---

## TD-036 — El paquete de lectura no tiene métrica automática de mejora

**Severity:** Low  
**Impact:** Medium · **Effort:** Medium  
**Files:** `scripts/build-reader-pack.mjs`, `src/lib/localReader/localReader.corpus.test.ts`

**Problem:** Cada lectura guarda `packVersion` en `ocrEval`, pero el panel no
compara la precisión antes y después de un paquete, y `pack:build` no corre
el corpus con el paquete nuevo antes de escribirlo.

**Recommended fix:** Que `pack:build` corra el test de corpus con el paquete
candidato y se niegue a escribirlo si baja la precisión; panel de
precisión por `packVersion` desde `ocrEval`.
