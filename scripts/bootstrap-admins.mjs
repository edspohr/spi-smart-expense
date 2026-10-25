// Promotes the tenant's bootstrap admins (tenants/<id>.json →
// auth.bootstrapAdminEmails) to role admin. Replaces the former client-side
// auto-promotion on first login, which security rules no longer allow.
//
//   node scripts/bootstrap-admins.mjs --tenant spi --dry-run        # emulators
//   node scripts/bootstrap-admins.mjs --tenant spi --apply --prod   # production

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : fallback;
};
const apply = flag('--apply');
const prod = flag('--prod');
const tenantId = opt('--tenant', 'spi');
if (!apply && !flag('--dry-run')) {
  console.error('Pass --dry-run or --apply');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tenant = JSON.parse(readFileSync(path.join(root, 'tenants', `${tenantId}.json`), 'utf8'));
const emails = (tenant.auth?.bootstrapAdminEmails ?? []).map((e) => e.toLowerCase());
if (emails.length === 0) {
  console.log(`Tenant ${tenantId} has no bootstrapAdminEmails; nothing to do.`);
  process.exit(0);
}

if (!prod) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}
const { initializeApp, cert } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

if (prod) {
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

for (const email of emails) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    console.log(`  ? ${email}: no Auth account yet — will be promoted once they sign up (re-run then)`);
    continue;
  }
  const ref = db.doc(`users/${user.uid}`);
  const snap = await ref.get();
  const role = snap.data()?.role;
  if (role === 'admin' || role === 'superadmin') {
    console.log(`  = ${email} already ${role}`);
    continue;
  }
  console.log(`  ${apply ? '✓' : '→'} ${email} (${user.uid}): ${role ?? 'no doc'} → admin`);
  if (apply) {
    await ref.set(
      { uid: user.uid, email, displayName: snap.data()?.displayName || user.displayName || email.split('@')[0], role: 'admin', balance: snap.data()?.balance ?? 0 },
      { merge: true },
    );
  }
}
process.exit(0);
