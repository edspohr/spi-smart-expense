// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { createWorker, type Worker } from 'tesseract.js';
import { PNG } from 'pngjs';
import { scanTaxBarcode } from './barcodeScan';
import { extractFromText, type CountryCode } from './rules';
import { mergeLocalRead } from './merge';
import type { BarcodeData, LocalFields } from './types';

// Accuracy of the on-device reader over the receipt corpus (Ola 8): the same
// engines (zxing-wasm, tesseract.js + spa) and the same pure rules the
// browser uses. Synthetic receipts come from
// scripts/fixtures/make-receipt-fixtures.py; real anonymised receipts are
// added to the same folder with their entries in expected.json.

interface Case {
  file: string;
  country: CountryCode;
  kind: 'ted' | 'dian' | 'paper';
  expect: Partial<Record<'amount' | 'date' | 'taxId' | 'invoiceNumber' | 'merchant', string | number>>;
}

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(__dirname, '__fixtures__/receipts');
const CASES: Case[] = JSON.parse(readFileSync(path.join(DIR, 'expected.json'), 'utf8'));
const TODAY = new Date('2026-10-26T12:00:00Z');

let worker: Worker;

beforeAll(async () => {
  prepareZXingModule({
    overrides: { wasmBinary: readFileSync(path.join(ROOT, 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')).buffer as ArrayBuffer },
    fireImmediately: true,
  });
  worker = await createWorker('spa', 1, {
    langPath: path.join(ROOT, 'node_modules/@tesseract.js-data/spa/4.0.0_best_int'),
    gzip: true,
    cacheMethod: 'none',
  });
}, 60_000);

afterAll(async () => {
  await worker?.terminate();
});

async function read(c: Case) {
  const bytes = readFileSync(path.join(DIR, c.file));
  const png = PNG.sync.read(bytes);
  const pixels = { data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), width: png.width, height: png.height };
  const barcode: BarcodeData | null = await scanTaxBarcode(pixels, async (img) =>
    (await readBarcodes(img as unknown as ImageData, { formats: ['PDF417', 'QRCode'], tryHarder: true, maxNumberOfSymbols: 4 })).map((r) => r.text).filter(Boolean),
  );
  let ocrText = '';
  let ocrFields: LocalFields = {};
  if (!barcode) {
    ocrText = (await worker.recognize(bytes)).data.text;
    ocrFields = extractFromText(ocrText, { country: c.country, baseCurrency: c.country === 'CL' ? 'CLP' : 'COP', today: TODAY });
  }
  return mergeLocalRead({ barcode, ocrFields, ocrText, dictionary: {}, categories: [], baseCurrency: 'CLP', durationMs: 0 });
}

const norm = (k: string, v: unknown) =>
  v === undefined || v === null ? null : k === 'taxId' ? String(v).replace(/[.\s-]/g, '').toUpperCase() : k === 'amount' ? Number(v) : String(v).replace(/^0+/, '');

describe('on-device reader corpus', () => {
  it('meets the accuracy thresholds', async () => {
    const hits: Record<string, { ok: number; total: number }> = {};
    const misses: string[] = [];
    for (const c of CASES) {
      const r = await read(c);
      if (c.kind !== 'paper') expect(r.barcode, `${c.file}: barcode not decoded`).not.toBeNull();
      for (const [k, want] of Object.entries(c.expect)) {
        const got = (r.fields as Record<string, { value: unknown } | undefined>)[k]?.value;
        const bucket = `${c.kind === 'paper' ? 'ocr' : 'barcode'}.${k}`;
        hits[bucket] ??= { ok: 0, total: 0 };
        hits[bucket].total += 1;
        if (norm(k, got) === norm(k, want)) hits[bucket].ok += 1;
        else misses.push(`${c.file} ${k}: want ${want}, got ${got ?? '—'}`);
      }
    }
    console.info('[corpus]', Object.entries(hits).map(([k, v]) => `${k} ${v.ok}/${v.total}`).join(' · '));
    if (misses.length) console.info('[corpus] misses:\n  ' + misses.join('\n  '));

    // Barcodes are exact; OCR thresholds are the Ola 8 acceptance bar.
    for (const [k, v] of Object.entries(hits)) {
      if (k.startsWith('barcode.')) expect(v.ok, k).toBe(v.total);
    }
    for (const k of ['ocr.amount', 'ocr.date']) {
      if (hits[k]) expect(hits[k].ok / hits[k].total, k).toBeGreaterThanOrEqual(0.9);
    }
  }, 120_000);
});
