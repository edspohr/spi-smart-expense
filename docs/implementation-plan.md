# Expense Buddy — Implementation Plan (v3)

**Producto:** Expense Buddy, plataforma genérica de rendición de gastos
desplegada como una instancia independiente por cliente (un Firebase project
por tenant, un solo repositorio).
**Primer tenant:** SPI Smart Expense (Colombia, COP). Conserva su branding y
su flujo actual sin fricción percibida.
**Segundo tenant:** `demo` (Expense Buddy, Chile/CLP), base para la prueba de
Elecnor y la oferta a otros clientes.

**Stack:** React 19 + Vite + Tailwind + Firebase (Auth / Firestore / Storage /
Functions / App Check) + Gemini + TypeScript gradual.

**Plan anterior:** `docs/archive/implementation-plan-v2-fases-1-6.md`
(fases 1-6, deployadas 2026-04-16).
**Decisiones de arquitectura:** `docs/adr/`.
**Fuera de alcance deliberado:** `docs/backlog.md`.

---

## Estado por ola

| Ola | Nombre | Impacto en SPI | Estado |
|-----|--------|----------------|--------|
| 0 | Fundaciones (tenant config, TS, tests, Functions scaffold, CI) | Transparente | En curso |
| 1 | PWA instalable | Visible positivo | Pendiente |
| 2 | Backend seguro (Functions, App Check, claims, rules) | Fricción mitigada | Pendiente |
| 3 | Superadmin + gestión de usuarios + settings | Transparente para admins | Pendiente |
| 4 | PIN por acción | Transparente (apagado por defecto) | Pendiente |
| 5 | Flujos de aprobación + auditoría + email | Transparente (política por defecto = actual) | Pendiente |
| 6 | Offline, push y share target | Visible positivo (opt-in) | Pendiente |
| 7 | País configurable + tenant demo | Transparente | Pendiente |
| 8 | Observabilidad y operación | Transparente | Pendiente |
| 9 | Calidad (refactor monolitos, e2e) | Transparente | Pendiente |

Actualizar esta tabla al cerrar cada ola (estado `Deployada YYYY-MM-DD` +
commit en `docs/README.md`).

---

## Reglas para todas las olas

- Strings de UI en español; código, comentarios e identificadores en inglés.
- Cada ola es auto-contenida y deployable por sí sola
  (`npm run build && firebase deploy`). Nunca dejar una ola a medias en `main`.
- Cambios en Firestore siempre aditivos y opcionales. Ningún documento
  existente se rompe por leerlo con el código nuevo.
- Preservar el design system Tailwind (`brand`, `shadow-soft`,
  `shadow-glass`, Inter). Los colores pasan a CSS variables pero SPI debe
  renderizar idéntico.
- `npm run lint`, `npm run typecheck` y `npm test` en verde antes de commitear.
- **Toda funcionalidad nueva es configurable por tenant** (`tenants/*.json` o
  `tenants/{id}/settings` en Firestore). **El comportamiento por defecto de
  SPI no cambia**: PIN apagado, política de aprobación = un admin aprueba,
  país COP/BanRep, Google login encendido.
- **Toda ola cierra con documentación**: ADR nuevo si hubo decisión de
  arquitectura (`docs/adr/`), `docs/technical-debt.md` (cerrar TDs
  resueltos, registrar nuevos), `docs/backlog.md` (podar lo que entró),
  `README.md` / `CLAUDE.md` si cambia la operación, y
  `docs/validation/ola-N.md` en formato
  "qué cambió / cómo probarlo / estado esperado".
- **Migraciones de datos** como scripts idempotentes en `scripts/migrations/`
  con `--dry-run` por defecto, reporte de cambios y `--apply` explícito.
  Export de Firestore a GCS antes de cada `--apply` en producción.
- Referencias cruzadas permitidas: `~/Documents/comandas-charcuteria`
  (PIN, InstallButton, App Check, users callables) y
  `~/Documents/etfa-ruido` (super admin, invitaciones, runbook de handover).
  Se portan patrones, no se copian archivos sin adaptar.

---

## Ola 0 — Fundaciones

**Goal:** Dejar el repo listo para multi-tenant, TypeScript gradual, tests y
backend sin cambiar nada de lo que SPI ve. Todo lo que viene después se apoya
en esta ola.

**Scope**
- `tenants/spi.json` y `tenants/demo.json`: branding (nombre, nombre corto,
  logo, paleta), país y moneda base, módulos habilitados,
  `security.pinEnabled`, `auth.googleLogin`, `auth.bootstrapAdminEmails`.
- Inyección en build: `VITE_TENANT=spi|demo` seleccionado en
  `vite.config.js` vía `define` (`__TENANT__`) y `transformIndexHtml` para
  `<title>`, `meta description`, `theme-color`.
- `src/lib/tenant.ts`: `tenant` tipado (`TenantConfig`), `applyTenantTheme()`
  y `hexToRgbTriplet()`.
