import { describe, it, expect } from 'vitest';
import { computeAggregateDeltas, isEmptyDeltas } from './aggregates.logic';

const base = { userId: 'u1', projectId: 'p1', amount: 100, status: 'pending', isCompanyExpense: false };

describe('computeAggregateDeltas', () => {
  it('credits the user when a pending expense is created', () => {
    expect(computeAggregateDeltas(null, base)).toEqual({ users: { u1: 100 }, projects: {} });
  });

  it('charges the project on approval without touching the balance', () => {
    expect(computeAggregateDeltas(base, { ...base, status: 'approved' })).toEqual({ users: {}, projects: { p1: 100 } });
  });

  it('refunds the balance on rejection', () => {
    expect(computeAggregateDeltas(base, { ...base, status: 'rejected' })).toEqual({ users: { u1: -100 }, projects: {} });
  });

  it('re-credits when a rejected expense is reopened', () => {
    expect(computeAggregateDeltas({ ...base, status: 'rejected' }, base)).toEqual({ users: { u1: 100 }, projects: {} });
  });

  it('reverses balance and project when an approved expense is deleted', () => {
    expect(computeAggregateDeltas({ ...base, status: 'approved' }, null)).toEqual({ users: { u1: -100 }, projects: { p1: -100 } });
  });

  it('does nothing when a rejected expense is deleted', () => {
    expect(isEmptyDeltas(computeAggregateDeltas({ ...base, status: 'rejected' }, null))).toBe(true);
  });

  it('applies only the amount diff on edit, to project too when approved', () => {
    expect(computeAggregateDeltas({ ...base, status: 'approved' }, { ...base, status: 'approved', amount: 130 })).toEqual({
      users: { u1: 30 },
      projects: { p1: 30 },
    });
  });

  it('moves the credit when the expense is reassigned to another user', () => {
    expect(computeAggregateDeltas(base, { ...base, userId: 'u2' })).toEqual({ users: { u1: -100, u2: 100 }, projects: {} });
  });

  it('ignores company expenses for balances but not for projects', () => {
    const company = { ...base, isCompanyExpense: true };
    expect(computeAggregateDeltas(null, company)).toEqual({ users: {}, projects: {} });
    expect(computeAggregateDeltas(company, { ...company, status: 'approved' })).toEqual({ users: {}, projects: { p1: 100 } });
  });

  it('treats non-numeric amounts as zero', () => {
    expect(isEmptyDeltas(computeAggregateDeltas(null, { ...base, amount: 'abc' }))).toBe(true);
  });
});
