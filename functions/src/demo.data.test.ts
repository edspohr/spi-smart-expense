import { describe, expect, it } from 'vitest';
import { demoFiscal } from './demo.data';

const fv = (r: Record<string, unknown>) => r.fiscalVerification as Record<string, unknown>;

describe('demoFiscal', () => {
  it('writes a verified server result for a boleta by default', () => {
    const r = fv(demoFiscal('boleta', 5, '76.341.213-3', 10_000, '2026-10-01'));
    expect(r).toMatchObject({ status: 'verified', docType: '39', verifiedOn: 'server', folio: '4005' });
  });

  it('marks facturas as doc type 33 so the export splits their VAT', () => {
    expect(fv(demoFiscal('factura', 1, null, 10_000, '2026-10-01')).docType).toBe('33');
  });

  it('writes nothing for receipts without a timbre, leaving them to the server', () => {
    expect(demoFiscal('none', 1, null, 10_000, '2026-10-01')).toEqual({});
  });

  it('keeps a mismatch verified and reports the printed amount', () => {
    const r = fv(demoFiscal('mismatch', 2, null, 32_900, '2026-10-01'));
    expect(r.status).toBe('verified');
    expect(r.mismatches).toEqual([{ field: 'amount', ted: '29300', submitted: '32900' }]);
  });

  it('carries the failure reasons', () => {
    expect(fv(demoFiscal('invalid', 3, null, 1, '2026-10-01')).status).toBe('invalid_signature');
    expect(fv(demoFiscal('folio', 4, null, 1, '2026-10-01')).status).toBe('folio_out_of_range');
  });
});
