import { randomBytes } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';
import { COUNTRY, SCHEDULER_REGION, nowIso, requireAuth } from './common';
import { DERIVED_TERMS_VERSION, buildContribution, isEmptyContribution, type Contribution, type Country, type StatsDay } from './learning.logic';

// Ola 8c — tenant side of the cross-client learning layer (ADR 0016).
// Once a day, if a superadmin consented with the current text version, the
// tenant sends its anonymised contribution to the learning hub. With no hub
// configured (LEARNING_HUB_URL empty) it is written to learningOutbox in the
// tenant's own project instead: nothing leaves until the hub exists.

// Optional: set in functions/.env.<projectId> to connect to the hub. A plain
// env var (not a param) so tenants without a hub deploy without prompts.
const hubUrl = () => process.env.LEARNING_HUB_URL ?? '';

const STATE = 'cache/learning';

interface ExportState {
  envId?: string;
  lastExportDay?: string | null;
  lastResult?: { at: string; status: string; destination?: string; issuers?: number; days?: number; reason?: string };
}

async function loadState(db: Firestore): Promise<ExportState & { envId: string }> {
  const ref = db.doc(STATE);
  const state = ((await ref.get()).data() ?? {}) as ExportState;
  if (state.envId) return state as ExportState & { envId: string };
  // Random pseudonym of this environment: lets the hub replace its previous
  // snapshot without knowing which client it is.
  const envId = randomBytes(16).toString('hex');
  await ref.set({ envId }, { merge: true });
  return { ...state, envId };
}

async function consent(db: Firestore): Promise<{ ok: boolean; reason?: string }> {
  const learning = (await db.doc('settings/tenant').get()).data()?.learning ?? {};
  if (learning.shareDerived !== true) return { ok: false, reason: 'sin consentimiento' };
  if (learning.termsVersion !== DERIVED_TERMS_VERSION) return { ok: false, reason: `consentimiento de una versión anterior (${learning.termsVersion ?? '—'})` };
  return { ok: true };
}

const today = () => nowIso().slice(0, 10);

/** The contribution for the days after the last export, today excluded (still counting). */
async function collect(db: Firestore, state: ExportState & { envId: string }): Promise<Contribution> {
  const [profiles, stats] = await Promise.all([
    db.collection('readerProfiles').limit(5000).get(),
    db.collection('ocrStats').where('date', '<', today()).orderBy('date', 'desc').limit(400).get(),
  ]);
  return buildContribution({
    envId: state.envId,
    country: (COUNTRY.value() === 'CL' ? 'CL' : 'CO') as Country,
    generatedAt: nowIso(),
    profiles: profiles.docs.map((d) => ({ issuer: d.id, labels: d.data().labels })),
    stats: stats.docs.map((d) => d.data() as StatsDay),
    sinceDay: state.lastExportDay ?? null,
  });
}

async function send(db: Firestore, c: Contribution): Promise<'hub' | 'outbox'> {
  const url = hubUrl();
  if (!url) {
    await db.doc(`learningOutbox/${c.generatedAt.slice(0, 10)}`).set(c);
    return 'outbox';
  }
  // Google-signed ID token of this project's service account; the hub only
  // accepts senders on its allowlist.
  const client = await new GoogleAuth().getIdTokenClient(url);
  await client.request({ url, method: 'POST', data: c, timeout: 30_000 });
  return 'hub';
}

export async function runExport(db = getFirestore()): Promise<ExportState['lastResult']> {
  const at = nowIso();
  const allowed = await consent(db);
  let result: ExportState['lastResult'];
  const state = await loadState(db);
  if (!allowed.ok) {
    result = { at, status: 'skipped', reason: allowed.reason };
  } else {
    const c = await collect(db, state);
    if (isEmptyContribution(c)) {
      result = { at, status: 'empty' };
    } else {
      const destination = await send(db, c);
      result = { at, status: 'sent', destination, issuers: c.issuers.length, days: c.stats.length };
      const lastDay = c.stats[c.stats.length - 1]?.date;
      if (lastDay) await db.doc(STATE).set({ lastExportDay: lastDay }, { merge: true });
    }
  }
  await db.doc(STATE).set({ lastResult: result }, { merge: true });
  logger.info('derived data export', result);
  return result;
}

export const exportDerivedData = onSchedule({ schedule: '0 7 * * *', timeZone: 'Etc/UTC', region: SCHEDULER_REGION }, async () => {
  try {
    await runExport();
  } catch (err) {
    logger.error('derived data export failed', { error: String(err) });
    await getFirestore().doc(STATE).set({ lastResult: { at: nowIso(), status: 'error', reason: String(err).slice(0, 300) } }, { merge: true });
  }
});

/** Superadmin: exactly what the next export would send, and where. */
export const previewDerivedData = onCall(async (req) => {
  const { claims } = requireAuth(req);
  if (claims.role !== 'superadmin') throw new HttpsError('permission-denied', 'Solo un superadministrador puede ver el aporte de datos.');
  const db = getFirestore();
  const state = await loadState(db);
  const [contribution, allowed] = await Promise.all([collect(db, state), consent(db)]);
  return {
    contribution,
    destination: hubUrl() ? 'hub' : 'outbox',
    consent: allowed,
    lastExportDay: state.lastExportDay ?? null,
    lastResult: state.lastResult ?? null,
  };
});
