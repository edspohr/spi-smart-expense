import { country, BASE_CURRENCY } from '../country';
import { decodeTaxBarcode } from './barcode';
import { getMerchantDictionary } from './dictionary';
import { mergeLocalRead } from './merge';
import { recognizeText } from './ocr';
import { extractFromText, type CountryCode } from './rules';
import type { BarcodeData, LocalFields, LocalReadResult } from './types';

export { toFormPatch } from './merge';
export type { LocalReadResult, LocalField, Confidence } from './types';

/**
 * Reads a receipt on the device, without network: the tax barcode first
 * (exact, milliseconds); OCR + rules when there is none. Never throws for an
 * unreadable photo: it returns whatever it could read.
 */
export async function readReceiptLocally(image: Blob, opts: { categories: string[] }): Promise<LocalReadResult> {
  const t0 = performance.now();
  let barcode: BarcodeData | null = null;
  try {
    barcode = await decodeTaxBarcode(image);
  } catch (err) {
    console.warn('[localReader] barcode decode failed', err);
  }

  let ocrText = '';
  let ocrFields: LocalFields = {};
  let ocrConfidence: number | undefined;
  // A tax barcode already carries issuer, date, total and folio: skip the
  // slower OCR so the read feels instant.
  if (!barcode) {
    try {
      const r = await recognizeText(image);
      ocrText = r.text;
      ocrConfidence = r.confidence;
      ocrFields = extractFromText(r.text, { country: country.code as CountryCode, baseCurrency: BASE_CURRENCY });
    } catch (err) {
      console.warn('[localReader] OCR failed', err);
    }
  }

  return mergeLocalRead({
    barcode,
    ocrFields,
    ocrText,
    dictionary: getMerchantDictionary(),
    categories: opts.categories,
    baseCurrency: BASE_CURRENCY,
    ocrConfidence,
    durationMs: Math.round(performance.now() - t0),
  });
}
