# Validación — Ola 2: Backend seguro

**Fecha:** 2026-10-25
**Impacto en SPI:** fricción mitigada. Ningún flujo cambia de lugar en la UI;
cambian los cimientos: quién escribe el dinero, dónde vive la key de Gemini y
cómo autorizan las rules. Ver `docs/runbooks/deploy-ola-2.md` para el orden
de salida a producción.

Formato: qué cambió → cómo probarlo → estado esperado. Marcar ✅ al verificar.

---

## 1. Balance y gasto de proyecto se derivan en el servidor

**Qué cambió:** el trigger `onExpenseWritten` (`functions/src/aggregates.ts`)
es el único que escribe `users.balance` y `projects.expenses`. Reacciona a
cada creación, edición, borrado o cambio de estado de un gasto; la lógica pura
está en `aggregates.logic.ts` (10 tests) y es idempotente mediante
`aggregateLedger/{eventId}`. Semántica idéntica a la que tenía el cliente:
balance = suma de gastos no rechazados y no de empresa (monto crudo, sin FX —
TD-026 sigue abierto); `projects.expenses` = suma de gastos aprobados.
El cliente ya no escribe `balance` en ningún lado (`ExpenseForm`,
`BulkUpload`, `UserExpenses`, `EditExpenseModal`, borrado en
`AdminApprovals`, `AdminUserDetails`).

**Cómo probarlo (emuladores):** `npm run emulators`, `npm run seed:emu`,
luego:
```bash
curl -s -H "Authorization: Bearer owner" \
  "http://127.0.0.1:8080/v1/projects/spi-smart-expense/databases/(default)/documents/users"
```
Crear una rendición manual como profesional y volver a consultar.

**Estado esperado:** el seed deja `test-professional` en 805042.5 (incluye
los 42.5 USD crudos, TD-026) y `proj-feria-bogota.expenses = 620000` sin que
el seed escriba balances; tras la rendición nueva el balance sube por el
monto. Nota: el dashboard puede mostrar el saldo anterior ~1 s después de
enviar (latencia del trigger, TD-028). ☐

## 2. Aprobar, rechazar y reabrir pasan por `reviewExpense`

**Qué cambió:** callable `reviewExpense({ expenseId, action:
approve|reject|reopen, reason })` (`functions/src/expenses.ts`). Autoriza por
claims (admin; `canApprove` para moneda ≠ COP; `isColombiaApprover` para COP;
reabrir solo admin), y en una sola transacción escribe `status`,
`reviewedAt/reviewedByUid/reviewedByName`, las entradas en `movements` y la
notificación al profesional. Es idempotente (no-op si ya está en el estado
destino) y rechaza aprobar algo rechazado o rechazar algo aprobado. Lo usan
`AdminApprovals` (individual y masivo) y el selector de estado de
`AdminUserDetails`; cliente en `src/lib/expenseActions.ts` sobre
`src/lib/functions.ts`.

**Cómo probarlo:** como admin, aprobar una rendición y rechazar otra con
motivo; como profesional, intentar la callable por REST:
```bash
curl -s http://127.0.0.1:5001/spi-smart-expense/us-central1/reviewExpense \
  -H "Authorization: Bearer <idToken profesional>" -H "Content-Type: application/json" \
  -d '{"data":{"expenseId":"exp-pending-1","action":"approve"}}'
```

**Estado esperado:** toasts "Gasto aprobado." / "Gasto rechazado y saldo
devuelto."; el gasto tiene `reviewedByName` y una entrada `status` en
`movements`; la campana del profesional recibe la notificación; la llamada
sin sesión responde `UNAUTHENTICATED` y la del profesional
`PERMISSION_DENIED` con mensaje en español. ☐

## 3. Gemini detrás de `extractReceipt`