- Paleta `brand` migrada a CSS variables en `index.css`; `tailwind.config.js`
  las referencia. `tenant.ts` las aplica al arrancar. SPI renderiza idéntico.
- Emails de admin hardcodeados en `AuthContext.jsx` → `auth.bootstrapAdminEmails`
  del tenant (el script de bootstrap de superadmin llega en Ola 3).
- `src/lib/env.ts`: valida todas las `VITE_FIREBASE_*` y `VITE_GEMINI_API_KEY`
  al arrancar; pantalla de error clara si falta alguna (cierra TD-020).
- `tsconfig.json` con `allowJs`, `checkJs: false`, `strict` en archivos `.ts`;
  `src/types/models.ts` con `Expense`, `User`, `Tenant`, `Project`,
  `Allocation`, `Movement`, `Notification`.
- Vitest + React Testing Library + jsdom. Primeros tests:
  `permissions`, `format`, `tenant`, `env`.
- `functions/` workspace en TypeScript (firebase-functions v6, Node 22),
  un solo callable `healthcheck`, cableado en `firebase.json`. No se
  deploya en esta ola.
- `firestore.indexes.json` versionado y declarado en `firebase.json`
  (abre el camino a TD-021).
- `manualChunks` más fino en Vite: `vendor-charts`, `vendor-xlsx`,
  `vendor-motion` separados.
- GitHub Actions `.github/workflows/ci.yml`: lint, typecheck, test, build
  para `spi` y `demo`, build de `functions/`. Sin deploy.

**Dependencies:** ninguna.
**Impacto en SPI:** Transparente. Mismo bundle funcional, mismos colores,
mismos emails de admin resueltos desde config.

### Prompt 0 (paste into Claude Code)

```
You are working on the Expense Buddy codebase (formerly SPI Smart Expense:
React 19 + Vite + Firebase). Implement Ola 0: multi-tenant foundations,
gradual TypeScript, tests, Functions scaffold and CI. Zero functional change
for the SPI tenant.

CONTEXT
- Read docs/implementation-plan.md (this file) and docs/adr/0001-0009.
- Admin emails are hardcoded in src/context/AuthContext.jsx. Brand colours
  live in tailwind.config.js. There are no tests, no TypeScript, no
  functions/ folder, no firestore.indexes.json, no CI.

TASKS
1. Create tenants/spi.json and tenants/demo.json following the Tenant type
   (see src/types/models.ts you will create). SPI values must reproduce the
   current app exactly (name "SPI Smart Expense", short "SPI Expense",
   brand palette from tailwind.config.js, country CO, baseCurrency COP,
   googleLogin true, pin disabled, bootstrapAdminEmails = the three current
   hardcoded emails). demo = "Expense Buddy", country CL, baseCurrency CLP,
   googleLogin false, pin disabled, neutral palette.
2. vite.config.js: read VITE_TENANT (default "spi"), import the JSON, expose
   it as __TENANT__ via define, and use transformIndexHtml to set <title>,
   meta description, theme-color and apple-mobile-web-app-title.
   Split manualChunks: vendor-charts (recharts), vendor-xlsx (xlsx, jszip),
   vendor-motion (framer-motion), keep vendor-firebase / vendor-react /
   vendor-ui (lucide-react, sonner) / vendor-ai (@google/generative-ai).
3. src/lib/tenant.ts: typed accessors over __TENANT__ plus applyBrandTheme()
   that writes CSS variables (--brand-50 ... --brand-900) on :root. Call it
   in main.jsx before render. Move tailwind brand palette to
   rgb(var(--brand-N) / <alpha-value>) references; define SPI defaults in
   index.css :root so the app never renders unstyled.
4. AuthContext.jsx: replace the hardcoded admin email list with
   tenant.auth.bootstrapAdminEmails. Behaviour identical.
5. src/lib/env.ts: validate all VITE_FIREBASE_* and VITE_GEMINI_API_KEY at
   startup; export a typed env object; main.jsx renders a clear Spanish
   error screen listing missing vars instead of mounting the app.
6. tsconfig.json (allowJs, jsx react-jsx, strict, noEmit, paths none) and
   src/types/models.ts with Expense, User, Tenant, Project, Allocation,
   Movement, Notification types derived from the current Firestore shapes.
   Add "typecheck": "tsc -p tsconfig.json" to package.json.
7. Vitest + @testing-library/react + jsdom. vitest.config.ts with
   environment jsdom, setupFiles. Tests: permissions.test.ts (resolve,
   canUserApprove for COP vs USD), format.test.ts, tenant.test.ts (both
   tenants load and satisfy the type), env.test.ts (missing var detected).
   Add "test": "vitest run" and "test:watch".
8. functions/: npm workspace in TypeScript (firebase-functions ^6,
   firebase-admin ^13, Node 22, eslint). One onCall healthcheck returning
   { ok: true, tenant, version }. Wire "functions" in firebase.json with
   predeploy build. Do NOT deploy.
9. firestore.indexes.json with the indexes implied by current queries
   (expenses: userId+createdAt desc; expenses: status+createdAt desc;
   notifications: toUid+createdAt desc) and declare it in firebase.json.
10. .github/workflows/ci.yml: on push/PR to main — npm ci, lint, typecheck,
    test, build with VITE_TENANT=spi and VITE_TENANT=demo (Firebase env
    vars from repo secrets, dummy values acceptable for build), and
    functions build. No deploy step.
11. Docs: update README.md and CLAUDE.md (commands, tenants, functions,
    tests), docs/technical-debt.md (close TD-020, note TD-021 index
    created), create docs/validation/ola-0.md.

ACCEPTANCE CRITERIA
- npm run lint, npm run typecheck, npm test, npm run build (spi and demo)
  all pass locally and in CI.
- Built spi bundle renders pixel-identical colours; the three admin emails
  still resolve role admin on first login.
- Removing any VITE_ var shows the error screen instead of a blank page.
- functions/ compiles; firebase emulators:start --only functions serves
  healthcheck.
- No Firestore document is read or written differently than before.
```

