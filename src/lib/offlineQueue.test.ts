import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let previous: typeof import('./offlineQueue') | null = null;

async function freshQueue() {
  await previous?.closeOfflineQueue();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('expense-buddy-offline');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  vi.resetModules();
  previous = await import('./offlineQueue');
  return previous;
}

const submission = (id: string, uid = 'u1') => ({
  id,
  uid,
  label: 'Taxi · $ 30.000',
  createdAt: new Date(2026, 9, 25, 10, Number(id.replace(/\D/g, '')) || 0).toISOString(),
  files: { receipt: { name: 'r.jpg', type: 'image/jpeg', blob: new Blob(['img']), url: null } },
  docs: [{ id: `doc-${id}`, data: { userId: uid, amount: 30000 } }],
});

describe('offline queue', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('stores submissions per user and lists them oldest first', async () => {
    const q = await freshQueue();
    await q.enqueueSubmission(submission('s2'));
    await q.enqueueSubmission(submission('s1'));
    await q.enqueueSubmission(submission('s3', 'other'));
    expect((await q.listQueued('u1')).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('uploads, commits with the uploaded URL and removes the item', async () => {
    const q = await freshQueue();
    await q.enqueueSubmission(submission('s1'));
    const upload = vi.fn().mockResolvedValue('https://storage/r.jpg');
    const commit = vi.fn().mockResolvedValue(undefined);
    expect(await q.flushQueue('u1', { upload, commit })).toEqual({ sent: 1, failed: 0 });
    expect(commit).toHaveBeenCalledWith([{ id: 'doc-s1', data: { userId: 'u1', amount: 30000, receiptUrl: 'https://storage/r.jpg', voucherUrl: null } }]);
    expect(await q.listQueued('u1')).toEqual([]);
  });

  it('keeps the uploaded URL when the commit fails offline, and never re-uploads', async () => {
    const q = await freshQueue();
    await q.enqueueSubmission(submission('s1'));
    const upload = vi.fn().mockResolvedValue('https://storage/r.jpg');
    const offline = Object.assign(new Error('Failed to fetch'), { code: 'unavailable' });
    await q.flushQueue('u1', { upload, commit: vi.fn().mockRejectedValue(offline) });
    const [item] = await q.listQueued('u1');
    expect(item?.files.receipt?.url).toBe('https://storage/r.jpg');
    expect(item?.attempts).toBe(1);

    const commit = vi.fn().mockResolvedValue(undefined);
    await q.flushQueue('u1', { upload, commit });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await q.listQueued('u1')).toEqual([]);
  });

  it('stops at a network error but skips past other failures', async () => {
    const q = await freshQueue();
    await q.enqueueSubmission(submission('s1'));
    await q.enqueueSubmission(submission('s2'));
    const upload = vi.fn().mockResolvedValue('u');
    const commit = vi.fn().mockRejectedValueOnce(new Error('permission-denied')).mockResolvedValue(undefined);
    expect(await q.flushQueue('u1', { upload, commit })).toEqual({ sent: 1, failed: 1 });
    const [left] = await q.listQueued('u1');
    expect(left?.id).toBe('s1');
    expect(left?.lastError).toBe('permission-denied');
  });

  it('classifies network errors', async () => {
    const q = await freshQueue();
    expect(q.isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(q.isNetworkError({ code: 'storage/retry-limit-exceeded' })).toBe(true);
    expect(q.isNetworkError(new Error('permission-denied'))).toBe(false);
  });
});
