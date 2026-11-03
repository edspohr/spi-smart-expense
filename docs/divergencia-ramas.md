# Divergencia entre `main` (SPI) y `expense-buddy` (demo)

Estado al 2026-11-03. Este documento sirve de checklist para el día en que
se homologue SPI con la plataforma genérica (ADR 0019). Actualízalo cada vez
que `expense-buddy` gane algo que `main` no tiene, o al revés.

## Cómo se mantienen

- `main` es lo que corre SPI (`spi-smart-expense`, Colombia, COP).
- `expense-buddy` es `main` + lo de abajo, y se despliega solo con
  `--project demo` (`expense-buddy-demo`, Chile, CLP).
- Lo que sirve a los dos (UX, arreglos) se hace en `main`, se despliega a SPI
  si no lo afecta, y luego se hace merge de `main` en `expense-buddy`. Nunca
  al revés hasta homologar.

## Ya compartido (está en las dos ramas)

| Fecha | Commit en `main` | Qué |
|---|---|---|
| 2026-11-03 | `e24edfb` | Documentación del cambio de abajo: README, plan, backlog, TD-018/TD-026, CLAUDE.md y `docs/validation/ux-movil-2026-11.md`. |
| 2026-11-03 | `def7cba` | Dashboard con 6 tarjetas compactas orientadas a acción; todas las tablas pasan a tarjetas en móvil; se elimina «Recalcular Saldos (Repair)» y `src/utils/fixBalances.js` (TD-018). Desplegado a SPI (solo hosting) y al demo. |

## Solo en `expense-buddy`

### Ola 10 — Timbre electrónico SII (ADR 0017)

- **Funciones:** `verifyFiscalDocument` (`functions/src/fiscal.ts`), que se
  exporta solo con `COUNTRY=CL`; verificador puro en
  `functions/src/tedVerify.logic.ts`; claves en `functions/sii-keys/`.
- **Cliente:** el lector conserva `rawTed` (`barcode.ts`,
  `barcodeParsers.ts`, `types.ts`); `src/lib/localReader/fiscal.ts`,
  `siiKeys.ts`; `FiscalBadge.tsx`, `FiscalCard.tsx` (Ajustes),
  `src/lib/fiscalStatus.ts`; insignias en `ExpenseForm`, `AdminApprovals`
  (tabla y tarjetas móviles), `MyApprovals`, `ExpenseDetailsModal`; anomalía
  `fiscal-failed` en el dashboard.
- **Datos:** campos `rawTed` y `fiscalVerification` en `expenses`.
- **Ajustes:** `settings/tenant.fiscal.tedVerification` (`off` por defecto).
- **Reglas:** `validFiscal()` en la creación; `rawTed` y `fiscalVerification`
  inmutables después.

### Ola 11 — Exportador contable (ADR 0018)

- **Funciones:** `buildAccountingExport` (`functions/src/accounting.ts`),
  lógica pura `accounting.logic.ts`, conectores `accounting.connectors.ts`
  (CSV genérico, Softland, Defontana, SAP B1 con `// ASSUMPTION:`).
  `reviewExpense` (reopen) y `deleteExpense` rechazan rendiciones exportadas.
- **Cliente:** `/admin/accounting` (`AdminAccounting.tsx`,
  `src/lib/accountingExport.ts`), `AccountingCard.tsx` en Ajustes, entrada en
  el menú.
- **Datos:** colección `accountingExports/{id}` (+ `files/`), campo
  `accountingExport` en `expenses`; `settings/tenant.accounting`.
- **Ajustes:** `modules.accounting` (`tenants/spi.json` lo declara `false`).
- **Reglas:** `accountingExport` solo del servidor; una rendición exportada no
  cambia sus campos contables (`keepsJournalFields`).
- **Índice:** `expenses (status, date)` en `firestore.indexes.json`.

### Demo

- **Landing del login** (`tenants/demo.json → landing`): destacados y dos
  funciones nuevas, «Timbre electrónico SII verificado» y «Directo a su
  contabilidad»; íconos `fiscal` y `accounting` en `LoginLanding.tsx`. SPI no
  tiene landing, así que no hay nada que homologar ahí.
- `functions/src/demo.data.ts`: estados de timbre realistas por rendición
  (`demoFiscal`), facturas tipo 33 con IVA separado.
- `functions/.env.expense-buddy-demo`: `COUNTRY=CL`,
  `TED_VERIFICATION_DEFAULT=advisory`.

## Qué revisar al homologar SPI

1. **Timbre:** SPI es `COUNTRY=CO`, así que `verifyFiscalDocument` no se
   exporta y el modo queda `off`. El equivalente colombiano (QR DIAN) es la
   Ola 15; hasta entonces SPI no ve insignias.
2. **Contabilidad:** `modules.accounting` queda `false` en SPI. Si SPI lo
   quiere, antes hay que resolver **TD-026** (saldos en moneda base) y armar un
   mapeo de cuentas colombiano y su IVA (el código asume IVA recuperable por
   tipo de documento chileno).
3. **Desplegar en orden:** índice `expenses (status, date)` → reglas →
   funciones → hosting. Las reglas nuevas solo agregan restricciones sobre
   campos que SPI no escribe, pero hay que correr `npm run test:rules` igual.
4. **Merge:** se hace `expense-buddy` → `main` de una vez, cuando se decida
   homologar; después se borra este documento o se marca como histórico.
