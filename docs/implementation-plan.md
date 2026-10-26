# Expense Buddy — Implementation Plan (v4)

**Producto:** Expense Buddy, plataforma genérica de rendición de gastos
desplegada como una instancia independiente por cliente (un Firebase project
por tenant, un solo repositorio).
**Primer tenant:** SPI Smart Expense (Colombia, COP). Conserva su branding y
su flujo actual sin fricción percibida.
**Segundo tenant:** `demo` (Expense Buddy, Chile/CLP), base para la prueba de
Elecnor y la oferta a otros clientes.

**Stack:** React 19 + Vite + Tailwind + Firebase (Auth / Firestore / Storage /
Functions / App Check) + Gemini + TypeScript gradual.

**v4 (2026-10-26):** las olas 0-7 (v3) quedan como historia; las olas 8-16
siguen el roadmap acordado tras el benchmark de mercado
(`docs/research/benchmark-2026-10.md`, ADR 0014). **Solo hay orden
sugerido, no fechas.**

**Plan anterior:** `docs/archive/implementation-plan-v2-fases-1-6.md`
(fases 1-6, deployadas 2026-04-16).
**Decisiones de arquitectura:** `docs/adr/`.
**Fuera de alcance deliberado:** `docs/backlog.md`.

---

## Estado por ola

| Ola | Nombre | Impacto en SPI | Estado |
|-----|--------|----------------|--------|
| 0 | Fundaciones (tenant config, TS, tests, Functions scaffold, CI) | Transparente | Deployada 2026-10-25 (`3a7b8e2`) |
| 1 | PWA instalable | Visible positivo | Deployada 2026-10-25 (`f2ff128`) |
| 2 | Backend seguro (Functions, App Check, claims, rules) | Fricción mitigada | Deployada 2026-10-25 (`cb7e8bf`) |
| 3 | Superadmin + gestión de usuarios + settings | Transparente para admins | Deployada 2026-10-25 (`47a5827`) |
| 4 | PIN por acción | Transparente (apagado por defecto) | Deployada 2026-10-25 (`23bfff1`) |
| 5 | Flujos de aprobación + auditoría + email | Transparente (política por defecto = actual) | Deployada 2026-10-25 (`ed26b9c`) |
| 6 | Offline, push y share target | Visible positivo (opt-in) | Deployada 2026-10-25 (`1f5d0af`) |
| 7 | País configurable + tenant demo | Transparente | Deployada 2026-10-25: SPI (`6378638`) y demo `expense-buddy-demo` |
| 8 | Offline automatizado (lectura sin conexión + "Listo para terreno") + cierre de pendientes del responsable | Visible positivo (opt-in por tenant) | Deployada 2026-10-26 (`89a4592`): demo con lector activo, SPI apagado |
| 8b | **Lector que aprende I:** modo sombra en todas las rendiciones, aprendizaje por cliente, métricas en el tiempo; contrato y textos de consentimiento | Transparente (opt-in por tenant) | Deployada 2026-10-26 (`a79a856`): demo con modo sombra, SPI apagado |
| 8c | Lector que aprende II: capa general entre clientes (proyecto central, paquete de lectura versionado) con consentimiento | Transparente (opt-in + cláusula) | Implementada 2026-10-26 con textos provisionales `derived-v0`; sin proyecto central aún (envíos al `learningOutbox` del cliente) |
| 8d | Lector que aprende III: corpus de imágenes con consentimiento separado y modelo propio | Transparente (opt-in) | Condicional (volumen + clientes que acepten) |
| 9 | Operación de flota, observabilidad y seguridad base | Transparente | Pendiente |
| 10 | Documentos tributarios Chile: timbre electrónico + validación SII | Transparente (add-on apagado) | Pendiente |
| 11 | Integración contable: exportador configurable + Softland / Defontana / SAP B1 | Transparente (add-on) | Pendiente |
| 12 | Fondos por rendir, viáticos, kilometraje, políticas y nómina de pago | Transparente (opt-in) | Pendiente |
| 13 | Canales conversacionales: WhatsApp + email | Transparente (opt-in) | Pendiente |
| 14 | Enterprise: SSO, paquete de seguridad, roles finos | Transparente (opt-in) | Pendiente |
| 15 | Colombia DIAN + conciliación de cartola de tarjeta | Visible positivo para SPI si lo activa | Pendiente |
| 16 | Calidad y escala (refactor monolitos, e2e, modo oscuro completo) | Transparente | Pendiente |

