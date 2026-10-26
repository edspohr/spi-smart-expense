import { validateNit, validateRut } from '../country';
import { normalizeRut } from './barcodeParsers';
import type { LocalFields, LocalField } from './types';

// Field extraction from OCR text with regular expressions and heuristics.
// Pure and deterministic: tested against OCR-text fixtures.

export type CountryCode = 'CL' | 'CO';

const MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12,
};

/** Upper-case, accents removed, OCR look-alike dashes unified. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .toUpperCase();
}

const field = <T,>(value: T, confidence: LocalField['confidence'], source: LocalField['source'] = 'ocr'): LocalField<T> => ({ value, confidence, source });

// ---------- amounts

/** Parses "3.500", "$ 1.240.000", "45.000,50", "1,190.00", "149.00". */
export function parseAmount(raw: string, wholeUnits: boolean): number | null {
  const s = raw.replace(/[$\s]|CLP|COP|USD|US|EUR/gi, '');
  let n: number;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) n = Number(s.replace(/,/g, ''));
  else if (/^\d+[.,]\d{1,2}$/.test(s)) n = Number(s.replace(',', '.'));
  else if (/^\d+$/.test(s)) n = Number(s);
  else return null;
  if (!Number.isFinite(n) || n <= 0) return null;
  return wholeUnits ? Math.round(n) : n;
}

const AMOUNT_RE = /\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\$?\s?\d+(?:[.,]\d{1,2})?/g;
const TOTAL_LABEL = /\b(TOTAL A PAGAR|TOTAL PAGADO|MONTO TOTAL|VALOR TOTAL|TOTAL GENERAL|TOTAL|MONTO|IMPORTE)\b/;
const NOT_TOTAL = /SUB ?TOTAL|TOTAL IVA|IVA\b|NETO|EXENTO|PROPINA|DESCUENTO|VUELTO|CAMBIO|AFECTO|IMPUESTO/;

function amountsIn(line: string, wholeUnits: boolean): number[] {
  return (line.match(AMOUNT_RE) ?? [])
    .map((m) => parseAmount(m, wholeUnits))
    .filter((n): n is number => n !== null);
}

export function extractAmount(lines: string[], wholeUnits: boolean): LocalField<number> | undefined {
  let best: { value: number; score: number } | undefined;
  lines.forEach((line, i) => {
    const label = line.match(TOTAL_LABEL)?.[1];
    if (!label || NOT_TOTAL.test(line)) return;
    const onLine = amountsIn(line.replace(TOTAL_LABEL, ' '), wholeUnits);
    const candidates = onLine.length ? onLine : amountsIn(lines[i + 1] ?? '', wholeUnits);
    const value = candidates.length ? Math.max(...candidates) : undefined;
    if (!value) return;
    const score = (label.includes('PAGAR') || label.includes('PAGADO') ? 3 : label === 'TOTAL' ? 2 : 1) + i / 1000;
    if (!best || score > best.score) best = { value, score };
  });
  if (best) return field(best.value, best.score >= 2 ? 'high' : 'medium');
  // Fallback: largest plausible amount anywhere (low confidence).
  const all = lines.filter((l) => !/RUT|NIT|FOLIO|BOLETA|FACTURA|TEL|FONO|N[°O] ?\d/.test(l)).flatMap((l) => amountsIn(l, wholeUnits));
  const plausible = all.filter((n) => n >= (wholeUnits ? 100 : 1));
  return plausible.length ? field(Math.max(...plausible), 'low') : undefined;
}

// ---------- dates and times

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function extractDate(lines: string[], today = new Date()): LocalField | undefined {
  const found: { value: string; nearLabel: boolean }[] = [];
  for (const line of lines) {
    const nearLabel = /FECHA|EMISION|FEC\b/.test(line);
    for (const m of line.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
      const v = iso(Number(m[3]), Number(m[2]), Number(m[1]));
      if (v) found.push({ value: v, nearLabel });
    }
    for (const m of line.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
      const v = iso(Number(m[1]), Number(m[2]), Number(m[3]));
      if (v) found.push({ value: v, nearLabel });
    }
    // OCR often reads the O of OCT/NOV as a zero ("22-0CT-2026").
    const lettered = line.replace(/(?<=[\s/.-]|\d)0(?=[A-Z]{2})|(?<=[A-Z])0(?=[A-Z])/g, 'O');
    for (const m of lettered.matchAll(/\b(\d{1,2})[\s/.-]?(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)[A-Z]*[\s/.-]?(\d{2,4})\b/g)) {
      const v = iso(Number(m[3]), MONTHS[m[2]!]!, Number(m[1]));
      if (v) found.push({ value: v, nearLabel });
    }
  }
  const max = new Date(today.getTime() + 86_400_000);
  const min = new Date(today.getTime() - 2 * 365 * 86_400_000);
  const valid = found.filter((f) => {
    const d = new Date(`${f.value}T12:00:00Z`);
    return d <= max && d >= min;
  });
  const pick = valid.find((f) => f.nearLabel) ?? valid[0];
  if (pick) return field(pick.value, pick.nearLabel ? 'high' : 'medium');
  return found[0] ? field(found[0].value, 'low') : undefined;
}

export function extractTime(lines: string[]): LocalField | undefined {
  for (const line of lines) {
    const m = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
    if (m) return field(`${m[1]!.padStart(2, '0')}:${m[2]}`, /HORA/.test(line) ? 'high' : 'medium');
  }
  return undefined;
}

// ---------- tax ids