---

## Ola 1 — PWA instalable

**Goal:** Que la app se instale en escritorio y móvil con un botón siempre
visible (patrón Comandas), íconos correctos y actualizaciones controladas.

**Scope**
- `vite-plugin-pwa` con `registerType: 'prompt'`, precache del app shell,
  `navigateFallback`, `cleanupOutdatedCaches`.
- `UpdateToast` (portar `app/src/components/UpdateToast.tsx` de Comandas):
  "Actualización disponible → Recargar".
- `src/lib/install.ts` (portar `app/src/lib/install.ts` de Comandas): store
  con `useSyncExternalStore`, modos `hidden | prompt | ios | manual`,
  captura `beforeinstallprompt` antes de montar React.
- `InstallButton` (portar `app/src/components/InstallButton.tsx`): variantes
  `pill` (header, login) y `menu` (sidebar / Mi cuenta). **Nunca se
  descarta**; solo desaparece cuando la app ya está instalada. Reemplaza
  `InstallPwaPrompt.jsx` y `src/lib/pwa.js`.
- Íconos por tenant: 192, 512, 512 maskable, apple-touch 180, generados
  desde el logo del tenant en build. Manifest por tenant (nombre, colores,
  `start_url`, `lang`).
- Firestore `persistentLocalCache` + `persistentMultipleTabManager`.

**Dependencies:** Ola 0 (tenant config para manifest e íconos).
**Impacto en SPI:** Visible positivo. Botón nuevo, íconos correctos, toast
de actualización tras cada deploy.

### Prompt 1 (paste into Claude Code)

```
Implement Ola 1: installable PWA with always-visible install button.

CONTEXT
- Current PWA has no service worker, a 7-day-dismissable banner
  (InstallPwaPrompt.jsx + src/lib/pwa.js) and a stretched 1024x433 icon.
- Reference implementation: ~/Documents/comandas-charcuteria/app/src/lib/
  install.ts, components/InstallButton.tsx, components/UpdateToast.tsx,
  vite.config.js. Port the behaviour, adapt styling to this design system.

TASKS
1. Add vite-plugin-pwa (registerType 'prompt'). Manifest generated from
   loadTenant() in vite.config.js. Precache js/css/html/svg/png/webmanifest.
2. scripts/generate-icons.mjs (sharp): from tenants/<id>/logo source produce
   public/icons/<tenant>/icon-192.png, icon-512.png, icon-512-maskable.png,
   apple-touch-180.png. Run in prebuild.
3. src/lib/install.ts store + useInstallMode(); import first in main.jsx.
4. src/components/InstallButton.tsx with pill and menu variants and the
   iOS/manual instructions modal (createPortal). Mount: header (pill, when
   not hidden), Sidebar account section (menu), Login (pill).
   Delete InstallPwaPrompt.jsx and src/lib/pwa.js.
5. src/components/UpdateToast.tsx using virtual:pwa-register/react; mount in
   Layout.
6. firebase.js: initializeFirestore with persistentLocalCache +
   persistentMultipleTabManager.
7. Docs: validation/ola-1.md, README (install instructions), technical-debt
   (close PWA icon item), backlog prune.

ACCEPTANCE CRITERIA
- Lighthouse PWA installable on Chrome desktop and Android; iOS shows the
  instructions modal; installed app hides the button everywhere.
- Deploying a new build shows the update toast in open tabs; reload loads
  the new version; no stale asset errors.
- Expense list renders from cache when offline (read-only).
```

---

## Ola 2 — Backend seguro

**Goal:** Sacar secretos y lógica de dinero del cliente; que las rules sean
rápidas, estrictas y testeadas.

