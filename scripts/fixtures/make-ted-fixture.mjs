#!/usr/bin/env node
// Writes a synthetic, signed Chilean TED for manual tests (Ola 10):
//   <out>/ted-valid.png     PDF417 that verifies
//   <out>/ted-tampered.png  same TED with MNT changed → invalid_signature
//   <out>/<IDK>.pem         the fake SII public key that signs the CAF
//   <out>/teds.json         both XML payloads, amount and date
//
// Keys are generated on every run and are not real SII keys. To see a
// `verified` badge, copy <IDK>.pem into functions/sii-keys/ temporarily and
// remove it afterwards (never commit it).
//
// Usage: node scripts/fixtures/make-ted-fixture.mjs --out <dir> [--idk 900]
// Needs Node 22.18+ (imports the TypeScript fixture builder directly).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeBarcode } from 'zxing-wasm/full';
import { makeTedFixture } from '../../src/lib/localReader/__fixtures__/ted/makeTed.ts';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const out = arg('out');
if (!out) {
  console.error('Usage: node scripts/fixtures/make-ted-fixture.mjs --out <dir> [--idk 900]');
  process.exit(1);
}
const dir = resolve(out);
mkdirSync(dir, { recursive: true });

const idk = arg('idk', '900');
const good = await makeTedFixture({ idk, issuerName: 'CAÑÓN DEMO SPA' });
const tampered = good.ted.replace(`<MNT>${good.amount}</MNT>`, '<MNT>1</MNT>');

async function png(ted, file) {
  // Emitters print ISO-8859-1: one byte per char.
  const bytes = Uint8Array.from(ted, (c) => c.charCodeAt(0));
  const { image, error } = await writeBarcode(bytes, { format: 'PDF417', scale: 2 });
  if (!image) throw new Error(`PDF417: ${error}`);
  writeFileSync(join(dir, file), Buffer.from(await image.arrayBuffer()));
}

await png(good.ted, 'ted-valid.png');
await png(tampered, 'ted-tampered.png');

const spki = Buffer.from(await globalThis.crypto.subtle.exportKey('spki', good.siiPublicKey)).toString('base64');
const pem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
writeFileSync(join(dir, `${idk}.pem`), pem);
writeFileSync(join(dir, 'teds.json'), JSON.stringify({ good: good.ted, tampered, amount: good.amount, date: good.date }, null, 2));

console.log(`Wrote ted-valid.png, ted-tampered.png, ${idk}.pem and teds.json to ${dir}`);
console.log(`TED: folio ${good.folio}, ${good.date}, total ${good.amount}`);
