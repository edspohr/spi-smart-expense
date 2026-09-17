#!/usr/bin/env node
/**
 * Lists every user that will have READ access to /receipts/* after the
 * hardened storage.rules deployment. A user gets read access if their
 * Firestore doc has role == 'admin' OR permissions.canApprove == true.
 *
 * Run: node scripts/verifyStorageRuleAccess.cjs
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const keyPath = path.resolve(__dirname, 'serviceAccountKey.json');
initializeApp({ credential: cert(require(keyPath)) });

(async () => {
  const db = getFirestore();
  const snap = await db.collection('users').get();

  const admins = [];
  const approvers = [];
  const owners = [];
  const noRole = [];

  snap.docs.forEach((d) => {
    const u = d.data();
    const email = u.email || '(sin email)';
    const role = u.role || '(sin role)';
    const canApprove = u.permissions?.canApprove === true;
    if (role === 'admin') admins.push({ email, uid: d.id });
    else if (canApprove) approvers.push({ email, uid: d.id, role });
    else owners.push({ email, uid: d.id, role });
    if (!u.role) noRole.push({ email, uid: d.id });
  });

  console.log(`\n=== Storage rule access audit (${snap.size} users) ===\n`);

  console.log(`ADMINS (${admins.length}) — full read of all receipts:`);
  admins.forEach((u) => console.log(`  • ${u.email}  [${u.uid}]`));

  console.log(`\nEXPLICIT APPROVERS (${approvers.length}) — permissions.canApprove == true, non-admin:`);
  if (approvers.length === 0) console.log('  (none)');
  approvers.forEach((u) => console.log(`  • ${u.email}  role=${u.role}  [${u.uid}]`));

  console.log(`\nOWNERS ONLY (${owners.length}) — can only read their own receipts:`);
  owners.slice(0, 5).forEach((u) => console.log(`  • ${u.email}  role=${u.role}`));
  if (owners.length > 5) console.log(`  ... and ${owners.length - 5} more`);

  if (noRole.length > 0) {
    console.log(`\n⚠ USERS WITHOUT role FIELD (${noRole.length}):`);
    noRole.forEach((u) => console.log(`  • ${u.email}  [${u.uid}]`));
    console.log('  These users default to "professional" in permissions.js — they cannot read others\' receipts.');
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
