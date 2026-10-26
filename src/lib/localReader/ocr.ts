import { OCR_ASSET_URLS } from './assets';

// On-device OCR with tesseract.js (WebAssembly, Spanish model). The engine
// runs in its own Web Worker and is created once, lazily; its files come
// from our origin so the service worker can serve them offline.

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>;
let worker: Promise<TesseractWorker> | null = null;

function getWorker(): Promise<TesseractWorker> {
  worker ??= import('tesseract.js').then(({ createWorker }) =>
    createWorker('spa', 1, {
      workerPath: OCR_ASSET_URLS.worker,
      corePath: OCR_ASSET_URLS.core,
      langPath: OCR_ASSET_URLS.langDir,
      gzip: true,
      // Load the worker from its URL (not a blob) so the service worker caches it.
      workerBlobURL: false,
    }),
  );
  worker.catch(() => {
    worker = null; // retry on the next call
  });
  return worker;
}

/** Creates the OCR engine ahead of time (used by "Listo para terreno"). */
export async function warmUpOcr(): Promise<void> {
  await getWorker();
}

/**
 * Grey-scales, stretches contrast and limits the width of the photo: thermal
 * receipts read noticeably better and faster this way.
 */
async function preprocess(image: Blob, maxWidth = 1600): Promise<HTMLCanvasElement | Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return image;
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return image;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) | 0;
    d[i] = d[i + 1] = d[i + 2] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i]! - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function recognizeText(image: Blob): Promise<{ text: string; confidence: number }> {
  const [w, input] = await Promise.all([getWorker(), preprocess(image)]);
  const { data } = await w.recognize(input);
  return { text: data.text ?? '', confidence: data.confidence ?? 0 };
}
