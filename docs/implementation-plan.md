# SPI Smart Expense — Implementation Plan

**Scope:** `cardBrand` field (AmEx/Citi), shared constants extraction, UX/UI upgrades inspired by ETFA Ruido.

**Stack reference:** React 19 + Vite + Firebase (Firestore/Auth/Storage) + Gemini AI + Tailwind.

**Rules for every phase:**
- UI strings in Spanish, code/comments in English.
- Each phase is self-contained and independently deployable (`npm run build && firebase deploy`).
- No breaking changes to Firestore data — all new fields are additive and optional.
- Preserve existing Tailwind design system (`brand` palette, `shadow-soft`, `shadow-glass`, Inter font).
- Run `npm run lint` after each phase; fix warnings before committing.

---

## Phase 1 — Shared constants + `cardBrand` field (foundation)

**Goal:** Extract duplicated constants, introduce `cardBrand` as a separate field from `paymentMethod`, and wire it through the capture, edit, display, and reporting flows. This is the foundation for every later phase, so it ships first.

### Prompt 1 (paste into Claude Code)

```
You are working on the SPI Smart Expense codebase (React 19 + Vite + Firebase).
Implement Phase 1: shared constants extraction and a new `cardBrand` field
separate from `paymentMethod`.

CONTEXT
- `paymentMethod` is HOW payment was made (Credit Card, Debit Card, Cash,
  Transfer, Wallet, Other).
- `cardBrand` is a NEW field for the card issuer/brand (Visa, Mastercard,
  American Express, Citi, Diners, Otro). It is independent of paymentMethod
  and of `cardCompany` (which is the internal entity: SPI Americas / SPI
  Advisors).
- `CATEGORIES_COMMON` is currently duplicated across three files
  (ExpenseForm.jsx, EditExpenseModal.jsx, gemini.js logic). Payment method
  options are also duplicated across ExpenseForm and EditExpenseModal and
  they diverge (ExpenseForm has "Other", Edit does not).

TASK 1 — Create shared constants file
- Create `src/lib/constants.js` and export:
  - `CATEGORIES_COMMON` — same values as the current array, single source
    of truth.
  - `PAYMENT_METHODS` — array of `{ value, label }` objects for: Credit
    Card, Debit Card, Cash, Transfer, Wallet, Other. Labels in Spanish
    ("Tarjeta de Crédito", "Tarjeta Débito", "Efectivo", "Transferencia",
    "Billetera Digital (Nequi/Daviplata)", "Otro").
  - `CARD_BRANDS` — array of `{ value, label }` for: `visa`/"Visa",
    `mastercard`/"Mastercard", `amex`/"American Express", `citi`/"Citi",
    `diners`/"Diners Club", `other`/"Otra".
  - `CARD_COMPANIES` — array of `{ value, label }` for "SPI Americas" and
    "SPI Advisors" (keeping current values).
  - `CURRENCIES` — array of `{ value, label }` for COP, USD, CLP.

TASK 2 — Update ExpenseForm.jsx
- Import from `../lib/constants`. Delete the local CATEGORIES_COMMON and
  CATEGORIES_ADMIN arrays.
- Add `cardBrand: ''` to `formData` initial state and to the reset in
  `handleCancel`.
- In the "Clasificación y Pago" area of the review step (the grid that
  currently holds Forma de Pago and Empresa Tarjeta), add a new select
  "Marca Tarjeta" driven by CARD_BRANDS, rendered BETWEEN "Forma de Pago"
  and "Empresa Tarjeta". The select should only be enabled/visible when
  paymentMethod is "Credit Card" or "Debit Card" — if paymentMethod is
  something else, keep the field in the DOM but disabled with muted
  styling (so the grid layout doesn't jump).
- Render all PAYMENT_METHODS and CARD_COMPANIES selects from the imported
  constants (map over them), not hardcoded <option> tags.
- Persist `cardBrand` on the expense document in `handleSubmit` (the
  `batch.set(expenseRef, {...})` call). Save `null` when empty.

TASK 3 — Update EditExpenseModal.jsx
- Import from `../lib/constants`. Delete the local CATEGORIES_COMMON.
- Add `cardBrand: expense?.cardBrand || ''` to form state.
- Render PAYMENT_METHODS from the constant (this also fixes the missing
  "Other" option bug).
- Add the same "Marca Tarjeta" select as in ExpenseForm, with the same
  enable/disable rule based on paymentMethod.
- Include `cardBrand: form.cardBrand || null` in the `updates` object
  passed to `updateDoc`.

TASK 4 — Update ExpenseDetailsModal.jsx
- In the "Clasificación y Pago" section, display "Marca Tarjeta" next to
  "Medio de Pago" when `expense.cardBrand` is present. Use the same
  <CreditCard /> icon style. Resolve the label from CARD_BRANDS (don't
  show raw values like "amex" — show "American Express").

TASK 5 — Update AdminReports.jsx
- Add `cardBrand` as a filter: a new <select> "Marca Tarjeta" next to
  "Empresa Tarjeta", populated from CARD_BRANDS with a "Todas" option.
- Apply the filter in `handleSearch`.
- Add a "Marca Tarjeta" column to the CSV_HEADERS, XLSX_HEADERS, and
  `expenseToRow` helper, positioned right after "Empresa Tarjeta".
- Add the same column to the results table rendering — show the resolved
  label, or "—" when empty.
- Update the summary-row index math in `handleDownloadExcel` accordingly
  (the Monto/Moneda columns shift by one).

TASK 6 — Update AdminApprovals.jsx CSV export
- The `handleExportCSV` function builds its own headers/rows. Add "Marca
  Tarjeta" as a column right after "Empresa Tarjeta" in both `headers`
  and the `rows` mapping. Use the resolved label from CARD_BRANDS.

TASK 7 — Update gemini.js prompt
- The Gemini extraction prompt currently returns `cardCompany: null`.
  Add a new field `cardBrand` to the JSON schema requested from Gemini,
  with the hint: "One of 'visa', 'mastercard', 'amex', 'citi', 'diners'
  if clearly identifiable from the receipt, otherwise null." Return null
  when uncertain — never guess.
- In ExpenseForm's `handleAnalyze`, merge the returned `cardBrand` into
  formData just like other extracted fields.

ACCEPTANCE CRITERIA
- `npm run lint` passes with zero new warnings.
- `npm run build` succeeds.
- Creating a new expense with AmEx selected writes `cardBrand: "amex"`
  to Firestore.
- Editing an existing expense (which has no `cardBrand`) shows the
  field empty and lets me save a value.
- Admin Reports filter by "American Express" returns only expenses
  with `cardBrand: "amex"`.
- CSV and Excel exports include the new column with the human-readable
  label.
- Expense details modal shows "Marca Tarjeta: American Express" when set.
- No existing expense document is mutated by this change.

Do not touch anything outside the files listed above.
```

