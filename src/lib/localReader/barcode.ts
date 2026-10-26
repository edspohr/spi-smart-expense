import { OCR_ASSET_URLS } from './assets';
import { scanTaxBarcode, type Pixels } from './barcodeScan';
import type { BarcodeData } from './types';

// Decodes PDF417 (Chilean TED) and QR (DIAN) codes from a receipt photo with
// zxing-wasm, entirely on the device. The WebAssembly is loaded lazily from
// our own origin.

type ZXingReader = typeof import('zxing-wasm/reader');
let reader: Promise<ZXingReader> | null = null;

function loadReader(): Promise<ZXingReader> {
  reader ??= import('zxing-wasm/reader').then((m) => {
    m.prepareZXingModule({
      overrides: { locateFile: (path: string) => (path.endsWith('.wasm') ? OCR_ASSET_URLS.zxing : path) },
      fireImmediately: true,
    });
    return m;
  });
  return reader;
}

/** Loads the decoder ahead of time (used by "Listo para terreno"). */
export async function warmUpBarcodeReader(): Promise<void> {
  const m = await loadReader();
  await m.getZXingModule();
}

const MAX_SIDE = 1800;

async function toPixels(image: Blob): Promise<Pixels> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height);
}

export async function decodeTaxBarcode(image: Blob): Promise<BarcodeData | null> {
  const { readBarcodes } = await loadReader();
  const pixels = await toPixels(image);
  return scanTaxBarcode(pixels, async (img) => {
    const results = await readBarcodes(img as ImageData, { formats: ['PDF417', 'QRCode'], tryHarder: true, maxNumberOfSymbols: 4 });
    return results.map((r) => r.text).filter(Boolean);
  });
}
