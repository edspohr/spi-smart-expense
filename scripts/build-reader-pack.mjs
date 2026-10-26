// Builds the reader pack (Ola 8c, ADR 0016) from the learning hub: sums the
// latest issuer snapshot of every environment and keeps, per issuer, the
// label of the total with enough votes and a clear majority. The pack ships
// in every build (src/lib/localReader/pack/reader-pack.json); the tenant's
// own learning (merchant dictionary) still wins over it on the device.
//
//   npm run pack:build -- --project <hub-project>     # gcloud ADC
//   npm run pack:build -- --emulator --project <id>   # hub in the emulators
//   add --dry-run to print the result without writing the file
//
// Review the diff and commit it like any other code change.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { aggregateIssuers } = require('../functions/lib/learning.logic.js');
const { learnedAmountLabel } = require('../functions/lib/offline.logic.js');

const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(n);
  return i > -1 ? args[i + 1] : undefined;
};
const projectId = opt('--project');
if (!projectId) {
  console.error('Usage: npm run pack:build -- --project <hub-project> [--emulator] [--dry-run]');
  process.exit(1);
}
if (args.includes('--emulator')) process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

// Pack thresholds are stricter than a tenant's own (2 votes): the pack
// applies to every client.
const MIN_VOTES = Number(opt('--min-votes') ?? 3);
const MIN_SHARE = 0.7;

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId });

const snap = await getFirestore().collection('envIssuers').get();
const votes = aggregateIssuers(snap.docs.map((d) => d.data().issuers ?? []));
const issuers = {};
for (const [issuer, labels] of Object.entries(votes).sort(([a], [b]) => a.localeCompare(b))) {
  const amountLabel = learnedAmountLabel(labels, MIN_VOTES, MIN_SHARE);
  if (amountLabel) issuers[issuer] = { amountLabel };
}
const builtAt = new Date().toISOString();
const pack = { version: builtAt.slice(0, 10), builtAt, environments: snap.size, issuers };

console.log(`${snap.size} environments · ${Object.keys(votes).length} issuers seen · ${Object.keys(issuers).length} in the pack`);
if (args.includes('--dry-run')) {
  console.log(JSON.stringify(pack, null, 2));
} else {
  writeFileSync(new URL('../src/lib/localReader/pack/reader-pack.json', import.meta.url), JSON.stringify(pack, null, 2) + '\n');
  console.log('Wrote src/lib/localReader/pack/reader-pack.json — bump READER_VERSION if the rules changed too.');
}
