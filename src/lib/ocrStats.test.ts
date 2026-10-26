import { describe, expect, it } from 'vitest';
import { computeReaderStats, weekOf } from './ocrStats';

describe('computeReaderStats', () => {
  it('adds daily counters per field, engine and mode, plus AI accuracy and weekly trend', () => {
    const s = computeReaderStats([
      {
        date: '2026-10-19',
        reads: 3,
        byMode: { shadow: 2, offline: 1 },
        fields: {
          shadow: { ocr: { amount: { ok: 1, total: 2 } }, barcode: { amount: { ok: 1, total: 1 } } },
          offline: { barcode: { date: { ok: 1, total: 1 } } },
        },
        ai: { amount: { ok: 2, total: 2 } },
        time: { ocr: { sum: 2000, n: 2 }, barcode: { sum: 100, n: 1 } },
        aiMismatch: 1,
      },
      { date: '2026-10-26', reads: 1, byMode: { shadow: 1 }, fields: { shadow: { ocr: { amount: { ok: 1, total: 1 } } } } },
    ]);
    expect(s.reads).toBe(4);
    expect(s.byMode).toEqual({ shadow: 3, offline: 1, 'local-first': 0 });
    expect(s.device.amount.all).toEqual({ correct: 3, total: 4, rate: 0.75 });
    expect(s.device.amount.ocr.rate).toBeCloseTo(2 / 3);
    expect(s.device.date.barcode.rate).toBe(1);
    expect(s.device.merchant.all.rate).toBeNull();
    expect(s.ai.amount.rate).toBe(1);
    expect(s.avgMs).toEqual({ barcode: 100, ocr: 1000 });
    expect(s.aiMismatches).toBe(1);
    expect(s.amountByWeek.map((w) => [w.week, w.stat.rate])).toEqual([
      ['2026-10-19', 2 / 3],
      ['2026-10-26', 1],
    ]);
  });

  it('groups dates by their Monday', () => {
    expect(weekOf('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekOf('2026-10-26')).toBe('2026-10-26'); // Monday
  });
});
