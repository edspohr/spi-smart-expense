import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

/**
 * Append movement entries to expenses/{expenseId}/movements.
 * One document per changed field. Errors are swallowed so a logging
 * failure never blocks the primary save.
 *
 * @param {string} expenseId
 * @param {{ field: string, from: unknown, to: unknown }[]} changes
 * @param {{ uid: string, name: string }} actor
 */
export async function logMovements(expenseId, changes, actor) {
  if (!expenseId || !changes?.length) return;
  const at = new Date().toISOString();
  const movementsRef = collection(db, 'expenses', expenseId, 'movements');
  await Promise.all(
    changes.map(({ field, from, to }) =>
      addDoc(movementsRef, { field, from: from ?? null, to: to ?? null, byUid: actor.uid, byName: actor.name || actor.uid, at })
        .catch(err => console.error('[audit] logMovements failed:', err))
    )
  );
}
