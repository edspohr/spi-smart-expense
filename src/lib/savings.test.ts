import { describe, expect, it } from 'vitest';
import { estimateSavings } from './savings';

describe('estimateSavings', () => {
  it('multiplies reports by minutes saved and hourly cost', () => {
    const r = estimateSavings({ people: 20, reportsPerPerson: 8, minutesToday: 15, minutesWithApp: 3, hourlyCost: 12_000 });
    expect(r.reportsPerMonth).toBe(160);
    expect(r.hoursPerMonth).toBe(32); // 160 × 12 min / 60
    expect(r.costPerMonth).toBe(384_000);
    expect(r.costPerYear).toBe(4_608_000);
  });

  it('never returns negative savings when the app is not faster', () => {
    const r = estimateSavings({ people: 5, reportsPerPerson: 4, minutesToday: 3, minutesWithApp: 10, hourlyCost: 10_000 });
    expect(r.hoursPerMonth).toBe(0);
    expect(r.costPerMonth).toBe(0);
  });

  it('treats empty or invalid inputs as zero', () => {
    const r = estimateSavings({ people: Number.NaN, reportsPerPerson: 8, minutesToday: 15, minutesWithApp: 3, hourlyCost: -1 });
    expect(r).toEqual({ reportsPerMonth: 0, hoursPerMonth: 0, costPerMonth: 0, costPerYear: 0 });
  });
});
