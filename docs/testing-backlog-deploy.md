# Testing Guide — Backlog Deploy (Stages 1–4)

**Date:** 2026-05-07  
**Branch:** main  
**Tester role:** Admin + Professional (internal users)

---

## How to use this document

Each section maps to one task. For each test case:
- ✅ = pass  
- ❌ = fail (note the actual behaviour)  
- ⚠️ = partial / needs follow-up

---

## Stage 1

### Task 63 — ZIP download works for receipt images

**Pre-condition:** At least one approved expense with a receipt image exists.

| # | Steps | Expected |
|---|-------|----------|
| 1 | Log in as **admin** → Reports | Page loads with no errors |
| 2 | Select a date range that includes approved expenses with receipts | Results table shows rows |
| 3 | Click **Descargar ZIP** | Browser downloads a `.zip` file without a CORS or network error |
| 4 | Open the ZIP | Each receipt file inside is a valid image (not a 0-byte or corrupted file) |

---

### Task 56 — Bulk OCR upload

**Pre-condition:** Have 2–5 receipt images (JPG/PNG) ready.

| # | Steps | Expected |
|---|-------|----------|
| 1 | Log in as **professional** → sidebar "Carga Masiva" | Page loads with drag-and-drop area |
| 2 | Drop 3 receipt images into the upload area | Thumbnails appear; status shows "En cola" |
| 3 | Click **Analizar todo** | Status changes to spinner → green check as each image is processed; fields are pre-filled (merchant, date, amount) |
| 4 | Edit any incorrect field inline | Change persists in the row |
| 5 | Assign an event and project using the global controls at the top of the review table | All rows update with the selected event/project |
| 6 | Click **Enviar todo** | Progress bar advances; each row flips to "✓ Enviado"; success toast appears |
| 7 | Navigate to **Mis Rendiciones** | All submitted expenses appear with status "Pendiente" |

---

## Stage 2

### Task 62 — Duplicate invoice detection (soft stop)

**Pre-condition:** At least one expense already exists for the logged-in user.

#### Case A — Invoice number duplicate

| # | Steps | Expected |
|---|-------|----------|
| 1 | Note the invoice number of an existing expense | — |
| 2 | Submit a **new** expense with the same invoice number | A yellow warning dialog appears: *"Posible duplicado detectado"* with details of the matching expense |
| 3 | Click **Cancelar** | Dialog closes; form stays open; nothing is submitted |
| 4 | Repeat step 2, then click **Continuar de todas formas** | Expense is submitted normally |

#### Case B — Amount + date + merchant duplicate

| # | Steps | Expected |
|---|-------|----------|
| 1 | Submit a new expense with the same amount, date, and merchant as an existing one | Warning dialog appears |
| 2 | Confirm → submit | Expense is created; no infinite loop |

#### Case C — No duplicate

| # | Steps | Expected |
|---|-------|----------|
| 1 | Submit an expense with a unique invoice number, or unique amount/date/merchant | No dialog; expense submits directly |

---

### Task 62 (Bulk Upload) — Duplicate warning in review table

| # | Steps | Expected |
|---|-------|----------|
| 1 | In **Carga Masiva**, upload a receipt that matches an existing expense (same merchant, date, amount) | After OCR analysis, that row has a **yellow background** and a yellow ⚠ icon in the status column |
| 2 | Hover over the ⚠ icon | Tooltip shows the warning reason (e.g. "Posible duplicado: mismo monto, fecha y comercio") |
| 3 | A non-duplicate row | Green ✓ icon; white background |

---

### Tasks 60 & 37 — USD/COP currency separation

#### In Mis Rendiciones

| # | Steps | Expected |
|---|-------|----------|
| 1 | Have at least one expense in USD and one in COP | — |
| 2 | Open **Mis Rendiciones** | USD expenses show their amount with the `USD` label (e.g. "USD 150.00 USD"); COP expenses show the COP formatted amount without a currency tag |

#### In Mi Resumen (dashboard balance card)

| # | Steps | Expected |
|---|-------|----------|
| 1 | Have at least one non-rejected USD expense | — |
| 2 | Open **Mi Resumen** | Balance card shows a small note: "Incluye X USD (saldo en múltiples monedas)" |
| 3 | All expenses are COP | No USD note is shown |

---

### Task 39 — Historical TRM (exchange rate)

