import type { FiscalVerification, FiscalVerificationMismatch } from '../types/models';

// Ola 10: shows the TED (timbre SII) verification state of an expense.
// `verified` is a green pill; cryptographic failures are red; "sin timbre"
// and "pendiente" are amber. Renders nothing when no verification was
// attached (CO tenants, pre-Ola 10 docs, or `fiscal.tedVerification = off`).

export interface FiscalBadgeProps {
  verification?: FiscalVerification | null;
  size?: 'sm' | 'md';
  className?: string;
}

const LABELS: Record<FiscalVerification['status'], string> = {
  verified: 'Timbre SII verificado',
  invalid_signature: 'Timbre inválido',
  folio_out_of_range: 'Folio fuera de rango',
  issuer_mismatch: 'RUT emisor no coincide',
  not_verifiable: 'Sin timbre',
  error: 'Verificación pendiente',
};

const TONE: Record<FiscalVerification['status'], string> = {
  verified: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  invalid_signature: 'bg-rose-50 text-rose-700 ring-rose-200',
  folio_out_of_range: 'bg-rose-50 text-rose-700 ring-rose-200',
  issuer_mismatch: 'bg-rose-50 text-rose-700 ring-rose-200',
  not_verifiable: 'bg-amber-50 text-amber-800 ring-amber-200',
  error: 'bg-amber-50 text-amber-800 ring-amber-200',
};

const MISMATCH_LABELS: Record<FiscalVerificationMismatch['field'], string> = {
  amount: 'monto',
  date: 'fecha',
  issuerRut: 'RUT emisor',
};

const ICON: Record<FiscalVerification['status'], string> = {
  verified: '✓',
  invalid_signature: '✕',
  folio_out_of_range: '✕',
  issuer_mismatch: '✕',
  not_verifiable: '—',
  error: '…',
};

export default function FiscalBadge({ verification, size = 'sm', className = '' }: FiscalBadgeProps) {
  if (!verification) return null;
  const label = verification.status === 'verified' && verification.verifiedOn === 'device'
    ? 'Timbre verificado en el dispositivo'
    : LABELS[verification.status];
  const tone = TONE[verification.status];
  const icon = ICON[verification.status];
  const sizing = size === 'md'
    ? 'px-2.5 py-1 text-xs'
    : 'px-2 py-0.5 text-[10px]';
  return (
    <span
      title={tooltip(verification)}
      className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ${tone} ${sizing} ${className}`.trim()}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function tooltip(v: FiscalVerification): string {
  const parts: string[] = [];
  if (v.reason) parts.push(v.reason);
  if (v.issuerRut) parts.push(`RUT emisor: ${v.issuerRut}`);
  if (v.docType) parts.push(`Tipo: ${v.docType}`);
  if (v.folio) parts.push(`Folio: ${v.folio}`);
  if (v.cafRange) parts.push(`CAF: ${v.cafRange.desde}-${v.cafRange.hasta}`);
  parts.push(v.verifiedOn === 'server' ? 'Verificado en el servidor' : 'Verificado en el dispositivo');
  if (v.mismatches?.length) {
    for (const m of v.mismatches) {
      parts.push(`Diferencia en ${MISMATCH_LABELS[m.field]}: timbre ${m.ted} vs. ingresado ${m.submitted}`);
    }
  }
  return parts.join(' · ');
}
