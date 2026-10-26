// Promotes (or creates) the first superadmin of a tenant by email. After that,
// superadmins manage everyone else from /admin/users.
//
//   node scripts/bootstrap-superadmin.mjs --email edmundo@spohr.cl --dry-run           # emulators
//   node scripts/bootstrap-superadmin.mjs --email edmundo@spohr.cl --apply --prod      # production
//   node scripts/bootstrap-superadmin.mjs --email x --apply --prod --project expense-buddy-demo --tenant demo
//
// --prod uses scripts/serviceAccountKey.json (never committed), or your gcloud
// Application Default Credentials when --project is given. If the email
// has no Auth account yet, --apply creates it and prints a one-time
// password-setup link instead of a password.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : undefined;
};
const apply = args.includes('--apply');
const prod = args.includes('--prod');
const email = (opt('--email') ?? '').trim().toLowerCase();
const tenantId = opt('--tenant') ?? process.env.TENANT_ID ?? 'spi';
if (!email || (!apply && !args.includes('--dry-run'))) {
  console.error('Usage: --email <email> (--dry-run | --apply) [--prod] [--tenant spi]');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!prod) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}
const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

const projectOpt = opt('--project');
if (prod && projectOpt) {
  initializeApp({ credential: applicationDefault(), projectId: projectOpt });
  console.log(`Target: PRODUCTION ${projectOpt} (gcloud ADC)`);
} else if (prod) {
  const keyPath = path.join(root, 'scripts/serviceAccountKey.json');
  if (!existsSync(keyPath)) {
    console.error('Missing scripts/serviceAccountKey.json for --prod');
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  console.log(`Target: PRODUCTION ${sa.project_id}`);
} else {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'spi-smart-expense' });
  console.log('Target: emulators');
}

const auth = getAuth();
const db = getFirestore();

let user;
try {
  user = await auth.getUserByEmail(email);
} catch {
  console.log(`  ${email} has no Auth account.`);
  if (!apply) process.exit(0);
  user = await auth.createUser({ email, password: randomBytes(24).toString('base64url') });
  console.log(`  ✓ created Auth account ${user.uid}`);
  console.log(`  Password setup link (single use): ${await auth.generatePasswordResetLink(email)}`);
}

const ref = db.doc(`users/${user.uid}`);
const snap = await ref.get();
const current = snap.data() ?? {};
if (current.role === 'superadmin' && current.active !== false) {
  console.log(`  = ${email} is already an active superadmin`);
  process.exit(0);
}
console.log(`  ${apply ? '✓' : '→'} ${email} (${user.uid}): ${current.role ?? 'no doc'} → superadmin`);
if (apply) {
  await ref.set(
    {
      uid: user.uid,
      email,
      displayName: current.displayName || user.displayName || email.split('@')[0],
      role: 'superadmin',
      active: true,
      tenantId,
      balance: current.balance ?? 0,
    },
    { merge: true },
  );
  console.log('  Claims follow via the onUserWritten trigger (functions must be deployed / emulated).');
}
process.exit(0);
