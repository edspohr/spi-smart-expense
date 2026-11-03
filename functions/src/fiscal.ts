import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { BASE_CURRENCY, FUNCTIONS_REGION } from './common';
import { needsFiscalCheck, notVerifiable, pemBase64, submittedFacts, verifyTed, type TedKeyProvider } from './tedVerify.logic';

// Ola 10: authoritative verification of the Chilean TED. Exported only for
// COUNTRY=CL tenants (index.ts). The device result is provisional; this one
// replaces it, so a client cannot keep a claimed `verified` it did not earn.
// The region is explicit: index.ts loads this module before setGlobalOptions.

const TED_VERIFICATION_DEFAULT = defineString('TED_VERIFICATION_DEFAULT', { default: 'off' });

const KEY_DIR = join(__dirname, '..', 'sii-keys');
const keys = new Map<string, Promise<CryptoKey | null>>();

async function importPem(pem: string): Promise<CryptoKey> {
  const der = Buffer.from(pemBase64(pem), 'base64');
  return globalThis.crypto.subtle.importKey(
    'spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['verify'],
  );
}

const siiKeyProvider: TedKeyProvider = {
  getSiiPublicKey(idk) {
    if (!/^\d+$/.test(idk)) return Promise.resolve(null);
    let pending = keys.get(idk);
    if (!pending) {
      const file = `${idk}.pem`;
      pending = readdirSync(KEY_DIR).includes(file)
        ? importPem(readFileSync(join(KEY_DIR, file), 'utf8'))
        : Promise.resolve(null);
      keys.set(idk, pending);
    }
    return pending;
  },
};

export const verifyFiscalDocument = onDocumentWritten({ document: 'expenses/{expenseId}', region: FUNCTIONS_REGION, memory: '256MiB' }, async (event) => {
  const after = event.data?.after;
  const e = after?.exists ? after.data() : undefined;
  if (!after || !e) return;
  if (!needsFiscalCheck(event.data?.before?.exists ? event.data.before.data() : undefined, e)) return;

  const settings = (await getFirestore().doc('settings/tenant').get()).data();
  const mode = settings?.fiscal?.tedVerification ?? TED_VERIFICATION_DEFAULT.value();
  if (mode === 'off') {
    if (e.fiscalVerification) await after.ref.update({ fiscalVerification: FieldValue.delete() });
    return;
  }

  const readerVersion = typeof e.localRead?.readerVersion === 'string' ? e.localRead.readerVersion : 'server';
  const fiscalVerification = typeof e.rawTed === 'string'
    ? (await verifyTed({
        rawTed: e.rawTed, readerVersion, verifiedOn: 'server', submitted: submittedFacts(e, BASE_CURRENCY.value()),
      }, siiKeyProvider)).verification
    : notVerifiable({ readerVersion, verifiedOn: 'server' });
  await after.ref.update({ fiscalVerification });
  logger.info('fiscal verification', { expenseId: after.id, status: fiscalVerification.status });
});
