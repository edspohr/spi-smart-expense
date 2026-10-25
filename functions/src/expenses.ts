import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { isAdminRole, nowIso, requireAuth, requireString, type AppClaims } from './common';

type Action = 'approve' | 'reject' | 'reopen';
type Status = 'pending' | 'approved' | 'rejected';

const TARGET: Record<Action, Status> = { approve: 'approved', reject: 'rejected', reopen: 'pending' };

function assertCanReview(claims: AppClaims, action: Action, expense: FirebaseFirestore.DocumentData) {
  if (isAdminRole(claims.role)) return;
  if (action === 'reopen') throw new HttpsError('permission-denied', 'Solo un administrador puede reabrir una rendición.');
  // Mirrors src/lib/permissions.js canUserApprove(): COP needs the Colombia
  // approver flag, any other currency needs canApprove.
  const isColombia = (expense.currency ?? 'COP') === 'COP';
  const allowed = isColombia ? claims.isColombiaApprover === true : claims.canApprove === true;
  if (!allowed) throw new HttpsError('permission-denied', 'No tienes permiso para revisar esta rendición.');
}

// Status transitions for an expense. Balance and project totals are NOT
// touched here: the onExpenseWritten trigger derives them from the status
// change, so approving stays a single document write plus its audit entry.
export const reviewExpense = onCall(async (req) => {
  const { claims, actor } = requireAuth(req);
  const expenseId = requireString(req.data?.expenseId, 'expenseId', 128);
  const action = req.data?.action as Action;
  if (!(action in TARGET)) throw new HttpsError('invalid-argument', 'Acción no válida.');
  const reason = action === 'reject' ? requireString(req.data?.reason, 'motivo', 1000) : null;

  const db = getFirestore();
  const ref = db.doc(`expenses/${expenseId}`);
  const at = nowIso();

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Rendición no encontrada.');
    const expense = snap.data() ?? {};
    assertCanReview(claims, action, expense);

    const from = (expense.status ?? 'pending') as Status;
    const to = TARGET[action];
    if (from === to) return { noop: true as const, expense, from, to };
    if (action === 'approve' && from === 'rejected') {
      throw new HttpsError('failed-precondition', 'La rendición ya fue rechazada.');
    }
    if (action === 'reject' && from === 'approved') {
      throw new HttpsError('failed-precondition', 'La rendición ya fue aprobada.');
    }

    tx.update(ref, {
      status: to,
      rejectionReason: action === 'reject' ? reason : FieldValue.delete(),
      reviewedAt: at,
      reviewedByUid: actor.uid,
      reviewedByName: actor.name,
    });

    const movements = ref.collection('movements');
    tx.set(movements.doc(), { field: 'status', from, to, byUid: actor.uid, byName: actor.name, at });
    if (action === 'reject') {
      tx.set(movements.doc(), {
        field: 'rejectionReason',
        from: expense.rejectionReason ?? null,
        to: reason,
        byUid: actor.uid,
        byName: actor.name,
        at,
      });
    }
    return { noop: false as const, expense, from, to };
  });

  if (!outcome.noop && outcome.expense.userId && outcome.expense.isCompanyExpense !== true) {
    const merchant = outcome.expense.merchant || 'sin comercio';
    const copy: Record<Action, { type: string; title: string; body: string }> = {
      approve: { type: 'status_change', title: 'Rendición aprobada', body: `Tu rendición de ${merchant} fue aprobada.` },
      reject: { type: 'rejection', title: 'Rendición rechazada', body: `Tu rendición de ${merchant} fue rechazada. Motivo: ${reason}` },
      reopen: { type: 'status_change', title: 'Rendición reabierta', body: `Tu rendición de ${merchant} volvió a estado pendiente.` },
    };
    await db.collection('notifications').add({
      toUid: outcome.expense.userId,
      ...copy[action],
      expenseId,
      read: false,
      createdAt: at,
    });
  }

  return { ok: true, status: outcome.to, noop: outcome.noop };
});
