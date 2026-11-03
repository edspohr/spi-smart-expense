// Ola 10: offline cryptographic verification of the Chilean TED.
//
// Verifies two SHA1withRSA signatures that travel inside every DTE's PDF417:
//   - FRMA, the SII's signature over the <DA>…</DA> subtree of the CAF
//     (proves the folio range was authorised to the stated RUT by the SII).
//   - FRMT, the issuer's signature over the <DD>…</DD> subtree
//     (proves this specific document was issued inside that CAF).
//
// Pure and runtime-agnostic: uses only `globalThis.crypto.subtle`, available
// in modern browsers and Node 20+. This file is the single implementation:
// the browser imports it from here because functions/ cannot import src/.
// The caller supplies a TedKeyProvider that resolves CAF IDKs to SII public
// keys and says who is verifying (the device is provisional, the server is
// authoritative).
//
// Signed bytes: emitters sign the flattened XML in ISO-8859-1. rawTed keeps
// each scanned byte as one char (latin1, see barcode.ts), so re-encoding it
// gives back the printed bytes; signedByteCandidates also covers whitespace
// and UTF-8 variations. No real receipt has exercised this yet (ADR 0017).

export type FiscalScheme = 'cl_ted';

export type FiscalVerificationStatus =
  | 'verified'          // every signature and range check passed
  | 'invalid_signature' // FRMT or FRMA failed
  | 'folio_out_of_range'// F outside the CAF's authorised RNG D..H
  | 'issuer_mismatch'   // CAF.RE differs from DD.RE
  | 'not_verifiable'    // no decodable TED on the receipt
  | 'error';            // key unavailable or crypto failure

export interface FiscalVerificationMismatch {
  field: 'amount' | 'date' | 'issuerRut';
  ted: string;
  submitted: string;
}

export interface FiscalVerification {
  scheme: FiscalScheme;
  status: FiscalVerificationStatus;
  issuerRut: string | null;
  docType: string | null;
  folio: string | null;
  cafRange: { desde: number; hasta: number; fechaAutorizacion: string } | null;
  cafKeyId: string | null;
  verifiedAt: string;
  verifiedOn: 'device' | 'server'; // device is provisional, server is authoritative
  readerVersion: string;
  mismatches?: FiscalVerificationMismatch[];
  reason?: string;                 // human-readable Spanish, for the UI
}

type VerifyKey = Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;

export interface TedKeyProvider {
  /** Returns the SII public key for the CAF's IDK, or null if unknown. */
  getSiiPublicKey(idk: string): Promise<VerifyKey | null>;
}

export interface TedSubmittedFacts {
  amount?: number;
  date?: string;        // ISO yyyy-mm-dd
  taxId?: string;
}

export interface TedVerifyInput {
  rawTed: string;
  readerVersion: string;
  verifiedOn: FiscalVerification['verifiedOn'];
  submitted?: TedSubmittedFacts;
  now?: Date;           // injected for deterministic tests
}

/** Same RUT normalisation as the reader (src/lib/localReader/barcodeParsers.ts). */
function normalizeRut(raw: string): string {
  const clean = raw.replace(/[.\s]/g, '').replace(/[–—]/g, '-').toUpperCase();
  const m = clean.match(/^(\d{1,9})-?([\dK])$/);
  return m ? `${m[1]}-${m[2]}` : clean;
}

/** The result for an expense with no readable TED. */
export function notVerifiable(
  opts: { readerVersion: string; verifiedOn: FiscalVerification['verifiedOn']; now?: Date },
): FiscalVerification {
  return {
    scheme: 'cl_ted',
    status: 'not_verifiable',
    issuerRut: null, docType: null, folio: null,
    cafRange: null, cafKeyId: null,
    verifiedAt: (opts.now ?? new Date()).toISOString(),
    verifiedOn: opts.verifiedOn,
    readerVersion: opts.readerVersion,
    reason: 'No se encontró un timbre electrónico legible',
  };
}

export interface TedVerifyResult {
  verification: FiscalVerification;
}

