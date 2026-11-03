import { describe, expect, it } from 'vitest';
import { buildJournal, buildJournals, parseAccountingSettings, type AccountingExpense, type AccountingSettings, type BuildContext } from './accounting.logic';

const CL: AccountingSettings = {
  liabilityAccount: '2-1-05-001',
  companyCardAccount: '2-1-01-010',
  vatAccount: '1-1-05-001',
  vatRate: 0.19,
  recoverableDocTypes: ['33'],
  costCentreSource: 'projectCode',
  categoryAccounts: { COMBUSTIBLE: '6-1-01-001', ALIMENTACIÓN: '6-1-02-001' },
};
const ctx: BuildContext = { baseCurrency: 'CLP', projects: { p1: { code: 'CC-100', name: 'Faena Norte' } } };

const expense = (over: Partial<AccountingExpense> = {}): AccountingExpense => ({
  id: 'e1', status: 'approved', date: '2026-10-20', category: 'COMBUSTIBLE', amount: 119000, currency: 'CLP',
  projectId: 'p1', merchant: 'COPEC', taxId: '99520000-7', userName: 'Ana Pérez', ...over,
});

const balanced = (j: { lines: { debit: number; credit: number }[] }) =>
  j.lines.reduce((s, l) => s + l.debit, 0) === j.lines.reduce((s, l) => s + l.credit, 0);

