import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { FUNCTIONS_REGION, SCHEDULER_REGION, nowIso } from './common';
import { DEMO_ROLES, PEOPLE, RETIRED_UIDS, seedDemoData, wipeDemoData } from './demo.data';

// Demo-only functions. index.ts exports them only when DEMO_MODE=true in
// functions/.env.<projectId>, so client tenants (SPI, Elecnor...) never
// deploy a password-less sign-in.

const SIGNINS_PER_IP_PER_HOUR = 30;

async function consumeDemoQuota(ip: string) {
  const db = getFirestore();
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
  const ref = db.doc(`rateLimits/${hour}_demo_${createHash('sha256').update(ip).digest('hex').slice(0, 16)}`);
  await db.runTransaction(async (tx) => {
    const count = ((await tx.get(ref)).data()?.count as number | undefined) ?? 0;
    if (count >= SIGNINS_PER_IP_PER_HOUR) {
      throw new HttpsError('resource-exhausted', 'Demasiados ingresos al demo desde esta red. Intenta en una hora.');
    }
    tx.set(ref, { count: FieldValue.increment(1), kind: 'demo', lastAt: nowIso() }, { merge: true });
  });
}

/**
 * One-click demo: returns a custom token for the fixed account of a role
 * (worker, manager, finance). Needs roles/iam.serviceAccountTokenCreator for
 * the Functions service account on itself (see docs/runbooks/bootstrap-tenant.md).
 */
// Region set explicitly: index.ts imports this module before setGlobalOptions runs.
export const demoSignIn = onCall({ region: FUNCTIONS_REGION, maxInstances: 5 }, async (req) => {
  const role = typeof req.data?.role === 'string' ? req.data.role : '';
  const uid = DEMO_ROLES[role];
  if (!uid) throw new HttpsError('invalid-argument', 'Rol de demo desconocido.');
  await consumeDemoQuota(req.rawRequest.ip ?? 'unknown');
  try {
    await getAuth().getUser(uid);
  } catch {
    throw new HttpsError('failed-precondition', 'El demo no está inicializado. Vuelve a intentarlo en unos minutos.');
  }
  const token = await getAuth().createCustomToken(uid, { demo: true });
  logger.info('demo sign-in', { role });
  return { token };
});

/** Deletes visitor uploads (receipts/vouchers) from the default bucket. */
async function wipeUploads() {
  const bucket = getStorage().bucket();
  for (const prefix of ['receipts/', 'vouchers/']) {
    await bucket.deleteFiles({ prefix, force: true }).catch((err) => logger.warn('storage wipe failed', { prefix, error: String(err) }));
  }
}

/** Nightly (04:00 Santiago) the demo goes back to its initial state. */
export const resetDemoData = onSchedule(
  { schedule: '0 4 * * *', timeZone: 'America/Santiago', region: SCHEDULER_REGION, timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const db = getFirestore();
    await wipeDemoData(db);
    await wipeUploads();
    // Re-enable accounts in case anything disabled them; passwords stay as set.
    for (const p of PEOPLE) await getAuth().updateUser(p.uid, { disabled: false }).catch(() => undefined);
    for (const uid of RETIRED_UIDS) await getAuth().deleteUser(uid).catch(() => undefined);
    const counts = await seedDemoData(db);
    logger.info('demo reset done', counts);
  },
);