---

## Phase 2 — Dashboard upgrade (admin KPIs + alerts)

**Goal:** Replace the current admin dashboard with an actionable command center. Show aggregated KPIs, currency-aware totals, alerts (over-budget users, stale pending approvals, TRM capture gaps), and a mini-chart of last 30 days submissions. Inspired by ETFA's finance dashboard pattern.

### Prompt 2 (paste into Claude Code)

```
Work on the SPI Smart Expense codebase. Implement Phase 2: admin
dashboard upgrade. Do not touch files unrelated to the dashboard.

GOAL
Transform `src/pages/AdminDashboard.jsx` into an actionable admin
command center. Keep the existing per-user card grid but replace the
three-metric header with a richer KPI strip and add an alerts panel and
a 30-day submission trend.

NEW COMPONENTS (in src/components/)
1. `KpiCard.jsx` — reusable metric card. Props: `label`, `value` (can be
   ReactNode for multi-currency stacks), `delta` (optional string like
   "+12% vs mes anterior"), `tone` (neutral|positive|warning|danger),
   `icon` (lucide component), `onClick` (optional). Use shadow-soft,
   rounded-2xl, subtle tone-colored left border.
2. `AlertsPanel.jsx` — takes an array of alerts
   `{ id, severity, title, description, href }` and renders a compact
   list with colored dots, icon, and chevron. Empty state reads
   "Todo en orden. No hay alertas." with a check icon.
3. `MiniTrendChart.jsx` — bare-bones SVG bar chart, no libraries. Props:
   `data` (array of `{ date, value }`), `height` (default 80),
   `barColor` (default brand-500). Render 30 bars, axis-less, tooltip
   on hover showing "DD/MM: X gastos".

DATA DERIVATION (inside AdminDashboard.jsx, in the existing useEffect)
Fetch once, derive everything client-side. Reuse the snapshots already
loaded (users + expenses). Add a projects snapshot if needed for names.

Compute:
- `totalPending` — count of status='pending'.
- `totalPendingAmount` — sum grouped by currency for pending only.
- `totalApprovedThisMonth` — sum grouped by currency where status
  in ['approved','pending'] and date in current month.
- `totalApprovedLastMonth` — same, last calendar month, for delta %.
- `trmGaps` — count of USD expenses where `trm` is null.
- `staleApprovals` — pending expenses with `createdAt` older than 7
  days. Provide the raw list so we can show top 3 in the alerts.
- `overBudgetUsers` — users whose total rendered (sum of non-rejected
  expense amounts in COP equivalent — use amountCOP when currency is
  USD, else amount) exceeds 2x their total allocations in the last 30
  days. Use `allocations` collection (new fetch) for this.
- `trend30d` — array of 30 objects `{ date: 'YYYY-MM-DD', value: N }`
  counting expenses created per day.

LAYOUT
- Top row: 4 KpiCards in a grid — "Usuarios Activos", "Rendiciones
  Pendientes" (clickable → /admin/approvals, danger tone if >10),
  "Aprobado este mes" (show delta vs last month, positive/warning),
  "Brechas de TRM" (count + warning tone if >0).
- Second row: two-column layout:
    Left (2/3 width): 30-day trend chart + title "Últimos 30 días".
    Right (1/3): AlertsPanel with up to 5 alerts built from
      staleApprovals, trmGaps, overBudgetUsers.
- Third row onward: keep the existing "Resumen por Persona" section
  exactly as it is (search box + card grid).

ALERT CONSTRUCTION
Build alerts in priority order:
1. For each stale approval >14 days old (severity: danger):
   `{ title: "Rendición sin revisar", description: "$USER — hace $N días", href: "/admin/approvals" }`
2. trmGaps > 0 → one warning alert: `{ title: "Gastos USD sin TRM",
   description: "$N gastos perdieron la captura automática", href: "/admin/reports?currency=USD" }`.
3. overBudgetUsers → one warning per user.
Max 5 alerts shown; show "Ver todas (N)" link if more.

LOADING & EMPTY STATES
- Extend the existing Skeleton layout to cover the new KPI strip,
  chart skeleton (a single shimmer rectangle at height 80), and
  alerts panel skeleton (3 rows).
- Empty trend (no expenses) → chart shows "Sin actividad reciente"
  centered.

ACCESSIBILITY
- KpiCards that are clickable must be <button> elements, focusable,
  with aria-label like "Ver rendiciones pendientes".
- AlertsPanel items with href must be anchors (Link from react-router).

ACCEPTANCE
- `npm run lint` passes.
- Dashboard loads on first paint with skeletons, then fills in.
- Clicking "Rendiciones Pendientes" KPI navigates to /admin/approvals.
- If I simulate >7-day-old pending expenses they appear in alerts.
- Trend chart renders 30 bars even for days with zero (height 0 bar).
- All existing user cards below still render with same behavior.
- No new third-party dependencies.

Do not alter AdminApprovals, UserDashboard, or any expense mutation
logic. This phase is read-only on the dashboard side.
```