**Qué cambió:** Gemini se consume vía **Vertex AI** con el SDK
`@google/genai` (`vertexai: true`, ubicación `VERTEX_LOCATION`, por defecto
`global`): la service account de Functions autentica con IAM y no existe
ninguna API key (ADR 0011). El callable (`functions/src/extractReceipt.ts`) usa
`gemini-3.6-flash` con fallback a `gemini-3.5-flash-lite` y reintentos,
limita por día por usuario (`GEMINI_DAILY_LIMIT_USER`, 60) y por tenant
(`GEMINI_DAILY_LIMIT_TENANT`, 1500) en `rateLimits/{yyyymmdd}_user_{uid}` y
`_tenant_{id}`, y expone `mode: 'health'`. `src/lib/gemini.js` quedó como thin
client y `@google/generative-ai` salió del bundle web.

Hallazgo corregido en el camino: el bundle anterior traía
`VITE_GEMINI_API_KEY` y, peor, `validateEnv(import.meta.env)` hacía que Vite
incrustara **todas** las variables `VITE_*`. Ahora cada variable se lee de
forma explícita. La key de AI Studio estuvo pública en el bundle y ya no se
usa: **eliminarla después del deploy** (runbook, paso 7).

**Cómo probarlo:** con la API habilitada y el rol otorgado (runbook, paso 1),
`npm run vertex:check -- --project spi-smart-expense` debe responder `ok`
para ambos modelos; luego subir un recibo en "Nueva Rendición".

**Cómo probarlo:** subir una foto de recibo en "Nueva Rendición"; o por REST
con `{"data":{"mode":"health"}}`. Verificar el bundle:
```bash
npm run build && grep -l "VITE_GEMINI" dist/assets/*.js ; echo "sin coincidencias = ok"
```

**Estado esperado:** campos pre-llenados (en emuladores, un recibo sintético
colombiano devolvió fecha, NIT, total 71.500 COP, Visa ****4242 y categoría
en ~9 s); `rateLimits` incrementa 1 por llamada; sin `VITE_GEMINI` en
`dist/`. ☐

## 4. Custom claims y refresh de token

**Qué cambió:** el trigger `onUserWritten` espeja `role`, `tenantId`,
`active`, `canApprove`, `canDelete`, `canExport`, `isColombiaApprover` en
custom claims. `scripts/migrations/002-backfill-claims.mjs --dry-run|--apply
[--prod]` hace el backfill (requiere `npm run functions:build`; en producción
usa `scripts/serviceAccountKey.json`). `AuthContext.syncClaims()` fuerza
`getIdToken(true)` cuando el token no coincide con el documento. El registro
propio siempre crea `professional`; los admins de arranque se promueven con
`scripts/bootstrap-admins.mjs --tenant spi --apply --prod` (se eliminó la
auto-promoción por email en el cliente).

**Cómo probarlo:** `npm run claims:backfill -- --dry-run` contra emuladores;
en la UI del emulador de Auth revisar "Custom claims".

**Estado esperado:** los tres usuarios seed muestran sus claims; un cambio de
`role` en `users/{uid}` se refleja en el token en el siguiente load sin
cerrar sesión. ☐

## 5. Rules con claims y validación de schema

**Qué cambió:** `firestore.rules` y `storage.rules` reescritas sin
`get()`/`exists()`. Matriz:

| Colección | Leer | Crear | Actualizar | Borrar |
|-----------|------|-------|------------|--------|
| `users` | cualquier activo | solo el propio, `professional`, `balance 0`, sin `permissions` | propio: solo `displayName/photoURL/forcePasswordChange/fcmTokens/updatedAt`; admin: todo | admin |
| `projects` | activo | admin | admin, `expenses` inmutable desde cliente | admin |
| `expenses` | dueño, admin o aprobador según moneda | dueño (o admin/asistente en nombre de otro), solo `pending`, schema validado | `status` y `createdAt` inmutables; admin/aprobador según moneda, o dueño mientras `pending` sin cambiar `userId` | admin o dueño mientras `pending` |
| `movements` | activo | `byUid == uid` | nunca | nunca |
| `allocations` | activo | admin | admin | admin |
| `invoices` | admin | admin | admin | admin |
| `notifications` | destinatario | cualquier activo, `read=false` | destinatario, solo `read` | nunca |
| `rateLimits`, `aggregateLedger` | nadie | nadie | nadie | nadie |