Las olas 8b-8d profundizan el lector offline antes de seguir (decisión del responsable, ADR 0016). El orden 9-16 es sugerido y puede cambiar con lo que pidan los clientes
fundadores. Los prompts de las olas 9-16 se escriben al iniciar cada una
(así no quedan obsoletos); cada sección deja el alcance acordado.

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
  desde el logo del tenant con `scripts/generate-icons.py` (Pillow, `npm run
  icons`) y commiteados en `public/icons/<id>/`. Manifest por tenant (nombre,
  colores, `start_url`, `lang`) generado en build por `vite-plugin-pwa`.
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

**Desviaciones implementadas (2026-10-25):**
- En vez de `approveExpense`/`rejectExpense`/`editExpense`/`deleteExpense`,
  un solo callable `reviewExpense` (aprobar/rechazar/reabrir) y un trigger
  `onExpenseWritten` que deriva `users.balance` y `projects.expenses` de
  cualquier escritura en `expenses` (ADR 0010). El cliente ya no escribe
  dinero en ningún lado; crear/editar/borrar siguen siendo escrituras
  directas validadas por rules.
- Bootstrap de admins por script (`scripts/bootstrap-admins.mjs`) desde ya,
  porque las rules nuevas impiden la auto-promoción cliente-side.
- Gemini vía Vertex AI con `@google/genai` e IAM en lugar de Developer API +
  Secret Manager (ADR 0011): no hay key que rotar y cada tenant procesa sus
  recibos dentro de su propio proyecto GCP.
- Orden de salida y cutover documentados en `docs/runbooks/deploy-ola-2.md`;
  validación en `docs/validation/ola-2.md`.

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

**Desviaciones implementadas (2026-10-25):**
- Sin colección `user_invitations` ni `claimInvite`: `adminInviteUser` crea
  la cuenta con Admin SDK y el cliente envía el correo nativo de "crear
  contraseña". El registro abierto actual de SPI se mantiene (siempre como
  profesional); restringirlo por tenant queda en backlog.
- Ajustes en `settings/tenant` (un proyecto por tenant hace innecesario el
  prefijo `tenants/{id}`), escritos por el callable `adminUpdateSettings`.
  Branding editable en runtime no se incluyó: manifest, íconos y colores son
  de build (Ola 1); queda en backlog.
- La asignación de proyectos sigue en el detalle del usuario
  (asignaciones con monto); el reset de PIN llega con la Ola 4.
- Los permisos finos (aprobador, Colombia, borrar, exportar) pasan a ser solo
  de superadmin, tanto en UI como en rules.
- Scripts en `.mjs` (como los de Ola 2) en vez de `.ts`.
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

**Desviaciones implementadas (2026-10-25):**
- El registro de uso del PIN vive en Ajustes (sección "PIN de seguridad"),
  no en una ruta `/admin/security` aparte.
- Nuevo callable `deleteExpense`: las rules ya no dejan a un admin borrar
  rendiciones directo, para que el PIN no se pueda esquivar. El dueño sigue
  borrando su propia rendición pendiente sin PIN.
- Exportar es una confirmación (`verifyPin`) previa a la descarga en el
  navegador: protege el flujo normal; los datos siguen siendo legibles para
  quien ya tiene permiso por rules.
- Invitar usuarios también queda bajo la acción "usuarios".
- El umbral usa la moneda base del tenant (`BASE_CURRENCY`); para moneda
  extranjera compara `amountCOP` y, sin tasa, siempre pide PIN (TD-026).
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

**Desviaciones implementadas (2026-10-25):**
- Modelo de política simplificado (ADR 0012): modo simple o por niveles con
  responsable → finanzas, doble firma por monto, auto-aprobación y
  delegación, en vez de un arreglo genérico de niveles.
- Correo con outbox (`mailQueue`) y remitente Brevo exportado solo con
  `EMAIL_PROVIDER=brevo`, para que el deploy no dependa del secreto. Plantillas
  en código (`mail.templates.ts`), no en Brevo. Resumen semanal pasa a
  backlog; se implementó el recordatorio diario de pendientes (opt-in).
