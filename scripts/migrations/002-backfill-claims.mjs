// Backfills custom claims for every users/{uid} document using the same
// derivation as the onUserWritten trigger (functions/src/claims.logic.ts).
//
// Usage:
//   npm run functions:build                      # claims.logic must be compiled
//   node scripts/migrations/002-backfill-claims.mjs --dry-run            # emulator
//   node scripts/migrations/002-backfill-claims.mjs --apply --prod        # production
//
// --prod uses scripts/serviceAccountKey.json (never committed). Without it the
// script targets the local emulators and refuses to touch production.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');
const { claimsFromUserDoc, claimsEqual } = await import(path.join(root, 'functions/lib/claims.logic.js'));

if (prod) {
  const keyPath = path.join(root, 'scripts/serviceAccountKey.json');
  if (!existsSync(keyPath)) {
    console.error('Missing scripts/serviceAccountKey.json for --prod');
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  console.log(`Target: PRODUCTION project ${sa.project_id} (tenant ${tenantId})`);
} else {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'spi-smart-expense' });
  console.log(`Target: emulators (tenant ${tenantId})`);
}

const auth = getAuth();
const db = getFirestore();
const snap = await db.collection('users').get();
let changed = 0;
let skipped = 0;
let missing = 0;

for (const docSnap of snap.docs) {
  const uid = docSnap.id;
  const desired = claimsFromUserDoc(docSnap.data(), tenantId);
  let current;
  try {
    current = (await auth.getUser(uid)).customClaims;
  } catch {
    missing++;
    console.log(`  ? ${uid} (${docSnap.data().email ?? 'no email'}) has no Auth account — skipped`);
    continue;
  }
  if (claimsEqual(current, desired)) {
    skipped++;
    continue;
  }
  changed++;
  console.log(`  ${apply ? '✓' : '→'} ${uid} ${docSnap.data().email ?? ''}: ${JSON.stringify(current ?? {})} → ${JSON.stringify(desired)}`);
  if (apply) await auth.setCustomUserClaims(uid, desired);
}

console.log(`\n${apply ? 'Applied' : 'Would apply'}: ${changed} · unchanged: ${skipped} · no auth account: ${missing}`);
process.exit(0);
