import { describe, expect, it } from 'vitest';
import {
  aiMismatches,
  buildDictionary,
  compareFields,
  confirmedAmountLabel,
  issuerKey,
  learnedAmountLabel,
  mismatchSummary,
  nestDotted,
  readModeOf,
  statIncrements,
  storagePathFromUrl,
} from './offline.logic';

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

describe('learning per issuer (Ola 8b)', () => {
  it('normalizes issuer keys and rejects garbage', () => {
    expect(issuerKey('76.354.771-k')).toBe('76354771-K');
    expect(issuerKey('900.123.456-7')).toBe('900123456-7');
    expect(issuerKey('abc')).toBeNull();
    expect(issuerKey(undefined)).toBeNull();
  });

  it('votes for the one label that carried the confirmed total', () => {
    const candidates = [
      { label: 'SUBTOTAL', value: 28300 },
      { label: 'TOTAL A PAGAR', value: 31130 },
      { label: 'EFECTIVO', value: 35000 },
    ];
    expect(confirmedAmountLabel(candidates, 31130)).toBe('TOTAL A PAGAR');
    expect(confirmedAmountLabel(candidates, 99)).toBeNull();
    // Ambiguous: two different labels with the same value teach nothing.
    expect(confirmedAmountLabel([{ label: 'TOTAL', value: 5 }, { label: 'EFECTIVO', value: 5 }], 5)).toBeNull();
    expect(confirmedAmountLabel([{ label: 'total <script>', value: 5 }], 5)).toBeNull();
  });

  it('serves a label only with enough votes and a clear majority', () => {
    expect(learnedAmountLabel({ 'TOTAL A PAGAR': 1 })).toBeNull();
    expect(learnedAmountLabel({ 'TOTAL A PAGAR': 3, TOTAL: 1 })).toBe('TOTAL A PAGAR');
    expect(learnedAmountLabel({ 'TOTAL A PAGAR': 2, TOTAL: 2 })).toBeNull();
  });
});

describe('daily stats (Ola 8b)', () => {
  it('derives the read mode, defaulting from the offline flag', () => {
    expect(readModeOf({ mode: 'shadow' })).toBe('shadow');
    expect(readModeOf({ offline: true })).toBe('offline');
    expect(readModeOf({})).toBe('local-first');
  });

  it('counts device and AI accuracy per mode and engine', () => {
    const inc = statIncrements('shadow', 'barcode:ted', { amount: true, date: false, taxId: null }, { amount: false });
    expect(inc).toEqual({
      reads: 1,
      'byMode.shadow': 1,
      'fields.shadow.barcode.amount.total': 1,
      'fields.shadow.barcode.amount.ok': 1,
      'fields.shadow.barcode.date.total': 1,
      'ai.amount.total': 1,
    });
    expect(statIncrements('offline', 'ocr', {}, null, { durationMs: 640.4, aiMismatch: true })).toEqual({
      reads: 1,
      'byMode.offline': 1,
      'time.ocr.sum': 640,
      'time.ocr.n': 1,
      aiMismatch: 1,
    });
    expect(nestDotted({ 'a.b.c': 1, 'a.d': 2 }, (n) => n * 10)).toEqual({ a: { b: { c: 10 }, d: 20 } });
  });
});