---

## Phase 3 — Approvals table (ETFA-style power tools)

**Goal:** Turn the approvals table into a proper triage tool: inline filters, sortable columns, row selection, bulk approve/reject, keyboard shortcuts, saved last-used filter set. This is the highest ROI page for admins.

### Prompt 3 (paste into Claude Code)

```
Implement Phase 3: approvals table upgrade on the SPI Smart Expense
codebase. Target file is `src/pages/AdminApprovals.jsx` plus new
components in `src/components/`.

GOAL
Replace the current approvals table with a data grid that supports
inline filters, column sorting, row selection, bulk actions, and
keyboard shortcuts — matching the triage UX of ETFA Ruido's
expense reviewer.

NEW COMPONENTS
1. `DataGridHeader.jsx` — header cell with optional sort toggle
   (asc/desc/none) and optional filter popover button.
2. `BulkActionBar.jsx` — sticky bar that appears at the bottom of the
   viewport when >=1 rows are selected. Shows count + buttons: "Aprobar
   Seleccionados", "Rechazar Seleccionados", "Limpiar selección". Uses
   shadow-glass and slides in from the bottom (framer-motion).
3. `ConfirmDialog.jsx` — generic confirmation modal. Props: `isOpen`,
   `title`, `description`, `confirmLabel`, `confirmTone`
   (primary|danger), `onConfirm`, `onClose`.

CHANGES TO AdminApprovals.jsx
- Add a `selectedIds: Set<string>` state. Render a checkbox column as
  first column. Header checkbox toggles select-all for the currently
  filtered rows.
- Add inline filter state (client-side): date range, user (select from
  distinct userNames in results), cardCompany, cardBrand, currency,
  minAmount/maxAmount, search text (matches merchant or description).
  Render filters in a collapsible card above the tabs. Filters persist
  in `localStorage` under `spi_approvals_filters_v1` and restore on
  mount.
- Add column sort: date, userName, projectName, amount, cardCompany.
  Sort state persists per tab (pending/history) in the same localStorage
  key.
- Keyboard shortcuts (only active when NOT typing in an input):
    j / k → move row focus down/up (add a `focusedIndex` state, visible
      via a subtle ring).
    x → toggle selection of focused row.
    a → approve focused row (same handler as the green check button).
    r → reject focused row (opens the rejection modal for that row).
    e → edit focused row (opens EditExpenseModal).
    Esc → clear selection and focus.
    Shift+A → bulk approve selected.
  Register shortcuts via a single useEffect with keydown listener. Add
  a "?" key that opens a ShortcutsHelp modal listing all bindings.
- Bulk approve: iterate selected expenses, call the existing approve
  logic (writeBatch) in chunks of 20 per batch commit. Show a progress
  toast.
- Bulk reject: open a ConfirmDialog that asks for a single rejection
  reason to apply to all. Then iterate with the same batching pattern.
- Replace the current header row with the new DataGridHeader in sortable
  columns.
- Update the export buttons: add a second "Exportar Selección (CSV)"
  button that only enables when selectedIds.size > 0, exporting only
  selected rows with the same column set as the full export.

EMPTY STATES
- When filters yield zero rows, show centered message "Ningún
  resultado con los filtros aplicados" + "Limpiar filtros" link button.
- Existing "No hay registros en esta vista" stays for the unfiltered
  empty case.

PERSIST SHORTCUT DISCOVERY
- Tiny keyboard-icon button in the top-right of the card header labeled
  "Atajos (?)" opening the ShortcutsHelp modal.

ACCEPTANCE
- Linter passes, build succeeds.
- Selecting 3 expenses and pressing Shift+A approves all three, updates
  the table optimistically, shows a success toast with the count.
- Applying a date filter narrows the list; reloading the page restores
  the same filter.
- Pressing j/k moves a focus ring through visible rows; pressing a
  approves the focused row; pressing ? opens the help modal.
- All existing single-row actions (approve/reject/edit/view details)
  still work identically.
- CSV export of selection contains only selected rows.

Do not alter AdminDashboard, ExpenseForm, or AuthContext.
```

