# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**Expense Buddy** is a multi-client expense-report platform. Each client ("tenant") gets its own Firebase project and its own build of this single codebase. **SPI Smart Expense** is the first tenant (`tenants/spi.json`); `tenants/demo.json` is the neutral Expense Buddy demo shown to prospects. Never hardcode a tenant's name, colours, emails, currency or country in `src/` — read them from `src/lib/tenant.ts`.

## Commands

```bash
npm run dev              # Dev server for the spi tenant (http://localhost:5173)
VITE_TENANT=demo npm run dev
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

firebase deploy                            # Hosting + rules + indexes + functions
firebase deploy --only firestore:indexes   # Composite indexes from firestore.indexes.json
# First backend deploy of a tenant: follow docs/runbooks/deploy-ola-2.md (secret → functions → claims backfill → hosting+rules together)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and both tenant builds plus the functions build on every push/PR. It does not deploy.

Manual testing happens against the Emulator Suite (`docs/runbooks/emulators.md`), never against SPI's production project: test accounts and their shared password live in `scripts/seed-emulator.mjs`.

## Environment Setup

Copy `.env.example` to `.env` and populate every `VITE_FIREBASE_*` variable (no Gemini key: the client never calls Gemini). `src/lib/env.ts` validates them at boot and renders `EnvError.jsx` listing anything missing. `VITE_TENANT` (default `spi`) selects `tenants/<id>.json`.

## Architecture

React 19 SPA (Vite + Tailwind CSS). Backend is Firebase (Auth, Firestore, Storage) plus Cloud Functions in `functions/` (TypeScript, Node 22, 2nd gen). Google Gemini extracts receipt data through the `extractReceipt` callable; the API key is a Functions secret and never ships to the browser.

### Backend (`functions/`)

- **Callables** (`onCall`, region `us-central1`): `extractReceipt` (Gemini via Vertex AI with `@google/genai` — IAM auth, no API key; param `VERTEX_LOCATION`; model fallback with retries, daily rate limits per user/tenant in `rateLimits/`, `mode: 'health'`), `reviewExpense` (`approve | reject | reopen`: authorises by claims, writes status + `reviewedAt/By*` + `movements` + notification in one transaction), `healthcheck`.
- **Triggers**: `onExpenseWritten` is the single writer of `users.balance` and `projects.expenses` for every expense create/update/delete/status change — pure rules in `aggregates.logic.ts`, idempotent via `aggregateLedger/{eventId}` (ADR 0010). `onUserWritten` mirrors `users/{uid}` role/permissions/active into custom claims (`claims.logic.ts`, shared with `scripts/migrations/002-backfill-claims.mjs`).
- Client side: `src/lib/functions.ts` (`callFunction`, Spanish error mapping, emulator wiring), `src/lib/expenseActions.ts`, `src/lib/gemini.js` (thin client). Never write `balance`, `projects.expenses` or `expenses.status` from the browser; rules reject it.
- Params per project in `functions/.env.<projectId>` (committed): `FUNCTIONS_REGION` must equal the tenant's Firestore location and `functionsRegion` in `tenants/<id>.json` (SPI: `southamerica-east1`), plus `TENANT_ID`, `VERTEX_LOCATION` and the Gemini daily limits. Vertex needs `aiplatform.googleapis.com` enabled and `roles/aiplatform.user` on the Functions service account (see `docs/runbooks/deploy-ola-2.md`); the emulator uses your gcloud ADC. App Check is monitor-only (`enforceAppCheck: false`) until the console shows a clean week.

### Tenant config (`tenants/*.json`, `src/lib/tenant.ts`)

`vite.config.js` reads `tenants/${VITE_TENANT}.json`, injects it as the `__TENANT__` global (typed `TenantConfig`) and replaces `%TENANT_*%` placeholders in `index.html`. The Tailwind `brand` palette reads `--brand-*` CSS variables, which `applyTenantTheme()` sets from `branding.palette` in `main.jsx`. Build-time defaults only; runtime-editable settings (PIN toggle, approval policy) move to Firestore in Ola 3.

### PWA

`vite-plugin-pwa` (in `vite.config.js`, `registerType: 'prompt'`) generates `sw.js` and the manifest from the tenant config at build time; icons come from `public/icons/<tenant>/`. `src/lib/install.ts` must stay the first import of `main.jsx` (it captures `beforeinstallprompt`); `InstallButton.tsx` reads its `useInstallMode()` and is never dismissed, only hidden when installed. `UpdateToast.tsx` (`virtual:pwa-register/react`) is the only place that applies a new service worker. Firestore uses `persistentLocalCache` for offline reads. In `npm run dev` there is no service worker, so the button always shows the manual-steps modal; test install flows with `npm run preview` or in production.

### Auth & Roles

`src/context/AuthContext.jsx` wraps the app. On login it resolves the Firebase user, reads `users/{uid}` for `role` and `permissions`, migrates seeded users by email, and calls `syncClaims()` to force `getIdToken(true)` when the token's claims lag the document. Roles: `superadmin > admin > assistant > professional` (`src/lib/roles.ts`; `roleSatisfies` makes `requiredRole="admin"` admit superadmins). The profile is a live `onSnapshot` of `users/{uid}`: a role change applies immediately and `active === false` signs the user out with a notice on `/login` (`src/context/authNotice.js`). Security rules authorise from custom claims only (no `get()`), mirrored by `onUserWritten`; privilege fields (`role`, `permissions`, `active`, `managerUid`, `requiresApproval`, `tenantId`) are superadmin-only and never on oneself. Users are managed in `/admin/users` through the `admin*` callables; self-registration always creates a `professional`; the first superadmin comes from `npm run superadmin:bootstrap -- --email <x> --apply --prod`.

### PIN (Ola 4)

Server: `functions/src/pin.ts` (`requirePinFor(req, action, { amount })` at the top of sensitive callables; `userPins`/`pinLog` are server-only). Client: wrap any sensitive callable with `withPin(reason, (pin) => callFunction(name, { ...data, pin }))` from `src/lib/pin.ts`; browser-side actions (exports) call `ensureExportAllowed(settings.security)`. Never delete another user's expense with `deleteDoc` — use `deleteExpense` (rules forbid it). `PinCancelled` means the user dismissed the prompt: don't toast it as an error.

### Offline, push, share (Ola 6)

`ExpenseForm` builds the final expense docs with pre-generated ids, then either sends them (`flushNewSubmission`) or queues them (`enqueueSubmission`, IndexedDB) when offline or on a network error; `startOfflineSync()` (main.jsx) flushes the queue. Keep both paths writing identical payloads. `public/sw-extras.js` (imported by Workbox) handles the share target POST and push display; `functions/src/push.ts` sends push from `notifyUser()`.

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

Server-only collections: `rateLimits` (Gemini quotas), `aggregateLedger` (trigger idempotency). Rules: `firestore.rules`, `storage.rules` (claims-based, field-level schema validation; tested in `tests/rules/firestore.rules.test.ts`, `npm run test:rules`). Composite indexes: `firestore.indexes.json` (deploy before adding a query that needs one).

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

See `docs/implementation-plan.md`. Execute olas in order; each is self-contained and independently deployable. Decisions behind the plan are recorded in `docs/adr/`.
