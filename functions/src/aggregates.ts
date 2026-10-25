import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { computeAggregateDeltas, isEmptyDeltas } from './aggregates.logic';
import { nowIso } from './common';

// Single writer for users.balance and projects.expenses. Every create,
// edit, status change or delete of an expense flows through here, so client
// code never touches those fields. Idempotent via a per-event ledger doc:
// Firestore triggers are at-least-once and a retry must not double-apply.
export const onExpenseWritten = onDocumentWritten('expenses/{expenseId}', async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() ?? null : null;
  const after = event.data?.after.exists ? event.data.after.data() ?? null : null;
  const deltas = computeAggregateDeltas(before, after);
  if (isEmptyDeltas(deltas)) return;

  const db = getFirestore();
  const ledgerRef = db.doc(`aggregateLedger/${event.id}`);

  await db.runTransaction(async (tx) => {
    const ledger = await tx.get(ledgerRef);
    if (ledger.exists) {
      logger.info('aggregate event already applied', { eventId: event.id });
      return;
    }
    for (const [uid, delta] of Object.entries(deltas.users)) {
      tx.set(db.doc(`users/${uid}`), { balance: FieldValue.increment(delta) }, { merge: true });
    }
    for (const [pid, delta] of Object.entries(deltas.projects)) {
      tx.set(db.doc(`projects/${pid}`), { expenses: FieldValue.increment(delta) }, { merge: true });
    }
    tx.set(ledgerRef, {
      expenseId: event.params.expenseId,
      deltas,
      at: nowIso(),
    });
  });
});
