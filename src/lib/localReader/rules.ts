import { validateNit, validateRut } from '../country';
import { normalizeRut } from './barcodeParsers';
import type { LocalFields, LocalField } from './types';

// Field extraction from OCR text with regular expressions and heuristics.
// Pure and deterministic: tested against OCR-text fixtures.

export type CountryCode = 'CL' | 'CO';

const MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12,
  // English (receipts abroad: trade fairs, travel)
  JAN: 1, APR: 4, AUG: 8, DEC: 12,
};
const MONTH_RE = 'ENE|JAN|FEB|MAR|ABR|APR|MAY|JUN|JUL|AGO|AUG|SEP|SET|OCT|NOV|DIC|DEC';

// ---------- receipt locale

/**
 * Receipts from the United States (and other English-speaking places) write
 * dates month first and amounts with cents. Markers that only appear on
 * English receipts, plus a "STATE 12345" zip line.
 */
const EN_MARKERS = [
  /THANK YOU/, /\bTAX\b/, /\bTIP\b|GRATUITY/, /CHANGE DUE|\bCHANGE\b/, /AMOUNT DUE|BALANCE DUE|TOTAL DUE/,
  /\bCASHIER\b|\bSERVER\b/, /\bGUESTS?\b/, /APPROVED|AUTH(ORIZATION)? ?(CODE|#)/, /\bQTY\b|\bITEMS?\b/,
  /\b[A-Z]{2} \d{5}(-\d{4})?\b/, /\bRECEIPT\b/, /\bSUITES?\b|\bROOM\b/,
];

export type ReceiptLocale = 'latam' | 'us' | 'unsure';

export function receiptLocale(text: string): ReceiptLocale {
  const score = EN_MARKERS.filter((re) => re.test(text)).length;
  if (score >= 2) return 'us';
  return score === 1 ? 'unsure' : 'latam';
}

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
const TOTAL_LABEL = /\b(TOTAL A PAGAR|TOTAL PAGADO|MONTO TOTAL|VALOR TOTAL|TOTAL GENERAL|AMOUNT DUE|BALANCE DUE|TOTAL DUE|GRAND TOTAL|TOTAL|MONTO|IMPORTE|AMOUNT)\b/;
const NOT_TOTAL = /SUB ?-?TOTAL|TOTAL IVA|IVA\b|NETO|EXENTO|PROPINA|DESCUENTO|VUELTO|CAMBIO|AFECTO|IMPUESTO|\bTAX\b|\bTIP\b|GRATUITY|\bCHANGE\b|DISCOUNT|SAVINGS|TENDERED|TOTAL ITEMS/;
const STRONG_TOTAL = /PAGAR|PAGADO|DUE|GRAND/;

function amountsIn(line: string, wholeUnits: boolean): number[] {
  return (line.match(AMOUNT_RE) ?? [])
    .map((m) => parseAmount(m, wholeUnits))
    .filter((n): n is number => n !== null);
}

const SKIP_FOR_CANDIDATES = /RUT|NIT|FOLIO|TEL|FONO|FECHA|HORA|N[°O] ?\d|\*{2,}/;

/** The words before an amount on a line, as a short label ("TOTAL A PAGAR"). */
export function amountLabel(line: string): string {
  return line
    .replace(AMOUNT_RE, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ')
    .slice(0, 24);
}

export interface AmountCandidate {
  label: string;
  value: number;
}

/**
 * Every labelled amount on the receipt. Sent with shadow/offline reads so the
 * server can learn, per issuer, which label carries the confirmed total.
 */
export function amountCandidates(lines: string[], wholeUnits: boolean, max = 30): AmountCandidate[] {
  const out: AmountCandidate[] = [];
  for (const line of lines) {
    if (SKIP_FOR_CANDIDATES.test(line)) continue;
    const label = amountLabel(line);
    if (label.length < 3) continue;
    for (const value of amountsIn(line.replace(TOTAL_LABEL, ' '), wholeUnits)) {
      if (value >= (wholeUnits ? 10 : 0.5)) out.push({ label, value });
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/**
 * Total amount. `preferredLabel` is what this tenant learned for the issuer
 * (readerProfiles): when a line carries it, that amount wins.
 */
export function extractAmount(lines: string[], wholeUnits: boolean, preferredLabel?: string): LocalField<number> | undefined {
  if (preferredLabel) {
    const hit = amountCandidates(lines, wholeUnits, 60).find((c) => c.label === preferredLabel);
    if (hit) return field(hit.value, 'high');
  }
  let best: { value: number; score: number } | undefined;
  lines.forEach((line, i) => {
    const label = line.match(TOTAL_LABEL)?.[1];
    if (!label || NOT_TOTAL.test(line)) return;
    const onLine = amountsIn(line.replace(TOTAL_LABEL, ' '), wholeUnits);
    const candidates = onLine.length ? onLine : amountsIn(lines[i + 1] ?? '', wholeUnits);
    const value = candidates.length ? Math.max(...candidates) : undefined;
    if (!value) return;
    const score = (STRONG_TOTAL.test(label) ? 3 : label === 'TOTAL' ? 2 : 1) + i / 1000;
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

/**
 * Receipt date. Latin American receipts write day/month; US receipts
 * month/day (`locale`). When the locale is unsure and the numbers could be
 * either (03/10), the date comes back with low confidence so the form asks
 * the person to check it.
 */
export function extractDate(lines: string[], today = new Date(), locale: ReceiptLocale = 'latam'): LocalField | undefined {
  const found: { value: string; nearLabel: boolean; ambiguous?: boolean }[] = [];
  for (const line of lines) {
    const nearLabel = /FECHA|EMISION|FEC\b|\bDATE\b/.test(line);
    for (const m of line.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
      const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const monthFirst = locale === 'us' || (a <= 12 && b > 12);
      const v = monthFirst ? iso(y, a, b) : iso(y, b, a);
      if (v) found.push({ value: v, nearLabel, ambiguous: locale === 'unsure' && a <= 12 && b <= 12 && a !== b });
    }
    for (const m of line.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
      const v = iso(Number(m[1]), Number(m[2]), Number(m[3]));
      if (v) found.push({ value: v, nearLabel });
    }
    // OCR often reads the O of OCT/NOV as a zero ("22-0CT-2026").
    const lettered = line.replace(/(?<=[\s/.-]|\d)0(?=[A-Z]{2})|(?<=[A-Z])0(?=[A-Z])/g, 'O');
    for (const m of lettered.matchAll(new RegExp(`\\b(\\d{1,2})[\\s/.-]?(${MONTH_RE})[A-Z]*[\\s/.,-]*(\\d{2,4})\\b`, 'g'))) {
      const v = iso(Number(m[3]), MONTHS[m[2]!]!, Number(m[1]));
      if (v) found.push({ value: v, nearLabel });
    }
    // "OCT 21, 2026" / "Oct 21 26" (month first, English receipts).
    for (const m of lettered.matchAll(new RegExp(`\\b(${MONTH_RE})[A-Z]*\\.?\\s(\\d{1,2}),?\\s(\\d{2,4})\\b`, 'g'))) {
      const v = iso(Number(m[3]), MONTHS[m[1]!]!, Number(m[2]));
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
  if (pick) return field(pick.value, pick.ambiguous ? 'low' : pick.nearLabel ? 'high' : 'medium');
  return found[0] ? field(found[0].value, 'low') : undefined;
}

export function extractTime(lines: string[]): LocalField | undefined {
  for (const line of lines) {
    const m = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s?(AM|PM|A\.M\.|P\.M\.)?(?![A-Z])/);
    if (!m) continue;
    let h = Number(m[1]);
    const pm = m[3]?.startsWith('P');
    if (m[3] && h <= 12) h = (h % 12) + (pm ? 12 : 0);
    return field(`${String(h).padStart(2, '0')}:${m[2]}`, /HORA|TIME/.test(line) ? 'high' : 'medium');
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
    if (!/BOLETA|FACTURA|FOLIO|TICKET|COMPROBANTE|RECEIPT|INVOICE|CHECK|ORDER|N[°O]\.?\s*\d|NRO|#\s*\d/.test(line)) continue;
    if (/RUT|NIT|FECHA|TEL|PHONE|TABLE|GUEST|SERVER|STORE ?#|AUTH/.test(line)) continue;
    const m = line.match(/(?:N[°O]\.?|NRO\.?|FOLIO|#)\s*:?\s*([A-Z]{0,4}-?\d{3,12})/) ?? line.match(/\b(\d{4,12})\b/);
    if (m) return field(m[1]!.replace(/^0+(?=\d{3,})/, ''), /FOLIO|BOLETA|FACTURA|INVOICE/.test(line) ? 'high' : 'medium');
  }
  return undefined;
}

export function extractPayment(text: string): Pick<LocalFields, 'paymentMethod' | 'cardBrand' | 'cardLast4'> {
  const out: Pick<LocalFields, 'paymentMethod' | 'cardBrand' | 'cardLast4'> = {};
  // Whole words: "BOLETA ELECTRONICA" must not read as Visa Electron (debit).
  if (/DEBITO|\bDEBIT\b|REDCOMPRA|\bMAESTRO\b|\bELECTRON\b/.test(text)) out.paymentMethod = field('Debit Card', 'high');
  else if (/CREDITO|\bCREDIT\b/.test(text)) out.paymentMethod = field('Credit Card', 'high');
  else if (/EFECTIVO|CONTADO|\bCASH\b/.test(text)) out.paymentMethod = field('Cash', 'high');
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

export function extractCurrency(text: string, base: string, locale: ReceiptLocale = 'latam'): LocalField {
  if (/\bUSD\b|US\$|U\$S/.test(text)) return field('USD', 'high');
  if (/\bEUR\b|€/.test(text)) return field('EUR', 'high');
  // A US receipt in dollars: "$" is USD there, not the local peso.
  if (locale === 'us' && base !== 'USD') return field('USD', /\$/.test(text) ? 'high' : 'medium');
  return field(base, 'medium');
}

const NOT_MERCHANT = /RUT|NIT|BOLETA|FACTURA|FECHA|HORA|DIRECC|^AV\b|AVENIDA|CALLE|CARRERA|\bTEL|FONO|GIRO|SUCURSAL|CASA MATRIZ|WWW|@|ELECTRONICA|COMPROBANTE|^\d|TOTAL|SII\b|DIAN|WELCOME|RECEIPT|INVOICE|\bORDER\b|STORE ?#|PHONE|\bDATE\b/;
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

/** Normalised, non-empty lines of OCR text. */
export function textLines(rawText: string): string[] {
  return normalizeText(rawText).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** True for currencies read without decimals. */
export const isWholeUnits = (currency: string) => currency === 'CLP';

/**
 * All text-derived fields. `amountLabels`: learned total label per issuer tax
 * id (dictionary keys), applied once the tax id is read.
 */
export function extractFromText(
  rawText: string,
  opts: { country: CountryCode; baseCurrency: string; today?: Date; amountLabels?: Record<string, string> },
): LocalFields {
  const text = normalizeText(rawText);
  const lines = textLines(rawText);
  const locale = receiptLocale(text);
  const currency = extractCurrency(text, opts.baseCurrency, locale);
  const wholeUnits = isWholeUnits(currency.value);
  const taxId = extractTaxId(lines, opts.country);
  const fields: LocalFields = {
    taxId,
    merchant: extractMerchant(lines),
    date: extractDate(lines, opts.today, locale),
    time: extractTime(lines),
    amount: extractAmount(lines, wholeUnits, taxId ? opts.amountLabels?.[taxId.value.toUpperCase()] : undefined),
    currency,
    invoiceNumber: extractInvoiceNumber(lines),
    ...extractPayment(text),
  };
  for (const k of Object.keys(fields) as (keyof LocalFields)[]) if (fields[k] === undefined) delete fields[k];
  return fields;
}