**Scope**
- Secret Manager para la key de Gemini y futuras credenciales.
- App Check (reCAPTCHA Enterprise) en Firestore, Storage y Functions.
  Una semana en modo monitor, luego enforce.
- `extractReceipt` callable: proxy Gemini con fallback de modelo, rate
  limit por UID y por tenant, log de consumo (cierra TD-002 / TD-022).
  `src/lib/gemini.js` pasa a thin client.
- Callables transaccionales `approveExpense`, `rejectExpense`,
  `editExpense`, `deleteExpense`: balance, presupuesto y `movements` en una
  sola transacción server-side.
- Custom claims `role` + `tenantId` espejados en `users/{uid}`; refresh
  forzado de token al cargar la app tras la migración.
- `firestore.rules` reescritas con claims (sin `get()`) y validación de
  schema por campo (`amount is number && amount > 0`, enums de `status`,
  `currency`, `role`).
- Tests de rules con `@firebase/rules-unit-testing` en emulador; en CI.

**Dependencies:** Ola 0. Plan Blaze (confirmado).
**Impacto en SPI:** Fricción mitigada: (a) re-login transparente vía
`getIdToken(true)`; (b) cold start de Gemini 1-3 s con skeleton claro,
`minInstances` evaluado en backlog; (c) App Check en monitor antes de enforce.

### Prompt 2 (paste into Claude Code)

```
Implement Ola 2: secure backend.

CONTEXT
- functions/ exists with healthcheck (Ola 0). Gemini key is in the client
  bundle. Approve/reject run client-side in AdminApprovals.jsx with
  runTransaction. Rules use get() on users/{uid} for every check.
- Reference: ~/Documents/comandas-charcuteria/functions/src/users.ts
  (claims + doc mirror pattern), app/src/data/firebase.ts (App Check).

TASKS
1. functions/src/extractReceipt.ts: onCall, requires auth + App Check,
   accepts { imageBase64 | storagePath, mimeType }, calls Gemini with the
   secret from defineSecret('GEMINI_API_KEY'), model fallback, returns the
   same JSON shape gemini.js returns today. Rate limit: Firestore counter
   rateLimits/{tenant}/{uid}/{yyyymmdd}, defaults from tenant config.
2. functions/src/expenses.ts: approveExpense, rejectExpense, editExpense,
   deleteExpense as transactional callables reproducing the exact balance /
   project / movements logic currently in the client. Client pages call
   them; remove the client-side money writes.
3. functions/src/claims.ts: onDocumentWritten(users/{uid}) mirrors role and
   tenantId into custom claims. scripts/migrations/002-backfill-claims.ts
   with --dry-run / --apply. AuthContext forces getIdToken(true) when the
   claims are missing or older than the doc.
4. Rewrite firestore.rules and storage.rules using request.auth.token.role
   / tenantId, field-level schema validation, same permission matrix as
   today (document the matrix in docs/validation/ola-2.md).
5. App Check: ReCaptchaEnterpriseProvider in firebase.js, debug token in
   dev, monitor mode first. Document the enforce switch date.
6. functions/test/rules.test.ts with @firebase/rules-unit-testing covering
   each role x collection x operation. Add to CI with the emulator.
7. Docs: ADR 0003 status update, technical-debt (close TD-002/TD-022),
   validation/ola-2.md.

ACCEPTANCE CRITERIA
- No VITE_GEMINI_API_KEY in the built bundle (grep dist/).
- Receipt extraction works end-to-end through the callable; a user hitting
  the rate limit gets a clear Spanish message.
- Approving an expense updates balance, project and movements atomically;
  killing the function mid-way leaves no partial write.
- Rules tests pass; no rule uses get()/exists() for role checks.
- Existing users keep working without manual logout.
```

---

## Ola 3 — Superadmin y gestión de usuarios

**Goal:** Un rol `superadmin` que gestiona usuarios y configuración del
tenant desde la UI, sin tocar lo que hacen los admins hoy.

**Scope**
- Rol `superadmin > admin > assistant > professional`. Admins actuales
  siguen aprobando igual; pierden gestión de usuarios y settings.
- `/admin/users` (solo superadmin) reemplaza `AdminUserSeeder`: invitar,
  cambiar rol (incluye promover a superadmin; nunca degradarse a sí mismo),
  asignar manager y proyectos, activar/desactivar, reenviar invitación,
  reset de password, reset de PIN, borrar.
- Colección `user_invitations/{email}` (patrón ETFA `firestore.rules:30-54`)
  + callables `adminInviteUser`, `adminUpdateUser`, `adminDeleteInvite`,
  `claimInvite` (patrón Comandas `functions/src/users.ts`). Email de
  invitación con Firebase Auth nativo.
- Flag `active` en usuario: desactivar cierra sesión al instante
  (ETFA `AuthContext.jsx:171-176`).