describe('buildJournal', () => {
  it('splits recoverable VAT on a factura (TD 33)', () => {
    const j = buildJournal(expense({ fiscalVerification: { status: 'verified', docType: '33', folio: '881', issuerRut: '99520000-7' } }), CL, ctx);
    expect(j.issues).toEqual([]);
    expect(j.lines).toEqual([
      { account: '6-1-01-001', debit: 100000, credit: 0, costCentre: 'CC-100', memo: 'Ana Pérez · COPEC · COMBUSTIBLE' },
      { account: '1-1-05-001', debit: 19000, credit: 0, costCentre: null, memo: 'Ana Pérez · COPEC · COMBUSTIBLE' },
      { account: '2-1-05-001', debit: 0, credit: 119000, costCentre: null, memo: 'Ana Pérez · COPEC · COMBUSTIBLE' },
    ]);
    expect(j.folio).toBe('881');
    expect(j.docType).toBe('33');
  });

  it('keeps the full amount as expense on a boleta (TD 39) and with no document type', () => {
    for (const fv of [{ status: 'verified', docType: '39' }, null]) {
      const j = buildJournal(expense({ fiscalVerification: fv }), CL, ctx);
      expect(j.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([['6-1-01-001', 119000, 0], ['2-1-05-001', 0, 119000]]);
    }
  });

  it('rounds VAT to whole pesos and always balances', () => {
    const j = buildJournal(expense({ amount: 10001, localRead: { docType: '33' } }), CL, ctx);
    expect(j.lines.map((l) => l.debit)).toEqual([8404, 1597, 0]);
    expect(balanced(j)).toBe(true);
  });

  it('uses two decimals for a USD base', () => {
    const usd: BuildContext = { baseCurrency: 'USD', projects: {} };
    const j = buildJournal(expense({ amount: 10, currency: 'USD', localRead: { docType: '33' } }), { ...CL, costCentreSource: 'none' }, usd);
    expect(j.lines.map((l) => l.debit)).toEqual([8.4, 1.6, 0]);
    expect(j.total).toBe(10);
    expect(balanced(j)).toBe(true);
  });

  it('does not recover VAT when the timbre failed', () => {
    const j = buildJournal(expense({ fiscalVerification: { status: 'invalid_signature', docType: '33' } }), CL, ctx);
    expect(j.lines).toHaveLength(2);
    expect(j.warnings).toContain('fiscal_failed');
    expect(j.issues).toEqual([]);
  });

  it('books foreign receipts at their base equivalent without VAT', () => {
    const j = buildJournal(expense({ amount: 42.5, currency: 'USD', amountBase: 40375, localRead: { docType: '33' } }), CL, ctx);
    expect(j.total).toBe(40375);
    expect(j.lines).toHaveLength(2);
    expect(buildJournal(expense({ amount: 42.5, currency: 'USD' }), CL, ctx).issues).toContain('no_base_amount');
  });

  it('credits the company card for company expenses', () => {
    const j = buildJournal(expense({ isCompanyExpense: true }), CL, ctx);
    expect(j.lines.at(-1)?.account).toBe('2-1-01-010');
    expect(buildJournal(expense({ isCompanyExpense: true }), { ...CL, companyCardAccount: null }, ctx).issues).toContain('missing_card_account');
  });

  it('flags what blocks the export', () => {
    expect(buildJournal(expense({ category: 'VARIOS' }), CL, ctx).issues).toEqual(['unmapped_category']);
    expect(buildJournal(expense({ status: 'pending' }), CL, ctx).issues).toEqual(['not_approved']);
    expect(buildJournal(expense(), { ...CL, liabilityAccount: null }, ctx).issues).toEqual(['missing_liability_account']);
    expect(buildJournal(expense({ localRead: { docType: '33' } }), { ...CL, vatAccount: null }, ctx).issues).toEqual(['missing_vat_account']);
  });

  it('warns about re-exports and missing cost centres', () => {
    const j = buildJournal(expense({ projectId: 'unknown', accountingExport: { exportId: 'x' } }), CL, ctx);
    expect(j.warnings).toEqual(['already_exported', 'missing_cost_centre']);
    expect(j.issues).toEqual([]);
  });

  it('works for a COP tenant with no VAT configured', () => {
    const co: BuildContext = { baseCurrency: 'COP', projects: {} };
    const settings = parseAccountingSettings({ liabilityAccount: '2335', categoryAccounts: { GASOLINA: '5195' }, costCentreSource: 'none' });
    const j = buildJournal(expense({ category: 'GASOLINA', currency: 'COP', amount: 85000 }), settings, co);
    expect(j.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([['5195', 85000, 0], ['2335', 0, 85000]]);
    const legacy = buildJournal(expense({ category: 'GASOLINA', currency: 'USD', amount: 20, amountCOP: 80000 }), settings, co);
    expect(legacy.total).toBe(80000);
  });
});

describe('buildJournals', () => {
  it('sorts by date, separates blocked journals and totals only the ready ones', () => {
    const batch = buildJournals([
      expense({ id: 'b', date: '2026-10-21', localRead: { docType: '33' } }),
      expense({ id: 'a', date: '2026-10-20' }),
      expense({ id: 'c', category: 'VARIOS' }),
    ], CL, ctx);
    expect(batch.journals.map((j) => j.expenseId)).toEqual(['a', 'c', 'b']);
    expect(batch.ready.map((j) => j.expenseId)).toEqual(['a', 'b']);
    expect(batch.blocked.map((j) => j.expenseId)).toEqual(['c']);
    expect(batch.totals).toEqual({ count: 2, debit: 238000, credit: 238000 });
  });
});

describe('parseAccountingSettings', () => {
  it('normalises input and drops invalid values', () => {
    expect(parseAccountingSettings({
      liabilityAccount: '  2-1-05-001 ',
      vatRate: 1.5,
      recoverableDocTypes: ['33', '33', 'x', 46],
      costCentreSource: 'whatever',
      categoryAccounts: { COMBUSTIBLE: '6-1', VARIOS: '', OTRO: 3 },
    })).toEqual({
      liabilityAccount: '2-1-05-001',
      companyCardAccount: null,
      vatAccount: null,
      vatRate: 0,
      recoverableDocTypes: ['33'],
      costCentreSource: 'projectCode',
      categoryAccounts: { COMBUSTIBLE: '6-1' },
    });
    expect(parseAccountingSettings(undefined).categoryAccounts).toEqual({});
  });
});
