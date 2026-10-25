import { tenant } from './tenant';

// Country profile of the tenant (ADR 0007). Everything country-specific in
// the UI reads from here: base currency, tax-id label and validation, wallet
// examples, locale. The build-time tenant config picks the profile.

export interface TaxIdCheck {
  valid: boolean;
  formatted: string | null;
}

export interface CountryProfile {
  code: 'CO' | 'CL';
  name: string;
  locale: string;
  taxIdLabel: string;
  taxIdPlaceholder: string;
  walletLabel: string;
  cityPlaceholder: string;
  phonePlaceholder: string;
  validateTaxId: (value: string) => TaxIdCheck;
}

// ---- Chile: RUT (ported from etfa-ruido/src/utils/rut.js)
export function validateRut(raw: string): boolean {
  const clean = String(raw ?? '').replace(/[.\-\s]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i] as string, 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const expected = 11 - (sum % 11);
  return dv === (expected === 11 ? '0' : expected === 10 ? 'K' : String(expected));
}

export function formatRut(raw: string): string {
  const clean = String(raw ?? '').replace(/[.\-\s]/g, '').toUpperCase();
  return clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + clean.slice(-1);
}

// ---- Colombia: NIT with DIAN check digit (weights per DIAN)
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function nitCheckDigit(body: string): number {
  const digits = body.split('').reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (NIT_WEIGHTS[i] ?? 0), 0);
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

export function validateNit(raw: string): boolean {
  const clean = String(raw ?? '').replace(/[.\s]/g, '');
  const m = /^(\d{6,15})-?(\d)?$/.exec(clean);
  if (!m) return false;
  // Without a check digit we can only check the shape.
  return m[2] === undefined ? true : nitCheckDigit(m[1] as string) === Number(m[2]);
}

function formatNit(raw: string): string {
  const clean = String(raw ?? '').replace(/[.\s]/g, '');
  const [body, dv] = clean.split('-');
  const grouped = (body ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dv !== undefined ? `${grouped}-${dv}` : grouped;
}

export const COUNTRIES: Record<CountryProfile['code'], CountryProfile> = {
  CO: {
    code: 'CO',
    name: 'Colombia',
    locale: 'es-CO',
    taxIdLabel: 'NIT',
    taxIdPlaceholder: 'Ej: 900.123.456-7',
    walletLabel: 'Billetera Digital (Nequi/Daviplata)',
    cityPlaceholder: 'Ej: Bogotá',
    phonePlaceholder: 'Ej: 300 123 4567',
    validateTaxId: (v) => {
      const valid = validateNit(v);
      return { valid, formatted: valid ? formatNit(v) : null };
    },
  },
  CL: {
    code: 'CL',
    name: 'Chile',
    locale: 'es-CL',
    taxIdLabel: 'RUT',
    taxIdPlaceholder: 'Ej: 76.123.456-7',
    walletLabel: 'Billetera Digital (MACH/Mercado Pago)',
    cityPlaceholder: 'Ej: Santiago',
    phonePlaceholder: 'Ej: +56 9 1234 5678',
    validateTaxId: (v) => {
      const valid = validateRut(v);
      return { valid, formatted: valid ? formatRut(v) : null };
    },
  },
};

export const country: CountryProfile = COUNTRIES[tenant.locale.country as CountryProfile['code']] ?? COUNTRIES.CO;

export const BASE_CURRENCY = tenant.locale.baseCurrency;

// Foreign currencies need a rate to the tenant's base currency.
export const needsRate = (currency: string | null | undefined): boolean => Boolean(currency) && currency !== BASE_CURRENCY;

// Base-currency value of an expense, or null when it is foreign and has no
// stored equivalent. `amountBase` is written since Ola 7; older Colombian
// expenses carry the same number in `amountCOP`.
export function baseAmountOf(e: { currency?: string; amount?: unknown; amountBase?: unknown; amountCOP?: unknown }): number | null {
  const currency = e.currency || BASE_CURRENCY;
  if (currency === BASE_CURRENCY) return Number(e.amount) || 0;
  const stored = typeof e.amountBase === 'number' ? e.amountBase : BASE_CURRENCY === 'COP' && typeof e.amountCOP === 'number' ? e.amountCOP : null;
  return stored;
}

// Fields to store with an expense for its base-currency equivalent. Writes
// the legacy `amountCOP` too while the base is COP so existing readers and
// exports keep working.
export function baseEquivalentFields(currency: string, equivalent: number | null) {
  const foreign = needsRate(currency);
  const value = foreign ? equivalent : null;
  return {
    baseCurrency: BASE_CURRENCY,
    amountBase: value,
    amountCOP: BASE_CURRENCY === 'COP' ? value : null,
  };
}

// Stored base-currency equivalent of a foreign expense (exports/reports).
export function baseEquivalentOf(e: { currency?: string; amountBase?: unknown; amountCOP?: unknown }): number | null {
  if (!e.currency || e.currency === BASE_CURRENCY) return null;
  return baseAmountOf(e as { currency?: string; amount?: unknown; amountBase?: unknown; amountCOP?: unknown });
}