Schema de `expenses`: `amount` número > 0, `currency` en COP/USD/EUR/CLP,
`status` en pending/approved/rejected, `date` y `createdAt` strings,
`projectId`/`amountCOP`/`trm` nulos o del tipo correcto, `isCompanyExpense`
booleano. Storage: lectura dueño/admin/aprobador; escritura solo dueño,
< 10 MB, `image/*` o PDF.

**Cómo probarlo:** `npm run test:rules` (15 tests en
`tests/rules/firestore.rules.test.ts`; también corre en CI, job "Firestore
rules" con Java 21).

**Estado esperado:** 15/15 en verde. ☐

## 6. App Check

**Qué cambió:** `firebase.js` inicializa `ReCaptchaEnterpriseProvider` solo si
existe `VITE_RECAPTCHA_SITE_KEY` (nunca en emuladores);
`VITE_APPCHECK_DEBUG_TOKEN` para CI. Las Functions corren con
`enforceAppCheck: false` (monitor).

**Cómo probarlo:** registrar la key en Firebase console → App Check (paso
manual), setear la variable, redeployar hosting y revisar métricas de App
Check durante una semana.

**Estado esperado:** 100% de solicitudes verificadas antes de activar
enforce. ☐

## 7. Emuladores

**Qué cambió:** `npm run emulators` compila y levanta también Functions; las
llamadas a Vertex desde el emulador usan tus Application Default Credentials
de gcloud (`gcloud auth application-default login`); el seed ya no escribe
balances.

**Estado esperado:** `npm run seed:emu` deja balances y claims calculados
por los triggers. ☐

---

## Verificado en emuladores (2026-10-25)

- Balances y gasto de proyecto derivados del seed por el trigger; 5
  entradas en `aggregateLedger` tras una rendición nueva.
- Claims asignados por `onUserWritten` a los tres usuarios seed.
- `extractReceipt` con recibo sintético: todos los campos correctos en ~9 s;
  `mode: 'health'` ok; llamadas sin sesión y sin permiso rechazadas en
  español; contadores de `rateLimits` en 1.
- UI: profesional crea rendición (balance 805.043 → 903.043); admin aprueba
  y rechaza vía callable (Pendientes 4 → 2); notificaciones creadas en el
  servidor.
- Lint, typecheck, 41 tests unitarios (incluye 20 de `functions/`), 15 tests
  de rules, build de ambos tenants.

## Estado del deploy

- 2026-10-25: paso 1 del runbook completado en `spi-smart-expense` (APIs
  Compute/Functions/Run/Eventarc/Build/Artifact Registry/Vertex habilitadas;
  `roles/aiplatform.user` otorgado a la service account por defecto de
  Compute). `npm run vertex:check` responde `ok` para ambos modelos en
  `global`.
- 2026-10-25: App Check registrado en Firebase console con reCAPTCHA
  Enterprise (clave `6Lemyf4tAAAAAEVgv-cx5o_Z2oup58-nDTETSVYC`, dominios
  `spi-smart-expense.web.app`, `spi-smart-expense.firebaseapp.com`,
  `localhost`), en modo monitor; `VITE_RECAPTCHA_SITE_KEY` ya está en el
  `.env` de build. Enforce queda para una semana después del deploy.
- 2026-10-25: pasos 2-4 ejecutados. Functions desplegadas en
  `southamerica-east1` (la región de Firestore; el primer intento en
  `us-central1` falló por la propagación inicial del agente de Eventarc y
  se borró). Claims backfilled a los 12 usuarios (`Applied: 12`). Hosting +
  rules de Firestore y Storage liberados en un solo deploy; el bundle en vivo
  lleva la región, la clave de App Check y ningún rastro de Gemini.
  `healthcheck` responde en producción; `reviewExpense` sin sesión devuelve
  `UNAUTHENTICATED`.
- Pendiente (paso 5, manual con sesión real): subir un recibo, aprobar y
  rechazar una rendición, revisar la campana y correr la reconciliación de
  saldos en `/admin/reconciliation`. Pendiente paso 7: borrar la key de AI
  Studio. Paso 6 (enforce de App Check) a partir del 2026-11-01.