- La delegación cubre el paso del responsable.
- TD-026 (agregados con monedas mezcladas) no se tocó: cambiar la semántica
  de `projects.expenses` afecta dashboards de SPI y merece decisión aparte.
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

**Desviaciones implementadas (2026-10-25):**
- Sin Background Sync del service worker: la cola se envía desde la página
  (al abrir, al volver la red y cada minuto), porque la sesión y el SDK de
  Firebase viven ahí. El envío diferido escribe los documentos directo (con
  IDs fijos), no por callable.
- Push: tokens en `users/{uid}.fcmTokens` (array) y mensajes de datos
  renderizados por `public/sw-extras.js`, sin el SDK de Firebase en el
  worker. Cada notificación in-app también genera push.
- El share target usa `workbox.importScripts` en vez de cambiar a la
  estrategia `injectManifest`.
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

**Desviaciones implementadas (2026-10-25):**
- El permiso conserva el nombre `isColombiaApprover` (ahora significa
  "aprobador en moneda base" y se rotula con el país); renombrarlo exigía
  migrar documentos y claims sin beneficio para el usuario. El claim lleva
  `baseCurrency` y las reglas comparan contra él.
- Gastos nuevos guardan `baseCurrency` + `amountBase`; `amountCOP` sigue
  escribiéndose cuando la base es COP. TD-026 (agregados con monedas
  mezcladas) queda igual: ahora el dato para corregirlo existe.
- Sin usuarios `@system.local` ni `isSystemUser()`: los usuarios demo son
  personas ficticias reales (`@andesenergia.demo`) que la demo necesita
  mostrar. Scripts en `.mjs` (como los demás), no `.ts`.
- `bootstrap-tenant` genera archivos e imprime los pasos de consola; no
  ejecuta deploys ni crea proyectos (requieren al responsable).
- `useSpeechToText` no se portó: pasa a backlog.
- Además: `auth.selfSignup` por tenant (registro abierto solo en SPI),
  branding de login/sidebar desde el tenant, clases `blue-*` → `brand-*`,
  centros de costo por defecto en `tenants/spi.json` y
  `functions/.env.<proyecto>` versionados.

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

## Ola 8 — Offline automatizado

**Goal:** Que rendir sin señal sea tan automático como rendir con señal: la
app lee la boleta en el teléfono (sin IA en la nube), sabe de antemano todo
lo que necesita para trabajar en faena, envía sola al volver la cobertura y
verifica con IA lo que leyó offline. Es el gancho comercial principal
(ADR 0014): ningún competidor del benchmark documenta rendición offline, y
cada uso real (testing o clientes) mejora el motor.

**Por qué ahora:** hoy, sin señal, la cola guarda la rendición pero los
datos se escriben a mano. "Funciona sin señal" vende; "lee la boleta sin
señal" cierra negocios.

**Scope**

1. **Lectura por código de barras (exacta, milisegundos, sin red).**
   - Chile: el timbre electrónico (TED, PDF417) de todo DTE (factura,
     boleta, nota) trae RUT emisor, tipo, folio, fecha y monto total.
     Decodificar con `zxing-wasm` (o equivalente WebAssembly) y parsear el
     XML del TED. Esta base la reutiliza la Ola 10 (validación SII).
   - Colombia: el QR de la factura electrónica DIAN (NIT emisor, total,
     fecha, CUFE). Base de la Ola 15.
   - Resultado con confianza "alta" y origen `barcode`.
2. **OCR local para lo que no trae código.** `tesseract.js` (WebAssembly)
   con modelo español; carga diferida (solo cuando se necesita) y guardado
   en caché para uso offline. Preprocesado en canvas: escala, grises,
   contraste/umbral, rotación (OSD). Corre en un Web Worker para no
   congelar la UI.
