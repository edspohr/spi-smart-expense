// Ola 8c — the cross-client layer of the learning reader (ADR 0016).
// Pure: builds the anonymised contribution a tenant sends and validates it
// on the hub. Only what describes documents leaves a tenant: legal-entity
// issuers with their total-label votes, and daily accuracy counters.
// Text shown to people: docs/legal/textos-vigentes-lector.md.

/** Version of the consent text; must match src/lib/learningTerms.ts. */
export const DERIVED_TERMS_VERSION = 'derived-v0';
export const CONTRIBUTION_SCHEMA = 'derived-v0';

export type Country = 'CL' | 'CO';

/**
 * True when a tax id belongs to a company (persona jurídica), whose id is
 * public business data. Natural-person issuers are personal data and never
 * leave the tenant. CL: RUT body ≥ 50.000.000. CO: NIT starting with 8 or 9.
 */
export function isLegalEntity(issuer: string, country: Country): boolean {
  const body = issuer.split('-')[0] ?? '';
  if (!/^\d{6,10}$/.test(body)) return false;
  if (country === 'CL') return Number(body) >= 50_000_000;
  return body.length >= 9 && (body.startsWith('8') || body.startsWith('9'));
}

const LABEL_RE = /^[A-Z ]{3,24}$/;
const MODES = ['shadow', 'offline', 'local-first'] as const;
const GROUPS = ['barcode', 'ocr'] as const;
const FIELDS = ['amount', 'date', 'taxId', 'invoiceNumber', 'merchant', 'category'] as const;
const MAX_ISSUERS = 5000;
const MAX_DAYS = 400;

type Counter = { ok?: number; total?: number };
export interface StatsDay {
  date: string;
  reads?: number;
  byMode?: Partial<Record<string, number>>;
  fields?: Record<string, Record<string, Record<string, Counter>>>;
  time?: Record<string, { sum?: number; n?: number }>;
}

export interface Contribution {
  schema: typeof CONTRIBUTION_SCHEMA;
  envId: string;
  country: Country;
  generatedAt: string;
  issuers: { issuer: string; labels: Record<string, number> }[];
  stats: StatsDay[];
}

const count = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0);

/** Copies only the known counters of a day (drops `ai`, `aiMismatch` and anything else). */
function cleanDay(d: StatsDay): StatsDay {
  const out: StatsDay = { date: d.date, reads: count(d.reads) };
  const byMode: Record<string, number> = {};
  for (const m of MODES) if (count(d.byMode?.[m])) byMode[m] = count(d.byMode?.[m]);
  if (Object.keys(byMode).length) out.byMode = byMode;
  const fields: StatsDay['fields'] = {};
  for (const m of MODES) {
    for (const g of GROUPS) {
      for (const f of FIELDS) {
        const c = d.fields?.[m]?.[g]?.[f];
        if (!c || !count(c.total)) continue;
        ((fields[m] ??= {})[g] ??= {})[f] = { ok: count(c.ok), total: count(c.total) };
      }
    }
  }
  if (Object.keys(fields).length) out.fields = fields;
  const time: NonNullable<StatsDay['time']> = {};
  for (const g of GROUPS) if (count(d.time?.[g]?.n)) time[g] = { sum: count(d.time?.[g]?.sum), n: count(d.time?.[g]?.n) };
  if (Object.keys(time).length) out.time = time;
  return out;
}

/**
 * The contribution of one tenant: cumulative issuer votes (the hub keeps the
 * latest snapshot per environment, so re-sending never double-counts) and
 * the daily counters since `sinceDay` (exclusive; overwritten per day).
 */
export function buildContribution(input: {
  envId: string;
  country: Country;
  generatedAt: string;
  profiles: { issuer: string; labels?: Record<string, unknown> }[];
  stats: StatsDay[];
  sinceDay?: string | null;
}): Contribution {
  const issuers: Contribution['issuers'] = [];
  for (const p of input.profiles) {
    if (!isLegalEntity(p.issuer, input.country)) continue;
    const labels: Record<string, number> = {};
    for (const [label, n] of Object.entries(p.labels ?? {})) if (LABEL_RE.test(label) && count(n)) labels[label] = count(n);
    if (Object.keys(labels).length) issuers.push({ issuer: p.issuer, labels });
    if (issuers.length >= MAX_ISSUERS) break;
  }
  const stats = input.stats
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && (!input.sinceDay || d.date > input.sinceDay))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_DAYS)
    .map(cleanDay);
  return { schema: CONTRIBUTION_SCHEMA, envId: input.envId, country: input.country, generatedAt: input.generatedAt, issuers, stats };
}

/** True when nothing worth sending was found. */
export const isEmptyContribution = (c: Contribution) => !c.issuers.length && !c.stats.length;

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));

/**
 * Hub-side guard: accepts only the exact shape buildContribution produces.
 * Any extra field (a value, a name, an image) rejects the whole contribution.
 * Returns an error message, or null when valid.
 */
export function validateContribution(c: unknown): string | null {
  if (!isPlainObject(c)) return 'not an object';
  if (!onlyKeys(c, ['schema', 'envId', 'country', 'generatedAt', 'issuers', 'stats'])) return 'unexpected top-level field';
  if (c.schema !== CONTRIBUTION_SCHEMA) return 'unknown schema';
  if (typeof c.envId !== 'string' || !/^[a-f0-9]{32}$/.test(c.envId)) return 'bad envId';
  if (c.country !== 'CL' && c.country !== 'CO') return 'bad country';
  if (typeof c.generatedAt !== 'string' || Number.isNaN(Date.parse(c.generatedAt))) return 'bad generatedAt';
  if (!Array.isArray(c.issuers) || c.issuers.length > MAX_ISSUERS) return 'bad issuers';
  for (const i of c.issuers) {
    if (!isPlainObject(i) || !onlyKeys(i, ['issuer', 'labels'])) return 'unexpected issuer field';
    if (typeof i.issuer !== 'string' || !isLegalEntity(i.issuer, c.country)) return 'issuer is not a legal entity';
    if (!isPlainObject(i.labels)) return 'bad labels';
    for (const [label, n] of Object.entries(i.labels)) if (!LABEL_RE.test(label) || !count(n)) return 'bad label';
  }
  if (!Array.isArray(c.stats) || c.stats.length > MAX_DAYS) return 'bad stats';
  for (const d of c.stats) {
    if (!isPlainObject(d) || !onlyKeys(d, ['date', 'reads', 'byMode', 'fields', 'time'])) return 'unexpected stats field';
    if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'bad date';
    if (JSON.stringify(cleanDay(d as unknown as StatsDay)) !== JSON.stringify(d)) return 'unexpected counters';
  }
  return null;
}

/**
 * Hub: sums the latest issuer snapshot of every environment into the votes
 * the reader pack is built from.
 */
export function aggregateIssuers(snapshots: Contribution['issuers'][]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const issuers of snapshots) {
    for (const { issuer, labels } of issuers) {
      const target = (out[issuer] ??= {});
      for (const [label, n] of Object.entries(labels)) target[label] = (target[label] ?? 0) + n;
    }
  }
  return out;
}
