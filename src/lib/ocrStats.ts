// Accuracy of the on-device reader (Ola 8), computed from the anonymous
// ocrEval records the verifier writes: per field and per engine.

export interface OcrEvalRecord {
  createdAt: string;
  engine: string; // 'barcode:ted' | 'barcode:dian' | 'ocr'
  offline?: boolean;
  durationMs?: number | null;
  localVsSubmitted?: Record<string, boolean | null>;
  aiStatus?: string;
}

export const STAT_FIELDS = ['amount', 'date', 'taxId', 'invoiceNumber', 'merchant', 'category'] as const;
export const FIELD_LABELS: Record<(typeof STAT_FIELDS)[number], string> = {
  amount: 'Monto',
  date: 'Fecha',
  taxId: 'RUT / NIT',
  invoiceNumber: 'N° documento',
  merchant: 'Comercio',
  category: 'Categoría',
};

export interface FieldStat {
  correct: number;
  total: number;
  rate: number | null;
}

export interface OcrStats {
  reads: number;
  byEngine: Record<string, number>;
  fields: Record<string, FieldStat>;
  fieldsByEngine: Record<string, Record<string, FieldStat>>;
  medianMs: number | null;
  aiMismatches: number;
}

const engineGroup = (e: string) => (e.startsWith('barcode') ? 'barcode' : 'ocr');

function stat(records: OcrEvalRecord[], field: string): FieldStat {
  let correct = 0;
  let total = 0;
  for (const r of records) {
    const v = r.localVsSubmitted?.[field];
    if (v === true) correct += 1;
    if (v === true || v === false) total += 1;
  }
  return { correct, total, rate: total ? correct / total : null };
}

export function computeOcrStats(records: OcrEvalRecord[]): OcrStats {
  const byEngine: Record<string, number> = {};
  for (const r of records) byEngine[engineGroup(r.engine)] = (byEngine[engineGroup(r.engine)] ?? 0) + 1;
  const fields = Object.fromEntries(STAT_FIELDS.map((f) => [f, stat(records, f)]));
  const fieldsByEngine = Object.fromEntries(
    Object.keys(byEngine).map((g) => [g, Object.fromEntries(STAT_FIELDS.map((f) => [f, stat(records.filter((r) => engineGroup(r.engine) === g), f)]))]),
  );
  const times = records.map((r) => r.durationMs).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
  return {
    reads: records.length,
    byEngine,
    fields,
    fieldsByEngine,
    medianMs: times.length ? times[Math.floor(times.length / 2)]! : null,
    aiMismatches: records.filter((r) => r.aiStatus === 'mismatch').length,
  };
}
