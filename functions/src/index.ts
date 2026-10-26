import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { FUNCTIONS_REGION } from './common';
import { makeEmailSender } from './notify';
import * as demo from './demo';

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
export { reviewExpense, deleteExpense } from './expenses';
export { setOwnPin, verifyPin, adminResetPin, adminListPinLog } from './pin';
export { onExpenseCreated, setDelegation, staleApprovalReminders } from './approval';

// The Brevo sender is only exported when the tenant enables email
// (EMAIL_PROVIDER=brevo in functions/.env.<projectId>), so deploying a tenant
// without the BREVO_API_KEY secret never fails.
export const sendQueuedEmail = process.env.EMAIL_PROVIDER === 'brevo' ? makeEmailSender() : undefined;
export { onExpenseWritten } from './aggregates';
export { onUserWritten } from './claims';
// Ola 8: merchant dictionary for the on-device reader and verification of
// offline reads (acts only on expenses that carry `localRead`).
export { getMerchantDictionary, verifyLocalRead } from './offline';

// Demo tenant only (DEMO_MODE=true in functions/.env.<projectId>): one-click
// sign-in by role and the nightly data reset. Never deployed for clients.
const DEMO = process.env.DEMO_MODE === 'true';
export const demoSignIn = DEMO ? demo.demoSignIn : undefined;
export const resetDemoData = DEMO ? demo.resetDemoData : undefined;
export { adminListUsers, adminInviteUser, adminUpdateUser, adminDeleteUser, adminUpdateSettings } from './users';
