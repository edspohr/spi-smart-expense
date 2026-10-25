import { describe, it, expect } from 'vitest';
import {
  ApprovalError,
  DEFAULT_POLICY,
  activeDelegate,
  applyApproval,
  approvalPolicyFrom,
  pendingApproverUids,
  planOnCreate,
  type Actor,
  type ApprovalPolicy,
} from './approval.logic';

const levels: ApprovalPolicy = { ...DEFAULT_POLICY, mode: 'levels', secondSignatureAbove: 1_000_000 };
const input = { amount: 200_000, submitterUid: 'pro', managerUid: 'boss', managerName: 'Jefa' };
const actor = (uid: string, extra: Partial<Actor> = {}): Actor => ({ uid, name: uid, isAdmin: false, canFinance: false, delegatedFrom: [], ...extra });
const NOW = '2026-10-25T12:00:00.000Z';

describe('policy', () => {
  it('defaults to the historical single-step flow with nothing automatic', () => {
    expect(approvalPolicyFrom(undefined)).toEqual(DEFAULT_POLICY);
    expect(planOnCreate(DEFAULT_POLICY, input)).toEqual({ kind: 'none' });
  });

  it('auto-approves below the threshold in any mode, never unknown amounts', () => {
    const p = { ...DEFAULT_POLICY, autoApproveBelow: 50_000 };
    expect(planOnCreate(p, { ...input, amount: 49_999 })).toEqual({ kind: 'auto-approve' });
    expect(planOnCreate(p, { ...input, amount: 50_000 })).toEqual({ kind: 'none' });
    expect(planOnCreate(p, { ...input, amount: null })).toEqual({ kind: 'none' });
  });
});

describe('planOnCreate in levels mode', () => {
  it('adds the manager step, then finance', () => {
    const out = planOnCreate(levels, input);
    expect(out.kind).toBe('flow');
    if (out.kind !== 'flow') return;
    expect(out.flow.steps.map((s) => s.kind)).toEqual(['manager', 'finance']);
    expect(out.flow.steps[1]?.signaturesRequired).toBe(1);
  });

  it('skips the manager step without a manager or when it is the submitter', () => {
    for (const managerUid of [null, 'pro']) {
      const out = planOnCreate(levels, { ...input, managerUid });
      expect(out.kind === 'flow' && out.flow.steps.map((s) => s.kind)).toEqual(['finance']);
    }
  });

  it('requires two finance signatures above the threshold or when the amount is unknown', () => {
    for (const amount of [1_000_000, null]) {
      const out = planOnCreate(levels, { ...input, amount });
      expect(out.kind === 'flow' && out.flow.steps.at(-1)?.signaturesRequired).toBe(2);
    }
  });
});

describe('applyApproval', () => {
  const flowOf = (amount: number) => {
    const out = planOnCreate(levels, { ...input, amount });
    if (out.kind !== 'flow') throw new Error('expected flow');
    return out.flow;
  };

  it('walks manager → finance', () => {
    const r1 = applyApproval(flowOf(200_000), actor('boss'), 'pro', 'ok', NOW);
    expect(r1).toMatchObject({ done: false, stepCompleted: true, override: false });
    expect(r1.flow.currentStep).toBe(1);
    const r2 = applyApproval(r1.flow, actor('fin', { canFinance: true }), 'pro', null, NOW);
    expect(r2.done).toBe(true);
  });

  it('enforces who may act on each step', () => {
    const flow = flowOf(200_000);
    expect(() => applyApproval(flow, actor('fin', { canFinance: true }), 'pro', null, NOW)).toThrow(/Jefa/);
    expect(() => applyApproval(flow, actor('pro'), 'pro', null, NOW)).toThrow(/propia/);
    expect(applyApproval(flow, actor('sub', { delegatedFrom: ['boss'] }), 'pro', null, NOW).stepCompleted).toBe(true);
    expect(applyApproval(flow, actor('adm', { isAdmin: true, canFinance: true }), 'pro', null, NOW).override).toBe(true);
  });

  it('needs two distinct finance signers for large amounts', () => {
    const afterBoss = applyApproval(flowOf(2_000_000), actor('boss'), 'pro', null, NOW).flow;
    const first = applyApproval(afterBoss, actor('fin1', { canFinance: true }), 'pro', null, NOW);
    expect(first.done).toBe(false);
    expect(() => applyApproval(first.flow, actor('fin1', { canFinance: true }), 'pro', null, NOW)).toThrow(ApprovalError);
    expect(applyApproval(first.flow, actor('fin2', { canFinance: true }), 'pro', null, NOW).done).toBe(true);
  });
});

describe('delegation and pending approvers', () => {
  it('honours a delegation only until its end date', () => {
    expect(activeDelegate({ toUid: 'sub', until: '2026-10-30T00:00:00.000Z' }, NOW)).toBe('sub');
    expect(activeDelegate({ toUid: 'sub', until: '2026-10-20T00:00:00.000Z' }, NOW)).toBeNull();
    expect(activeDelegate(null, NOW)).toBeNull();
  });

  it('lists the manager and delegate while the manager step is open', () => {
    const out = planOnCreate(levels, input);
    if (out.kind !== 'flow') throw new Error('expected flow');
    expect(pendingApproverUids(out.flow, () => 'sub')).toEqual(['boss', 'sub']);
    expect(pendingApproverUids({ ...out.flow, currentStep: 1 }, () => 'sub')).toEqual([]);
    expect(pendingApproverUids(null, () => null)).toEqual([]);
  });
});
