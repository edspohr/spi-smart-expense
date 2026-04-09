import { formatCurrency } from './format';

/**
 * Groups an array of expense objects by currency, summing amounts.
 * Excludes rejected expenses. Returns only currencies that have at least one expense.
 * @param {Array} expenses
 * @returns {{ [currency: string]: { total: number, count: number } }}
 */
export function groupByCurrency(expenses) {
  const groups = {};
  (expenses || []).forEach(exp => {
    if (exp.status === 'rejected') return;
    const currency = exp.currency || 'COP';
    if (!groups[currency]) groups[currency] = { total: 0, count: 0 };
    groups[currency].total += Number(exp.amount) || 0;
    groups[currency].count += 1;
  });
  return groups;
}

/**
 * Returns an array of formatted strings for each currency present.
 * COP first, then USD, then others.
 * @param {{ [currency: string]: { total: number, count: number } }} currencyGroups
 * @returns {string[]}
 */
export function formatMultiCurrencyTotal(currencyGroups) {
  const order = ['COP', 'USD', 'CLP'];
  const currencies = [
    ...order.filter(c => currencyGroups[c]),
    ...Object.keys(currencyGroups).filter(c => !order.includes(c))
  ];
  return currencies.map(c => `${formatCurrency(currencyGroups[c].total, c)} ${c}`);
}
