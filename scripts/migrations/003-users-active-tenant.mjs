// Adds the Ola 3 user fields to every users/{uid} doc that lacks them:
//   active: true, tenantId: <tenant>, managerUid: null
// Idempotent: existing values are never overwritten.
//
//   node scripts/migrations/003-users-active-tenant.mjs --dry-run            # emulators
//   node scripts/migrations/003-users-active-tenant.mjs --apply --prod       # production

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const prod = args.has('--prod');
const tenantId = process.env.TENANT_ID || 'spi';
if (!apply && !args.has('--dry-run')) {
  console.error('Pass --dry-run or --apply');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
if (!prod) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}
const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

if (prod) {
  const keyPath = path.join(root, 'scripts/serviceAccountKey.json');
  if (!existsSync(keyPath)) {
    console.error('Missing scripts/serviceAccountKey.json for --prod');
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  console.log(`Target: PRODUCTION ${sa.project_id} (tenant ${tenantId})`);
} else {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'spi-smart-expense' });
  console.log(`Target: emulators (tenant ${tenantId})`);
}

const db = getFirestore();
const snap = await db.collection('users').get();
let changed = 0;
for (const d of snap.docs) {
  const data = d.data();
  const patch = {};
  if (data.active === undefined) patch.active = true;
  if (data.tenantId === undefined) patch.tenantId = tenantId;
  if (data.managerUid === undefined) patch.managerUid = null;
  if (Object.keys(patch).length === 0) continue;
  changed++;
  console.log(`  ${apply ? '✓' : '→'} ${d.id} ${data.email ?? ''}: ${JSON.stringify(patch)}`);
  if (apply) await d.ref.set(patch, { merge: true });
}
console.log(`\n${apply ? 'Applied' : 'Would apply'}: ${changed} of ${snap.size} users`);
process.exit(0);
