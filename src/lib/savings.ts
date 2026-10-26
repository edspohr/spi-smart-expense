// Savings calculator for the landing: every input is the visitor's own
// assumption; the result is an estimate, never a promise.
export interface SavingsInput {
  people: number;
  reportsPerPerson: number; // per person, per month
  minutesToday: number; // per report, current process
  minutesWithApp: number; // per report, with Expense Buddy
  hourlyCost: number; // loaded cost of one hour, base currency
}

export interface SavingsResult {
  reportsPerMonth: number;
  hoursPerMonth: number;
  costPerMonth: number;
  costPerYear: number;
}

const clean = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

export function estimateSavings(i: SavingsInput): SavingsResult {
  const reportsPerMonth = clean(i.people) * clean(i.reportsPerPerson);
  const minutesSaved = Math.max(0, clean(i.minutesToday) - clean(i.minutesWithApp));
  const hoursPerMonth = (reportsPerMonth * minutesSaved) / 60;
  const costPerMonth = Math.round(hoursPerMonth * clean(i.hourlyCost));
  return { reportsPerMonth, hoursPerMonth, costPerMonth, costPerYear: costPerMonth * 12 };
}
