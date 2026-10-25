// Pure derivation of balance / project deltas for an expense write. Kept free
// of Firebase imports so it can be unit-tested and so the semantics live in
// exactly one place:
//   - a user's balance holds every non-rejected, non-company expense amount
//   - a project's `expenses` holds every approved expense amount
// Amounts are raw (no currency conversion) to match the historical client
// behaviour; TD-026 tracks the move to tenant base currency.

export interface ExpenseLike {
  status?: unknown;
  amount?: unknown;
  userId?: unknown;
  projectId?: unknown;
  isCompanyExpense?: unknown;
}

export interface AggregateDeltas {
  users: Record<string, number>;
  projects: Record<string, number>;
}

const amountOf = (e: ExpenseLike | null): number => (e ? Number(e.amount) || 0 : 0);

function creditedUser(e: ExpenseLike | null): string | null {
  if (!e || e.status === 'rejected' || e.isCompanyExpense === true) return null;
  return typeof e.userId === 'string' && e.userId ? e.userId : null;
}

function chargedProject(e: ExpenseLike | null): string | null {
  if (!e || e.status !== 'approved') return null;
  return typeof e.projectId === 'string' && e.projectId ? e.projectId : null;
}

function add(map: Record<string, number>, key: string | null, delta: number) {
  if (!key || delta === 0) return;
  map[key] = (map[key] ?? 0) + delta;
  if (map[key] === 0) delete map[key];
}

export function computeAggregateDeltas(before: ExpenseLike | null, after: ExpenseLike | null): AggregateDeltas {
  const deltas: AggregateDeltas = { users: {}, projects: {} };
  add(deltas.users, creditedUser(before), -amountOf(before));
  add(deltas.users, creditedUser(after), amountOf(after));
  add(deltas.projects, chargedProject(before), -amountOf(before));
  add(deltas.projects, chargedProject(after), amountOf(after));
  return deltas;
}

export function isEmptyDeltas(d: AggregateDeltas): boolean {
  return Object.keys(d.users).length === 0 && Object.keys(d.projects).length === 0;
}