---

## Phase 4 — Mobile-first expense capture

**Goal:** Make receipt submission delightful on a phone. Today the ExpenseForm is desktop-styled and the upload inputs don't hint "camera". Goal: native camera capture, sticky primary action, card-based step layout, and a PWA install prompt so pros can pin the app to their home screen.

### Prompt 4 (paste into Claude Code)

```
Implement Phase 4: mobile-first expense capture on the SPI Smart
Expense codebase.

SCOPE
- `src/pages/ExpenseForm.jsx`
- `public/manifest.webmanifest` (new)
- `index.html` (manifest link + theme-color meta)
- `src/lib/pwa.js` (new) — service worker registration helper
- New component `src/components/InstallPwaPrompt.jsx`

TASK 1 — Camera-friendly file inputs
In ExpenseForm, both file inputs currently have
`accept="image/*,application/pdf"`. On mobile, this shows a generic
picker. Change the receipt input to use two buttons inside the dropzone:
- "Tomar Foto" → `<input type="file" accept="image/*" capture="environment">`
- "Elegir Archivo" → `<input type="file" accept="image/*,application/pdf">`
On desktop, show only "Subir archivo" (detect via `window.matchMedia('(pointer: coarse)')`).
Voucher input gets the same treatment.

TASK 2 — Mobile layout pass on Step 2 (review)
- On screens <md, stack the two columns (previews + form). Previews
  render as a horizontal scroll of thumbnails at the top (not full-
  width cards).
- The "Confirmar Rendición" button becomes position: sticky at the
  bottom of the viewport on mobile (bottom: 0, with safe-area-inset
  padding), full width, shadow-lg above it to separate from content.
- Grid columns `grid-cols-1 md:grid-cols-2` on every field group
  (already partially true — audit every grid).
- Font sizes: reduce the "font-mono text-lg font-bold" on amount input
  to `text-base md:text-lg` on small screens.
- Increase tap targets: every button/select min-height 44px.

TASK 3 — PWA install
- Create `public/manifest.webmanifest` with:
    name: "SPI Smart Expense"
    short_name: "SPI Expense"
    start_url: "/"
    display: "standalone"
    background_color: "#ffffff"
    theme_color: "#2563eb"
    icons: use existing /logo.png as 192 and 512 (same file is fine).
- In `index.html`, add
    <link rel="manifest" href="/manifest.webmanifest">
    <meta name="theme-color" content="#2563eb">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <link rel="apple-touch-icon" href="/logo.png">
- Create `src/lib/pwa.js` with a simple service worker registration
  stub — we are NOT adding offline caching in this phase, so skip the
  SW file. This module instead exports `canInstall()` and
  `triggerInstall()` that wraps the `beforeinstallprompt` event.
- Create `InstallPwaPrompt.jsx` — a dismissible banner that appears
  once per 7 days (localStorage key `spi_pwa_dismissed_at`) at the
  bottom of the screen on mobile when `canInstall()` is true. Copy:
  "Instala Smart Expense en tu teléfono para acceso rápido." Two
  buttons: "Instalar", "Más tarde". Hook into the App root in
  `src/main.jsx` so it's global.

TASK 4 — Image compression UX
`compressImage` already runs but there's no feedback. In ExpenseForm,
when `handleFileSelect` is running, show a tiny spinner overlay on the
dropzone that just received the file until the compressed File is set.

ACCEPTANCE
- Opening the form on an iPhone Safari and tapping "Tomar Foto" opens
  the rear camera directly.
- On desktop, the form looks and behaves identically to today.
- On mobile, the Confirmar button sticks to the bottom of the screen
  when scrolling.
- Manifest validates (Chrome DevTools → Application → Manifest shows
  no errors).
- Install banner appears once on Chrome mobile; dismissing hides it
  for 7 days.
- Lighthouse mobile score for the form page improves (informal check).

Do not change Firestore schema, Gemini prompt, or admin pages.
```

