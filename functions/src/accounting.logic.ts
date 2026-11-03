// Ola 11: pure journal builder for the accounting export (ADR 0018).
//
// One balanced journal per approved expense, always in the tenant's base
// currency: debit the category's expense account (net of recoverable VAT),
// debit VAT when the document type allows recovering it, credit the
// employee liability (or the company-card account for company expenses).
// Works in integer minor units so every journal balances exactly.
//
// No Firebase imports: the browser imports this file for the preview and
// the callable uses it for the real export, so both always agree.

export type CostCentreSource = 'projectCode' | 'projectName' | 'none';

export interface AccountingSettings {
  /** Credit for expenses the person paid (cuenta por pagar al personal / fondos por rendir). */
  liabilityAccount: string | null;
  /** Credit for company-card expenses (`isCompanyExpense`). */
  companyCardAccount: string | null;
  /** Debit for recoverable VAT (IVA crédito fiscal). */
  vatAccount: string | null;
  /** VAT rate included in the total, e.g. 0.19 in Chile. 0 disables the split. */
  vatRate: number;
  /** Document types whose VAT is recoverable, e.g. ['33'] (factura electrónica). */
  recoverableDocTypes: string[];
  costCentreSource: CostCentreSource;
  /** Category name (as in tenants/<id>.json) → expense account. */
  categoryAccounts: Record<string, string>;
}

export const EMPTY_ACCOUNTING_SETTINGS: AccountingSettings = {
  liabilityAccount: null,
  companyCardAccount: null,
  vatAccount: null,
  vatRate: 0,
  recoverableDocTypes: [],
  costCentreSource: 'projectCode',
  categoryAccounts: {},
};

/** The expense fields the builder reads; a Firestore expense satisfies it. */
export interface AccountingExpense {
  id: string;
  status?: unknown;
  date?: unknown;
  category?: unknown;
  amount?: unknown;
  currency?: unknown;
  amountBase?: unknown;
  amountCOP?: unknown;
  isCompanyExpense?: unknown;
  projectId?: unknown;
  projectName?: unknown;
  merchant?: unknown;
  taxId?: unknown;
  invoiceNumber?: unknown;
  userName?: unknown;
  description?: unknown;
  fiscalVerification?: { status?: unknown; docType?: unknown; folio?: unknown; issuerRut?: unknown } | null;
  localRead?: { docType?: unknown } | null;
  accountingExport?: { exportId?: unknown; exportedAt?: unknown } | null;
}

export interface ProjectRef { code?: string | null; name?: string | null }

/** Problems that keep a journal out of the export until the mapping is fixed. */
export type JournalIssue =
  | 'not_approved'
  | 'no_base_amount'
  | 'unmapped_category'
  | 'missing_liability_account'
  | 'missing_card_account'
  | 'missing_vat_account';

/** Informative notes; the journal still exports. */
export type JournalWarning =
  | 'fiscal_failed'         // TED failed: VAT is not recovered
  | 'already_exported'
  | 'missing_cost_centre';

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
  costCentre: string | null;
  memo: string;
}

export interface Journal {
  expenseId: string;
  date: string;
  currency: string;
  total: number;
  lines: JournalLine[];
  category: string;
  supplierRut: string | null;
  supplierName: string | null;
  docType: string | null;
  folio: string | null;
  employee: string | null;
  memo: string;
  fiscalStatus: string | null;
  issues: JournalIssue[];
  warnings: JournalWarning[];
}

export interface JournalBatch {
  journals: Journal[];
  ready: Journal[];
  blocked: Journal[];
  totals: { count: number; debit: number; credit: number };
}

export interface BuildContext {
  baseCurrency: string;
  projects: Record<string, ProjectRef>;
}

const FISCAL_FAILURES = new Set(['invalid_signature', 'folio_out_of_range', 'issuer_mismatch']);
const ZERO_DECIMAL = new Set(['CLP', 'COP', 'JPY', 'KRW', 'PYG']);

export function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Same rule as baseAmountOf (src/lib/country.ts) and baseAmount (approval.ts). */
export function baseAmountFor(e: AccountingExpense, baseCurrency: string): number | null {
  const currency = str(e.currency) ?? baseCurrency;
  if (currency === baseCurrency) return Number(e.amount) || 0;
  if (typeof e.amountBase === 'number') return e.amountBase;
  return baseCurrency === 'COP' && typeof e.amountCOP === 'number' ? e.amountCOP : null;
}

function costCentreFor(e: AccountingExpense, ctx: BuildContext, source: CostCentreSource): string | null {
  if (source === 'none') return null;
  const project = typeof e.projectId === 'string' ? ctx.projects[e.projectId] : undefined;
  if (source === 'projectCode') return str(project?.code) ?? null;
  return str(project?.name) ?? str(e.projectName);
}

