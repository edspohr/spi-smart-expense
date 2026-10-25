import { describe, it, expect } from 'vitest';
import { renderTemplate } from './mail.templates';

const brand = { appName: 'SPI Smart Expense', appUrl: 'https://spi-smart-expense.web.app', color: '#2563eb' };

describe('renderTemplate', () => {
  it('builds a branded approval email with a link back to the app', () => {
    const { subject, html } = renderTemplate('approved', { recipientName: 'Pablo', merchant: 'Hotel Tequendama', amount: '$ 620.000' }, brand);
    expect(subject).toBe('Rendición aprobada: Hotel Tequendama');
    expect(html).toContain('SPI Smart Expense');
    expect(html).toContain('https://spi-smart-expense.web.app/dashboard/expenses');
    expect(html).toContain('$ 620.000');
  });

  it('escapes user-provided text', () => {
    const { html } = renderTemplate('rejected', { merchant: '<script>x</script>', reason: 'a & b' }, brand);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
  });

  it('lists stale items in the digest', () => {
    const { subject, html } = renderTemplate(
      'staleDigest',
      { count: 2, items: [{ merchant: 'Avianca', amount: '$ 1.850.000', submitterName: 'Sofía', days: 30 }] },
      brand,
    );
    expect(subject).toBe('2 rendiciones esperan tu revisión');
    expect(html).toContain('30 días');
  });
});
