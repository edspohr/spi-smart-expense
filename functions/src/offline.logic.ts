// Pure comparisons for the offline-read verifier (Ola 8): how well did the
// on-device reader do against the values the person confirmed, and does
// Gemini agree with what was submitted?

export type FieldKey = 'amount' | 'date' | 'taxId' | 'invoiceNumber' | 'category' | 'merchant';
export const EVAL_FIELDS: FieldKey[] = ['amount', 'date', 'taxId', 'invoiceNumber', 'category', 'merchant'];
/** Fields where a disagreement with Gemini is worth flagging to people. */
export const CRITICAL_FIELDS: FieldKey[] = ['amount', 'date', 'taxId'];

const LEGAL = /\b(SPA|S P A|LTDA|LIMITADA|S A S|SAS|S A|EIRL|Y CIA)\b/g;

function norm(field: FieldKey, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  switch (field) {
    case 'amount': {
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
    }
    case 'date':
      return s.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    case 'taxId':
      return s.replace(/[.\s-]/g, '').toUpperCase() || null;
    case 'invoiceNumber':
      return s.replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toUpperCase() || null;
    case 'merchant':
      return (
        s
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toUpperCase()
          .replace(/[^A-Z0-9 ]/g, ' ')
          .replace(LEGAL, ' ')
          .replace(/\s+/g, ' ')
          .trim() || null
      );
    default:
      return s.trim() || null;
  }
}

function same(field: FieldKey, a: string, b: string): boolean {
  // Merchant names vary in form ("Copec" vs "COPEC S.A."): containment counts.
  if (field === 'merchant') return a === b || a.includes(b) || b.includes(a);
  return a === b;
}

/** Per field: true/false when both sides have a value, null otherwise. */
export function compareFields(
  read: Record<string, unknown> | undefined,
  truth: Record<string, unknown>,
  fields: FieldKey[] = EVAL_FIELDS,
): Partial<Record<FieldKey, boolean | null>> {
  const out: Partial<Record<FieldKey, boolean | null>> = {};
  for (const f of fields) {
    const a = norm(f, read?.[f]);
    const b = norm(f, truth[f]);
    out[f] = a === null || b === null ? null : same(f, a, b);
  }
  return out;
}

export interface Mismatch {
  field: FieldKey;
  submitted: unknown;
  ai: unknown;
}

/** Critical fields where Gemini read something different from what was submitted. */
export function aiMismatches(ai: Record<string, unknown>, submitted: Record<string, unknown>): Mismatch[] {
  const cmp = compareFields(ai, submitted, CRITICAL_FIELDS);
  return CRITICAL_FIELDS.filter((f) => cmp[f] === false).map((f) => ({ field: f, submitted: submitted[f] ?? null, ai: ai[f] ?? null }));
}