- `/admin/settings` (solo superadmin): `security.pinEnabled`, umbrales, módulos,
  branding editable, política de aprobación (se completa en Ola 5).
  Persistido en `tenants/{id}/settings` en Firestore; `tenants/*.json`
  queda como default de build.
- `scripts/bootstrap-superadmin.ts`: crea o promueve al primer superadmin
  por email. Elimina `auth.bootstrapAdminEmails` como mecanismo.
- `scripts/migrations/003-users-active-tenant.ts`: `active: true`,
  `tenantId`, `managerUid: null`.

**Dependencies:** Ola 2 (claims y callables).
**Impacto en SPI:** Transparente para admins y profesionales. Edmundo es el
único superadmin inicial. `/admin/users-seeder` deja de existir.

### Prompt 3 (paste into Claude Code)

```
Implement Ola 3: superadmin role, user management and tenant settings.

CONTEXT
- Roles today: admin, assistant, professional. AdminUserSeeder.jsx is a
  manual seeding page. No invitations, no active flag.
- References: ~/Documents/etfa-ruido/firestore.rules (isMember,
  changesPrivileges, user_invitations), etfa-ruido/src/pages/AdminUsers.jsx,
  ~/Documents/comandas-charcuteria/functions/src/users.ts.

TASKS
1. Add role 'superadmin' to models, permissions.js, ProtectedRoute, rules
   and claims. Superadmin inherits admin. A superadmin cannot demote or
   deactivate themself (server-side check).
2. functions/src/users.ts: adminInviteUser, adminUpdateUser,
   adminDeleteInvite, adminResetPassword (sends Firebase reset email),
   adminSetActive, claimInvite. All require claim superadmin except
   claimInvite.
3. user_invitations/{email} collection + rules; users create rule requires
   an active invitation and copies its role (never superadmin via invite).
4. src/pages/AdminUsers.tsx replacing AdminUserSeeder: table with search,
   role select, manager select, project assignment, active toggle, resend,
   reset password, delete; pending invitations panel; authErrorMessage
   helper. Route /admin/users (superadmin only). Remove /admin/users-seeder.
5. src/pages/AdminSettings.tsx: security.pinEnabled toggle, thresholds, modules,
   branding, approval policy placeholder. Backed by
   tenants/{id}/settings/current with rules superadmin-only write, all
   authenticated read. tenant.ts merges build JSON defaults with Firestore
   settings at runtime.
6. AuthContext: subscribe to users/{uid}; if active === false sign out and
   show "Tu cuenta fue desactivada" on Login via sessionStorage.
7. scripts/bootstrap-superadmin.ts (Admin SDK) and
   scripts/migrations/003-users-active-tenant.ts (dry-run default).
8. Docs: ADR 0004 reference, validation/ola-3.md, README/CLAUDE.md (new
   routes, scripts), technical-debt (AdminUserSeeder item closed).

ACCEPTANCE CRITERIA
- Only superadmin sees /admin/users and /admin/settings; admin gets
  redirected with a toast.
- Inviting a new email creates the invitation, sends the email, and the
  user lands with the invited role; invite cannot grant superadmin.
- Deactivating a logged-in user signs them out within seconds.
- Toggling security.pinEnabled in settings is reflected on next load for all
  users without redeploy.
```

---

## Ola 4 — PIN por acción

**Goal:** PIN de 4 dígitos para autorizar acciones sensibles, verificado
server-side, activable por el superadmin. Apagado en SPI por defecto.

**Scope**
- Portar `functions/src/pin.ts` de Comandas: `userPins/{uid}` solo
  servidor (scrypt + salt, `timingSafeEqual`), `pinLog`, 5 fallos →
  bloqueo 15 min, 10 → desactivado hasta reautenticar, rechazo de PINs
  obvios, `setOwnPin`, `verifyPin`, `adminResetPin`, helper `checkPin()`.
- Cliente: `withPin(reason, call)` + `PinPrompt` global (portar
  `app/src/data/pin.ts` y su prompt). Caché 2 min en memoria.
- Setup de PIN en Mi Espacio con declaración de responsabilidad versionada.
- Acciones protegidas (configurables en settings): aprobar/rechazar sobre
  umbral, cambiar rol o permisos, borrar gasto, export masivo, cambiar
  settings, desactivar usuario.
- Vista `pinLog` para superadmin.
- No se porta `AppLock` ni `pinLogin` (PIN al abrir la app) — queda en
  backlog como feature opcional por tenant.

**Dependencies:** Ola 3 (settings y superadmin).
**Impacto en SPI:** Transparente. `security.pinEnabled = false`; Edmundo lo activa
desde settings cuando quiera mostrarlo.

### Prompt 4 (paste into Claude Code)

