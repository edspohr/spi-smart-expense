import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_CURRENCY, nowIso, requireAuth } from './common';
import { activeDelegate, approvalPolicyFrom, pendingApproverUids, planOnCreate, type ApprovalFlow, type Delegation } from './approval.logic';
import { notifyUser } from './notify';

export const TIMEZONE = defineString('TIMEZONE', { default: 'America/Bogota' });

export function baseAmount(expense: FirebaseFirestore.DocumentData): number | null {
  const currency = expense.currency ?? BASE_CURRENCY.value();
  if (currency === BASE_CURRENCY.value()) return Number(expense.amount) || 0;
  return typeof expense.amountCOP === 'number' ? expense.amountCOP : null;
}

export function formatAmount(expense: FirebaseFirestore.DocumentData): string {
  const currency = expense.currency ?? BASE_CURRENCY.value();
  const value = Number(expense.amount) || 0;
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: currency === 'USD' || currency === 'EUR' ? 2 : 0 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export async function loadApprovalPolicy() {
  return approvalPolicyFrom((await getFirestore().doc('settings/tenant').get()).data());
}

export async function delegateOf(uid: string): Promise<string | null> {
  const data = (await getFirestore().doc(`users/${uid}`).get()).data();
  return activeDelegate(data?.delegation as Delegation | undefined, nowIso());
}

export async function notifyStepApprovers(expenseId: string, expense: FirebaseFirestore.DocumentData, flow: ApprovalFlow, uids: string[]) {
  const step = flow.steps[flow.currentStep];
  if (!step || step.kind !== 'manager') return;
  for (const toUid of uids) {
    await notifyUser({
      toUid,
      type: 'approval_request',
      title: 'Rendición por aprobar',
      body: `${expense.userName ?? 'Un colaborador'} rindió ${expense.merchant ?? 'un gasto'} por ${formatAmount(expense)}.`,
      expenseId,
      email: {
        template: 'needsApproval',
        vars: { submitterName: expense.userName, merchant: expense.merchant, amount: formatAmount(expense) },
      },
    });
  }
}

// Applies the tenant policy to every new expense. With the default policy
// (single mode, no auto-approval) it returns without writing, so SPI's flow
// is untouched.
export const onExpenseCreated = onDocumentCreated('expenses/{expenseId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const expense = snap.data();
  if ((expense.status ?? 'pending') !== 'pending' || expense.approvalFlow) return;

  const policy = await loadApprovalPolicy();
  const submitter = (await getFirestore().doc(`users/${expense.userId}`).get()).data();
  const managerUid = typeof submitter?.managerUid === 'string' ? submitter.managerUid : null;
  const manager = managerUid ? (await getFirestore().doc(`users/${managerUid}`).get()).data() : undefined;
  const plan = planOnCreate(policy, {
    amount: baseAmount(expense),
    submitterUid: expense.userId,
    managerUid: manager && manager.active !== false ? managerUid : null,
    managerName: manager?.displayName ?? null,
  });

  const at = nowIso();
  if (plan.kind === 'none') return;

  if (plan.kind === 'auto-approve') {
    await snap.ref.update({ status: 'approved', reviewedAt: at, reviewedByUid: 'system', reviewedByName: 'Aprobación automática' });
    await snap.ref.collection('movements').add({
      action: 'auto_approved',
      field: 'status',
      from: 'pending',
      to: 'approved',
      byUid: 'system',
      byName: 'Aprobación automática',
      comment: `Monto bajo el umbral de aprobación automática (${policy.autoApproveBelow}).`,
      at,
    });
    if (expense.isCompanyExpense !== true) {
      await notifyUser({
        toUid: expense.userId,
        type: 'status_change',
        title: 'Rendición aprobada',
        body: `Tu rendición de ${expense.merchant ?? 'sin comercio'} se aprobó automáticamente.`,
        expenseId: event.params.expenseId,
        email: { template: 'approved', vars: { merchant: expense.merchant, amount: formatAmount(expense) } },
      });
    }
    return;
  }

  const delegate = policy.allowDelegation && managerUid ? await delegateOf(managerUid) : null;
  const uids = pendingApproverUids(plan.flow, () => delegate);
  await snap.ref.update({ approvalFlow: plan.flow, pendingApproverUids: uids });
  await snap.ref.collection('movements').add({
    action: 'flow_started',
    field: 'approvalFlow',
    from: null,
    to: plan.flow.steps.map((s) => (s.kind === 'manager' ? `responsable (${s.approverName ?? '—'})` : `finanzas x${s.signaturesRequired}`)).join(' → '),
    byUid: 'system',
    byName: 'Política de aprobación',
    comment: null,
    at,
  });
  await notifyStepApprovers(event.params.expenseId, expense, plan.flow, uids);
});