---

## Phase 5 — Polish pass: skeletons, empty states, optimistic updates, a11y

**Goal:** Sand down every rough edge. Consistent skeleton loaders on every page, friendly empty states with first-action CTAs, optimistic updates on expense mutations, and accessibility baseline (focus rings, aria labels, keyboard nav on modals).

### Prompt 5 (paste into Claude Code)

```
Implement Phase 5: polish pass on the SPI Smart Expense codebase. This
is the consistency/accessibility sweep — small changes across many files.

NEW SHARED COMPONENTS
1. `src/components/EmptyState.jsx` — props: `icon`, `title`,
   `description`, `action` (optional `{ label, onClick, href }`).
   Centered, with muted Lucide icon at top.
2. `src/components/TableSkeleton.jsx` — props: `rows` (default 5),
   `cols` (default 5). Uses existing Skeleton primitive.
3. `src/components/FocusableModal.jsx` — lightweight wrapper that:
   traps focus inside modal, restores focus on close, closes on Esc,
   has `role="dialog"` and `aria-modal="true"`. Refactor the existing
   EditExpenseModal, ExpenseDetailsModal, RejectionModal, and
   ImageLightbox to use it (they all hand-roll overlays today).

TASKS
1. Every page that currently returns `<Layout title="..."><p>Cargando...</p></Layout>`
   gets a proper TableSkeleton or the page-specific skeleton that
   already exists in AdminDashboard. Pages to fix:
   - AdminApprovals
   - AdminBalances
   - AdminProjects
   - AdminProjectDetails
   - AdminUserDetails
   - UserDashboard
   - UserExpenses

2. Replace every ad-hoc empty-row message with <EmptyState>:
   - UserExpenses: "No tienes rendiciones registradas." → EmptyState
     with Receipt icon, CTA "Rendir un gasto" linking to
     /dashboard/new-expense.
   - AdminApprovals pending empty → EmptyState with CheckCircle,
     "Todo al día", description "No hay rendiciones pendientes de
     revisión.". No CTA.
   - AdminBalances empty → EmptyState Users icon.
   - AdminProjectDetails empty allocations/expenses stay inline but
     get the EmptyState component with `small` variant (new optional
     prop, reduces vertical padding).

3. Optimistic updates
   - UserExpenses `handleDelete`: optimistically remove from list
     before the Firestore call; rollback on error with a toast. (Today
     the code does the opposite order.)
   - AdminApprovals `handleApprove`: the row already removes
     optimistically — keep. Also optimistically append to
     historyExpenses so switching tabs doesn't require a refetch.
   - AdminUserDetails expense status changes: add the same optimistic
     merge into the local expenses array.

4. Accessibility baseline
   - All icon-only buttons get `aria-label` (currently a lot of them
     lack it: the edit/delete/approve/reject buttons across approvals,
     project details, user details).
   - Sidebar nav links get `aria-current="page"` when active.
   - Modal close buttons get `aria-label="Cerrar"`.
   - All <select> and <input> in ExpenseForm and EditExpenseModal get
     explicit <label htmlFor> matching. Today most are visually
     labeled but the <label> has no htmlFor.
   - Global focus ring: audit Tailwind classes — ensure every
     interactive element shows `focus-visible:ring-2
     focus-visible:ring-brand-500 focus-visible:ring-offset-2`
     somewhere in its className. Add a Tailwind plugin only if needed
     (prefer utility classes).

5. Keyboard baseline
   - ImageLightbox already handles Esc; add Left/Right arrow keys to
     switch between Recibo and Voucher tabs.
   - EditExpenseModal closes on Esc via FocusableModal.
   - Tab order in forms audited: the main ExpenseForm review step
     should flow left-to-right, top-to-bottom without surprises.

6. Toast cleanup
   - Standardize every `alert()` call to `toast.success`/`toast.error`
     from `sonner`. Sweep the repo. AdminProjects still uses one
     `alert()` in handleDeleteProject — replace it.

ACCEPTANCE
- Linter passes, build succeeds, bundle size is within 5% of current.
- Tabbing through any page reveals a clearly visible focus ring on
  every interactive element.
- Opening EditExpenseModal, pressing Tab cycles inside the modal; Esc
  closes it.
- Deleting an expense feels instant; if the Firestore call fails, the
  row comes back with an error toast.
- Every "Cargando..." placeholder is gone.
- No `alert()` calls remain in `src/`.

Do not introduce new animations, new routes, or new Firestore fields.
This is a polish pass, not a feature pass.
```

---

## Execution notes

**Order matters.** Phase 1 must ship before anything else — every later phase imports from `src/lib/constants.js`. Phases 2–5 are independent after that and can be reordered if priorities shift.

**Testing between phases.** After each `firebase deploy`, sanity-check:
- Submit a new expense (touches constants, Gemini, storage, balance).
- Approve one and reject one.
- Export CSV + Excel.
- Load reports with filters.
- Open on a phone browser (especially after Phase 4).

**Rollback.** Every phase is a single PR / branch. If something goes sideways, revert the branch and redeploy the previous `dist/`.

**Data migration.** None needed. `cardBrand` is additive. Old expenses simply render "—" where the brand would appear.

**Future ideas deliberately NOT in this plan** (parking lot, discuss later): offline queue for submissions, recurring expenses, approval delegation rules, OCR retry pipeline, per-user notification preferences, export scheduling.