3. **Motor de reglas sobre el texto** (`src/lib/localReader/`, TypeScript
   puro y testeado):
   - RUT/NIT con validación de dígito verificador (reusa `country.ts`).
   - Total: montos junto a "TOTAL", "TOTAL A PAGAR", "MONTO"; descarta
     subtotales, IVA y vuelto; heurística del mayor monto coherente.
   - Fecha en sus formatos locales, folio/número de boleta, medio de pago
     ("DÉBITO", "CRÉDITO", "EFECTIVO"), moneda.
   - Comercio y categoría: diccionario del tenant RUT emisor → razón
     social y categoría, construido de sus gastos aprobados (se sincroniza
     al teléfono), más palabras clave por país (Copec/Shell → Combustible,
     peajes, estacionamientos...).
   - Confianza por campo (alta/media/baja) y origen (`barcode`, `ocr`,
     `dictionary`).
4. **UX "leído sin conexión".** El formulario se precarga con lo leído y
   marca cada campo con su confianza ("revisa este monto"). Nunca se envía
   sin confirmación de la persona. El mismo flujo funciona con señal si el
   tenant activa `localFirst` (abajo).
5. **"Listo para terreno".** Indicador y botón en Mi Espacio (y aviso al
   instalar la app) que descarga y verifica todo lo necesario para operar
   sin red: motor OCR y modelo, diccionario del tenant, centros de costo,
   categorías, saldos y perfil (hoy el formulario carga los centros de
   costo con `getDocs`: si nunca se cargaron con red, offline quedan
   vacíos). Se refresca solo al abrir la app con red. Estado visible: "Listo
   para terreno · actualizado hace 2 h".
6. **Verificación con IA al reconectar (aprendizaje).** Cuando una
   rendición leída offline se sincroniza, una Function la relee con Gemini
   y compara campo a campo. Si difiere (monto, RUT, fecha), marca la
   rendición "Revisar: la IA leyó otro monto" para quien rinde y para quien
   aprueba. Cada comparación se guarda como métrica anónima
   (`ocrEval`: tipo de documento, campo, acierto/error, origen) sin
   imagen ni datos personales.
7. **Panel de precisión (superadmin).** Tasa de acierto por campo y por
   origen, en el tiempo y por tenant; lista de casos fallidos para ajustar
   reglas. Así "mientras más se usa, mejor lee" es medible.
8. **Corpus de pruebas en CI.** `test/fixtures/receipts/` con fotos reales
   anonimizadas (boletas y facturas chilenas y colombianas) y sus valores
   esperados; un test mide la precisión del motor (barcode + OCR + reglas)
   y falla si baja de un umbral. El responsable aporta las primeras
   50-100 boletas (ver pendientes).
9. **Modo "simular sin señal" para demos.** En el tenant demo (y como
   opción de superadmin), un interruptor que corta la red de la app
   (`disableNetwork` de Firestore + bloqueo de llamadas) para mostrar el
   flujo offline completo en una reunión sin modo avión.
10. **Lectura local también con señal (opcional por tenant).**
    `settings/tenant.ai.localFirst`: si la lectura local es de confianza
    alta, no se llama a Gemini (más rápido y más barato); si es baja, se
    usa Gemini como hoy. Apagado por defecto.
11. **Investigación acotada:** envío en segundo plano en Android
    (Background Sync) para que la cola salga aunque la app esté cerrada.
    Se implementa solo si es viable con la sesión de Firebase; si no, queda
    documentado como límite.

**Cierre de pendientes del responsable (parte de esta ola):** verificar
Olas 2/3 en producción, borrar la key vieja de AI Studio, enforce de App
Check (desde 2026-11-01, luego `enforceAppCheck` en Functions), campana de
notificaciones, instalación PWA en Android e iPhone, clave Web Push (VAPID)
para activar push, Brevo (API key + remitente) para correos, prueba de
offline y compartir en terreno, eventos GA4 del demo, y el corpus de
boletas para el punto 8. Lista viva en `docs/pendientes.md`.

**Límites honestos (se comunican así en ventas):** el OCR local es menos
preciso que la IA en boletas de papel térmico sin código de barras, arrugadas
o mal fotografiadas; en teléfonos de gama media tarda algunos segundos.
Con timbre electrónico o QR DIAN la lectura es exacta.

### Resultado (2026-10-26)

Implementada según el scope, con estas desviaciones (detalle en
`docs/validation/ola-8.md`, decisión técnica en ADR 0015):

