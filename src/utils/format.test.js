import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format';

// Intl inserts non-breaking spaces; normalise before asserting.
const NBSP = String.fromCharCode(160);
const norm = (s) => s.split(NBSP).join(' ');

describe('formatCurrency', () => {
  it('returns $0 for null or undefined', () => {
    expect(formatCurrency(null)).toBe('$0');
    expect(formatCurrency(undefined, 'USD')).toBe('$0');
  });

  it('formats COP without decimals using dot thousands separator', () => {
    expect(norm(formatCurrency(1500000))).toContain('1.500.000');
    expect(norm(formatCurrency(1500000))).not.toMatch(/,\d\d$/);
  });

  it('formats USD with two decimals', () => {
    expect(formatCurrency(12.5, 'USD')).toBe('$12.50');
  });

  it('formats EUR with comma decimals', () => {
    expect(norm(formatCurrency(10, 'EUR'))).toContain('10,00');
  });

  it('formats CLP without decimals', () => {
    expect(norm(formatCurrency(1000, 'CLP'))).toContain('1.000');
  });
});
