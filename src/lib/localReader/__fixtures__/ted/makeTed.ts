// Test-only helper: synthesizes a valid Chilean TED signed by freshly
// generated "fake SII" and issuer RSA keypairs. Nothing is persisted — each
// run gets new keys — so no real or long-lived keys live in the repo.
//
// Tampering hooks (`tamperFrma`, `tamperFrmt`) let individual tests cover
// the negative statuses of the TED verifier.

export interface MakeTedOptions {
  idk?: string;
  issuerRut?: string;
  caIssuerRut?: string;         // defaults to issuerRut; set differently to force issuer_mismatch
  issuerName?: string;
  docType?: string;
  folio?: number;
  date?: string;                // YYYY-MM-DD
  amount?: number;
  rng?: { desde: number; hasta: number };
  cafAuthorizationDate?: string;
  firstItem?: string;
  /** Sign UTF-8 instead of the ISO-8859-1 emitters use. */
  signUtf8?: boolean;
  /** Sign flattened XML but print it indented, as the scanner may see it. */
  indented?: boolean;
  tamperFrma?: boolean;
  tamperFrmt?: boolean;
}

export interface MakeTedResult {
  ted: string;
  siiPublicKey: CryptoKey;
  issuerPublicKey: CryptoKey;
  idk: string;
  folio: string;
  amount: number;
  date: string;
}

const DEFAULTS = {
  idk: '100',
  issuerRut: '76123456-7',
  issuerName: 'EMPRESA DEMO SPA',
  docType: '39',
  folio: 42,
  date: '2026-10-20',
  amount: 68400,
  rng: { desde: 1, hasta: 1000 },
  cafAuthorizationDate: '2026-01-01',
  firstItem: 'ITEM',
};

export async function makeTedFixture(opts: MakeTedOptions = {}): Promise<MakeTedResult> {
  const o = { ...DEFAULTS, ...opts };

  const [siiPair, issuerPair] = await Promise.all([
    generateRsa(1024),
    generateRsa(512), // CAF keys are this short, which is what fits the PDF417
  ]);

  const issuerJwk = await globalThis.crypto.subtle.exportKey('jwk', issuerPair.publicKey);
  const mB64 = base64UrlToBase64(issuerJwk.n!);
  const eB64 = base64UrlToBase64(issuerJwk.e!);

  const caRe = opts.caIssuerRut ?? o.issuerRut;
  const da = `<DA><RE>${caRe}</RE><RS>${o.issuerName}</RS><TD>${o.docType}</TD><RNG><D>${o.rng.desde}</D><H>${o.rng.hasta}</H></RNG><FA>${o.cafAuthorizationDate}</FA><RSAPK><M>${mB64}</M><E>${eB64}</E></RSAPK><IDK>${o.idk}</IDK></DA>`;
  const frmaRaw = await signSha1Rsa(siiPair.privateKey, da, opts.signUtf8);
  const frma = opts.tamperFrma ? flipFirstByteOfBase64(frmaRaw) : frmaRaw;

  const caf = `<CAF version="1.0">${da}<FRMA algoritmo="SHA1withRSA">${frma}</FRMA></CAF>`;
  const dd = `<DD><RE>${o.issuerRut}</RE><TD>${o.docType}</TD><F>${o.folio}</F><FE>${o.date}</FE><RR>66666666-6</RR><RSR>CLIENTE</RSR><MNT>${o.amount}</MNT><IT1>${o.firstItem}</IT1>${caf}<TSTED>${o.date}T12:00:00</TSTED></DD>`;
  const frmtRaw = await signSha1Rsa(issuerPair.privateKey, dd, opts.signUtf8);
  const frmt = opts.tamperFrmt ? flipFirstByteOfBase64(frmtRaw) : frmtRaw;

  const printedDd = opts.indented ? dd.replace(/></g, '>\n  <') : dd;
  const ted = `<TED version="1.0">${printedDd}<FRMT algoritmo="SHA1withRSA">${frmt}</FRMT></TED>`;

  return {
    ted,
    siiPublicKey: siiPair.publicKey,
    issuerPublicKey: issuerPair.publicKey,
    idk: o.idk,
    folio: String(o.folio),
    amount: o.amount,
    date: o.date,
  };
}

// -------------------- crypto helpers --------------------

async function generateRsa(modulusLength: number): Promise<CryptoKeyPair> {
  return (await globalThis.crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-1',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
}

async function signSha1Rsa(privateKey: CryptoKey, data: string, utf8 = false): Promise<string> {
  const bytes = utf8 ? new TextEncoder().encode(data) : Uint8Array.from(data, (c) => c.charCodeAt(0));
  const sig = await globalThis.crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    bytes.buffer as ArrayBuffer,
  );
  return bytesToBase64(new Uint8Array(sig));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToBase64(s: string): string {
  const padLen = (4 - (s.length % 4)) % 4;
  return s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
}

function flipFirstByteOfBase64(b64: string): string {
  const bytes = base64ToBytes(b64);
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return bytesToBase64(bytes);
}
