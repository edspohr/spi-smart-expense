import { describe, expect, it } from 'vitest';
import { aiMismatches, buildDictionary, compareFields, mismatchSummary, storagePathFromUrl } from './offline.logic';

describe('compareFields', () => {
  it('normalizes amounts, tax ids, invoice numbers and merchant names', () => {
    const read = { amount: 68400, date: '2026-10-20', taxId: '99.520.000-7', invoiceNumber: '0004815162', category: 'COMBUSTIBLE', merchant: 'COPEC S.A.' };
    const truth = { amount: '68400', date: '2026-10-20', taxId: '99520000-7', invoiceNumber: '4815162', category: 'COMBUSTIBLE', merchant: 'Copec Ruta 5 Norte' };
    expect(compareFields(read, truth)).toEqual({ amount: true, date: true, taxId: true, invoiceNumber: true, category: true, merchant: true });
  });

  it('reports false on real differences and null when a side is missing', () => {
    const r = compareFields({ amount: 3500, date: '2026-10-21' }, { amount: 35000, date: '2026-10-21', taxId: '76354771-K' });
    expect(r.amount).toBe(false);
    expect(r.date).toBe(true);
    expect(r.taxId).toBeNull();
  });
});

describe('aiMismatches', () => {
  it('flags only critical fields that differ', () => {
    const m = aiMismatches({ amount: 31130, date: '2026-10-20', taxId: '76354771-K', invoiceNumber: '999' }, { amount: 28300, date: '2026-10-20', taxId: '76354771-K', invoiceNumber: '123' });
    expect(m).toEqual([{ field: 'amount', submitted: 28300, ai: 31130 }]);
    expect(mismatchSummary([...m, { field: 'date', submitted: 'a', ai: 'b' }])).toBe('el monto y la fecha');
  });
});

describe('storagePathFromUrl', () => {
  it('extracts the object path from prod and emulator download URLs', () => {
    expect(storagePathFromUrl('https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/receipts%2Fu1%2F1.jpg?alt=media&token=t')).toBe('receipts/u1/1.jpg');
    expect(storagePathFromUrl('http://127.0.0.1:9199/v0/b/demo/o/receipts%2Fu2%2Fa.webp?alt=media')).toBe('receipts/u2/a.webp');
    expect(storagePathFromUrl('not a url')).toBeNull();
  });
});

describe('buildDictionary', () => {
  it('keeps the most frequent merchant and category per tax id', () => {
    const d = buildDictionary([
      { taxId: '99.520.000-7', merchant: 'Copec Ruta 5 Norte', category: 'COMBUSTIBLE' },
      { taxId: '99520000-7', merchant: 'Copec Ruta 5 Norte', category: 'COMBUSTIBLE' },
      { taxId: '99520000-7', merchant: 'COPEC', category: 'VARIOS' },
      { taxId: '76354771-k', merchant: 'Restaurante El Minero' },
    ]);
    expect(d['99520000-7']).toEqual({ merchant: 'Copec Ruta 5 Norte', category: 'COMBUSTIBLE' });
    expect(d['76354771-K']).toEqual({ merchant: 'Restaurante El Minero' });
  });
});
