import type { Confidence } from '../lib/localReader/types';

interface FieldRead {
  confidence: Confidence;
  source: string;
}

export interface LocalReadState {
  confidence: Record<string, FieldRead | undefined>;
  barcode: { kind: 'ted' | 'dian'; docLabel?: string } | null;
  durationMs?: number;
  complete: boolean;
  offline: boolean;
}

// Small badge next to a form label telling how a field was read on the
// device (Ola 8): exact from the tax barcode, or "revisa" when unsure.
export default function ReadConfidence({ field, read }: { field: string; read: LocalReadState | null }) {
  const f = read?.confidence?.[field];
  if (!f) return null;
  const fromCode = f.source === 'barcode';
  const label = fromCode
    ? read?.barcode?.kind === 'dian' ? 'Del QR DIAN' : 'Del timbre'
    : f.source === 'dictionary'
      ? 'Conocido'
      : f.confidence === 'high'
        ? 'Leído'
        : f.confidence === 'medium'
          ? 'Revisa'
          : 'Verifica';
  const tone =
    f.confidence === 'high'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : f.confidence === 'medium'
        ? 'bg-amber-50 text-amber-800 ring-amber-200'
        : 'bg-orange-50 text-orange-800 ring-orange-200';
  const title = fromCode
    ? 'Dato exacto leído del código del documento tributario, sin conexión.'
    : f.source === 'dictionary'
      ? 'Comercio ya registrado en rendiciones aprobadas de tu empresa.'
      : 'Leído en el teléfono. Revísalo antes de enviar.';
  return (
    <span title={title} className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ring-1 ${tone}`}>
      {label}
    </span>
  );
}
