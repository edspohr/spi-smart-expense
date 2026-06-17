import { db } from './firebase';
import {
  collection, addDoc, doc, updateDoc, query,
  where, orderBy, onSnapshot, writeBatch, getDocs,
} from 'firebase/firestore';

const COL = 'notifications';

/**
 * Write a notification document. Never throws — a logging failure must not
 * block the triggering action.
 */
export async function notify({ toUid, type, title, body, expenseId }) {
  if (!toUid) return;
  try {
    await addDoc(collection(db, COL), {
      toUid,
      type,
      title,
      body: body || '',
      expenseId: expenseId || null,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notify] failed:', err);
  }
}

/**
 * Real-time subscription to a user's notifications (newest first).
 * Returns the unsubscribe function.
 */
export function subscribeNotifications(uid, cb) {
  const q = query(
    collection(db, COL),
    where('toUid', '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/** Mark a single notification as read. */
export async function markRead(id) {
  try {
    await updateDoc(doc(db, COL, id), { read: true });
  } catch (err) {
    console.error('[markRead] failed:', err);
  }
}

/** Mark all of a user's unread notifications as read in a batch. */
export async function markAllRead(uid) {
  try {
    const q = query(collection(db, COL), where('toUid', '==', uid), where('read', '==', false));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch (err) {
    console.error('[markAllRead] failed:', err);
  }
}
