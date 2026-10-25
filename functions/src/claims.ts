import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions/v2';
import { claimsEqual, claimsFromUserDoc } from './claims.logic';
import { TENANT_ID } from './common';

// Mirrors users/{uid}.role / permissions / active into custom claims so
// firestore.rules and storage.rules can authorise without a get() per read.
// The client refreshes its ID token when it notices a mismatch (AuthContext).
export const onUserWritten = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const auth = getAuth();
  const after = event.data?.after;

  if (!after?.exists) {
    try {
      await auth.setCustomUserClaims(uid, null);
    } catch (e) {
      logger.warn('could not clear claims for deleted user doc', { uid, error: String(e) });
    }
    return;
  }

  const desired = claimsFromUserDoc(after.data(), TENANT_ID.value());
  let current: Record<string, unknown> | undefined;
  try {
    current = (await auth.getUser(uid)).customClaims;
  } catch (e) {
    // Seeded user docs may exist before the Auth account does; the backfill
    // script or the next doc write will catch up.
    logger.warn('no auth user for doc', { uid, error: String(e) });
    return;
  }
  if (claimsEqual(current, desired)) return;

  await auth.setCustomUserClaims(uid, desired);
  if (desired.active === false) await auth.revokeRefreshTokens(uid);
  logger.info('claims updated', { uid, role: desired.role });
});
