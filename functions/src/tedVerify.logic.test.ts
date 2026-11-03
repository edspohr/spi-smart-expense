import { beforeAll, describe, expect, it } from 'vitest';
import { needsFiscalCheck, notVerifiable, pemBase64, submittedFacts, verifyTed, type TedKeyProvider } from './tedVerify.logic';
import { makeTedFixture } from '../../src/lib/localReader/__fixtures__/ted/makeTed';

const READER_VERSION = '1.4.0';
const NOW = new Date('2026-10-20T15:00:00Z');

function keyMapProvider(map: Record<string, CryptoKey>): TedKeyProvider {
  return {
    getSiiPublicKey: async (idk: string) => map[idk] ?? null,
  };
}

describe('verifyTed', () => {
  // Generate the base fixture once; most tests build off it or regenerate
  // when they need to tamper with the signed bytes.
  let base: Awaited<ReturnType<typeof makeTedFixture>>;
  let siiKeys: Record<string, CryptoKey>;

  beforeAll(async () => {
    base = await makeTedFixture();
    siiKeys = { [base.idk]: base.siiPublicKey };
  });

  it('returns verified for an untampered TED', async () => {
    const { verification } = await verifyTed(
      { rawTed: base.ted, readerVersion: READER_VERSION, verifiedOn: 'device', now: NOW },
      keyMapProvider(siiKeys),
    );
    expect(verification).toMatchObject({
      scheme: 'cl_ted',
      status: 'verified',
      issuerRut: '76123456-7',
      docType: '39',
      folio: '42',
      cafRange: { desde: 1, hasta: 1000 },
      cafKeyId: base.idk,
      verifiedOn: 'device',
      readerVersion: READER_VERSION,
    });
    expect(verification.mismatches).toBeUndefined();
    expect(verification.verifiedAt).toBe(NOW.toISOString());
  });

  it('flags invalid_signature when FRMT is tampered (issuer signature over DD)', async () => {
    const t = await makeTedFixture({ tamperFrmt: true });
    const { verification } = await verifyTed(
      { rawTed: t.ted, readerVersion: READER_VERSION, verifiedOn: 'device', now: NOW },
      keyMapProvider({ [t.idk]: t.siiPublicKey }),
    );
    expect(verification.status).toBe('invalid_signature');
    expect(verification.reason).toMatch(/FRMT/);
  });

  it('flags invalid_signature when FRMA is tampered (SII signature over DA)', async () => {
    const t = await makeTedFixture({ tamperFrma: true });
    const { verification } = await verifyTed(
      { rawTed: t.ted, readerVersion: READER_VERSION, verifiedOn: 'device', now: NOW },
      keyMapProvider({ [t.idk]: t.siiPublicKey }),
    );
    expect(verification.status).toBe('invalid_signature');
    expect(verification.reason).toMatch(/FRMA/);
  });

  it('flags folio_out_of_range when the folio falls outside the CAF range', async () => {
    const t = await makeTedFixture({ folio: 5000, rng: { desde: 1, hasta: 1000 } });
    const { verification } = await verifyTed(
      { rawTed: t.ted, readerVersion: READER_VERSION, verifiedOn: 'device', now: NOW },
      keyMapProvider({ [t.idk]: t.siiPublicKey }),
    );
    expect(verification.status).toBe('folio_out_of_range');
    expect(verification.reason).toMatch(/5000/);
    expect(verification.cafRange).toEqual({
      desde: 1, hasta: 1000, fechaAutorizacion: '2026-01-01',
    });
  });

  it('flags issuer_mismatch when CAF.DA.RE differs from DD.RE', async () => {
    const t = await makeTedFixture({ issuerRut: '76123456-7', caIssuerRut: '99999999-9' });
    const { verification } = await verifyTed(
      { rawTed: t.ted, readerVersion: READER_VERSION, verifiedOn: 'device', now: NOW },
      keyMapProvider({ [t.idk]: t.siiPublicKey }),
    );
    expect(verification.status).toBe('issuer_mismatch');
    expect(verification.reason).toMatch(/99999999-9/);
  });

  it('returns error when the SII public key for the IDK is unknown', async () => {
    const { verification } = await verifyTed(
      { rawTed: base.ted, readerVersion: READER_VERSION, verifiedOn: 'device', now: NOW },
      keyMapProvider({}),           // no keys at all
    );
    expect(verification.status).toBe('error');
    expect(verification.reason).toMatch(/IDK/);
    expect(verification.cafKeyId).toBe(base.idk);
  });

  it('returns not_verifiable for input that is not a TED', async () => {
    const { verification } = await verifyTed(
      { rawTed: 'random-barcode-content', readerVersion: READER_VERSION, verifiedOn: 'device', now: NOW },
      keyMapProvider(siiKeys),
    );
    expect(verification.status).toBe('not_verifiable');
    expect(verification.issuerRut).toBeNull();
    expect(verification.cafKeyId).toBeNull();
  });

  it('keeps status verified when the submitted amount differs, logging a soft mismatch', async () => {
    const { verification } = await verifyTed(
      {
        rawTed: base.ted,
        readerVersion: READER_VERSION,
        verifiedOn: 'device',
        now: NOW,
        submitted: { amount: 50000, date: base.date, taxId: '76.123.456-7' },
      },
      keyMapProvider(siiKeys),
    );
    expect(verification.status).toBe('verified');
    expect(verification.mismatches).toEqual([
      { field: 'amount', ted: String(base.amount), submitted: '50000' },
    ]);
  });

  it('flags a RUT typed by the person that differs from the timbre', async () => {
    const { verification } = await verifyTed(
      { rawTed: base.ted, readerVersion: READER_VERSION, verifiedOn: 'server', submitted: { taxId: '11111111-1' } },
      keyMapProvider(siiKeys),
    );
    expect(verification).toMatchObject({ status: 'verified', verifiedOn: 'server' });
    expect(verification.mismatches?.[0]).toMatchObject({ field: 'issuerRut', ted: '76123456-7' });
  });

  it('verifies a name with Ñ signed in ISO-8859-1', async () => {
    const t = await makeTedFixture({ issuerName: 'CAÑÓN Y MUÑOZ LTDA' });
    const { verification } = await verifyTed(
      { rawTed: t.ted, readerVersion: READER_VERSION, verifiedOn: 'device' },
      keyMapProvider({ [t.idk]: t.siiPublicKey }),
    );
    expect(verification.status).toBe('verified');
  });

  it('verifies a TED signed in UTF-8', async () => {
    const t = await makeTedFixture({ issuerName: 'CAÑÓN LTDA', signUtf8: true });
    const { verification } = await verifyTed(
      { rawTed: t.ted, readerVersion: READER_VERSION, verifiedOn: 'device' },
      keyMapProvider({ [t.idk]: t.siiPublicKey }),
    );
    expect(verification.status).toBe('verified');
  });

  it('verifies a TED signed flattened but scanned with indentation', async () => {
    const t = await makeTedFixture({ indented: true });
    const { verification } = await verifyTed(
      { rawTed: t.ted, readerVersion: READER_VERSION, verifiedOn: 'device' },
      keyMapProvider({ [t.idk]: t.siiPublicKey }),
    );
    expect(verification.status).toBe('verified');
  });

  it('still rejects changed content across every byte candidate', async () => {
    const t = await makeTedFixture();
    const forged = t.ted.replace(`<MNT>${t.amount}</MNT>`, '<MNT>1</MNT>');
    const { verification } = await verifyTed(
      { rawTed: forged, readerVersion: READER_VERSION, verifiedOn: 'device' },
      keyMapProvider({ [t.idk]: t.siiPublicKey }),
    );
    expect(verification.status).toBe('invalid_signature');
  });
});

