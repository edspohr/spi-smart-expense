import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Web push through FCM to every device a user opted in from Mi Espacio
// (users/{uid}.fcmTokens). Data-only messages: public/sw-extras.js renders
// them, so the Firebase SDK is not needed inside the service worker.
// Tokens FCM reports as dead are pruned.

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export async function sendPush(uid: string, msg: { title: string; body: string; link: string; tag?: string }): Promise<void> {
  const ref = getFirestore().doc(`users/${uid}`);
  const tokens = ((await ref.get()).data()?.fcmTokens ?? []) as string[];
  if (tokens.length === 0) return;
  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      data: { title: msg.title, body: msg.body, link: msg.link, ...(msg.tag ? { tag: msg.tag } : {}) },
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
    });
    const dead = res.responses.flatMap((r, i) => (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code) ? [tokens[i] as string] : []));
    if (dead.length > 0) await ref.update({ fcmTokens: FieldValue.arrayRemove(...dead) });
  } catch (err) {
    logger.warn('push send failed', { uid, error: String(err) });
  }
}

export function linkForType(type: string): string {
  switch (type) {
    case 'approval_request':
    case 'stale_reminder':
      return '/dashboard/approvals';
    case 'status_change':
    case 'rejection':
      return '/dashboard/expenses';
    default:
      return '/dashboard/mi-espacio';
  }
}
