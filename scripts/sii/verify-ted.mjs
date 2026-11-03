#!/usr/bin/env node
// Verifies the TED of a receipt with the same code the app uses (Ola 10).
// Use it to check a new SII public key against a known-good receipt, or to
// see why a receipt failed.
//
//   node scripts/sii/verify-ted.mjs --image boleta.jpg [--keys functions/sii-keys]
//   node scripts/sii/verify-ted.mjs --xml ted.xml --keys 300.pem
//
// --keys is a folder of <IDK>.pem files or a single PEM (used for any IDK).
// Prints the IDK, the status and the reason. Nothing leaves the machine.
// Needs Node 22.18+ (imports the TypeScript verifier directly).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readBarcodes } from 'zxing-wasm/full';
import { pemBase64, verifyTed } from '../../functions/src/tedVerify.logic.ts';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const image = arg('image');
const xml = arg('xml');
const keysPath = resolve(arg('keys', 'functions/sii-keys'));
if (!image && !xml) {
  console.error('Usage: node scripts/sii/verify-ted.mjs (--image <file> | --xml <file>) [--keys <dir|pem>]');
  process.exit(1);
}

let rawTed;
if (xml) {
  rawTed = readFileSync(xml, 'latin1');
} else {
  const blob = new Blob([readFileSync(image)]);
  const results = await readBarcodes(blob, { formats: ['PDF417'], tryHarder: true });
  const hit = results.find((r) => r.text.includes('<TED'));
  if (!hit) {
    console.error('No PDF417 with a <TED> found in the image.');
    process.exit(2);
  }
  // Same as barcode.ts: keep each scanned byte as one char.
  rawTed = String.fromCharCode(...hit.bytes);
}

async function importPem(file) {
  return globalThis.crypto.subtle.importKey(
    'spki', Buffer.from(pemBase64(readFileSync(file, 'utf8')), 'base64'), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['verify'],
  );
}

const single = existsSync(keysPath) && statSync(keysPath).isFile();
const keys = {
  async getSiiPublicKey(idk) {
    if (single) return importPem(keysPath);
    const file = join(keysPath, `${idk}.pem`);
    return existsSync(file) ? importPem(file) : null;
  },
};

const { verification: v } = await verifyTed({ rawTed, readerVersion: 'cli', verifiedOn: 'device' }, keys);
console.log(JSON.stringify({
  status: v.status,
  reason: v.reason ?? null,
  idk: v.cafKeyId,
  issuerRut: v.issuerRut,
  docType: v.docType,
  folio: v.folio,
  cafRange: v.cafRange,
}, null, 2));
process.exit(v.status === 'verified' ? 0 : 3);