export async function verifyTed(
  input: TedVerifyInput,
  keys: TedKeyProvider,
): Promise<TedVerifyResult> {
  const now = (input.now ?? new Date()).toISOString();
  const base = {
    scheme: 'cl_ted' as const,
    verifiedAt: now,
    verifiedOn: input.verifiedOn,
    readerVersion: input.readerVersion,
  };

  const parsed = parseTedStructure(input.rawTed);
  if (!parsed) {
    return wrap(notVerifiable(input));
  }

  const issuerRut = parsed.re ? normalizeRut(parsed.re) : null;
  const common = {
    issuerRut,
    docType: parsed.td,
    folio: parsed.folio,
    cafRange: parsed.caRNG,
    cafKeyId: parsed.idk,
  };

  // Issuer-mismatch is a cheap, structural check and runs before crypto.
  if (!parsed.caRE || normalizeRut(parsed.re) !== normalizeRut(parsed.caRE)) {
    return wrap({
      ...base,
      ...common,
      status: 'issuer_mismatch',
      reason: `RUT del documento (${parsed.re}) no coincide con RUT autorizado en el CAF (${parsed.caRE})`,
    });
  }

  // Folio range.
  const folioNum = Number(parsed.folio);
  if (!parsed.caRNG || !Number.isFinite(folioNum)
      || folioNum < parsed.caRNG.desde || folioNum > parsed.caRNG.hasta) {
    return wrap({
      ...base,
      ...common,
      status: 'folio_out_of_range',
      reason: parsed.caRNG
        ? `Folio ${parsed.folio} fuera del rango autorizado ${parsed.caRNG.desde}-${parsed.caRNG.hasta}`
        : 'CAF sin rango de folios',
    });
  }

  // SII signature over DA.
  const siiKey = await keys.getSiiPublicKey(parsed.idk);
  if (!siiKey) {
    return wrap({
      ...base,
      ...common,
      status: 'error',
      reason: `Clave pública SII no disponible (IDK ${parsed.idk})`,
    });
  }
  const frmaOk = await verifyOrError(siiKey, parsed.frma, parsed.daText);
  if (frmaOk === 'error') {
    return wrap({ ...base, ...common, status: 'error', reason: 'Error verificando FRMA' });
  }
  if (!frmaOk) {
    return wrap({ ...base, ...common, status: 'invalid_signature', reason: 'Firma SII (FRMA) inválida' });
  }

  // Issuer signature over DD, using the public key inside the (now trusted) CAF.
  let issuerKey: VerifyKey;
  try {
    issuerKey = await importRsaFromModExp(parsed.caRSAM, parsed.caRSAE);
  } catch (err) {
    return wrap({
      ...base,
      ...common,
      status: 'error',
      reason: `No se pudo importar la clave del emisor: ${(err as Error).message}`,
    });
  }
  const frmtOk = await verifyOrError(issuerKey, parsed.frmt, parsed.ddText);
  if (frmtOk === 'error') {
    return wrap({ ...base, ...common, status: 'error', reason: 'Error verificando FRMT' });
  }
  if (!frmtOk) {
    return wrap({ ...base, ...common, status: 'invalid_signature', reason: 'Firma del emisor (FRMT) inválida' });
  }

  // Soft reconciliation vs the user-submitted expense. Mismatches here do
  // not demote the status: the receipt itself is authentic, the person just
  // typed something different.
  const mismatches = reconcile(input.submitted ?? {}, {
    amount: parsed.mnt,
    date: parsed.fe,
    issuerRut,
  });

  return wrap({
    ...base,
    ...common,
    status: 'verified',
    ...(mismatches.length ? { mismatches } : {}),
  });
}

function wrap(v: FiscalVerification): TedVerifyResult {
  return { verification: v };
}

// -------------------- parsing --------------------

interface Parsed {
  ddText: string;
  daText: string;
  frmt: string;
  frma: string;
  idk: string;
  re: string;
  td: string | null;
  folio: string | null;
  fe: string | null;
  mnt: number | null;
  caRE: string;
  caRNG: { desde: number; hasta: number; fechaAutorizacion: string } | null;
  caRSAM: string;
  caRSAE: string;
}

function tagText(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1]!.trim() : null;
}

function parseTedStructure(rawTed: string): Parsed | null {
  if (!/<TED\b/.test(rawTed) || !/<DD>/.test(rawTed)) return null;

  const ddText = rawTed.match(/<DD>[\s\S]*?<\/DD>/)?.[0];
  const frmt = rawTed.match(/<FRMT\b[^>]*>([^<]*)<\/FRMT>/)?.[1]?.trim();
  if (!ddText || !frmt) return null;

  const cafText = ddText.match(/<CAF\b[\s\S]*?<\/CAF>/)?.[0];
  if (!cafText) return null;
  const daText = cafText.match(/<DA>[\s\S]*?<\/DA>/)?.[0];
  const frma = cafText.match(/<FRMA\b[^>]*>([^<]*)<\/FRMA>/)?.[1]?.trim();
  if (!daText || !frma) return null;

  const ddOwn = ddText.replace(/<CAF\b[\s\S]*?<\/CAF>/, '');

  const re = tagText(ddOwn, 'RE');
  const idk = tagText(daText, 'IDK');
  const caRE = tagText(daText, 'RE');
  const caRSAM = (daText.match(/<RSAPK>[\s\S]*?<M>([\s\S]*?)<\/M>/)?.[1] ?? '').trim();
  const caRSAE = (daText.match(/<RSAPK>[\s\S]*?<E>([\s\S]*?)<\/E>/)?.[1] ?? '').trim();
  if (!re || !idk || !caRE || !caRSAM || !caRSAE) return null;

  const rngText = daText.match(/<RNG>[\s\S]*?<\/RNG>/)?.[0] ?? '';
  const rngD = tagText(rngText, 'D');
  const rngH = tagText(rngText, 'H');
  const caFA = tagText(daText, 'FA') ?? '';
  const caRNG = rngD && rngH
    ? { desde: Number(rngD), hasta: Number(rngH), fechaAutorizacion: caFA }
    : null;

  const mntRaw = tagText(ddOwn, 'MNT');
  const mnt = mntRaw != null && Number.isFinite(Number(mntRaw)) ? Number(mntRaw) : null;

  return {
    ddText, daText, frmt, frma, idk,
    re, td: tagText(ddOwn, 'TD'),
    folio: tagText(ddOwn, 'F'),
    fe: tagText(ddOwn, 'FE'),
    mnt,
    caRE, caRNG, caRSAM, caRSAE,
  };
}

