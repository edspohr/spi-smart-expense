import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';

initializeApp();

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Smoke-test callable: confirms the Functions deployment, auth propagation
// and (from Ola 2) App Check wiring for a tenant before real callables land.
export const healthcheck = onCall((request) => ({
  ok: true,
  uid: request.auth?.uid ?? null,
  appCheck: request.app !== undefined,
  at: new Date().toISOString(),
}));
