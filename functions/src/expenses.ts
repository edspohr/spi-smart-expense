import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { isAdminRole, nowIso, requireAuth, requireString, type AppClaims } from './common';
import { requirePinFor } from './pin';
import { ApprovalError, applyApproval, eligibility, pendingApproverUids, type Actor, type ApprovalFlow } from './approval.logic';
import { baseAmount, delegateOf, formatAmount } from './approval';
import { notifyUser } from './notify';

type Action = 'approve' | 'reject' | 'reopen';
type Status = 'pending' | 'approved' | 'rejected';

const TARGET: Record<Action, Status> = { approve: 'approved', reject: 'rejected', reopen: 'pending' };

// Mirrors src/lib/permissions.js canUserApprove(): COP needs the Colombia
// approver flag, any other currency needs canApprove.
function canFinance(claims: AppClaims, expense: FirebaseFirestore.DocumentData): boolean {
  if (isAdminRole(claims.role)) return true;
  const isColombia = (expense.currency ?? 'COP') === 'COP';
  return isColombia ? claims.isColombiaApprover === true : claims.canApprove === true;
}

async function buildActor(uid: string, name: string, claims: AppClaims, expense: FirebaseFirestore.DocumentData): Promise<Actor> {
  const flow = expense.approvalFlow as ApprovalFlow | undefined;
  const step = flow?.steps[flow.currentStep];
  const delegatedFrom: string[] = [];
  if (step?.kind === 'manager' && step.approverUid && step.approverUid !== uid && (await delegateOf(step.approverUid)) === uid) {
    delegatedFrom.push(step.approverUid);
  }
  return { uid, name, isAdmin: isAdminRole(claims.role), canFinance: canFinance(claims, expense), delegatedFrom };
}

function assertAllowed(action: Action, actor: Actor, expense: FirebaseFirestore.DocumentData) {
  const flow = expense.approvalFlow as ApprovalFlow | undefined;
  if (action === 'reopen') {
    if (!actor.isAdmin) throw new HttpsError('permission-denied', 'Solo un administrador puede reabrir una rendición.');
    return;
  }
  if (!flow) {
    if (!actor.canFinance) throw new HttpsError('permission-denied', 'No tienes permiso para revisar esta rendición.');
    return;
  }
  const check = eligibility(flow, actor, expense.userId);
  if (!check.ok) throw new HttpsError('permission-denied', check.reason);
}

function resetFlow(flow: ApprovalFlow): ApprovalFlow {
  return { currentStep: 0, steps: flow.steps.map((s) => ({ ...s, signatures: [] })) };
}

