import { onAuthStateChanged, type Auth } from 'firebase/auth';
import { doc, writeBatch, type Firestore } from 'firebase/firestore';
import { toast } from 'sonner';
import { auth, db, uploadReceiptImage } from './firebase';
import { flushQueue, setQueueOwner, type FlushDeps } from './offlineQueue';
import { isOnline } from './connectivity';
import { fillMissingRates } from './fxFill';

const COMMIT_TIMEOUT_MS = 30_000;

// With Firestore's persistent cache a commit made while the network is
// flaky can wait indefinitely; the timeout turns that into a network error
// so the item stays queued (the pending write is idempotent: same doc ids).
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error('network timeout'), { code: 'unavailable' })), COMMIT_TIMEOUT_MS)),
  ]);
}

export const firebaseFlushDeps: FlushDeps = {
  upload: (file, uid) => uploadReceiptImage(file, uid),
  commit: async (docs) => {
    // Foreign-currency expenses saved without signal get the rate of their
    // receipt date now that there is a connection.
    const ready = await fillMissingRates(docs);
    const batch = writeBatch(db as Firestore);
    for (const d of ready) batch.set(doc(db as Firestore, 'expenses', d.id), d.data);
    await withTimeout(batch.commit());
  },
};

let currentUid: string | null = null;

export async function syncNow(): Promise<void> {
  if (!currentUid || !isOnline()) return;
  const { sent, failed } = await flushQueue(currentUid, firebaseFlushDeps);
  if (sent > 0) toast.success(sent === 1 ? 'Se envió 1 rendición guardada sin conexión.' : `Se enviaron ${sent} rendiciones guardadas sin conexión.`);
  if (failed > 0) toast.error(`${failed} rendición(es) sin conexión no se pudieron enviar. Revísalas en Mi Espacio.`);
}

// Started once from main.jsx: flushes the signed-in user's queue at login,
// when the browser regains connectivity and every minute while items remain.
export function startOfflineSync(): void {
  if (!auth) return;
  onAuthStateChanged(auth as Auth, async (user) => {
    currentUid = user?.uid ?? null;
    const items = await setQueueOwner(user?.uid);
    if (user && items.length > 0) await syncNow();
  });
  window.addEventListener('online', () => void syncNow());
  setInterval(() => void syncNow(), 60_000);
}

// Online path of a fresh submission: same upload + commit as the queue flush,
// so both paths produce identical documents.
export async function flushNewSubmission(
  docs: { id: string; data: Record<string, unknown> }[],
  files: { receipt?: File | null; voucher?: File | null },
  uid: string,
): Promise<void> {
  const receiptUrl = files.receipt ? await firebaseFlushDeps.upload(files.receipt, uid) : null;
  const voucherUrl = files.voucher ? await firebaseFlushDeps.upload(files.voucher, uid) : null;
  await firebaseFlushDeps.commit(docs.map((d) => ({ id: d.id, data: { ...d.data, receiptUrl, voucherUrl } })));
}
