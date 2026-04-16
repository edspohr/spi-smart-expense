# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run lint      # Run ESLint

firebase deploy   # Deploy to Firebase Hosting (requires firebase CLI)
```

There is no test suite configured.

## Environment Setup

Copy `.env.example` to `.env` and populate:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_GEMINI_API_KEY
```

## Architecture

**SPI Smart Expense** is a React 19 SPA (Vite + Tailwind CSS) for expense management. The backend is entirely Firebase (Auth, Firestore, Storage). Google Gemini AI extracts data from receipt images.

### Auth & Roles

`src/context/AuthContext.jsx` wraps the entire app. On login it:

1. Resolves the Firebase Auth user
2. Looks up the Firestore `users` doc to get `role` (`admin` | `professional`)
3. Migrates seeded users — matches by email and updates Firestore refs to the real UID

Hardcoded admin emails (`edmundo@spohr.cl`, `admin@spi.cl`, `gerencia@spi.cl`) get `role: admin` automatically on first login.

### Routing (`src/App.jsx`)

- `/login` — public
- `/` — redirects based on auth/role
- `/admin/*` — admin-only (ProtectedRoute checks `role === 'admin'`)
- `/dashboard/*` — professionals and admins

### Key Data Flow

**Expense submission** (professional):

1. `ExpenseForm.jsx` — user uploads receipt image
2. `src/lib/gemini.js` calls Gemini (`gemini-2.5-flash-lite`, fallback `gemini-1.5-pro`) to extract date, merchant, amount, currency, NIT, payment method
3. User fills/corrects the pre-filled form and selects cost center(s)
4. On submit: image uploaded to Firebase Storage, expense doc written to Firestore `expenses` collection

**Expense approval** (admin):

- `AdminApprovals.jsx` lists pending expenses
- Approving deducts from project budget and updates user balance
- Rejecting writes a reason to the expense doc

### Firestore Collections

| Collection    | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `users`       | User profile, role, balance                         |
| `projects`    | Cost centers with budget tracking                   |
| `expenses`    | Expense records (status: pending/approved/rejected) |
| `allocations` | Per-user budget allocations per project             |

Security rules enforce: users read/write own data; only admins write projects and approve expenses.

### Services (`src/lib/`)

- **`firebase.js`** — Firebase initialization + `uploadImage()` helper
- **`gemini.js`** — Gemini API wrapper with model fallback and Colombian/US receipt parsing
- **`seedData.js`** — Utility to pre-populate Firestore with users/projects/allocations

### Utilities (`src/utils/`)

- **`format.js`** — Currency and date formatting
- **`imageUtils.js`** — Client-side image compression before upload
- **`fixBalances.js`** — Balance recalculation helpers
- **`sort.js`** — Data sorting

### Styling

Tailwind CSS with custom `brand` color palette (blue shades) and `soft`/`glass` shadow variants defined in `tailwind.config.js`. Font is Inter (Google Fonts). Animations via Framer Motion.

## Active implementation plan

See `docs/implementation-plan.md` for the current multi-phase upgrade
plan. Execute phases in order. Each phase is self-contained and
independently deployable.
