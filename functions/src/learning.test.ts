import { describe, expect, it } from 'vitest';
import { aggregateIssuers, buildContribution, isEmptyContribution, isLegalEntity, validateContribution } from './learning.logic';
import { DERIVED_TERMS_VERSION as CLIENT_VERSION } from '../../src/lib/learningTerms';
import { DERIVED_TERMS_VERSION } from './learning.logic';

const ENV = 'a'.repeat(32);

describe('isLegalEntity', () => {
  it('keeps companies and drops natural persons', () => {
    expect(isLegalEntity('99520000-7', 'CL')).toBe(true);
    expect(isLegalEntity('76354771-K', 'CL')).toBe(true);
    expect(isLegalEntity('12345678-5', 'CL')).toBe(false); // person
    expect(isLegalEntity('900123456-7', 'CO')).toBe(true);
    expect(isLegalEntity('800197268-4', 'CO')).toBe(true);
    expect(isLegalEntity('1020304050', 'CO')).toBe(false); // cédula
    expect(isLegalEntity('abc', 'CL')).toBe(false);
  });
});

describe('buildContribution', () => {
  const day = {
    date: '2026-10-26',
    reads: 3,
    byMode: { shadow: 3 },
    fields: { shadow: { ocr: { amount: { ok: 2, total: 3 } } } },
    ai: { amount: { ok: 3, total: 3 } },
    time: { ocr: { sum: 3000, n: 3 } },
    aiMismatch: 1,
  };

  it('sends only legal-entity issuers, clean labels and counters without AI data', () => {
    const c = buildContribution({
      envId: ENV,
      country: 'CL',
      generatedAt: '2026-10-27T05:00:00.000Z',
      profiles: [
        { issuer: '99520000-7', labels: { TOTAL: 4, 'total <b>': 2, EFECTIVO: 0 } },
        { issuer: '12345678-5', labels: { TOTAL: 9 } },
      ],
      stats: [{ date: '2026-10-25', reads: 1 }, day as never],
      sinceDay: '2026-10-25',
    });
    expect(c.issuers).toEqual([{ issuer: '99520000-7', labels: { TOTAL: 4 } }]);
    expect(c.stats).toEqual([
      { date: '2026-10-26', reads: 3, byMode: { shadow: 3 }, fields: { shadow: { ocr: { amount: { ok: 2, total: 3 } } } }, time: { ocr: { sum: 3000, n: 3 } } },
    ]);
    expect(JSON.stringify(c)).not.toMatch(/ai|12345678/);
    expect(validateContribution(c)).toBeNull();
    expect(isEmptyContribution({ ...c, issuers: [], stats: [] })).toBe(true);
  });
});

describe('validateContribution', () => {
  const ok = { schema: 'derived-v0', envId: ENV, country: 'CL', generatedAt: '2026-10-27T05:00:00.000Z', issuers: [], stats: [] };

  it('rejects anything beyond the exact schema', () => {
    expect(validateContribution(ok)).toBeNull();
    expect(validateContribution({ ...ok, tenant: 'spi' })).toBe('unexpected top-level field');
    expect(validateContribution({ ...ok, envId: 'spi-smart-expense' })).toBe('bad envId');
    expect(validateContribution({ ...ok, issuers: [{ issuer: '12345678-5', labels: { TOTAL: 1 } }] })).toBe('issuer is not a legal entity');
    expect(validateContribution({ ...ok, issuers: [{ issuer: '99520000-7', labels: { TOTAL: 1 }, name: 'COPEC' }] })).toBe('unexpected issuer field');
    expect(validateContribution({ ...ok, stats: [{ date: '2026-10-26', reads: 1, amounts: [1] }] })).toBe('unexpected stats field');
    expect(validateContribution({ ...ok, stats: [{ date: '2026-10-26', reads: 1, fields: { shadow: { ocr: { amount: { ok: 1, total: 1, value: 3500 } } } } }] })).toBe('unexpected counters');
  });
});

describe('aggregateIssuers', () => {
  it('sums the latest snapshot of each environment', () => {
    expect(
      aggregateIssuers([
        [{ issuer: '99520000-7', labels: { TOTAL: 3 } }],
        [{ issuer: '99520000-7', labels: { TOTAL: 1, 'TOTAL A PAGAR': 2 } }],
      ]),
    ).toEqual({ '99520000-7': { TOTAL: 4, 'TOTAL A PAGAR': 2 } });
  });
});

describe('terms version', () => {
  it('is the same on the client and the server', () => {
    expect(CLIENT_VERSION).toBe(DERIVED_TERMS_VERSION);
  });
});
