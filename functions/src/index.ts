import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { FUNCTIONS_REGION } from './common';

initializeApp();

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

// Smoke-test callable: confirms the deployment, auth propagation and App
// Check wiring for a tenant.
export const healthcheck = onCall((request) => ({
  ok: true,
  uid: request.auth?.uid ?? null,
  role: (request.auth?.token as { role?: string } | undefined)?.role ?? null,
  appCheck: request.app !== undefined,
  at: new Date().toISOString(),
}));

export { extractReceipt } from './extractReceipt';
export { reviewExpense } from './expenses';
export { onExpenseWritten } from './aggregates';
export { onUserWritten } from './claims';
export { adminListUsers, adminInviteUser, adminUpdateUser, adminDeleteUser, adminUpdateSettings } from './users';
