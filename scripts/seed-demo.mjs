// Seeds (or resets) the Expense Buddy demo tenant ("Andes Energía SpA").
// The data and the wipe live in functions/src/demo.data.ts, shared with the
// nightly resetDemoData function; this script also creates the Auth accounts.
// Expenses are plain documents: the triggers build approval flows and balances.
//
//   npm run seed:demo                     # emulators (project expense-buddy-demo)
//   npm run reset:demo                    # wipe visitor data (keeps accounts) and reseed
//   node scripts/seed-demo.mjs --prod [--key path/to/sa.json] [--password X] [--reset]   (ADC when no --key)
//
// Accounts use --password (or DEMO_PASSWORD); emulators default to Demo2026!.
// In production a random password is generated and printed once if none is given.
// Run `npm run functions:build` first (the npm scripts do it).

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const { PEOPLE, RETIRED_UIDS, seedDemoData, wipeDemoData } = require('../functions/lib/demo.data.js');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i > -1 ? args[i + 1] : undefined;
};
const prod = flag('--prod');
const reset = flag('--reset');
const projectId = opt('--project') ?? 'expense-buddy-demo';

if (!prod) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}
const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

if (prod) {
  // Either a service-account key (--key) or your gcloud Application Default
  // Credentials (`gcloud auth application-default login` + set-quota-project).
  const keyPath = opt('--key');
  if (keyPath && !existsSync(keyPath)) {
    console.error(`Key file not found: ${keyPath}`);
    process.exit(1);
  }
  const sa = keyPath ? JSON.parse(readFileSync(keyPath, 'utf8')) : null;
  const target = sa?.project_id ?? projectId;
  if (!/demo/i.test(target)) {
    console.error(`Refusing: ${target} does not look like a demo project.`);
    process.exit(1);
  }
  initializeApp({ ...(sa ? { credential: cert(sa) } : { credential: applicationDefault() }), projectId: target });
  console.log(`Target: PRODUCTION ${target} (${sa ? 'service account key' : 'gcloud ADC'})`);
} else {
  initializeApp({ projectId });
  console.log(`Target: emulators (${projectId})`);
}

const password = opt('--password') ?? process.env.DEMO_PASSWORD ?? (prod ? randomBytes(9).toString('base64url') : 'Demo2026!');
const setPassword = !reset || opt('--password') || process.env.DEMO_PASSWORD || !prod;
const auth = getAuth();
const db = getFirestore();

async function upsertAccount(p) {
  try {
    await auth.getUser(p.uid);
    await auth.updateUser(p.uid, { email: p.email, displayName: p.name, disabled: false, ...(setPassword ? { password } : {}) });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid: p.uid, email: p.email, password, displayName: p.name, emailVerified: true });
  }
}

if (reset) {
  console.log('  wiping visitor data (waits ~25 s for triggers to settle)…');
  await wipeDemoData(db);
}
for (const uid of RETIRED_UIDS) {
  await auth.deleteUser(uid).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
  await db.doc(`users/${uid}`).delete();
}
for (const p of PEOPLE) await upsertAccount(p);
const counts = await seedDemoData(db);

console.log(`  ${counts.people} people, ${counts.projects} projects, ${counts.expenses} expenses`);
console.log('\nAccounts (all share the same password):');
for (const p of PEOPLE) console.log(`  ${p.role.padEnd(12)} ${p.email}  — ${p.title}`);
console.log(setPassword ? `\nPassword: ${password}` : '\nPasswords unchanged (reset without --password).');
process.exit(0);