- **Corpus:** `src/lib/localReader/__fixtures__/receipts/` (junto al
  código, no `test/fixtures/`) con 8 boletas sintéticas generadas por
  `scripts/fixtures/make-receipt-fixtures.py`; el test
  `localReader.corpus.test.ts` corre en CI con umbrales (códigos 100 %,
  monto y fecha por OCR ≥ 90 %). Las boletas reales del responsable siguen
  pendientes.
- **Rotación:** reintentos con giros pequeños para el PDF417 (lo exigió el
  corpus); sin OSD para el OCR (TD-032).
- **Marca de revisión:** campo `aiReview` (`match | mismatch | …`) en lugar
  de `reviewFlags`.
- **Panel de precisión:** por campo y por motor (código vs. texto); sin
  tendencia temporal ni lista de casos fallidos (por privacidad, TD-031).
  "Por tenant" es implícito: cada tenant tiene su proyecto.
- **"Listo para terreno":** solo en Mi Espacio; sin aviso al instalar
  (TD-030).
- **Background Sync:** no implementado; documentado como límite (el SDK de
  Firestore y la sesión de Auth viven en la página; no existe en iPhone).
- **Cierre de pendientes del responsable:** siguen abiertos en
  `docs/pendientes.md` (requieren consola o teléfono del responsable).

**Dependencies:** Ola 6 (cola offline), Ola 7 (país, RUT/NIT).
**Impacto en SPI:** Opt-in por tenant (`settings/tenant.offline.localReader`);
"Listo para terreno" visible solo si se activa. Comportamiento actual intacto.

### Prompt 8 (paste into Claude Code)

```
Implement Ola 8: automated offline mode (local receipt reading +
"Listo para terreno" + AI verification on sync), per docs/implementation-plan.md.

CONTEXT
- Offline queue exists (src/lib/offlineQueue.ts, offlineSync.ts, Ola 6);
  AI extraction is the extractReceipt callable (Gemini on Vertex).
- Country helpers (RUT/NIT validation, base currency) in src/lib/country.ts.
- ExpenseForm loads projects with getDocs: offline it only works if they
  were cached before.

TASKS
1. src/lib/localReader/: barcode.ts (zxing-wasm: PDF417 TED for Chilean DTE,
   QR DIAN for Colombia; parse to {taxId, docType, folio, date, total,
   currency}), ocr.ts (tesseract.js in a Web Worker, Spanish model, lazy,
   cached; canvas preprocessing), rules.ts (pure TS: totals, dates, RUT/NIT
   with check digit, payment method, merchant/category from the tenant
   dictionary + per-country keywords), index.ts (pipeline returning
   per-field value + confidence + source). Unit tests for rules.ts.
2. Tenant dictionary: build taxId -> {merchant, category} from approved
   expenses (callable or scheduled function), cache on device.
3. ExpenseForm: when offline (or settings.ai.localFirst with high
   confidence), prefill from localReader and show per-field confidence
   badges; never auto-submit.
4. "Listo para terreno": src/lib/fieldReady.ts preloads OCR assets, the
   dictionary, projects, categories, balances and profile into caches;
   status card in Mi Espacio; refresh on app open when online.
5. Functions: on sync of an expense read offline (flag localRead: true),
   re-read with Gemini, compare fields, set reviewFlags on mismatch and
   write anonymized ocrEval docs (no image, no personal data). Rules:
   ocrEval server-only.
6. Superadmin accuracy panel (Ajustes or a new page): accuracy per field
   and source over time, failed cases list.
7. test/fixtures/receipts + an accuracy test with a threshold in CI
   (start with the fixtures available; document how to add more).
8. "Simular sin señal" toggle (demo tenant + superadmin): Firestore
   disableNetwork/enableNetwork and a guard on callables/uploads.
9. settings/tenant: offline.localReader (default false), ai.localFirst
   (default false); SPI unchanged.
10. Spike: Background Sync on Android for the queue; implement only if the
    Firebase session works from the worker, else document the limit.
11. Docs: ADR if a library choice is architectural, validation/ola-8.md,
    README, CLAUDE.md, technical-debt, backlog, pendientes.

ACCEPTANCE CRITERIA
- Airplane mode: a Chilean electronic boleta with TED is read exactly
  (RUT, folio, date, total) and a paper receipt gets total/date/merchant
  with confidence badges; "Listo para terreno" lets a fresh session submit
  offline with cost centers available.
- On reconnect the expense syncs, Gemini verifies it and a mismatch is
  flagged; ocrEval records appear in the accuracy panel.
- Fixture accuracy test runs in CI. SPI build and behaviour unchanged.
```


