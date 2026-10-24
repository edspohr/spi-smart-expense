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

firebase deploy                            # Hosting + rules + indexes + functions
firebase deploy --only firestore:indexes   # Composite indexes from firestore.indexes.json
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and both tenant builds plus the functions build on every push/PR. It does not deploy.

## Environment Setup

Copy `.env.example` to `.env` and populate every `VITE_FIREBASE_*` variable and `VITE_GEMINI_API_KEY`. `src/lib/env.ts` validates them at boot and renders `EnvError.jsx` listing anything missing. `VITE_TENANT` (default `spi`) selects `tenants/<id>.json`.

## Architecture

React 19 SPA (Vite + Tailwind CSS). Backend is Firebase (Auth, Firestore, Storage) plus Cloud Functions in `functions/` (TypeScript, Node 22, 2nd gen). Google Gemini extracts receipt data (still called client-side until Ola 2 proxies it).

### Tenant config (`tenants/*.json`, `src/lib/tenant.ts`)

`vite.config.js` reads `tenants/${VITE_TENANT}.json`, injects it as the `__TENANT__` global (typed `TenantConfig`) and replaces `%TENANT_*%` placeholders in `index.html`. The Tailwind `brand` palette reads `--brand-*` CSS variables, which `applyTenantTheme()` sets from `branding.palette` in `main.jsx`. Build-time defaults only; runtime-editable settings (PIN toggle, approval policy) move to Firestore in Ola 3.

### Auth & Roles

`src/context/AuthContext.jsx` wraps the app. On login it resolves the Firebase user, reads `users/{uid}` for `role` and `permissions`, and migrates seeded users by email. Roles today: `admin | assistant | professional`; `superadmin` arrives in Ola 3. First-login bootstrap admins come from `tenant.auth.bootstrapAdminEmails`. Granular flags live in `src/lib/permissions.js`.

### Routing (`src/App.jsx`)

- `/login` — public
- `/` — redirects by role
- `/admin/*` — admin-only
- `/dashboard/*` — professionals, assistants and admins

### Key Data Flow

**Expense submission:** `ExpenseForm.jsx` → `src/lib/gemini.js` (model `gemini-3.6-flash`, fallback `gemini-3.5-flash-lite`) pre-fills the form → receipt uploaded to Storage → expense doc written to `expenses` (shape in `src/types/models.ts`).

**Approval:** `AdminApprovals.jsx` approves/rejects; approving updates project budget and user balance transactionally; rejecting writes `rejectionReason`. Field-level changes are appended to `expenses/{id}/movements` by `src/lib/audit.js`.

### Firestore Collections

| Collection      | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `users`         | Profile, role, permissions, balance                  |
| `projects`      | Cost centers with budget tracking                    |
| `expenses`      | Expense records (`pending/approved/rejected`)        |
| `allocations`   | Per-user budget allocations/transfers per project    |
| `notifications` | In-app bell items (`toUid`, `read`)                  |

Rules: `firestore.rules`, `storage.rules`. Composite indexes: `firestore.indexes.json` (deploy before adding a query that needs one).

### Code layout

- `src/lib/` — service wrappers (`firebase.js`, `gemini.js`, `exchangeRate.js`, `notifications.js`, `audit.js`, `permissions.js`, `tenant.ts`, `env.ts`, `logger.js`)
- `src/types/models.ts` — Firestore document types; import these instead of re-declaring shapes
- `src/utils/` — `format.js`, `imageUtils.js`, `fixBalances.js`, `sort.js`
- `functions/src/` — Cloud Functions (callables); `healthcheck` is the smoke test
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
