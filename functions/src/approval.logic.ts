// Approval workflow rules, pure and unit-tested. The tenant policy lives in
// settings/tenant.approvalPolicy; `single` reproduces the historical flow
// (any eligible admin/approver decides in one step) and is the default.
//
// In `levels` mode an expense gets an approvalFlow when it is created:
//   1. manager step  — the submitter's managerUid (or their active delegate)
//   2. finance step  — admins / currency approvers; 2 distinct signatures
//                      when the amount reaches secondSignatureAbove
// Admins may act on any step (recorded as an override). Nobody approves
// their own expense in levels mode. Amounts are in the tenant base currency;
// an unknown amount (FX without rate) is treated as above every threshold.

export interface ApprovalPolicy {
  mode: 'single' | 'levels';
  autoApproveBelow: number | null;
  managerApproval: boolean;
  secondSignatureAbove: number | null;
  allowDelegation: boolean;
  staleReminders: boolean;
  staleDays: number;
}

export const DEFAULT_POLICY: ApprovalPolicy = {
  mode: 'single',
  autoApproveBelow: null,
  managerApproval: true,
  secondSignatureAbove: null,
  allowDelegation: true,
  staleReminders: false,
  staleDays: 7,
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export function approvalPolicyFrom(settings: Record<string, unknown> | undefined): ApprovalPolicy {
  const p = (settings?.approvalPolicy ?? {}) as Record<string, unknown>;
  const staleDays = Number.isInteger(p.staleDays) && (p.staleDays as number) > 0 ? (p.staleDays as number) : DEFAULT_POLICY.staleDays;
  return {
    mode: p.mode === 'levels' ? 'levels' : 'single',
    autoApproveBelow: num(p.autoApproveBelow),
    managerApproval: p.managerApproval !== false,
    secondSignatureAbove: num(p.secondSignatureAbove),
    allowDelegation: p.allowDelegation !== false,
    staleReminders: p.staleReminders === true,
    staleDays,
  };
}

export interface Signature {
  uid: string;
  name: string;
  at: string;
  comment: string | null;
  override?: boolean;
}

export interface ApprovalStep {
  kind: 'manager' | 'finance';
  approverUid: string | null;
  approverName: string | null;
  signaturesRequired: number;
  signatures: Signature[];
}

export interface ApprovalFlow {
  steps: ApprovalStep[];
  currentStep: number;
}

export interface FlowInput {
  amount: number | null;
  submitterUid: string;
  managerUid: string | null;
  managerName: string | null;
}

export type CreationOutcome = { kind: 'none' } | { kind: 'auto-approve' } | { kind: 'flow'; flow: ApprovalFlow };

export function planOnCreate(policy: ApprovalPolicy, input: FlowInput): CreationOutcome {
  if (policy.autoApproveBelow !== null && input.amount !== null && input.amount < policy.autoApproveBelow) {
    return { kind: 'auto-approve' };
  }
  if (policy.mode !== 'levels') return { kind: 'none' };

  const steps: ApprovalStep[] = [];
  const hasManager = policy.managerApproval && input.managerUid && input.managerUid !== input.submitterUid;
  if (hasManager) {
    steps.push({ kind: 'manager', approverUid: input.managerUid, approverName: input.managerName, signaturesRequired: 1, signatures: [] });
  }
  const needsTwo =
    policy.secondSignatureAbove !== null && (input.amount === null || input.amount >= policy.secondSignatureAbove);
  steps.push({ kind: 'finance', approverUid: null, approverName: null, signaturesRequired: needsTwo ? 2 : 1, signatures: [] });
  return { kind: 'flow', flow: { steps, currentStep: 0 } };
}

export interface Actor {
  uid: string;
  name: string;
  isAdmin: boolean;
  // Finance eligibility for this expense (admin, or the currency approver flag).
  canFinance: boolean;
  // uids whose approvals this actor currently holds by delegation.
  delegatedFrom: string[];
}

export class ApprovalError extends Error {}

export type Eligibility = { ok: true; override: boolean } | { ok: false; reason: string };

export function eligibility(flow: ApprovalFlow, actor: Actor, submitterUid: string): Eligibility {
  if (actor.uid === submitterUid) return { ok: false, reason: 'No puedes aprobar tu propia rendición.' };
  const step = flow.steps[flow.currentStep];
  if (!step) return { ok: false, reason: 'La rendición no tiene pasos pendientes.' };
  if (step.signatures.some((s) => s.uid === actor.uid)) {
    return { ok: false, reason: 'Ya firmaste este paso; falta la firma de otra persona.' };
  }
  if (step.kind === 'manager') {
    if (actor.uid === step.approverUid) return { ok: true, override: false };
    if (step.approverUid && actor.delegatedFrom.includes(step.approverUid)) return { ok: true, override: false };
    if (actor.isAdmin) return { ok: true, override: true };
    return { ok: false, reason: `Esta rendición espera la aprobación de ${step.approverName ?? 'su responsable'}.` };
  }
  if (actor.canFinance) return { ok: true, override: false };
  return { ok: false, reason: 'Esta rendición espera la aprobación de finanzas.' };
}

export interface ApprovalResult {
  flow: ApprovalFlow;
  done: boolean;
  stepCompleted: boolean;
  override: boolean;
}

export function applyApproval(flow: ApprovalFlow, actor: Actor, submitterUid: string, comment: string | null, now: string): ApprovalResult {
  const check = eligibility(flow, actor, submitterUid);
  if (!check.ok) throw new ApprovalError(check.reason);
  const steps = flow.steps.map((s) => ({ ...s, signatures: [...s.signatures] }));
  const step = steps[flow.currentStep] as ApprovalStep;
  step.signatures.push({ uid: actor.uid, name: actor.name, at: now, comment, ...(check.override ? { override: true } : {}) });
  const stepCompleted = step.signatures.length >= step.signaturesRequired;
  const currentStep = stepCompleted ? flow.currentStep + 1 : flow.currentStep;
  return { flow: { steps, currentStep }, done: currentStep >= steps.length, stepCompleted, override: check.override };
}

// Who can act right now without being an admin or finance user: the manager
// of the current step and their active delegate. Rules use this list to let
// managers read the expenses waiting for them.
export function pendingApproverUids(flow: ApprovalFlow | null, delegateOf: (uid: string) => string | null): string[] {
  if (!flow) return [];
  const step = flow.steps[flow.currentStep];
  if (!step || step.kind !== 'manager' || !step.approverUid) return [];
  const delegate = delegateOf(step.approverUid);
  return delegate && delegate !== step.approverUid ? [step.approverUid, delegate] : [step.approverUid];
}

export interface Delegation {
  toUid: string;
  toName?: string;
  until: string;
}

export function activeDelegate(delegation: Delegation | null | undefined, nowIso: string): string | null {
  if (!delegation?.toUid || !delegation.until) return null;
  return delegation.until > nowIso ? delegation.toUid : null;
}
