import { baseEquivalentFields, needsRate } from './country';
import { calculateBaseEquivalent, fetchRate } from './exchangeRate';

// Expenses in a foreign currency saved without signal (on a plane, roaming
// off) have no exchange rate yet. Before they are written, fill it in with
// the rate of the receipt's date, so reports and totals in the base
// currency include them. Expenses that already have a rate are untouched.

type ExpenseDoc = { id: string; data: Record<string, unknown> };
type RateFn = (currency: string, date: string) => Promise<{ rate: number | null; source: string }>;

export async function fillMissingRates(docs: ExpenseDoc[], getRate: RateFn = fetchRate): Promise<ExpenseDoc[]> {
  const cache = new Map<string, Promise<{ rate: number | null; source: string }>>();
  return Promise.all(
    docs.map(async (d) => {
      const currency = typeof d.data.currency === 'string' ? d.data.currency : '';
      if (!needsRate(currency) || d.data.trm) return d;
      const date = typeof d.data.date === 'string' ? d.data.date : '';
      const key = `${currency}|${date}`;
      if (!cache.has(key)) cache.set(key, getRate(currency, date).catch(() => ({ rate: null, source: 'error' })));
      const { rate, source } = await cache.get(key)!;
      if (!rate) return d;
      return {
        ...d,
        data: {
          ...d.data,
          trm: rate,
          trmSource: source,
          ...baseEquivalentFields(currency, calculateBaseEquivalent(d.data.amount as number, rate)),
        },
      };
    }),
  );
}
