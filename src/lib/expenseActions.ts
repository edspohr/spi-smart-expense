import { callFunction } from './functions';

export type ReviewAction = 'approve' | 'reject' | 'reopen';

export interface ReviewResult {
  ok: boolean;
  status: 'pending' | 'approved' | 'rejected';
  noop: boolean;
}

// Status transitions run server-side (functions/src/expenses.ts): they
// authorise by claims, stamp the reviewer, append the audit movement and
// notify the submitter. Balances and project totals follow via trigger.
export function reviewExpense(expenseId: string, action: ReviewAction, reason?: string): Promise<ReviewResult> {
  return callFunction<{ expenseId: string; action: ReviewAction; reason?: string }, ReviewResult>('reviewExpense', {
    expenseId,
    action,
    ...(reason !== undefined ? { reason } : {}),
  });
}

export const approveExpense = (expenseId: string) => reviewExpense(expenseId, 'approve');
export const rejectExpense = (expenseId: string, reason: string) => reviewExpense(expenseId, 'reject', reason);
export const reopenExpense = (expenseId: string) => reviewExpense(expenseId, 'reopen');
