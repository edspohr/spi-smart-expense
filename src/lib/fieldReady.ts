import { collection, doc, getDocFromServer, getDocsFromServer, query, where, type Firestore } from 'firebase/firestore';
import { db } from './firebase';
import { isOnline } from './connectivity';
import { OCR_BASE, OCR_CACHE, OCR_REQUIRED } from './localReader/assets';
import { merchantDictionaryInfo, refreshMerchantDictionary } from './localReader/dictionary';

// "Listo para terreno" (Ola 8): everything the phone needs to submit an
// expense with no signal, downloaded ahead of time — the reading engines,
// the merchant dictionary and the data the form loads (cost centers,
// profile, own expenses) into Firestore's offline cache.

const KEY = 'eb.fieldReady.v1';
const STALE_MS = 12 * 3_600_000;

export interface FieldReadyStatus {
  readyAt: string | null;
  engines: boolean;
  dictionary: number;
  projects: number;
}

export function getFieldReady(): FieldReadyStatus {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...(JSON.parse(raw) as FieldReadyStatus), dictionary: merchantDictionaryInfo().count };
  } catch {
    /* ignore */
  }
  return { readyAt: null, engines: false, dictionary: merchantDictionaryInfo().count, projects: 0 };
}

export function isFieldReadyStale(status = getFieldReady()): boolean {
  return !status.readyAt || Date.now() - new Date(status.readyAt).getTime() > STALE_MS;
}

/** True when the reading engines are in the offline cache (service worker). */
export async function enginesCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(OCR_CACHE);
    const hits = await Promise.all(OCR_REQUIRED.map((url) => cache.match(url)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

/**
 * Downloads and warms everything. Each step is independent: a failure in one
 * (e.g. the dictionary callable) does not stop the others.
 */
export async function prepareForField(uid: string, onStep?: (label: string) => void): Promise<FieldReadyStatus> {
  if (!isOnline()) throw Object.assign(new Error('Necesitas conexión para preparar la app.'), { code: 'unavailable' });
  const status: FieldReadyStatus = { ...getFieldReady(), engines: false };

  onStep?.('Descargando el lector de boletas…');
  try {
    // Written straight into the cache the service worker serves them from
    // (CacheFirst), so it works even before the worker controls the page.
    const cache = typeof caches !== 'undefined' ? await caches.open(OCR_CACHE) : null;
    await Promise.all(
      OCR_REQUIRED.map(async (url) => {
        const r = await fetch(url, { cache: 'reload' });
        if (!r.ok) throw new Error(url);
        await cache?.put(url, r);
      }),
    );
    // Workbox's expiration does not track these entries: drop older engine versions here.
    for (const req of (await cache?.keys()) ?? []) {
      if (!new URL(req.url).pathname.startsWith(`${OCR_BASE}/`)) await cache!.delete(req);
    }
    const [{ warmUpBarcodeReader }, { warmUpOcr }] = await Promise.all([import('./localReader/barcode'), import('./localReader/ocr')]);
    await Promise.all([warmUpBarcodeReader(), warmUpOcr()]);
    status.engines = true;
  } catch (err) {
    console.warn('[fieldReady] engines', err);
  }

  onStep?.('Actualizando comercios conocidos…');
  try {
    status.dictionary = await refreshMerchantDictionary();
  } catch (err) {
    console.warn('[fieldReady] dictionary', err);
  }

  onStep?.('Guardando centros de costo y tu perfil…');
  try {
    const store = db as Firestore;
    const [projects] = await Promise.all([
      getDocsFromServer(query(collection(store, 'projects'), where('status', '!=', 'deleted'))),
      getDocFromServer(doc(store, 'users', uid)),
      getDocsFromServer(query(collection(store, 'expenses'), where('userId', '==', uid))),
    ]);
    status.projects = projects.size;
  } catch (err) {
    console.warn('[fieldReady] data', err);
  }

  status.readyAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(status));
  } catch {
    /* ignore */
  }
  return status;
}