// -------------------- crypto --------------------

function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToBase64Url(b64: string): string {
  return b64.replace(/\s+/g, '').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function latin1Bytes(s: string): Uint8Array | null {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0xff) return null;
    bytes[i] = code;
  }
  return bytes;
}

/**
 * The byte sequences the signature may cover, most likely first: latin1 then
 * UTF-8, each as scanned and flattened. All of them render the same document,
 * so accepting any does not let a signature vouch for different content.
 */
export function signedByteCandidates(xml: string): Uint8Array[] {
  const forms = [xml, xml.replace(/>\s+</g, '><')];
  const candidates: Uint8Array[] = [];
  for (const form of new Set(forms)) {
    const latin1 = latin1Bytes(form);
    if (latin1) candidates.push(latin1);
    candidates.push(new TextEncoder().encode(form));
  }
  return candidates;
}

async function verifyOrError(
  key: VerifyKey,
  base64Sig: string,
  data: string,
): Promise<boolean | 'error'> {
  try {
    const sig = base64ToBytes(base64Sig);
    for (const bytes of signedByteCandidates(data)) {
      const ok = await globalThis.crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        key,
        sig.buffer as ArrayBuffer,
        bytes.buffer as ArrayBuffer,
      );
      if (ok) return true;
    }
    return false;
  } catch {
    return 'error';
  }
}

async function importRsaFromModExp(mB64: string, eB64: string): Promise<VerifyKey> {
  return await globalThis.crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: base64ToBase64Url(mB64),
      e: base64ToBase64Url(eB64),
      ext: true,
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
    false,
    ['verify'],
  );
}

// -------------------- reconciliation --------------------

function reconcile(
  submitted: TedSubmittedFacts,
  ted: { amount: number | null; date: string | null; issuerRut: string | null },
): FiscalVerificationMismatch[] {
  const mismatches: FiscalVerificationMismatch[] = [];
  if (submitted.amount != null && ted.amount != null
      && Math.round(submitted.amount) !== Math.round(ted.amount)) {
    mismatches.push({ field: 'amount', ted: String(ted.amount), submitted: String(submitted.amount) });
  }
  if (submitted.date && ted.date && submitted.date !== ted.date) {
    mismatches.push({ field: 'date', ted: ted.date, submitted: submitted.date });
  }
  if (submitted.taxId && ted.issuerRut && normalizeRut(submitted.taxId) !== ted.issuerRut) {
    mismatches.push({ field: 'issuerRut', ted: ted.issuerRut, submitted: submitted.taxId });
  }
  return mismatches;
}

// -------------------- server trigger decisions --------------------

export interface ExpenseFiscalFacts {
  amount?: unknown;
  date?: unknown;
  taxId?: unknown;
  currency?: unknown;
  splitGroupId?: unknown;
  fiscalVerification?: { verifiedOn?: unknown } | null;
}

/** What to reconcile against the TED. Split parts and foreign amounts skip the total. */
export function submittedFacts(e: ExpenseFiscalFacts, baseCurrency: string): TedSubmittedFacts {
  const comparable = !e.splitGroupId && (e.currency ?? baseCurrency) === baseCurrency;
  return {
    ...(comparable && typeof e.amount === 'number' ? { amount: e.amount } : {}),
    ...(typeof e.date === 'string' ? { date: e.date } : {}),
    ...(typeof e.taxId === 'string' ? { taxId: e.taxId } : {}),
  };
}

/**
 * Runs on create and when an edit changes a reconciled field; never on its
 * own write. A server result at creation only comes from the seed (rules
 * reject it from clients).
 */
export function needsFiscalCheck(before: ExpenseFiscalFacts | undefined, after: ExpenseFiscalFacts): boolean {
  if (!before) return after.fiscalVerification?.verifiedOn !== 'server';
  return before.amount !== after.amount || before.date !== after.date
    || before.taxId !== after.taxId || before.currency !== after.currency;
}
