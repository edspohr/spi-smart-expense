import { guessCategory } from './categories';
import type { BarcodeData, FieldSource, LocalFields, LocalReadResult } from './types';

// Combines what each engine found into one result. Precedence per field:
// barcode (exact) > tenant dictionary (merchant/category by tax id) > OCR
// rules > keyword guesses.

export interface MerchantEntry {
  merchant: string;
  category?: string;
}
export type MerchantDictionary = Record<string, MerchantEntry>;

/** Dictionary keys: tax ids without dots/spaces, upper-case ("76354771-K"). */
export function dictionaryKey(taxId: string): string {
  return taxId.replace(/[.\s]/g, '').toUpperCase();
}

export function fieldsFromBarcode(b: BarcodeData): LocalFields {
  const f: LocalFields = {};
  const hi = <T,>(value: T) => ({ value, confidence: 'high' as const, source: 'barcode' as const });
  if (b.issuerTaxId) f.taxId = hi(b.issuerTaxId);
  if (b.issuerName) f.merchant = hi(b.issuerName);
  if (b.date) f.date = hi(b.date);
  if (b.time) f.time = hi(b.time);
  if (b.total) f.amount = hi(b.total);
  if (b.folio) f.invoiceNumber = hi(b.folio);
  if (b.firstItem) f.description = { value: b.firstItem, confidence: 'medium', source: 'barcode' };
  return f;
}

export function mergeLocalRead(input: {
  barcode: BarcodeData | null;
  ocrFields: LocalFields;
  ocrText: string;
  dictionary: MerchantDictionary;
  categories: string[];
  baseCurrency: string;
  ocrConfidence?: number;
  durationMs: number;
}): LocalReadResult {
  const fromCode = input.barcode ? fieldsFromBarcode(input.barcode) : {};
  const fields: LocalFields = { ...input.ocrFields, ...fromCode };
  if (input.barcode?.kind === 'ted') fields.currency = { value: 'CLP', confidence: 'high', source: 'barcode' };
  if (input.barcode?.kind === 'dian') fields.currency = { value: 'COP', confidence: 'high', source: 'barcode' };

  // Tenant dictionary: what this company already approved for this issuer.
  const entry = fields.taxId ? input.dictionary[dictionaryKey(fields.taxId.value)] : undefined;
  if (entry) {
    if (!fields.merchant || fields.merchant.source !== 'barcode') fields.merchant = { value: entry.merchant, confidence: 'high', source: 'dictionary' };
    if (entry.category && input.categories.includes(entry.category)) {
      fields.category = { value: entry.category, confidence: 'high', source: 'dictionary' };
    }
  }
  if (!fields.category) {
    const text = [input.ocrText, fields.merchant?.value, fields.description?.value].filter(Boolean).join('\n');
    const guess = guessCategory(text, input.categories);
    if (guess) fields.category = guess;
  }
  fields.currency ??= { value: input.baseCurrency, confidence: 'medium', source: 'ocr' };

  const sources = [...new Set(Object.values(fields).map((f) => f!.source))] as FieldSource[];
  return {
    fields,
    barcode: input.barcode,
    complete: Boolean(fields.amount && fields.date),
    sources,
    ocrConfidence: input.ocrConfidence,
    durationMs: input.durationMs,
  };
}

/** Form patch (expense form field names) plus per-field confidence for badges. */
export function toFormPatch(result: LocalReadResult): {
  patch: Record<string, string>;
  confidence: Record<string, LocalReadResult['fields'][keyof LocalReadResult['fields']]>;
} {
  const patch: Record<string, string> = {};
  const confidence: Record<string, LocalReadResult['fields'][keyof LocalReadResult['fields']]> = {};
  for (const [key, f] of Object.entries(result.fields)) {
    if (!f) continue;
    patch[key] = String(f.value);
    confidence[key] = f;
  }
  return { patch, confidence };
}
