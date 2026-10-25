import { describe, it, expect } from 'vitest';
import { BASE_CURRENCY, COUNTRIES, baseAmountOf, baseEquivalentFields, country, formatRut, needsRate, nitCheckDigit, validateNit, validateRut } from './country';

describe('RUT (Chile)', () => {
  it('validates check digits, including K and 0', () => {
    expect(validateRut('76.086.428-5')).toBe(true);
    expect(validateRut('11111111-1')).toBe(true);
    expect(validateRut('76.086.428-4')).toBe(false);
    expect(validateRut('abc')).toBe(false);
  });

  it('formats with dots and dash', () => {
    expect(formatRut('760864285')).toBe('76.086.428-5');
  });
});

describe('NIT (Colombia)', () => {
  it('computes the DIAN check digit', () => {
    expect(nitCheckDigit('900123456')).toBe(8);
    expect(nitCheckDigit('860002183')).toBe(9);
  });

  it('accepts a correct check digit or none, rejects a wrong one', () => {
    expect(validateNit('900.123.456-8')).toBe(true);
    expect(validateNit('900123456')).toBe(true);
    expect(validateNit('900.123.456-7')).toBe(false);
    expect(validateNit('12')).toBe(false);
  });

  it('formats valid NITs through the country profile', () => {
    expect(COUNTRIES.CO.validateTaxId('900123456-8')).toEqual({ valid: true, formatted: '900.123.456-8' });
    expect(COUNTRIES.CL.validateTaxId('76086428-5')).toEqual({ valid: true, formatted: '76.086.428-5' });
  });
});

describe('base currency (spi tenant in tests)', () => {
  it('resolves the tenant profile', () => {
    expect(country.code).toBe('CO');
    expect(BASE_CURRENCY).toBe('COP');
  });

  it('needs a rate only for foreign currencies', () => {
    expect(needsRate('COP')).toBe(false);
    expect(needsRate('USD')).toBe(true);
    expect(needsRate('CLP')).toBe(true);
  });

  it('reads the base amount from amountBase, or legacy amountCOP', () => {
    expect(baseAmountOf({ currency: 'COP', amount: 1000 })).toBe(1000);
    expect(baseAmountOf({ currency: 'USD', amount: 10, amountBase: 41000 })).toBe(41000);
    expect(baseAmountOf({ currency: 'USD', amount: 10, amountCOP: 40000 })).toBe(40000);
    expect(baseAmountOf({ currency: 'EUR', amount: 10 })).toBeNull();
  });

  it('writes amountBase and the legacy amountCOP while the base is COP', () => {
    expect(baseEquivalentFields('USD', 41000)).toEqual({ baseCurrency: 'COP', amountBase: 41000, amountCOP: 41000 });
    expect(baseEquivalentFields('COP', 999)).toEqual({ baseCurrency: 'COP', amountBase: null, amountCOP: null });
  });
});
