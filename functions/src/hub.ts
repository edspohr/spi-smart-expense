import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';
import { nowIso } from './common';
import { validateContribution, type Contribution } from './learning.logic';

// Ola 8c — the learning hub (central Growth Buddies project, HUB_MODE=true).
// Receives anonymised contributions from tenants (exportDerivedData),
// verifies the sender and the exact schema, and keeps the latest snapshot
// per environment. scripts/build-reader-pack.mjs aggregates them into the
// reader pack that ships with every build. Runbook: docs/runbooks/learning-hub.md.

// Public URL of ingestContribution (the audience of the senders' ID tokens).
export const HUB_AUDIENCE = defineString('HUB_AUDIENCE', { default: '' });
// Comma-separated service-account emails allowed to send (one per tenant).
export const HUB_ALLOWED_SENDERS = defineString('HUB_ALLOWED_SENDERS', { default: '' });

const verifier = new OAuth2Client();

async function sender(authorization: string | undefined): Promise<string | null> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !HUB_AUDIENCE.value()) return null;
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience: HUB_AUDIENCE.value() });
    const p = ticket.getPayload();
    return p?.email && p.email_verified ? p.email : null;
  } catch {
    return null;
  }
}

export const ingestContribution = onRequest({ cors: false, memory: '256MiB', maxInstances: 5 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('method not allowed');
    return;
  }
  const email = await sender(req.get('authorization'));
  const allowed = HUB_ALLOWED_SENDERS.value().split(',').map((s) => s.trim()).filter(Boolean);
  if (!email || !allowed.includes(email)) {
    logger.warn('hub: rejected sender', { email });
    res.status(403).send('forbidden');
    return;
  }
  const error = validateContribution(req.body);
  if (error) {
    logger.warn('hub: invalid contribution', { error });
    res.status(400).send(`invalid contribution: ${error}`);
    return;
  }
  const c = req.body as Contribution;
  const db = getFirestore();
  const batch = db.batch();
  // The sender's identity is not stored: only the environment pseudonym.
  batch.set(db.doc(`envIssuers/${c.envId}`), { country: c.country, issuers: c.issuers, receivedAt: nowIso(), generatedAt: c.generatedAt });
  for (const day of c.stats) batch.set(db.doc(`envStats/${c.envId}_${day.date}`), { envId: c.envId, country: c.country, ...day });
  await batch.commit();
  res.status(200).json({ ok: true, issuers: c.issuers.length, days: c.stats.length });
});
