import { describe, expect, it, vi } from 'vitest';
import { fillMissingRates } from './fxFill';

// Tests run with the default tenant (SPI, base COP).
describe('fillMissingRates', () => {
  it('fills the rate of the receipt date for foreign expenses saved without one', async () => {
    const getRate = vi.fn(async () => ({ rate: 4000, source: 'Banco de la República' }));
    const [usd, again, cop, ready] = await fillMissingRates(
      [
        { id: 'a', data: { currency: 'USD', amount: 50.5, date: '2026-10-12', trm: null, amountBase: null } },
        { id: 'b', data: { currency: 'USD', amount: 10, date: '2026-10-12', trm: null } },
        { id: 'c', data: { currency: 'COP', amount: 45000, date: '2026-10-12', trm: null } },
        { id: 'd', data: { currency: 'USD', amount: 20, date: '2026-10-12', trm: 3900, amountBase: 78000 } },
      ],
      getRate,
    );
    expect(usd!.data).toMatchObject({ trm: 4000, trmSource: 'Banco de la República', amountBase: 202000, amountCOP: 202000, baseCurrency: 'COP' });
    expect(again!.data.amountBase).toBe(40000);
    expect(getRate).toHaveBeenCalledTimes(1); // one lookup per currency and date
    expect(cop!.data.trm).toBeNull();
    expect(ready!.data).toMatchObject({ trm: 3900, amountBase: 78000 });
  });

  it('leaves the expense as it was when no rate is available', async () => {
    const [d] = await fillMissingRates([{ id: 'a', data: { currency: 'EUR', amount: 9, date: '2026-10-12', trm: null } }], async () => {
      throw new Error('offline');
    });
    expect(d!.data.trm).toBeNull();
  });
});