// Status transitions. Single-step expenses (default policy) behave as
// always; expenses with an approvalFlow advance one signature at a time and
// only become `approved` when the last step completes. Balance and project
// totals follow from the status change via onExpenseWritten.
export const reviewExpense = onCall(async (req) => {
  const { uid, claims, actor: who } = requireAuth(req);
  const expenseId = requireString(req.data?.expenseId, 'expenseId', 128);
  const action = req.data?.action as Action;
  if (!(action in TARGET)) throw new HttpsError('invalid-argument', 'Acción no válida.');
  const reason = action === 'reject' ? requireString(req.data?.reason, 'motivo', 1000) : null;
  const comment = typeof req.data?.comment === 'string' && req.data.comment.trim() ? req.data.comment.trim().slice(0, 500) : null;

  const db = getFirestore();
  const ref = db.doc(`expenses/${expenseId}`);
  const at = nowIso();

  const pre = await ref.get();
  if (!pre.exists) throw new HttpsError('not-found', 'Rendición no encontrada.');
  const actor = await buildActor(uid, who.name, claims, pre.data() ?? {});
  assertAllowed(action, actor, pre.data() ?? {});
  await requirePinFor(req, action === 'reject' ? 'reject' : 'approve', { ref: expenseId, amount: baseAmount(pre.data() ?? {}) });

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Rendición no encontrada.');
    const expense = snap.data() ?? {};
    assertAllowed(action, actor, expense);

    const from = (expense.status ?? 'pending') as Status;
    const flow = expense.approvalFlow as ApprovalFlow | undefined;
    if (action === 'approve' && from === 'rejected') throw new HttpsError('failed-precondition', 'La rendición ya fue rechazada.');
    if (action === 'reject' && from === 'approved') throw new HttpsError('failed-precondition', 'La rendición ya fue aprobada.');
    if (from === TARGET[action]) return { noop: true as const, expense, from, to: from, partial: false };

    const movements = ref.collection('movements');
    const base = { byUid: actor.uid, byName: actor.name, at, comment };

    if (action === 'approve' && flow) {
      let result;
      try {
        result = applyApproval(flow, actor, expense.userId, comment, at);
      } catch (e) {
        if (e instanceof ApprovalError) throw new HttpsError('permission-denied', e.message);
        throw e;
      }
      const step = flow.steps[flow.currentStep];
      const stepLabel = step?.kind === 'manager' ? 'responsable' : 'finanzas';
      tx.update(ref, {
        approvalFlow: result.flow,
        pendingApproverUids: result.done ? [] : pendingApproverUids(result.flow, () => null),
        ...(result.done ? { status: 'approved', reviewedAt: at, reviewedByUid: actor.uid, reviewedByName: actor.name } : {}),
      });
      tx.set(movements.doc(), {
        ...base,
        action: result.done ? 'approved' : 'step_approved',
        field: 'status',
        from: `${from} (${stepLabel})`,
        to: result.done ? 'approved' : result.stepCompleted ? `paso ${result.flow.currentStep + 1}` : 'firma 1 de 2',
        ...(result.override ? { override: true } : {}),
      });
      return { noop: false as const, expense, from, to: result.done ? ('approved' as Status) : from, partial: !result.done };
    }

    const to = TARGET[action];
    tx.update(ref, {
      status: to,
      rejectionReason: action === 'reject' ? reason : FieldValue.delete(),
      reviewedAt: at,
      reviewedByUid: actor.uid,
      reviewedByName: actor.name,
      ...(flow ? { approvalFlow: action === 'reopen' ? resetFlow(flow) : flow, pendingApproverUids: action === 'reopen' ? pendingApproverUids(resetFlow(flow), () => null) : [] } : {}),
    });
    tx.set(movements.doc(), { ...base, action: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'reopened', field: 'status', from, to });
    if (action === 'reject') {
      tx.set(movements.doc(), { ...base, action: 'rejected', field: 'rejectionReason', from: expense.rejectionReason ?? null, to: reason });
    }
    return { noop: false as const, expense, from, to, partial: false };
  });

  const e = outcome.expense;
  if (!outcome.noop && !outcome.partial && e.userId && e.isCompanyExpense !== true) {
    const merchant = e.merchant || 'sin comercio';
    const amount = formatAmount(e);
    if (action === 'approve') {
      await notifyUser({ toUid: e.userId, type: 'status_change', title: 'Rendición aprobada', body: `Tu rendición de ${merchant} fue aprobada.`, expenseId, email: { template: 'approved', vars: { merchant, amount } } });
    } else if (action === 'reject') {
      await notifyUser({ toUid: e.userId, type: 'rejection', title: 'Rendición rechazada', body: `Tu rendición de ${merchant} fue rechazada. Motivo: ${reason}`, expenseId, email: { template: 'rejected', vars: { merchant, amount, reason: reason ?? '' } } });
    } else {
      await notifyUser({ toUid: e.userId, type: 'status_change', title: 'Rendición reabierta', body: `Tu rendición de ${merchant} volvió a estado pendiente.`, expenseId });
    }
  }

  return { ok: true, status: outcome.to, noop: outcome.noop, partial: outcome.partial };
});

// Deleting someone else's expense (admins) goes through here so the PIN can
// be enforced; rules only let owners delete their own pending expenses
// directly. Balances and project totals follow via onExpenseWritten.
export const deleteExpense = onCall(async (req) => {
  const { uid, claims } = requireAuth(req);
  const expenseId = requireString(req.data?.expenseId, 'expenseId', 128);
  const db = getFirestore();
  const ref = db.doc(`expenses/${expenseId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, noop: true };
  const expense = snap.data() ?? {};
  const isOwnPending = expense.userId === uid && (expense.status ?? 'pending') === 'pending';
  if (!isAdminRole(claims.role) && !isOwnPending) {
    throw new HttpsError('permission-denied', 'No tienes permiso para eliminar esta rendición.');
  }
  if (!isOwnPending) await requirePinFor(req, 'delete', { ref: expenseId });
  await ref.delete();
  return { ok: true, noop: false };
});
