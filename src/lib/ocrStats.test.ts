import { describe, expect, it } from 'vitest';
import { computeOcrStats } from './ocrStats';

describe('computeOcrStats', () => {
  it('computes per-field accuracy overall and per engine, ignoring missing sides', () => {
    const s = computeOcrStats([
      { createdAt: '1', engine: 'barcode:ted', durationMs: 40, localVsSubmitted: { amount: true, date: true, merchant: null }, aiStatus: 'match' },
      { createdAt: '2', engine: 'ocr', durationMs: 2400, localVsSubmitted: { amount: false, date: true }, aiStatus: 'mismatch' },
      { createdAt: '3', engine: 'ocr', durationMs: 1800, localVsSubmitted: { amount: true, date: null } },
    ]);
    expect(s.reads).toBe(3);
    expect(s.byEngine).toEqual({ barcode: 1, ocr: 2 });
    expect(s.fields.amount).toEqual({ correct: 2, total: 3, rate: 2 / 3 });
    expect(s.fields.merchant!.rate).toBeNull();
    expect(s.fieldsByEngine.ocr!.amount).toEqual({ correct: 1, total: 2, rate: 0.5 });
    expect(s.medianMs).toBe(1800);
    expect(s.aiMismatches).toBe(1);
  });
});