```
Implement Ola 4: per-action 4-digit PIN, server-verified, tenant-toggleable.

CONTEXT
- Reference: ~/Documents/comandas-charcuteria/functions/src/pin.ts and
  app/src/data/pin.ts, components PinPrompt. Port logic, adapt UI.
- Sensitive callables already exist (Ola 2/3). security.pinEnabled lives in tenant
  settings (Ola 3).

TASKS
1. functions/src/pin.ts: setOwnPin, verifyPin, adminResetPin, checkPin
   helper; userPins and pinLog collections with rules denying all client
   access.
2. Wrap approveExpense/rejectExpense (amount >= settings.pin.approvalThreshold),
   adminUpdateUser (role/permissions), deleteExpense, export callables,
   updateTenantSettings, adminSetActive with checkPin when security.pinEnabled.
   Return HttpsError 'failed-precondition' with details.pin = required |
   invalid | locked | unset.
3. src/lib/pin.ts withPin(reason, fn) + src/components/PinPrompt.tsx
   mounted once in Layout; 2-minute in-memory cache; Spanish copy per
   reason.
4. Mi Espacio: "Seguridad" card to create/change PIN with the versioned
   responsibility statement; banner prompting setup when security.pinEnabled is on
   and hasPin is false.
5. AdminSettings: PIN section (enable, threshold, protected actions list).
   AdminUsers: "Restablecer PIN" action. /admin/security: pinLog table.
6. Tests: pin.ts unit tests (hash/verify/lockout), withPin retry flow.
7. Docs: ADR 0005, validation/ola-4.md, README.

ACCEPTANCE CRITERIA
- With security.pinEnabled off, no flow changes and no PIN UI is visible.
- With it on, approving above threshold prompts for PIN once, then not
  again for 2 minutes; 5 wrong attempts lock for 15 minutes; superadmin
  can reset a user's PIN.
- userPins is unreadable from the client (rules test).
```

---

## Ola 5 — Flujos de aprobación, auditoría y email

**Goal:** Políticas de aprobación por monto y jerarquía configurables por
tenant, trazabilidad completa y notificaciones por email.

**Scope**
- Política por tenant: `autoApproveBelow`, niveles
  `[{ maxAmount, approver: 'manager' | 'finance' | 'admin' }]`, segunda
  firma, delegación temporal (`delegateTo`, `until`).
- `managerUid` en usuario; cola "Mis aprobaciones" para managers; comentario
  de aprobación.
- `AuditTimeline` en `ExpenseDetailsModal` con `actorUid`, `actorName`,
  `action`, `comment`, before/after (cierra TD-016).
- Emails transaccionales vía Brevo desde Functions: aprobado, rechazado,
  pendiente hace N días, resumen semanal; plantillas por tenant.
- Política por defecto de SPI = flujo actual (un admin aprueba, sin
  umbrales, sin segunda firma).

**Dependencies:** Ola 3 (managers, settings), Ola 4 (PIN sobre umbral).
**Impacto en SPI:** Transparente mientras la política sea la por defecto.
Timeline de auditoría visible en detalle de gasto (positivo).

### Prompt 5 (paste into Claude Code)

```
Implement Ola 5: configurable approval workflows, audit timeline, email.

CONTEXT
- Approvals are single-level, performed by any admin via approveExpense.
- movements subcollection exists (src/lib/audit.js) but has no UI and no
  actor fields.
- Brevo is the transactional email provider (ADR 0008); API key via
  defineSecret('BREVO_API_KEY').

TASKS
1. Tenant settings: approvalPolicy { autoApproveBelow, levels[],
   requireSecondSignatureAbove, allowDelegation }. Default for spi =
   current behaviour. AdminSettings UI for it.
2. Expense model: approvals[] { level, approverUid, decidedAt, comment },
   currentLevel, requiredLevels computed server-side on create.
   approveExpense/rejectExpense enforce level, approver eligibility
   (manager of submitter, finance permission, admin), delegation, and
   second signature.
3. Users: managerUid, delegation { toUid, until }. AdminUsers UI. Mi Espacio
   "Delegar aprobaciones" when user has reports.
4. Approvals page: tabs "Mis aprobaciones" / "Todas" (admin), approval
   comment field, level badges.
5. Extend movements with actorUid, actorName, action, comment,
   previousStatus, newStatus, diff; write them inside the callables.
   src/components/AuditTimeline.tsx in ExpenseDetailsModal.
6. functions/src/email.ts: Brevo client, templates per tenant
   (approved, rejected, stalePending, weeklyDigest), triggers from the
   callables and a scheduled stalePending job. Opt-out per user in
   Mi Espacio.
7. Docs: validation/ola-5.md, technical-debt (close TD-016), ADR 0008
   reference.

ACCEPTANCE CRITERIA
- spi default policy: behaviour identical to today.
- demo policy with two levels: submitter's manager must approve before
  finance; amounts below autoApproveBelow auto-approve with a movement.
- Every approval/rejection/edit appears in the timeline with actor and
  comment; emails arrive for approved/rejected within a minute.
```

---