/** Storage object path from a Firebase download URL (prod or emulator). */
export function storagePathFromUrl(url: string): string | null {
  const m = url.match(/\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

const LABELS: Record<FieldKey, string> = {
  amount: 'el monto',
  date: 'la fecha',
  taxId: 'el RUT/NIT',
  invoiceNumber: 'el número de documento',
  category: 'la categoría',
  merchant: 'el comercio',
};

export function mismatchSummary(mismatches: Mismatch[]): string {
  const parts = mismatches.map((m) => LABELS[m.field]);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

export interface MerchantVote {
  taxId: string;
  merchant: string;
  category?: string;
}

/** Most frequent merchant name and category per tax id. */
export function buildDictionary(votes: MerchantVote[], max = 3000): Record<string, { merchant: string; category?: string }> {
  const groups = new Map<string, { count: number; merchants: Map<string, number>; categories: Map<string, number> }>();
  for (const v of votes) {
    const key = v.taxId.replace(/[.\s]/g, '').toUpperCase();
    if (!key || !v.merchant) continue;
    const g = groups.get(key) ?? { count: 0, merchants: new Map(), categories: new Map() };
    g.count += 1;
    g.merchants.set(v.merchant, (g.merchants.get(v.merchant) ?? 0) + 1);
    if (v.category) g.categories.set(v.category, (g.categories.get(v.category) ?? 0) + 1);
    groups.set(key, g);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return Object.fromEntries(
    [...groups.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, max)
      .map(([key, g]) => {
        const category = top(g.categories);
        return [key, category ? { merchant: top(g.merchants)!, category } : { merchant: top(g.merchants)! }];
      }),
  );
}

// ---------- Ola 8b: learning per issuer and daily stats

export type ReadMode = 'offline' | 'local-first' | 'shadow';

export function readModeOf(localRead: { mode?: unknown; offline?: unknown }): ReadMode {
  if (localRead.mode === 'shadow' || localRead.mode === 'offline' || localRead.mode === 'local-first') return localRead.mode;
  return localRead.offline === true ? 'offline' : 'local-first';
}

/** Issuer key shared with the device dictionary ("76354771-K"). */
export function issuerKey(taxId: unknown): string | null {
  if (typeof taxId !== 'string') return null;
  const key = taxId.replace(/[.\s]/g, '').toUpperCase();
  return /^[0-9]{5,12}-?[0-9K]?$/.test(key) ? key : null;
}

/** The label of the OCR candidate that matches the confirmed amount, if exactly one label does. */
export function confirmedAmountLabel(candidates: unknown, amount: unknown): string | null {
  const total = Number(amount);
  if (!Array.isArray(candidates) || !Number.isFinite(total) || total <= 0) return null;
  const labels = new Set<string>();
  for (const c of candidates as { label?: unknown; value?: unknown }[]) {
    if (typeof c?.label !== 'string' || !/^[A-Z ]{3,24}$/.test(c.label)) continue;
    if (Math.abs(Number(c.value) - total) < 0.01) labels.add(c.label);
  }
  return labels.size === 1 ? [...labels][0]! : null;
}

/** Learned label for an issuer: at least `minVotes` and a clear majority. */
export function learnedAmountLabel(votes: Record<string, number> | undefined, minVotes = 2, minShare = 0.6): string | null {
  const entries = Object.entries(votes ?? {}).filter(([, n]) => typeof n === 'number' && n > 0);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  const [label, n] = entries.sort((a, b) => b[1] - a[1])[0] ?? [];
  return label && n! >= minVotes && n! / total >= minShare ? label : null;
}

/**
 * Counter increments for ocrStats/{day}, as dotted paths:
 * reads, byMode.<mode>, fields.<mode>.<engine>.<field>.{ok,total} for the
 * device vs. confirmed, and ai.<field>.{ok,total} for Gemini vs. confirmed
 * (how often people correct the AI), time.<engine>.{sum,n} and aiMismatch.
 */
export function statIncrements(
  mode: ReadMode,
  engine: string,
  localVsSubmitted: Partial<Record<FieldKey, boolean | null>>,
  aiVsSubmitted: Partial<Record<FieldKey, boolean | null>> | null,
  extra: { durationMs?: number | null; aiMismatch?: boolean } = {},
): Record<string, number> {
  const group = engine.startsWith('barcode') ? 'barcode' : 'ocr';
  const inc: Record<string, number> = { reads: 1, [`byMode.${mode}`]: 1 };
  if (typeof extra.durationMs === 'number' && extra.durationMs >= 0) {
    inc[`time.${group}.sum`] = Math.round(extra.durationMs);
    inc[`time.${group}.n`] = 1;
  }
  if (extra.aiMismatch) inc.aiMismatch = 1;
  for (const [f, ok] of Object.entries(localVsSubmitted)) {
    if (ok === null || ok === undefined) continue;
    inc[`fields.${mode}.${group}.${f}.total`] = 1;
    if (ok) inc[`fields.${mode}.${group}.${f}.ok`] = 1;
  }
  for (const [f, ok] of Object.entries(aiVsSubmitted ?? {})) {
    if (ok === null || ok === undefined) continue;
    inc[`ai.${f}.total`] = 1;
    if (ok) inc[`ai.${f}.ok`] = 1;
  }
  return inc;
}

/** Dotted paths → nested object, mapping each leaf (for set({merge:true}) with increments). */
export function nestDotted<T>(flat: Record<string, number>, leaf: (n: number) => T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, n] of Object.entries(flat)) {
    const parts = path.split('.');
    let node = out;
    parts.slice(0, -1).forEach((p) => {
      node[p] ??= {};
      node = node[p] as Record<string, unknown>;
    });
    node[parts[parts.length - 1]!] = leaf(n);
  }
  return out;
}
