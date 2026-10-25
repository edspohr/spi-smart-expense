import { openDB, type IDBPDatabase } from 'idb';
import { useSyncExternalStore } from 'react';

// Offline submission queue. When an expense cannot be sent (no signal, or the
// upload fails on the network) the complete submission — receipt images as
// Blobs plus the final Firestore documents with pre-generated ids — is kept
// in IndexedDB and flushed later. Fixed doc ids make retries idempotent, and
// uploaded URLs are written back so an image is never uploaded twice.

export interface QueuedFile {
  name: string;
  type: string;
  blob: Blob;
  url: string | null;
}

export interface QueuedSubmission {
  id: string;
  uid: string;
  label: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  files: Partial<Record<'receipt' | 'voucher', QueuedFile>>;
  // Expense documents; `receiptUrl`/`voucherUrl` are filled in on flush.
  docs: { id: string; data: Record<string, unknown> }[];
}

export interface FlushDeps {
  upload: (file: File, uid: string) => Promise<string>;
  commit: (docs: { id: string; data: Record<string, unknown> }[]) => Promise<void>;
}

const DB_NAME = 'expense-buddy-offline';
const STORE = 'submissions';
let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('uid', 'uid');
      },
    });
  }
  return dbPromise;
}

export async function closeOfflineQueue(): Promise<void> {
  if (!dbPromise) return;
  (await dbPromise).close();
  dbPromise = null;
}

// ---- tiny store so components re-render when the queue changes
let snapshot: QueuedSubmission[] = [];
const listeners = new Set<() => void>();

async function refresh(uid?: string): Promise<QueuedSubmission[]> {
  const all = (await (await db()).getAll(STORE)) as QueuedSubmission[];
  snapshot = (uid ? all.filter((s) => s.uid === uid) : all).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  listeners.forEach((l) => l());
  return snapshot;
}

export function useOfflineQueue(): QueuedSubmission[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}

let currentUid: string | undefined;
export function setQueueOwner(uid: string | undefined): Promise<QueuedSubmission[]> {
  currentUid = uid;
  return refresh(uid);
}

export async function enqueueSubmission(sub: Omit<QueuedSubmission, 'attempts' | 'lastError'>): Promise<void> {
  await (await db()).put(STORE, { ...sub, attempts: 0, lastError: null });
  await refresh(currentUid);
}

export async function listQueued(uid: string): Promise<QueuedSubmission[]> {
  return ((await (await db()).getAllFromIndex(STORE, 'uid', uid)) as QueuedSubmission[]).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export async function removeQueued(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
  await refresh(currentUid);
}

export function isNetworkError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  const message = (err as Error)?.message ?? '';
  return (
    code === 'unavailable' ||
    code === 'storage/retry-limit-exceeded' ||
    code === 'storage/unknown' ||
    code === 'functions/unavailable' ||
    err instanceof TypeError ||
    /network|offline|failed to fetch/i.test(message)
  );
}

let flushing = false;

// Sends every queued submission of `uid`, oldest first. Stops at the first
// network error (still offline); other errors are recorded on the item and
// the loop moves on so one bad item never blocks the rest.
export async function flushQueue(uid: string, deps: FlushDeps): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const database = await db();
    for (const sub of await listQueued(uid)) {
      try {
        const files = { ...sub.files };
        for (const key of ['receipt', 'voucher'] as const) {
          const f = files[key];
          if (f && !f.url) {
            const url = await deps.upload(new File([f.blob], f.name, { type: f.type }), uid);
            files[key] = { ...f, url };
            await database.put(STORE, { ...sub, files });
          }
        }
        const docs = sub.docs.map((d) => ({
          id: d.id,
          data: { ...d.data, receiptUrl: files.receipt?.url ?? null, voucherUrl: files.voucher?.url ?? null },
        }));
        await deps.commit(docs);
        await database.delete(STORE, sub.id);
        sent++;
      } catch (err) {
        const latest = ((await database.get(STORE, sub.id)) as QueuedSubmission | undefined) ?? sub;
        await database.put(STORE, { ...latest, attempts: latest.attempts + 1, lastError: (err as Error)?.message ?? String(err) });
        if (isNetworkError(err)) break;
        failed++;
      }
    }
  } finally {
    flushing = false;
    await refresh(currentUid);
  }
  return { sent, failed };
}