export function extractTaxId(lines: string[], country: CountryCode): LocalField | undefined {
  if (country === 'CL') {
    let fallback: LocalField | undefined;
    for (const line of lines) {
      // OCR may read a thousands dot as a comma ("76.354,771-K"); the check digit guards it.
      for (const m of line.matchAll(/\b(\d{1,2}[.,]?\d{3}[.,]?\d{3})\s?-\s?([\dK])\b/g)) {
        const rut = normalizeRut(`${m[1]!.replace(/,/g, '.')}-${m[2]}`);
        if (!validateRut(rut)) continue;
        if (/RUT|R\.U\.T/.test(line)) return field(rut, 'high');
        fallback ??= field(rut, 'medium');
      }
    }
    return fallback;
  }
  for (const line of lines) {
    const m = line.match(/N\.?I\.?T\.?\s*[:.]?\s*([\d.]{6,13})(?:\s?-\s?(\d))?/);
    if (!m) continue;
    const body = m[1]!.replace(/\./g, '');
    if (m[2]) {
      const nit = `${body}-${m[2]}`;
      return field(nit, validateNit(nit) ? 'high' : 'low');
    }
    return field(body, 'medium');
  }
  return undefined;
}

// ---------- other fields

export function extractInvoiceNumber(lines: string[]): LocalField | undefined {
  for (const line of lines) {
    if (!/BOLETA|FACTURA|FOLIO|TICKET|COMPROBANTE|N[°O]\.?\s*\d|NRO|#\s*\d/.test(line)) continue;
    if (/RUT|NIT|FECHA|TEL/.test(line)) continue;
    const m = line.match(/(?:N[°O]\.?|NRO\.?|FOLIO|#)\s*:?\s*([A-Z]{0,4}-?\d{3,12})/) ?? line.match(/\b(\d{4,12})\b/);
    if (m) return field(m[1]!.replace(/^0+(?=\d{3,})/, ''), /FOLIO|BOLETA|FACTURA/.test(line) ? 'high' : 'medium');
  }
  return undefined;
}

export function extractPayment(text: string): Pick<LocalFields, 'paymentMethod' | 'cardBrand' | 'cardLast4'> {
  const out: Pick<LocalFields, 'paymentMethod' | 'cardBrand' | 'cardLast4'> = {};
  // Whole words: "BOLETA ELECTRONICA" must not read as Visa Electron (debit).
  if (/DEBITO|REDCOMPRA|\bMAESTRO\b|\bELECTRON\b/.test(text)) out.paymentMethod = field('Debit Card', 'high');
  else if (/CREDITO/.test(text)) out.paymentMethod = field('Credit Card', 'high');
  else if (/EFECTIVO|CONTADO/.test(text)) out.paymentMethod = field('Cash', 'high');
  else if (/TRANSFERENCIA/.test(text)) out.paymentMethod = field('Transfer', 'high');
  const brand = text.match(/\b(VISA|MASTERCARD|MASTER CARD|AMEX|AMERICAN EXPRESS|DINERS)\b/)?.[1];
  if (brand) {
    out.cardBrand = field(brand.startsWith('MASTER') ? 'mastercard' : brand.startsWith('AM') ? 'amex' : brand.toLowerCase(), 'high');
    out.paymentMethod ??= field('Credit Card', 'medium');
  }
  const last4 = text.match(/(?:\*{2,}|X{2,}|\.{3,})\s?(\d{4})\b/)?.[1];
  if (last4) out.cardLast4 = field(last4, 'high');
  return out;
}

export function extractCurrency(text: string, base: string): LocalField {
  if (/\bUSD\b|US\$|U\$S/.test(text)) return field('USD', 'high');
  if (/\bEUR\b|€/.test(text)) return field('EUR', 'high');
  return field(base, 'medium');
}

const NOT_MERCHANT = /RUT|NIT|BOLETA|FACTURA|FECHA|HORA|DIRECC|^AV\b|AVENIDA|CALLE|CARRERA|\bTEL|FONO|GIRO|SUCURSAL|CASA MATRIZ|WWW|@|ELECTRONICA|COMPROBANTE|^\d|TOTAL|SII\b|DIAN/;
const LEGAL_SUFFIX = /\b(SPA|S\.?P\.?A|LTDA|LIMITADA|S\.?A\.?S?|E\.?I\.?R\.?L|Y CIA)\b/;

export function extractMerchant(lines: string[]): LocalField | undefined {
  for (const line of lines.slice(0, 6)) {
    const t = line.trim();
    if (t.length < 3 || NOT_MERCHANT.test(t)) continue;
    const letters = (t.match(/[A-ZÑ]/g) ?? []).length;
    if (letters / t.length < 0.6) continue;
    return field(t.replace(/\s+/g, ' '), LEGAL_SUFFIX.test(t) ? 'medium' : 'low');
  }
  return undefined;
}

/** All text-derived fields. `wholeUnits`: currencies without decimals (CLP). */
export function extractFromText(rawText: string, opts: { country: CountryCode; baseCurrency: string; today?: Date }): LocalFields {
  const text = normalizeText(rawText);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const currency = extractCurrency(text, opts.baseCurrency);
  const wholeUnits = currency.value === 'CLP';
  const fields: LocalFields = {
    taxId: extractTaxId(lines, opts.country),
    merchant: extractMerchant(lines),
    date: extractDate(lines, opts.today),
    time: extractTime(lines),
    amount: extractAmount(lines, wholeUnits),
    currency,
    invoiceNumber: extractInvoiceNumber(lines),
    ...extractPayment(text),
  };
  for (const k of Object.keys(fields) as (keyof LocalFields)[]) if (fields[k] === undefined) delete fields[k];
  return fields;
}