| # | Steps | Expected |
|---|-------|----------|
| 1 | Submit a USD expense with a past date (e.g. 2025-03-15) | Form fetches TRM automatically; field shows a rate from Banco de la República (≠ today's live rate) |
| 2 | Submit a USD expense with today's date | TRM fetches from BanRep; if unavailable, falls back to open.er-api.com (live rate) — source label shown in details modal |
| 3 | Open the expense details modal of a USD expense | "Conversión USD → COP" section shows TRM applied and COP equivalent |

---

## Stage 3

### Task 53 — Rejection reason visible in Mis Rendiciones

| # | Steps | Expected |
|---|-------|----------|
| 1 | As admin, reject an expense with a reason (e.g. "Falta soporte de pago") | — |
| 2 | Log in as the **professional** who submitted it → Mis Rendiciones | The rejected row shows the red "Rechazado" badge **plus** the rejection reason text directly below it (no hover required) |
| 3 | Open the **eye icon** (details modal) for the rejected expense | A red alert box at the bottom of the modal shows "Motivo de rechazo" with the reason text |

---

### Task 57 — Event filter in Approvals view

| # | Steps | Expected |
|---|-------|----------|
| 1 | Log in as **admin** → Aprobaciones | Filter bar is visible |
| 2 | Expand Filtros | A new **Evento** text input appears alongside the existing filters |
| 3 | Type part of an event name | List auto-suggests matching events (datalist) |
| 4 | Select or type an event name and confirm | Table filters to show only expenses with that event |
| 5 | Clear the field | All rows reappear |

---

### Task 54 — Aligned columns in Approvals table

| # | Steps | Expected |
|---|-------|----------|
| 1 | Open **Aprobaciones** → Pendientes tab | Table now has columns: Fecha, Usuario, **Evento**, **Comercio**, Proyecto, **Categoría**, Empresa, Monto, Acciones |
| 2 | Compare with **Reportes** table | Column order and names match: Fecha, Persona/Usuario, Evento, Comercio, Proyecto/Categoría, Empresa, Monto |
| 3 | Click the **Evento** or **Comercio** column header | Table sorts by that column |

---

### Task 52 — Bank reconciliation

| # | Steps | Expected |
|---|-------|----------|
| 1 | Log in as **admin** → sidebar "Conciliación" | 3-step page loads; drag-and-drop area visible |
| 2 | Upload a CSV or Excel bank statement (must have at least Date and Amount columns) | Moves to column-mapping step; columns auto-detected |
| 3 | Verify the column mapping dropdowns (Fecha, Monto, Comercio, Referencia) | Auto-detection picks the right columns; user can adjust if wrong |
| 4 | Click **Conciliar** | Processing spinner; then results table appears |
| 5 | Check summary pills: Coincidencia exacta (green), Parcial (yellow), Sin coincidencia (red), No en extracto (gray) | Counts are shown for each category |
| 6 | Click a filter pill | Table filters to that status only |
| 7 | Click **Exportar** | Downloads `conciliacion.xlsx` with all rows and their match status |
| 8 | Click **Nuevo archivo** | Resets to upload step |

**Matching rules to verify:**
- Same invoice number → Green
- Same date + amount (within 0.1%) + similar merchant name → Green
- Same date + amount but merchant differs → Yellow
- No match found → Red
- Smart Expense expense not in bank file → Gray "No en extracto"

---

## Stage 4

### Task 59 — New payment methods (AmEx / Citi)

| # | Steps | Expected |
|---|-------|----------|
| 1 | Open **Nueva Rendición** → step 2 → "Medio de Pago" dropdown | "Tarjeta American Express" and "Tarjeta Citi" appear in the list |
| 2 | Select "Tarjeta American Express" | Value is saved on submit and visible in the expense details modal |
| 3 | Same for "Tarjeta Citi" | Same |

---

### Task 61 — New card companies

| # | Steps | Expected |
|---|-------|----------|
| 1 | Open **Nueva Rendición** → step 2 → "Empresa Tarjeta" dropdown | "Socios SPI Advisors" and "Socios SPI Américas" appear alongside the existing options |
| 2 | Same in **Carga Masiva** review table company dropdown | Both new options are present |

---

### Task 55 — New cost center categories

| # | Steps | Expected |
|---|-------|----------|
| 1 | Open **Nueva Rendición** → step 2 → "Categoría" dropdown | New options present: PARQUEADEROS, GASOLINA, PEAJES, TICKET FERIA, TECNOLOGÍA, SUSCRIPCIONES, FEES BANCARIOS |
| 2 | Same dropdown in **Carga Masiva** review table | All new categories are available |
| 3 | Select "PEAJES" → submit | Expense stores and displays the category correctly |

---

## Regression checks

Quick smoke-test of core flows that should be unaffected:

| # | Flow | Expected |
|---|------|----------|
| R1 | Professional logs in → submits a standard COP expense via ExpenseForm | Submits without errors; appears in Mis Rendiciones as Pendiente |
| R2 | Admin approves the expense | Status changes to Aprobado; professional balance updates |
| R3 | Admin rejects with a reason | Status changes to Rechazado; reason visible to professional |
| R4 | Admin opens Reportes → downloads CSV | File downloads without errors |
| R5 | Admin opens Reportes → downloads Excel | File downloads; contents are correct |
| R6 | Admin opens Aprobaciones → bulk-approves multiple expenses | All selected expenses update to Aprobado |
| R7 | Admin opens Balances | User balances display correctly |

---

## Known limitations / deferred

| Task | Status | Notes |
|------|--------|-------|
| Task 58 — Admin for Jeaninne | ⏳ Deferred | Need Jeaninne's email to add to `AuthContext.jsx` hardcoded admin list |
| BulkUpload TRM for USD | ⏳ Deferred (TD-006) | TRM not fetched during bulk OCR; user must verify/correct exchange rate after upload |
| Firebase Storage CORS | ⚠️ Mitigation in code | SDK `getBytes()` bypasses CORS for ZIP download; permanent fix requires `gsutil cors set cors.json gs://BUCKET` |