describe('notVerifiable', () => {
  it('records who concluded there is no timbre', () => {
    expect(notVerifiable({ readerVersion: 'x', verifiedOn: 'server', now: NOW })).toMatchObject({
      status: 'not_verifiable', verifiedOn: 'server', issuerRut: null,
    });
  });
});

describe('submittedFacts', () => {
  it('skips the total on split parts and foreign currency', () => {
    expect(submittedFacts({ amount: 10, date: '2026-01-01', currency: 'CLP', splitGroupId: 'g' }, 'CLP')).toEqual({ date: '2026-01-01' });
    expect(submittedFacts({ amount: 10, currency: 'USD' }, 'CLP')).toEqual({});
    expect(submittedFacts({ amount: 10, currency: 'CLP', taxId: '1-9' }, 'CLP')).toEqual({ amount: 10, taxId: '1-9' });
  });
});

describe('needsFiscalCheck', () => {
  const e = { amount: 10, date: 'd', taxId: 't', currency: 'CLP' };
  it('runs on create and on reconciled edits only', () => {
    expect(needsFiscalCheck(undefined, e)).toBe(true);
    expect(needsFiscalCheck(e, { ...e, amount: 11 })).toBe(true);
    expect(needsFiscalCheck(e, { ...e })).toBe(false);
    expect(needsFiscalCheck(undefined, { ...e, fiscalVerification: { verifiedOn: 'device' } })).toBe(true);
    expect(needsFiscalCheck(undefined, { ...e, fiscalVerification: { verifiedOn: 'server' } })).toBe(false);
  });
});

describe('pemBase64', () => {
  it('ignores a source note above the block and line breaks inside it', () => {
    const pem = '# SII, mesa de ayuda, 2026-11-10\n-----BEGIN PUBLIC KEY-----\nMIGf\nMA0G\n-----END PUBLIC KEY-----\n';
    expect(pemBase64(pem)).toBe('MIGfMA0G');
    expect(() => pemBase64('MIGfMA0G')).toThrow();
  });
});
