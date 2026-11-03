import { describe, expect, it } from 'vitest';
import { signedByteCandidates, verifyTed } from './tedVerify.logic';

// Official example from the SII's "Manual para empresas usuarias, ambiente de
// certificación factura electrónica" (2009-02-02, §5.1-5.2): a factura timbre
// built from a certification CAF (IDK 100, 512-bit issuer key, e = 3) and the
// FRMT the SII says it produces. It checks our signed-string rules against the
// SII's own output; FRMA cannot be checked without the IDK 100 SII key.
const DD =
  '<DD><RE>97975000-5</RE><TD>33</TD><F>27</F><FE>2003-09-08</FE><RR>8414240-9</RR>' +
  '<RSR>JORGE GONZALEZ LTDA</RSR><MNT>502946</MNT><IT1>Cajon AFECTO</IT1>' +
  '<CAF version="1.0"><DA><RE>97975000-5</RE><RS>RUT DE PRUEBA</RS><TD>33</TD>' +
  '<RNG><D>1</D><H>200</H></RNG><FA>2003-09-04</FA><RSAPK>' +
  '<M>0a4O6Kbx8Qj3K4iWSP4w7KneZYeJ+g/prihYtIEolKt3cykSxl1zO8vSXu397QhTmsX7SBEudTUx++2zDXBhZw==</M>' +
  '<E>Aw==</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">' +
  'g1AQX0sy8NJugX52k2hTJEZAE9Cuul6pqYBdFxj1N17umW7zG/hAavCALKByHzdYAfZ3LhGTXCai5zNxOo4lDQ==</FRMA>' +
  '</CAF><TSTED>2003-09-08T12:28:31</TSTED></DD>';
const FRMT = 'pqjXHHQLJmyFPMRvxScN7tYHvIsty0pqL2LLYaG43jMmnfiZfllLA0wb32lP+HBJ/tf8nziSeorvjlx410ZImw==';
const M = '0a4O6Kbx8Qj3K4iWSP4w7KneZYeJ+g/prihYtIEolKt3cykSxl1zO8vSXu397QhTmsX7SBEudTUx++2zDXBhZw==';

// The manual prints the timbre indented, one tag per line.
const INDENTED_DD = DD.replace(/></g, '>\n\t\t<');
const RAW_TED = `<TED version="1.0">\n\t${INDENTED_DD}\n\t<FRMT algoritmo="SHA1withRSA">${FRMT}</FRMT>\n</TED>`;

const b64url = (b64: string) => b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

describe('official SII timbre example', () => {
  it('flattens the indented DD to the exact string the SII signed', async () => {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: b64url(M), e: b64url('Aw=='), alg: 'RS1', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
      false,
      ['verify'],
    );
    const candidates = signedByteCandidates(INDENTED_DD);
    const results = await Promise.all(
      candidates.map((c) => crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(FRMT), c)),
    );
    expect(results).toContain(true);
  });

  it('parses it and stops at the missing IDK 100 key', async () => {
    const { verification } = await verifyTed(
      { rawTed: RAW_TED, readerVersion: 'test', verifiedOn: 'server', now: new Date('2026-11-03T12:00:00Z') },
      { getSiiPublicKey: async () => null },
    );
    expect(verification).toMatchObject({
      status: 'error',
      issuerRut: '97975000-5',
      docType: '33',
      folio: '27',
      cafRange: { desde: 1, hasta: 200 },
      cafKeyId: '100',
    });
    expect(verification.reason).toContain('IDK 100');
  });
});