## Ola 6 — Offline, push y share target

**Goal:** Capturar gastos en terreno sin señal, avisar por push y compartir
fotos directo al formulario.

**Scope**
- Cola IndexedDB de gastos con recibo pendiente; Background Sync al
  reconectar; badge "N sin sincronizar"; resolución de conflictos simple
  (server wins en metadata, nunca se pierde la imagen).
- FCM: nueva aprobación requerida, aprobado/rechazado, PIN cambiado.
  Opt-in desde Mi Espacio, nunca en el primer load.
- Web Share Target: compartir imagen desde galería abre `ExpenseForm`
  precargado.

**Dependencies:** Ola 1 (service worker), Ola 2 (Functions para FCM).
**Impacto en SPI:** Visible positivo y opt-in.

### Prompt 6 (paste into Claude Code)

```
Implement Ola 6: offline expense queue, push notifications, share target.

CONTEXT
- Service worker from vite-plugin-pwa (Ola 1). Firestore persistent cache
  covers reads; Storage uploads fail offline today.

TASKS
1. src/lib/offlineQueue.ts (idb): queue { id, tenantId, uid, draft, blob,
   createdAt, attempts }. ExpenseForm submits to the queue when
   navigator.onLine is false or upload fails; UI shows "Guardado sin
   conexión". Background Sync tag + fallback interval flush on 'online'.
2. Sync worker: upload blob → create expense via callable → remove from
   queue; retries with backoff; badge in Sidebar and Mi Espacio list of
   pending items with retry/delete.
3. FCM: functions/src/push.ts sends on approval required / decided / PIN
   changed; client requests permission only from Mi Espacio toggle; tokens
   in users/{uid}/fcmTokens; service worker handles background messages.
4. manifest share_target (POST, multipart, files image/*); SW stores the
   file in Cache/IDB and redirects to /dashboard/new-expense?shared=1;
   ExpenseForm picks it up.
5. Tests: offlineQueue unit tests with fake-indexeddb.
6. Docs: validation/ola-6.md, README.

ACCEPTANCE CRITERIA
- Airplane mode: submit expense with photo → stored; back online → uploaded
  and visible to admin without user action.
- Push arrives on Android/desktop Chrome after opt-in; never prompted
  before opt-in.
- Sharing a photo from the gallery to the installed app opens the form
  with the image loaded.
```

---

## Ola 7 — País configurable y tenant demo

**Goal:** Que un tenant pueda operar en Chile (o cualquier país) y que el
tenant demo Expense Buddy exista con datos realistas para Elecnor.

**Scope**
- `src/lib/country.ts`: moneda base, proveedor FX (BanRep / mindicador.cl /
  open.er-api), validador de ID fiscal (NIT / RUT, portar
  `etfa-ruido/src/utils/rut.js`), billeteras, formatos `es-CO` / `es-CL`,
  etiquetas ("NIT" vs "RUT"), prompt Gemini por país.
- CLP incluido en totales y conversiones (hoy excluido).
- `tenants/demo.json` completo + `npm run seed:demo` / `npm run reset:demo`
  (Admin SDK) con empresa ficticia chilena, proyectos, usuarios demo
  (`@system.local`, ocultos con `isSystemUser()` patrón ETFA) y gastos.
- `npm run bootstrap-tenant -- --id=elecnor`: crea `tenants/elecnor.json`,
  hosting target, índices, rules deploy, superadmin inicial.
- `useSpeechToText` (es-CL / es-CO) para dictar descripciones (portar
  ETFA).

**Dependencies:** Ola 3 (settings), Ola 5 (política por tenant).
**Impacto en SPI:** Transparente. SPI sigue COP / BanRep / NIT.

### Prompt 7 (paste into Claude Code)

```
Implement Ola 7: country configuration per tenant and the demo tenant.

CONTEXT
- Colombia is hardcoded: COP base, BanRep TRM, Nequi/Daviplata, NIT label,
  isColombiaApprover based on currency. CLP is excluded from totals.
- References: ~/Documents/etfa-ruido/src/utils/rut.js,
  src/hooks/useSpeechToText.js, utils/userUtils.js (isSystemUser).

TASKS
1. src/lib/country.ts with a registry { CO, CL } exposing baseCurrency,
   fxProvider, taxIdLabel, validateTaxId, wallets, locale, geminiHints.
   exchangeRate.js uses the tenant's provider (add mindicador.cl for CL).
2. Replace Colombia-specific labels and logic with country.ts lookups;
   isColombiaApprover becomes isBaseCurrencyApprover (same semantics for
   spi). Include CLP in totals when it is the base currency.
3. Gemini prompt builder takes country hints (RUT format, boleta/factura,
   IVA 19%).
4. tenants/demo.json finalized; scripts/seed-demo.ts and scripts/reset-demo.ts
   with system users hidden via isSystemUser().
5. scripts/bootstrap-tenant.ts creating tenants/<id>.json from a template,
   firebase hosting target, indexes, rules deploy, bootstrap superadmin.
6. useSpeechToText hook on description fields (locale from country).
7. Docs: ADR 0007 reference, runbook docs/runbooks/bootstrap-tenant.md,
   validation/ola-7.md.

ACCEPTANCE CRITERIA
- spi build: no visible change; TRM still from BanRep.
- demo build: RUT validation, CLP totals, mindicador rates, Spanish-Chile
  formats; seed/reset reproducible in under a minute.
- bootstrap-tenant produces a deployable tenant end-to-end on a fresh
  Firebase project.
```

