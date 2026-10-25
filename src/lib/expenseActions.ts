import { callFunction } from './functions';
import { withPin } from './pin';

export type ReviewAction = 'approve' | 'reject' | 'reopen';

export interface ReviewResult {
  ok: boolean;
  status: 'pending' | 'approved' | 'rejected';
  noop: boolean;
}

// Status transitions run server-side (functions/src/expenses.ts): they
// authorise by claims, stamp the reviewer, append the audit movement and
// notify the submitter. Balances and project totals follow via trigger.
const PIN_REASON: Record<ReviewAction, string> = {
  approve: 'aprobar la rendición',
  reject: 'rechazar la rendición',
  reopen: 'reabrir la rendición',
};

export function reviewExpense(expenseId: string, action: ReviewAction, reason?: string): Promise<ReviewResult> {
  return withPin(PIN_REASON[action], (pin) =>
    callFunction<{ expenseId: string; action: ReviewAction; reason?: string; pin?: string }, ReviewResult>('reviewExpense', {
      expenseId,
      action,
      ...(reason !== undefined ? { reason } : {}),
      ...(pin ? { pin } : {}),
    }),
  );
}

// Deleting someone else's expense goes through the server so the PIN can be
// enforced; owners deleting their own pending expense also work here.
export function deleteExpense(expenseId: string): Promise<{ ok: boolean; noop: boolean }> {
  return withPin('eliminar la rendición', (pin) => callFunction('deleteExpense', { expenseId, ...(pin ? { pin } : {}) }));
}

export const approveExpense = (expenseId: string) => reviewExpense(expenseId, 'approve');
export const rejectExpense = (expenseId: string, reason: string) => reviewExpense(expenseId, 'reject', reason);
export const reopenExpense = (expenseId: string) => reviewExpense(expenseId, 'reopen');