---

## Ola 8b — Lector que aprende I (modo sombra y capa del cliente)

**Goal:** Que cada rendición, con o sin señal, mida y mejore el lector
offline, sin tocar la experiencia de quien rinde y sin que los datos salgan
del ambiente del cliente. Dejar listo lo documental (cláusula, avisos,
consentimiento) para la capa general. Decisión: ADR 0016.

**Scope**

1. **Modo sombra** (`settings/tenant.offline.shadowRead`, apagado por
   defecto; el demo lo trae activo): con señal, tras la lectura de Gemini, el
   lector local corre en segundo plano sobre la misma foto. No precarga ni se
   muestra. El gasto guarda `localRead` (`mode: 'shadow'`) y `aiRead` (lo que
   Gemini leyó, para comparar). Se salta con ahorro de datos o red 2G y si no
   termina antes de enviar.
2. **Comparación de tres puntas sin re-llamar a Gemini:** el trigger compara
   teléfono vs. confirmado, teléfono vs. Gemini y Gemini vs. confirmado (cuánto
   corrigen las personas a la IA). En modo sombra no hay `aiReview` (la persona
   ya confirmó sobre la lectura de Gemini).
3. **Formato por emisor:** el OCR guarda los montos candidatos con su
   etiqueta; el servidor vota qué etiqueta dio el monto confirmado por RUT
   emisor (`readerProfiles`, solo servidor) y el diccionario la entrega al
   teléfono, que la prefiere en la siguiente boleta de ese emisor (mínimo 2
   votos).
4. **Métricas diarias** (`ocrStats/{fecha}`, contadores por modo, motor y
   campo) y panel con tendencia de 30 días, desglose sombra/sin señal y "la
   IA corregida por las personas".
5. **Documental:** ADR 0016; borrador de cláusula de datos derivados, anexo
   técnico, aviso para usuarios y textos de consentimiento
   (`docs/legal/lector-datos-derivados.md`) para revisión legal; argumento
   comercial.
6. **Aviso a usuarios** en la tarjeta "Listo para terreno" (qué se mide, qué
   no, sin imágenes ni datos personales).

**Dependencies:** Ola 8. **Impacto en SPI:** ninguno mientras no active el
modo sombra.

## Ola 8c — Lector que aprende II (capa general)

**Goal:** Que lo aprendido sobre documentos (no sobre clientes) mejore el
lector de todos los tenants.

**Scope (se detalla al iniciar):** proyecto central de Growth Buddies con
una colección de solo escritura por tenant; Function que exporta atributos
anonimizados (columna "general" del ADR 0016) solo si
`learning.shareDerived` está activo (con quién/cuándo/versión del texto);
consentimiento en Ajustes con el texto aprobado por el abogado; agregación
central (etiquetas del total por emisor, razones sociales, errores típicos);
**paquete de lectura versionado** (`src/lib/localReader/pack/`) que entra en
cada build; métrica de mejora por versión del paquete en el corpus.

**Requisitos previos (responsable):** cláusula revisada por abogado e
incorporada al contrato; crear el proyecto central.

### Resultado (2026-10-26)

El responsable decidió avanzar con textos provisionales mientras la
revisión legal queda en pendientes. Implementado:

- Textos vigentes versionados (`docs/legal/textos-vigentes-lector.md`,
  `derived-v0`, marcados "Versión provisional" en la app).
- Consentimiento en Ajustes (`learning.shareDerived`) solo vía callable,
  con versión del texto, quién/cuándo y `consentLog`; reglas que impiden
  escribirlo desde el navegador.
- `buildContribution` / `validateContribution` (`learning.logic.ts`):
  emisores persona jurídica con votos de etiqueta y contadores diarios sin
  datos de la IA; el hub rechaza cualquier campo extra.
