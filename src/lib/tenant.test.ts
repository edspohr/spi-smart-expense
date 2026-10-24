import { describe, it, expect } from 'vitest';
import { tenant, hexToRgbTriplet, applyTenantTheme } from './tenant';

describe('tenant config', () => {
  it('defaults to the spi tenant when VITE_TENANT is unset', () => {
    expect(tenant.id).toBe('spi');
    expect(tenant.locale.baseCurrency).toBe('COP');
    expect(tenant.security.pinEnabled).toBe(false);
  });
});

describe('hexToRgbTriplet', () => {
  it('converts 6-digit hex', () => {
    expect(hexToRgbTriplet('#2563eb')).toBe('37 99 235');
  });

  it('expands 3-digit hex', () => {
    expect(hexToRgbTriplet('#fff')).toBe('255 255 255');
  });

  it('rejects invalid input', () => {
    expect(() => hexToRgbTriplet('blue')).toThrow(/Invalid hex/);
  });
});

describe('applyTenantTheme', () => {
  it('sets one CSS variable per palette step', () => {
    const el = document.createElement('div');
    applyTenantTheme(tenant, el);
    expect(el.style.getPropertyValue('--brand-600')).toBe('37 99 235');
    expect(el.style.getPropertyValue('--brand-50')).toBe('239 246 255');
  });
});