---

## Ola 8 — Observabilidad y operación

**Goal:** Saber qué pasa en producción y poder operar varios tenants con
procedimientos escritos.

**Scope**
- Sentry sobre `logger.js` con scrub de PII; `Sentry.ErrorBoundary`
  (cierra TD-019).
- Scheduled: reconciliación semanal de balances con alerta de drift
  (cierra TD-018), export diario de Firestore a GCS, limpieza de
  invitaciones vencidas.
- Dashboard ops del superadmin: consumo Gemini, errores, usuarios activos,
  storage, gastos sin sincronizar, cold starts.
- Queries paginadas con índices en Reports / Approvals / BulkUpload
  (cierra TD-003, TD-021).
- Runbooks: handover a proyecto GCP del cliente (basado en
  `etfa-ruido/docs/plan-cierre.md`), deploy por tenant, rotación de
  secretos, restore desde backup.

**Dependencies:** Ola 2, Ola 3.
**Impacto en SPI:** Transparente.

### Prompt 8 (paste into Claude Code)

```
Implement Ola 8: observability and operations.

TASKS
1. @sentry/react wired into logger.js (error + warn in production only),
   DSN per tenant via VITE_SENTRY_DSN, PII scrubbing, Sentry.ErrorBoundary
   wrapping ErrorBoundary.jsx. Functions use @sentry/node.
2. functions/src/scheduled.ts: weeklyBalanceReconciliation (dry-run of
   fixBalances logic, notify superadmin on drift > 100 base units),
   dailyFirestoreExport to gs://<bucket>/backups/<date>, purgeExpiredInvites.
3. /admin/ops (superadmin): Gemini calls/day and cost estimate, error
   count, active users 7d, storage usage, offline queue backlog, last
   backup status.
4. Paginate Reports/Approvals/BulkUpload with Firestore cursors and the
   indexes in firestore.indexes.json; remove client-side full scans.
5. docs/runbooks/: handover-cliente.md (adapted from etfa-ruido
   docs/plan-cierre.md), deploy-por-tenant.md, rotacion-secretos.md,
   restore-backup.md.
6. Docs: technical-debt (close TD-003, TD-018, TD-019, TD-021),
   validation/ola-8.md.

ACCEPTANCE CRITERIA
- A thrown error in production appears in Sentry with tenant tag and no
  email/name in payload.
- Reconciliation job runs on schedule and creates a notification on
  injected drift.
- Reports with 10k synthetic expenses load the first page under 1 s.
```

---

## Ola 9 — Calidad

**Goal:** Reducir riesgo de regresión en los tres componentes monolíticos y
cubrir el flujo crítico con e2e.

**Scope**
- Descomponer `AdminApprovals.jsx` (1292 loc), `ExpenseForm.jsx` (1164),
  `BulkUpload.jsx` (877) en hooks + componentes `.tsx` (cierra TD-014).
- Playwright e2e contra emuladores: login → gasto → aprobar con PIN →
  reporte; en CI.
- Cobertura mínima 60% en `src/lib/` y `functions/src/`, 100% de callables
  de dinero (cierra TD-013).

**Dependencies:** Olas 2-5 estables.
**Impacto en SPI:** Transparente.

### Prompt 9 (paste into Claude Code)

```
Implement Ola 9: decompose monolithic components and add e2e coverage.

TASKS
1. AdminApprovals → useApprovalsQuery, useApprovalsFilters,
   ApprovalsTable.tsx, BulkActionsController.tsx. ExpenseForm →
   UploadStep, ReviewStep, ClassifyStep + useReceiptExtraction. BulkUpload →
   useBulkParser, BulkReviewTable. Behaviour identical; snapshot the
   rendered DOM before/after for the spi tenant.
2. Playwright against firebase emulators: seed, login as professional,
   submit expense with fixture receipt, login as admin, approve with PIN
   (security.pinEnabled on in test tenant), verify report export. Run in CI.
3. Coverage thresholds in vitest.config.ts; fill gaps in src/lib and
   functions/src.
4. Docs: technical-debt (close TD-013, TD-014), validation/ola-9.md.

ACCEPTANCE CRITERIA
- No file in src/pages over 400 lines.
- e2e suite green in CI in under 5 minutes.
- Coverage thresholds enforced.
```
