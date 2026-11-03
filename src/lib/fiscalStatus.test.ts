import { describe, expect, it } from 'vitest';
import { fiscalExportCells, isFiscalFailure, matchesFiscalFilter } from './fiscalStatus';
import type { FiscalVerification } from '../types/models';

const v = (status: FiscalVerification['status'], extra: Partial<FiscalVerification> = {}) => ({
  scheme: 'cl_ted', status, issuerRut: '1-9', docType: '39', folio: '7', cafRange: null, cafKeyId: '100',
  verifiedAt: 'x', verifiedOn: 'server', readerVersion: 'r', ...extra,
}) as FiscalVerification;

describe('fiscalStatus', () => {
  it('treats only proven problems as failures', () => {
    expect(isFiscalFailure(v('invalid_signature'))).toBe(true);
    expect(isFiscalFailure(v('error'))).toBe(false);
    expect(isFiscalFailure(undefined)).toBe(false);
  });

  it('filters by group', () => {
    expect(matchesFiscalFilter(v('verified'), 'verified')).toBe(true);
    expect(matchesFiscalFilter(v('folio_out_of_range'), 'failed')).toBe(true);
    expect(matchesFiscalFilter(undefined, 'none')).toBe(true);
    expect(matchesFiscalFilter(v('verified'), 'none')).toBe(false);
    expect(matchesFiscalFilter(undefined, '')).toBe(true);
  });

  it('builds the report cells', () => {
    expect(fiscalExportCells(undefined)).toEqual(['', '', '', '', '']);
    expect(fiscalExportCells(v('verified', { mismatches: [{ field: 'amount', ted: '10', submitted: '9' }] })))
      .toEqual(['Timbre verificado', '', '1-9', '7', 'amount: 10 / 9']);
  });
});
