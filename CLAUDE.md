# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**Expense Buddy** is a multi-client expense-report platform. Each client ("tenant") gets its own Firebase project and its own build of this single codebase. **SPI Smart Expense** is the first tenant (`tenants/spi.json`); `tenants/demo.json` is the neutral Expense Buddy demo shown to prospects. Never hardcode a tenant's name, colours, emails, currency or country in `src/` — read them from `src/lib/tenant.ts`.

## Commands

```bash
npm run dev              # Dev server for the spi tenant (http://localhost:5173)
npm run dev:demo         # Dev server for the demo tenant (vite --mode demo loads .env.demo)
npm run build            # Production build of the spi tenant → dist/
npm run build:demo       # Same for the demo tenant
npm run preview          # Preview the last build locally
npm run lint             # ESLint (JS/JSX + TS/TSX), zero warnings allowed
npm run typecheck        # tsc --noEmit (allowJs; only .ts/.tsx are type-checked strictly)
npm test -- --run        # Vitest unit tests (src/**/*.test.{js,ts})
npm run functions:build  # Compile Cloud Functions (functions/ → functions/lib)
npm run icons            # Regenerate public/icons/<tenant>/ from each tenant logo (needs python3 + Pillow)

npm run emulators        # Firebase Emulator Suite (Auth, Firestore, Storage, UI on :4000); needs Java (Homebrew openjdk)
npm run seed:emu         # Seed test accounts + sample data into the emulators (scripts/seed-emulator.mjs)
npm run dev:emu          # Dev server pointed at the emulators — use this for manual testing, never a client's project
npm run test:rules       # Firestore rules suite inside `firebase emulators:exec` (needs Java)
npm run claims:backfill -- --dry-run [--apply] [--prod]   # Mirror users/{uid} into custom claims (build functions first)
npm run superadmin:bootstrap -- --email <x> --dry-run [--apply] [--prod]  # Promote/create the first superadmin
npm run migrate:003 -- --dry-run [--apply] [--prod]   # Backfill active/tenantId/managerUid on users
npm run emulators:demo   # Emulators for project expense-buddy-demo (loads functions/.env.expense-buddy-demo)
npm run seed:demo        # Seed Andes Energía demo data (reset:demo wipes and reseeds; --prod --key <sa.json> for the demo project)
npm run dev:demo:emu     # Demo tenant against the emulators
npm run bootstrap-tenant -- --id <id> --name "<Name>" --project <firebase-project>   # Scaffold a new client (docs/runbooks/bootstrap-tenant.md)

firebase deploy                            # Hosting + rules + indexes + functions
firebase deploy --only firestore:indexes   # Composite indexes from firestore.indexes.json
# First backend deploy of a tenant: follow docs/runbooks/deploy-ola-2.md (secret → functions → claims backfill → hosting+rules together)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and both tenant builds plus the functions build on every push/PR. It does not deploy.

Manual testing happens against the Emulator Suite (`docs/runbooks/emulators.md`), never against SPI's production project: test accounts and their shared password live in `scripts/seed-emulator.mjs`.

## Environment Setup

Copy `.env.example` to `.env` and populate every `VITE_FIREBASE_*` variable (no Gemini key: the client never calls Gemini). `src/lib/env.ts` validates them at boot and renders `EnvError.jsx` listing anything missing. `VITE_TENANT` (default `spi`) selects `tenants/<id>.json`; `vite --mode <tenant>` loads `.env.<tenant>` (gitignored, template `.env.<tenant>.example`). `functions/.env.local` holds emulator-only overrides and must not repeat tenant params (it wins over `.env.<projectId>`).

## Architecture

React 19 SPA (Vite + Tailwind CSS). Backend is Firebase (Auth, Firestore, Storage) plus Cloud Functions in `functions/` (TypeScript, Node 22, 2nd gen). Google Gemini extracts receipt data through the `extractReceipt` callable; the API key is a Functions secret and never ships to the browser.

### Backend (`functions/`)

- **Callables** (`onCall`, region from `FUNCTIONS_REGION`): `extractReceipt` (Gemini via Vertex AI with `@google/genai` — IAM auth, no API key; param `VERTEX_LOCATION`; model fallback with retries, daily rate limits per user/tenant in `rateLimits/`, `mode: 'health'`), `reviewExpense` (`approve | reject | reopen`: authorises by claims, writes status + `reviewedAt/By*` + `movements` + notification in one transaction), `healthcheck`.
- **Triggers**: `onExpenseWritten` is the single writer of `users.balance` and `projects.expenses` for every expense create/update/delete/status change — pure rules in `aggregates.logic.ts`, idempotent via `aggregateLedger/{eventId}` (ADR 0010). `onUserWritten` mirrors `users/{uid}` role/permissions/active into custom claims (`claims.logic.ts`, shared with `scripts/migrations/002-backfill-claims.mjs`).
- Client side: `src/lib/functions.ts` (`callFunction`, Spanish error mapping, emulator wiring), `src/lib/expenseActions.ts`, `src/lib/gemini.js` (thin client). Never write `balance`, `projects.expenses` or `expenses.status` from the browser; rules reject it.
- Params per project in `functions/.env.<projectId>` (committed): `FUNCTIONS_REGION` must equal the tenant's Firestore location and `functionsRegion` in `tenants/<id>.json` (SPI: `southamerica-east1`), plus `TENANT_ID`, `BASE_CURRENCY`, `COUNTRY`, `VERTEX_LOCATION` and the Gemini daily limits. Vertex needs `aiplatform.googleapis.com` enabled and `roles/aiplatform.user` on the Functions service account (see `docs/runbooks/deploy-ola-2.md`); the emulator uses your gcloud ADC. App Check is monitor-only (`enforceAppCheck: false`) until the console shows a clean week.

### Tenant config (`tenants/*.json`, `src/lib/tenant.ts`)

`vite.config.js` reads `tenants/${VITE_TENANT}.json`, injects it as the `__TENANT__` global (typed `TenantConfig`) and replaces `%TENANT_*%` placeholders in `index.html`. The Tailwind `brand` palette reads `--brand-*` CSS variables, which `applyTenantTheme()` sets from `branding.palette` in `main.jsx`. Build-time defaults only; runtime-editable settings (PIN, modules, approval policy) live in `settings/tenant`.

Country (Ola 7, ADR 0007): `src/lib/country.ts` resolves base currency, FX provider, tax-id label/validator (NIT/RUT), wallet label and locale from `locale.country`. Use `BASE_CURRENCY`, `baseAmountOf(expense)` (`amountBase ?? amountCOP`) and `baseEquivalentFields()` instead of COP/`amountCOP`; `isColombiaApprover` means "base-currency approver". Use `brand-*` Tailwind classes, never `blue-*` for the primary colour; the main call to action uses `cta-*` (green by default, `branding.ctaPalette` per tenant); green stays for semantic success/approve. Shared "buddies" design tokens live in `design/growth-buddies-light/` (ADR 0013); the demo app icon is generated by `scripts/brand/expense-buddy-icon.py` (the "B-recibo" mark; needs `pip install pillow resvg-py`). Tenant-specific data (categories, card companies, default cost centres, product/legal name, login `landing` and `poweredBy`) belongs in `tenants/<id>.json`. App frame colours (sidebar, header, landing) use `chrome-*` tokens; `branding.chrome: "ink"` turns them dark (Growth Buddies "Tinta"); main CTAs use `bg-cta-600 text-cta-fg`. Use the `standalone:` Tailwind variant to hide marketing inside the installed PWA. Demo-only functions (`demoSignIn`, `resetDemoData`) are exported only when `DEMO_MODE=true`; demo data lives in `functions/src/demo.data.ts` (shared with `scripts/seed-demo.mjs`). Landing analytics only via `track()` in `src/lib/analytics.ts`.

### PWA

`vite-plugin-pwa` (in `vite.config.js`, `registerType: 'prompt'`) generates `sw.js` and the manifest from the tenant config at build time; icons come from `public/icons/<tenant>/`. `src/lib/install.ts` must stay the first import of `main.jsx` (it captures `beforeinstallprompt`); `InstallButton.tsx` reads its `useInstallMode()` and is never dismissed, only hidden when installed. `UpdateToast.tsx` (`virtual:pwa-register/react`) is the only place that applies a new service worker. Firestore uses `persistentLocalCache` for offline reads. In `npm run dev` there is no service worker, so the button always shows the manual-steps modal; test install flows with `npm run preview` or in production.

### Auth & Roles

`src/context/AuthContext.jsx` wraps the app. On login it resolves the Firebase user, reads `users/{uid}` for `role` and `permissions`, migrates seeded users by email, and calls `syncClaims()` to force `getIdToken(true)` when the token's claims lag the document. Roles: `superadmin > admin > assistant > professional` (`src/lib/roles.ts`; `roleSatisfies` makes `requiredRole="admin"` admit superadmins). The profile is a live `onSnapshot` of `users/{uid}`: a role change applies immediately and `active === false` signs the user out with a notice on `/login` (`src/context/authNotice.js`). Security rules authorise from custom claims only (no `get()`), mirrored by `onUserWritten`; privilege fields (`role`, `permissions`, `active`, `managerUid`, `requiresApproval`, `tenantId`) are superadmin-only and never on oneself. Users are managed in `/admin/users` through the `admin*` callables; self-registration always creates a `professional`; the first superadmin comes from `npm run superadmin:bootstrap -- --email <x> --apply --prod`.

### PIN (Ola 4)

Server: `functions/src/pin.ts` (`requirePinFor(req, action, { amount })` at the top of sensitive callables; `userPins`/`pinLog` are server-only). Client: wrap any sensitive callable with `withPin(reason, (pin) => callFunction(name, { ...data, pin }))` from `src/lib/pin.ts`; browser-side actions (exports) call `ensureExportAllowed(settings.security)`. Never delete another user's expense with `deleteDoc` — use `deleteExpense` (rules forbid it). `PinCancelled` means the user dismissed the prompt: don't toast it as an error.

### Offline, push, share (Ola 6)

`ExpenseForm` builds the final expense docs with pre-generated ids, then either sends them (`flushNewSubmission`) or queues them (`enqueueSubmission`, IndexedDB) when offline or on a network error; `startOfflineSync()` (main.jsx) flushes the queue. Keep both paths writing identical payloads. `public/sw-extras.js` (imported by Workbox) handles the share target POST and push display; `functions/src/push.ts` sends push from `notifyUser()`.

### On-device reader (Ola 8)

`src/lib/localReader/` reads receipts with no network: `barcode.ts` + `barcodeScan.ts` (zxing-wasm, PDF417 TED / DIAN QR, small-rotation retries) first, then `ocr.ts` (tesseract.js, Spanish) + `rules.ts` (pure, tested) only when there is no tax barcode; `merge.ts` applies precedence barcode > dictionary > ocr > keyword. Engines are served from `/ocr/<version>/` by the `ocrAssets` plugin in `vite.config.js` (not precached; cache `ocr-assets`, filled by `fieldReady.ts`). `src/lib/connectivity.ts` is the only source of "online?" (includes "Simular sin señal"); use `isOnline()`, never `navigator.onLine`. Expenses read on the device carry `localRead`; `aiReview` and `ocrEval` are server-only (`functions/src/offline.ts`). Gated by `settings.offline.localReader` / `settings.ai.localFirst` (off by default). Accuracy corpus: `src/lib/localReader/__fixtures__/receipts/` + `expected.json` (regenerate synthetic ones with `python3 scripts/fixtures/make-receipt-fixtures.py`). Ola 8b (ADR 0016): `offline.shadowRead` runs the reader invisibly on every online expense (`localRead.mode: 'shadow'` + `aiRead`; never prefill in shadow mode); `verifyLocalRead` writes `ocrEval`, `ocrStats/{day}` counters and `readerProfiles/{issuer}` votes (learned total label, served as `amountLabel` in the dictionary). Bump `READER_VERSION` (`src/lib/localReader/index.ts`) when rules change. Receipts abroad: `receiptLocale()` switches dates to month/day and "$" to USD on English receipts; ambiguous dates with an unsure locale come back `low`. Foreign-currency expenses without a rate get it at send time (`fillMissingRates` in `src/lib/fxFill.ts`, inside `firebaseFlushDeps.commit`); the form never fetches rates offline. The offline-kit wording comes from `tenants/<id>.json → offline.context` (`field` | `travel`, `src/lib/fieldReadyCopy.ts`). Ola 8c: only `exportDerivedData` sends data out of a tenant, built by `buildContribution` and checked by `validateContribution` (`functions/src/learning.logic.ts`); never add a field there without updating ADR 0016, `docs/legal/textos-vigentes-lector.md` and the consent version. Consent lives in `settings/tenant.learning` and changes only through `adminUpdateSettings` (rules block direct writes; `consentLog` audits). Consent text and `DERIVED_TERMS_VERSION` live in `src/lib/learningTerms.ts` and `learning.logic.ts` (a test keeps them equal). `ingestContribution` (`functions/src/hub.ts`) is exported only with `HUB_MODE=true` (central project; `docs/runbooks/learning-hub.md`); `npm run pack:build -- --project <hub>` writes `src/lib/localReader/pack/reader-pack.json`, used below each tenant's own learning.

### Approval workflow (Ola 5)

`settings/tenant.approvalPolicy` (ADR 0012). `onExpenseCreated` applies it (no-op in `single` mode); expenses under `levels` carry `approvalFlow` and `pendingApproverUids` (server-only fields — rules reject client writes). `reviewExpense` returns `partial: true` while more signatures are needed; UIs must keep the expense pending. Managers use `/dashboard/approvals` (`useMyPendingApprovals`). Notifications go through `notifyUser()` in `functions/src/notify.ts`, which also queues email when `EMAIL_PROVIDER=brevo`.

### Tenant settings at runtime

`settings/tenant` (written only via the `adminUpdateSettings` callable from `/admin/settings`) overrides the build-time `tenants/<id>.json` defaults for `security.pinEnabled`, `security.pinApprovalThreshold`, `security.pinActions.*`, `modules.*` and `ai.dailyLimit*`. `SettingsProvider` (`src/context/SettingsContext.tsx`) subscribes live; read it with `useTenantSettings()`. Gate routes with `<ProtectedRoute module="reports">` and hide menu entries from `settings.modules`. Granular flags live in `src/lib/permissions.js` (UI) and in the claims (rules + callables).

### Routing (`src/App.jsx`)

- `/login` — public
- `/` — redirects by role
- `/admin/*` — admins and superadmins
- `/admin/users`, `/admin/settings` — superadmin only
- `/dashboard/*` — professionals, assistants and admins

### Key Data Flow

**Expense submission:** `ExpenseForm.jsx` → `extractReceipt` callable (via `src/lib/gemini.js`) pre-fills the form → receipt uploaded to Storage → expense doc written to `expenses` with `status: 'pending'` (shape in `src/types/models.ts`) → `onExpenseWritten` credits the user's balance.

**Approval:** `AdminApprovals.jsx` (and `AdminUserDetails.jsx`) call `reviewExpense`; the function flips `status`, stamps the reviewer, appends `expenses/{id}/movements` and notifies; `onExpenseWritten` then charges the project (approve) or refunds the balance (reject). Field-level edits from `EditExpenseModal` still log movements client-side via `src/lib/audit.js`.

### Firestore Collections

| Collection      | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `users`         | Profile, role, permissions, balance                  |
| `projects`      | Cost centers with budget tracking                    |
| `expenses`      | Expense records (`pending/approved/rejected`)        |
| `allocations`   | Per-user budget allocations/transfers per project    |
| `notifications` | In-app bell items (`toUid`, `read`)                  |

Server-only collections: `rateLimits` (Gemini quotas), `aggregateLedger` (trigger idempotency), `cache` (merchant dictionary), `ocrEval` and `ocrStats` (on-device reader accuracy, superadmin read-only), `readerProfiles` (per-issuer learning), `consentLog` (superadmin read), `learningOutbox` (superadmin read). Rules: `firestore.rules`, `storage.rules` (claims-based, field-level schema validation; tested in `tests/rules/firestore.rules.test.ts`, `npm run test:rules`). Composite indexes: `firestore.indexes.json` (deploy before adding a query that needs one).

### Code layout

- `src/lib/` — service wrappers (`firebase.js`, `gemini.js`, `exchangeRate.js`, `notifications.js`, `audit.js`, `permissions.js`, `tenant.ts`, `env.ts`, `logger.js`)
- `src/types/models.ts` — Firestore document types; import these instead of re-declaring shapes
- `src/utils/` — `format.js`, `imageUtils.js`, `fixBalances.js`, `sort.js`
- `functions/src/` — Cloud Functions: `extractReceipt.ts`, `expenses.ts` (`reviewExpense`), `aggregates.ts` + `aggregates.logic.ts`, `claims.ts` + `claims.logic.ts`, `common.ts` (params, auth helpers); `*.logic.ts` files are pure and unit-tested from the root Vitest run
- `tests/rules/` — Firestore rules suite (`@firebase/rules-unit-testing`, needs the emulator)
- `scripts/` — Admin SDK scripts (never commit `serviceAccountKey.json`); `scripts/migrations/` for idempotent dry-run data migrations
- `tenants/` — one JSON per client

### Conventions

- UI strings in Spanish; code, comments and commit messages in English.
- New modules in `src/lib`, `src/types`, `functions/` are TypeScript. Existing `.jsx` pages migrate to `.tsx` only when refactored.
- Tests colocated as `*.test.{js,ts}`; money logic (balances, FX, permissions) must be covered.
- Every feature must be tenant-configurable and must leave SPI's default behaviour unchanged.
- Styling: Tailwind with the `brand` palette, `shadow-soft`/`shadow-glass`, Inter font, Framer Motion for transitions.

## Documentation to keep current

Every phase ("Ola") updates, as part of its acceptance criteria: `docs/implementation-plan.md` (status table + prompts), `docs/adr/` (new ADR for architectural decisions), `docs/technical-debt.md`, `docs/backlog.md`, `README.md`, this file, and a `docs/validation/ola-N.md` ("qué cambió / cómo probarlo / estado esperado").

## Active implementation plan

See `docs/implementation-plan.md` (plan v4). Olas 0-8 are deployed (Ola 8: automated offline mode, opt-in per tenant). Olas 8b-8d deepen the reader before moving on (shadow mode and per-client learning; cross-client layer with consent; image corpus), then Ola 9 (fleet operations, observability, security baseline) and Olas 10-16 in suggested order, without dates (ADR 0014; market research in `docs/research/benchmark-2026-10.md`). Execute olas in order; each is self-contained and independently deployable. Prompts for Olas 9-16 are written when each wave starts. Decisions behind the plan are recorded in `docs/adr/`.
