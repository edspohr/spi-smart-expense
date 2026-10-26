// Accuracy of the on-device reader (Ola 8/8b), aggregated from the daily
// counters the verifier keeps in ocrStats/{YYYY-MM-DD} (see statIncrements
// in functions/src/offline.logic.ts).

export const STAT_FIELDS = ['amount', 'date', 'taxId', 'invoiceNumber', 'merchant', 'category'] as const;
export type StatField = (typeof STAT_FIELDS)[number];
export const FIELD_LABELS: Record<StatField, string> = {
  amount: 'Monto',
  date: 'Fecha',
  taxId: 'RUT / NIT',
  invoiceNumber: 'N° documento',
  merchant: 'Comercio',
  category: 'Categoría',
};

export const MODES = ['shadow', 'offline', 'local-first'] as const;
export type Mode = (typeof MODES)[number];
type Group = 'barcode' | 'ocr';
type Counter = { ok?: number; total?: number };

export interface DailyStatsDoc {
  date: string;
  reads?: number;
  byMode?: Partial<Record<Mode, number>>;
  fields?: Partial<Record<Mode, Partial<Record<Group, Partial<Record<string, Counter>>>>>>;
  ai?: Partial<Record<string, Counter>>;
  time?: Partial<Record<Group, { sum?: number; n?: number }>>;
  aiMismatch?: number;
}

export interface FieldStat {
  correct: number;
  total: number;
  rate: number | null;
}

export interface ReaderStats {
  days: number;
  reads: number;
  byMode: Record<Mode, number>;
  /** Device vs. confirmed, all modes: overall and per engine. */
  device: Record<StatField, { all: FieldStat; barcode: FieldStat; ocr: FieldStat }>;
  /** Gemini vs. confirmed (1 - rate = how often people correct the AI). */
  ai: Record<StatField, FieldStat>;
  avgMs: Record<Group, number | null>;
  aiMismatches: number;
  /** Device accuracy on the amount, per ISO week (oldest first). */
  amountByWeek: { week: string; stat: FieldStat }[];
}

const rate = (correct: number, total: number): FieldStat => ({ correct, total, rate: total ? correct / total : null });

function add(target: { c: number; t: number }, counter: Counter | undefined) {
  target.c += counter?.ok ?? 0;
  target.t += counter?.total ?? 0;
}

/** Monday of the date's week, as YYYY-MM-DD. */
export function weekOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function computeReaderStats(docs: DailyStatsDoc[]): ReaderStats {
  const byMode = { shadow: 0, offline: 0, 'local-first': 0 } as Record<Mode, number>;
  const acc = Object.fromEntries(STAT_FIELDS.map((f) => [f, { barcode: { c: 0, t: 0 }, ocr: { c: 0, t: 0 }, ai: { c: 0, t: 0 } }]));
  const time = { barcode: { sum: 0, n: 0 }, ocr: { sum: 0, n: 0 } };
  const weeks = new Map<string, { c: number; t: number }>();
  let reads = 0;
  let aiMismatches = 0;

  for (const d of docs) {
    reads += d.reads ?? 0;
    aiMismatches += d.aiMismatch ?? 0;
    for (const m of MODES) byMode[m] += d.byMode?.[m] ?? 0;
    for (const g of ['barcode', 'ocr'] as const) {
      time[g].sum += d.time?.[g]?.sum ?? 0;
      time[g].n += d.time?.[g]?.n ?? 0;
    }
    const week = weeks.get(weekOf(d.date)) ?? { c: 0, t: 0 };
    for (const f of STAT_FIELDS) {
      for (const m of MODES) {
        for (const g of ['barcode', 'ocr'] as const) {
          add(acc[f]![g], d.fields?.[m]?.[g]?.[f]);
          if (f === 'amount') add(week, d.fields?.[m]?.[g]?.[f]);
        }
      }
      add(acc[f]!.ai, d.ai?.[f]);
    }
    weeks.set(weekOf(d.date), week);
  }

  const device = Object.fromEntries(
    STAT_FIELDS.map((f) => {
      const a = acc[f]!;
      return [f, { all: rate(a.barcode.c + a.ocr.c, a.barcode.t + a.ocr.t), barcode: rate(a.barcode.c, a.barcode.t), ocr: rate(a.ocr.c, a.ocr.t) }];
    }),
  ) as ReaderStats['device'];
  return {
    days: docs.length,
    reads,
    byMode,
    device,
    ai: Object.fromEntries(STAT_FIELDS.map((f) => [f, rate(acc[f]!.ai.c, acc[f]!.ai.t)])) as ReaderStats['ai'],
    avgMs: { barcode: time.barcode.n ? time.barcode.sum / time.barcode.n : null, ocr: time.ocr.n ? time.ocr.sum / time.ocr.n : null },
    aiMismatches,
    amountByWeek: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, w]) => ({ week, stat: rate(w.c, w.t) })),
  };
}
