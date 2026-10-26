// Versioned paths of the on-device reading engines (vite.config.js,
// ocrAssetsPlugin). Served from our own origin and cached by the service
// worker ("ocr-assets") so they work offline.
declare const __OCR_BASE__: string;

export const OCR_BASE: string = typeof __OCR_BASE__ === 'string' ? __OCR_BASE__ : '/ocr/dev';

export const OCR_ASSET_URLS = {
  worker: `${OCR_BASE}/worker.min.js`,
  core: `${OCR_BASE}/tesseract-core-lstm.wasm.js`,
  langDir: `${OCR_BASE}/lang`,
  lang: `${OCR_BASE}/lang/spa.traineddata.gz`,
  zxing: `${OCR_BASE}/zxing_reader.wasm`,
};

/** Every file the reader needs offline (for "Listo para terreno"). */
export const OCR_REQUIRED = [OCR_ASSET_URLS.worker, OCR_ASSET_URLS.core, OCR_ASSET_URLS.lang, OCR_ASSET_URLS.zxing];

/** Cache the service worker serves these from (same name as in vite.config.js). */
export const OCR_CACHE = 'ocr-assets';
