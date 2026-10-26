import { country, BASE_CURRENCY } from '../country';
import { decodeTaxBarcode } from './barcode';
import { getMerchantDictionary } from './dictionary';
import { learnedLabels, mergeLocalRead } from './merge';
import readerPack from './pack/reader-pack.json';
import { recognizeText } from './ocr';
import { amountCandidates, extractFromText, isWholeUnits, textLines, type CountryCode } from './rules';
import type { BarcodeData, LocalFields, LocalReadResult } from './types';

export { toFormPatch } from './merge';

/**
 * Version of the reading rules, stored with each read so accuracy can be
 * compared across versions. Bump it whenever rules.ts or merge.ts change.
 */
export const READER_VERSION = '1.2.0';

/** Version of the cross-client reader pack built in (Ola 8c). */
export const READER_PACK_VERSION: string = readerPack.version;
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
  let candidates: LocalReadResult['amountCandidates'];
  const dictionary = getMerchantDictionary();
  // A tax barcode already carries issuer, date, total and folio: skip the
  // slower OCR so the read feels instant.
  if (!barcode) {
    try {
      const r = await recognizeText(image);
      ocrText = r.text;
      ocrConfidence = r.confidence;
      ocrFields = extractFromText(r.text, { country: country.code as CountryCode, baseCurrency: BASE_CURRENCY, amountLabels: learnedLabels(dictionary, readerPack) });
      candidates = amountCandidates(textLines(r.text), isWholeUnits(ocrFields.currency?.value ?? BASE_CURRENCY));
    } catch (err) {
      console.warn('[localReader] OCR failed', err);
    }
  }

  const result = mergeLocalRead({
    barcode,
    ocrFields,
    ocrText,
    dictionary,
    categories: opts.categories,
    baseCurrency: BASE_CURRENCY,
    ocrConfidence,
    durationMs: Math.round(performance.now() - t0),
  });
  if (candidates?.length) result.amountCandidates = candidates;
  return result;
}
