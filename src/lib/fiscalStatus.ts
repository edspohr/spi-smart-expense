import type { FiscalVerification } from '../types/models';

// Ola 10: labels and groupings of the TED verification state for reports.

export type FiscalFilter = '' | 'verified' | 'failed' | 'none';

const FAILED: FiscalVerification['status'][] = ['invalid_signature', 'folio_out_of_range', 'issuer_mismatch'];

export const FISCAL_STATUS_LABELS: Record<FiscalVerification['status'], string> = {
  verified: 'Timbre verificado',
  invalid_signature: 'Firma inválida',
  folio_out_of_range: 'Folio fuera de rango',
  issuer_mismatch: 'RUT emisor no coincide',
  not_verifiable: 'Sin timbre',
  error: 'Verificación pendiente',
};

export function isFiscalFailure(v?: FiscalVerification | null): boolean {
  return !!v && FAILED.includes(v.status);
}

export function matchesFiscalFilter(v: FiscalVerification | null | undefined, filter: FiscalFilter): boolean {
  if (filter === 'verified') return v?.status === 'verified';
  if (filter === 'failed') return isFiscalFailure(v);
  if (filter === 'none') return !v || v.status === 'not_verifiable' || v.status === 'error';
  return true;
}

/** Report columns, in order: state, reason, issuer RUT, folio, differences. */
export function fiscalExportCells(v?: FiscalVerification | null): string[] {
  if (!v) return ['', '', '', '', ''];
  return [
    FISCAL_STATUS_LABELS[v.status],
    v.reason ?? '',
    v.issuerRut ?? '',
    v.folio ?? '',
    (v.mismatches ?? []).map((m) => `${m.field}: ${m.ted} / ${m.submitted}`).join('; '),
  ];
}