// A manager hands their approvals to someone else until a date. Open
// expenses waiting for the manager are updated so the delegate can read and
// approve them right away.
export const setDelegation = onCall(async (req) => {
  const { uid, actor } = requireAuth(req);
  const db = getFirestore();
  const policy = await loadApprovalPolicy();
  if (!policy.allowDelegation) throw new HttpsError('failed-precondition', 'La delegación no está habilitada en esta organización.');

  const toUid = typeof req.data?.toUid === 'string' && req.data.toUid ? req.data.toUid : null;
  const until = typeof req.data?.until === 'string' ? req.data.until : null;
  let delegation: Delegation | null = null;
  if (toUid) {
    if (toUid === uid) throw new HttpsError('invalid-argument', 'No puedes delegarte a ti mismo.');
    if (!until || Number.isNaN(Date.parse(until)) || until <= nowIso()) {
      throw new HttpsError('invalid-argument', 'Indica una fecha de término futura.');
    }
    const target = (await db.doc(`users/${toUid}`).get()).data();
    if (!target || target.active === false) throw new HttpsError('not-found', 'La persona elegida no existe o está desactivada.');
    delegation = { toUid, toName: target.displayName ?? '', until: new Date(until).toISOString() };
  }

  const userRef = db.doc(`users/${uid}`);
  const previous = activeDelegate((await userRef.get()).data()?.delegation as Delegation | undefined, nowIso());
  await userRef.set({ delegation: delegation ?? null }, { merge: true });

  const open = await db.collection('expenses').where('pendingApproverUids', 'array-contains', uid).get();
  let updated = 0;
  for (const doc of open.docs) {
    const flow = doc.data().approvalFlow as ApprovalFlow | undefined;
    if (!flow || doc.data().status !== 'pending') continue;
    const uids = pendingApproverUids(flow, () => delegation?.toUid ?? null);
    await doc.ref.update({ pendingApproverUids: uids });
    updated++;
  }
  if (delegation && delegation.toUid !== previous) {
    await notifyUser({
      toUid: delegation.toUid,
      type: 'assignment',
      title: 'Te delegaron aprobaciones',
      body: `${actor.name} te delegó sus aprobaciones hasta el ${new Date(delegation.until).toLocaleDateString('es-CO')}.`,
    });
  }
  return { ok: true, delegation, updated };
});

// Daily reminder (weekdays, 08:00 tenant time) for expenses pending longer
// than staleDays. Opt-in per tenant (approvalPolicy.staleReminders).
export const staleApprovalReminders = onSchedule({ schedule: '0 8 * * 1-5', timeZone: TIMEZONE }, async () => {
  const policy = await loadApprovalPolicy();
  if (!policy.staleReminders) return;
  const db = getFirestore();
  const cutoff = new Date(Date.now() - policy.staleDays * 86_400_000).toISOString();
  const pending = await db.collection('expenses').where('status', '==', 'pending').where('createdAt', '<', cutoff).get();
  if (pending.empty) return;

  const byApprover = new Map<string, { merchant: string; amount: string; submitterName: string; days: number }[]>();
  const admins = await db.collection('users').where('role', 'in', ['admin', 'superadmin']).get();
  const adminUids = admins.docs.filter((d) => d.data().active !== false).map((d) => d.id);

  for (const doc of pending.docs) {
    const e = doc.data();
    const flow = e.approvalFlow as ApprovalFlow | undefined;
    const targets = flow && (e.pendingApproverUids ?? []).length > 0 ? (e.pendingApproverUids as string[]) : adminUids;
    const item = {
      merchant: e.merchant ?? '—',
      amount: formatAmount(e),
      submitterName: e.userName ?? '—',
      days: Math.floor((Date.now() - Date.parse(e.createdAt)) / 86_400_000),
    };
    for (const uid of targets) byApprover.set(uid, [...(byApprover.get(uid) ?? []), item]);
  }

  for (const [toUid, items] of byApprover) {
    await notifyUser({
      toUid,
      type: 'stale_reminder',
      title: 'Rendiciones sin revisar',
      body: `${items.length} rendiciones esperan tu revisión hace más de ${policy.staleDays} días.`,
      email: { template: 'staleDigest', vars: { count: items.length, items } },
    });
  }
  logger.info('stale reminders sent', { approvers: byApprover.size, expenses: pending.size });
});
