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

**Severity:** Medium  
**File:** `src/lib/gemini.js` (line 7)

**Problem:** `VITE_GEMINI_API_KEY` is embedded in the client bundle and visible to anyone who inspects the app. Noted in gemini.js as a comment but not resolved.

**Recommended fix:** Proxy Gemini calls through a Firebase Cloud Function so the key never leaves the server.

---

## TD-003 — Full Firestore collection scans

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