- `exportDerivedData` (diario, 07:00 UTC) y `previewDerivedData` ("Ver qué
  se envía" con el JSON exacto). Sin `LEARNING_HUB_URL` → `learningOutbox`.
- Hub `ingestContribution` (`HUB_MODE=true`): ID token de Google + lista de
  remitentes + esquema; guarda la última foto por ambiente.
- `npm run pack:build` → `src/lib/localReader/pack/reader-pack.json`
  (≥ 3 votos, ≥ 70 %); el lector lo usa por debajo del aprendizaje propio del
  cliente; cada lectura guarda `packVersion`.
- Runbook `docs/runbooks/learning-hub.md`.

**Sin verificar:** la verificación del ID token en el hub y el envío HTTPS
real (requieren el proyecto central). Probado en emulador: consentimiento,
vista previa, exportación al outbox, reenvío sin duplicar, revocación.

## Ola 8d — Lector que aprende III (corpus de imágenes y modelo propio)

**Goal:** Pasar de reglas a un modelo de lectura propio para papel térmico.

**Scope (condicional):** consentimiento separado `learning.shareImages`,
recorte de datos personales en el teléfono, retención acotada y retiro;
corpus curado; evaluar un modelo pequeño de extracción que corra en el
teléfono contra el corpus. Se aborda con volumen suficiente y clientes que
lo acepten.

---

## Ola 9 — Operación de flota, observabilidad y seguridad base

**Goal:** Operar 5+ ambientes dedicados sin que el costo de soporte crezca
con cada cliente (riesgo de escalabilidad del modelo single-tenant) y tener
la evidencia de seguridad que pide compras.

**Scope**
- Flota: comando para desplegar y migrar todos los tenants en secuencia
  con smoke tests; inventario de versiones por ambiente; canario
  demo → SPI → resto.
- Observabilidad: Sentry con scrub de PII (TD-019), alertas de uptime y
  errores de Functions, costo y consumo Gemini por tenant, dashboard ops del
  superadmin.
- Backups: export diario de Firestore a GCS + runbook de restore probado;
  reconciliación semanal de saldos con alerta de drift (TD-018).
- Seguridad: App Check en enforce, service account dedicada por ambiente
  (en lugar de la de Compute), paquete de seguridad (arquitectura,
  respuestas al cuestionario estándar de compras, certificaciones de GCP
  heredadas) como paso previo a ISO 27001.
- Queries paginadas (TD-003, TD-021); limpieza de invitaciones vencidas.
- Runbooks: handover a la cuenta de nube del cliente, rotación de secretos.

**Dependencies:** Ola 2, Ola 3. **Impacto en SPI:** Transparente.

---

## Ola 10 — Documentos tributarios Chile: timbre electrónico + validación SII

**Goal:** Cerrar la brecha #1 del benchmark para licitaciones chilenas.

**Scope**
- Reusa la lectura del TED (Ola 8) para datos exactos del DTE.
- **Spike primero:** verificación criptográfica de autenticidad del TED (el
  CAF firmado por el SII viaja en el timbre, posible incluso offline);
  consulta de estado ante el SII con certificado digital de la empresa
  (facturas emitidas a su nombre) vs. proveedor de validación de terceros
  (costo, cobertura de boletas). Sin scraping del sitio público (CAPTCHA).
- RUT emisor existente y vigente.
- Estado por gasto: "Validado SII", "No encontrado", "Anulado",
  "Discrepancia de monto"; política por tenant (bloquear, advertir,
  exigir aprobador).
- Add-on por tenant, apagado por defecto.

**Dependencies:** Ola 8. **Impacto en SPI:** Transparente (no aplica a COP).

---

## Ola 11 — Integración contable

**Goal:** Cerrar la brecha #2: que finanzas centralice sin digitar.

**Scope**
- Prerrequisito: cerrar TD-026 (agregados siempre en moneda base).
- Mapeo contable por tenant: categoría → cuenta, centro de costo → centro
  ERP, IVA recuperable, auxiliares.
- Cierre de rendiciones por período con lotes de exportación marcados
  "Contabilizado" (sin doble exportación).
- Formatos: CSV/Excel configurable, archivo plano Softland y Defontana,
  plantilla de importación SAP B1. Conectores API en un segundo paso,
  idealmente con un partner ERP (canal sugerido por el benchmark).

**Dependencies:** Ola 9 (backups antes de migrar agregados).
**Impacto en SPI:** Transparente (add-on).

---

## Ola 12 — Fondos por rendir, viáticos, kilometraje y políticas

**Goal:** Cubrir las brechas #3, #4, #8 y #10 y el motor de políticas.

**Scope**
- Ciclo formal de fondos por rendir: solicitado → aprobado → entregado →
  rendido → devuelto/reintegrado, con saldo por fondo (sobre los saldos y
  asignaciones actuales).
- Viáticos por política: monto diario por zona, cargo o turno de faena,
  sin boleta.
- Kilometraje: km × tarifa por tenant.
- Motor de políticas: topes por categoría o rol, antigüedad máxima de la
  boleta, campos obligatorios; acción "bloquear" o "advertir".
- Archivo de nómina bancaria genérico para pagar reembolsos (bancos
  chilenos principales).

**Dependencies:** Ola 11 (cuentas contables para fondos y viáticos).
**Impacto en SPI:** Transparente (opt-in).

---

## Ola 13 — Canales conversacionales: WhatsApp + email

**Goal:** Rendir y aprobar sin abrir la app (brecha #7; los 4 locales
relevantes lo tienen o lo anuncian). **Hoy no está en desarrollo: en
propuestas se comunica como "en roadmap".**

**Scope**
- WhatsApp (Meta Cloud API; cada cliente verifica su negocio en Meta y
  tiene su número como parte de la implementación): rendir enviando la
  foto (identifica por el teléfono del perfil, lee con IA o con el lector
  local, pide el centro de costo con botones y crea el gasto); consultar
  saldo y estado; aprobar o rechazar con botones respetando el PIN. Los
  mensajes de plantilla tienen costo de Meta, incluido en la mensualidad.
- Email: reenviar el comprobante a una dirección por tenant crea el gasto
  (útil para facturas que llegan por correo).

**Dependencies:** Ola 8 (lector local reutilizable), Ola 5 (aprobaciones).
**Impacto en SPI:** Transparente (opt-in).

---

## Ola 14 — Enterprise

**Goal:** Pasar los filtros de TI y compras de empresas grandes.

**Scope**
- SSO con Google Workspace y Microsoft Entra (Identity Platform en el
  proyecto del cliente).
- Segunda parte del paquete de seguridad: pentest externo, política de
  retención y borrado de datos.
- Roles más finos: auditor de solo lectura, aprobador por centro de costo.

**Dependencies:** Ola 9. **Impacto en SPI:** Transparente (opt-in).

---

## Ola 15 — Colombia DIAN y conciliación de cartola

**Goal:** Escalar en Colombia (cliente actual) y cubrir el gasto con tarjeta
corporativa sin emitir tarjetas.

**Scope**
- Validación DIAN: lectura del QR/CUFE (reusa Ola 8) y consulta a la DIAN.
- Conciliación de cartola de tarjeta: subir el CSV/Excel del banco y cruzar
  automáticamente contra los gastos.

**Dependencies:** Ola 8, Ola 11. **Impacto en SPI:** Visible positivo si
SPI lo activa.

---

## Ola 16 — Calidad y escala

**Goal:** Reducir riesgo de regresión y deuda visual antes de crecer el
equipo o la base de clientes (era la Ola 9 del plan v3).

**Scope**
- Descomponer `AdminApprovals.jsx`, `ExpenseForm.jsx`, `BulkUpload.jsx` en
  hooks + componentes `.tsx` (TD-014).
- Playwright e2e contra emuladores: login → gasto → aprobar con PIN →
  reporte, en CI; cobertura mínima de `src/lib/` y `functions/src/`
  (TD-013).
- Modo oscuro completo: migrar los ~1.200 colores fijos a tokens
  semánticos (ADR 0013).
- Wrapper de tiendas (iOS/Android) solo si un cliente lo exige.

**Dependencies:** Olas 8-12 estables. **Impacto en SPI:** Transparente.

---

## Fuera del roadmap (decisión)

- **Excluido:** emisión de tarjetas corporativas, reserva de viajes,
  movimiento de dinero propio (fintech).
- **Diferido hasta que el mercado lo pida:** Perú (SUNAT) y México (CFDI,
  con socio PAC) — solo con un caso validado; agentes de IA de auditoría
  sobre el motor de políticas de la Ola 12; certificación ISO 27001.
