import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import { db } from './firebase';
import type { ExpenseDoc, WithId } from '../types/models';

export type PendingForMe = WithId<ExpenseDoc & {
  approvalFlow?: { currentStep: number; steps: { kind: string; approverUid: string | null; approverName: string | null }[] };
}>;

// Expenses whose current approval step waits for this person (as manager or
// delegate). Backed by `pendingApproverUids`, which rules allow them to read.
export function useMyPendingApprovals(uid: string | null | undefined): { items: PendingForMe[]; loading: boolean } {
  const [items, setItems] = useState<PendingForMe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !db) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    const q = query(collection(db as Firestore, 'expenses'), where('pendingApproverUids', 'array-contains', uid), where('status', '==', 'pending'));
    return onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ExpenseDoc) })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        setLoading(false);
      },
      () => {
        setItems([]);
        setLoading(false);
      },
    );
  }, [uid]);

  return { items, loading };
}