export function buildJournal(e: AccountingExpense, settings: AccountingSettings, ctx: BuildContext): Journal {
  const issues: JournalIssue[] = [];
  const warnings: JournalWarning[] = [];
  const decimals = currencyDecimals(ctx.baseCurrency);
  const scale = 10 ** decimals;

  if (e.status !== 'approved') issues.push('not_approved');
  if (e.accountingExport) warnings.push('already_exported');

  const base = baseAmountFor(e, ctx.baseCurrency);
  if (base === null) issues.push('no_base_amount');
  const totalMinor = Math.round((base ?? 0) * scale);

  const category = str(e.category) ?? '';
  const expenseAccount = settings.categoryAccounts[category] ?? null;
  if (!expenseAccount) issues.push('unmapped_category');

  const company = e.isCompanyExpense === true;
  const creditAccount = company ? settings.companyCardAccount : settings.liabilityAccount;
  if (!creditAccount) issues.push(company ? 'missing_card_account' : 'missing_liability_account');

  const costCentre = costCentreFor(e, ctx, settings.costCentreSource);
  if (settings.costCentreSource !== 'none' && !costCentre) warnings.push('missing_cost_centre');

  const fv = e.fiscalVerification ?? null;
  const fiscalStatus = str(fv?.status);
  const fiscalFailed = fiscalStatus !== null && FISCAL_FAILURES.has(fiscalStatus);
  if (fiscalFailed) warnings.push('fiscal_failed');
  const docType = str(fv?.docType) ?? str(e.localRead?.docType);

  // VAT is only recoverable on base-currency documents of a listed type whose
  // timbre did not fail. Never guessed for foreign receipts.
  const inBase = (str(e.currency) ?? ctx.baseCurrency) === ctx.baseCurrency;
  const recoverVat = inBase && !fiscalFailed && settings.vatRate > 0
    && docType !== null && settings.recoverableDocTypes.includes(docType);
  if (recoverVat && !settings.vatAccount) issues.push('missing_vat_account');

  const netMinor = recoverVat ? Math.round(totalMinor / (1 + settings.vatRate)) : totalMinor;
  const vatMinor = totalMinor - netMinor;

  const supplierName = str(e.merchant);
  const employee = str(e.userName);
  const memo = [employee, supplierName, category].filter(Boolean).join(' · ').slice(0, 200);
  const toMajor = (minor: number) => minor / scale;

  const lines: JournalLine[] = [];
  if (expenseAccount) lines.push({ account: expenseAccount, debit: toMajor(netMinor), credit: 0, costCentre, memo });
  if (recoverVat && vatMinor > 0 && settings.vatAccount) {
    lines.push({ account: settings.vatAccount, debit: toMajor(vatMinor), credit: 0, costCentre: null, memo });
  }
  if (creditAccount) lines.push({ account: creditAccount, debit: 0, credit: toMajor(totalMinor), costCentre: null, memo });

  return {
    expenseId: e.id,
    date: str(e.date) ?? '',
    currency: ctx.baseCurrency,
    total: toMajor(totalMinor),
    lines,
    category,
    supplierRut: str(fv?.issuerRut) ?? str(e.taxId),
    supplierName,
    docType,
    folio: str(fv?.folio) ?? str(e.invoiceNumber),
    employee,
    memo,
    fiscalStatus,
    issues,
    warnings,
  };
}

export function buildJournals(expenses: AccountingExpense[], settings: AccountingSettings, ctx: BuildContext): JournalBatch {
  const journals = expenses
    .map((e) => buildJournal(e, settings, ctx))
    .sort((a, b) => a.date.localeCompare(b.date) || a.expenseId.localeCompare(b.expenseId));
  const ready = journals.filter((j) => j.issues.length === 0);
  const blocked = journals.filter((j) => j.issues.length > 0);
  const scale = 10 ** currencyDecimals(ctx.baseCurrency);
  let debit = 0;
  let credit = 0;
  for (const j of ready) {
    for (const l of j.lines) {
      debit += Math.round(l.debit * scale);
      credit += Math.round(l.credit * scale);
    }
  }
  return { journals, ready, blocked, totals: { count: ready.length, debit: debit / scale, credit: credit / scale } };
}

/** Validates and normalises the `settings/tenant.accounting` map (adminUpdateSettings and the client merge). */
export function parseAccountingSettings(raw: unknown): AccountingSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const account = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null);
  const rate = typeof r.vatRate === 'number' && Number.isFinite(r.vatRate) && r.vatRate >= 0 && r.vatRate < 1 ? r.vatRate : 0;
  const docTypes = Array.isArray(r.recoverableDocTypes)
    ? [...new Set(r.recoverableDocTypes.filter((d): d is string => typeof d === 'string' && /^\d{1,4}$/.test(d)))]
    : [];
  const source: CostCentreSource = r.costCentreSource === 'projectName' || r.costCentreSource === 'none' ? r.costCentreSource : 'projectCode';
  const categoryAccounts: Record<string, string> = {};
  if (r.categoryAccounts && typeof r.categoryAccounts === 'object') {
    for (const [cat, acc] of Object.entries(r.categoryAccounts as Record<string, unknown>)) {
      const a = account(acc);
      if (a && cat.length <= 80) categoryAccounts[cat] = a;
    }
  }
  return {
    liabilityAccount: account(r.liabilityAccount),
    companyCardAccount: account(r.companyCardAccount),
    vatAccount: account(r.vatAccount),
    vatRate: rate,
    recoverableDocTypes: docTypes,
    costCentreSource: source,
    categoryAccounts,
  };
}

export const ISSUE_LABELS: Record<JournalIssue, string> = {
  not_approved: 'No está aprobada',
  no_base_amount: 'Sin monto en moneda base (falta la tasa de cambio)',
  unmapped_category: 'Categoría sin cuenta contable',
  missing_liability_account: 'Falta la cuenta por pagar al personal',
  missing_card_account: 'Falta la cuenta de tarjeta corporativa',
  missing_vat_account: 'Falta la cuenta de IVA crédito fiscal',
};

export const WARNING_LABELS: Record<JournalWarning, string> = {
  fiscal_failed: 'Timbre SII no verifica: no se recupera IVA',
  already_exported: 'Ya fue exportada antes',
  missing_cost_centre: 'Sin centro de costo',
};
