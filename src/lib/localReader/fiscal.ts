import { decodeTaxBarcode } from './barcode';
import { READER_VERSION } from './index';
import { siiKeyProvider } from './siiKeys';
import { notVerifiable, verifyTed, type FiscalVerification, type TedSubmittedFacts } from '../../../functions/src/tedVerify.logic';

// Ola 10: device side of the TED check. Independent of how the form was
// filled (Gemini or local reader), so every path gets the same evidence.

export interface FiscalRead {
  rawTed: string | null;
  verification: FiscalVerification;
}

async function check(rawTed: string | null, submitted?: TedSubmittedFacts): Promise<FiscalRead> {
  if (!rawTed) return { rawTed: null, verification: notVerifiable({ readerVersion: READER_VERSION, verifiedOn: 'device' }) };
  const { verification } = await verifyTed({ rawTed, readerVersion: READER_VERSION, verifiedOn: 'device', submitted }, siiKeyProvider);
  return { rawTed, verification };
}

/** Scans the receipt for a TED and verifies it. A failed scan means no timbre. */
export async function readFiscal(image: Blob): Promise<FiscalRead> {
  const barcode = await decodeTaxBarcode(image).catch((err) => {
    console.warn('[fiscal] barcode decode failed', err);
    return null;
  });
  return check(barcode?.kind === 'ted' ? barcode.rawTed ?? null : null);
}

/** Re-checks with the values the person is actually submitting. */
export function reconcileFiscal(read: FiscalRead, submitted: TedSubmittedFacts): Promise<FiscalRead> {
  return check(read.rawTed, submitted);
}
