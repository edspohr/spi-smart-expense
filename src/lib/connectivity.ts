import { disableNetwork, enableNetwork, type Firestore } from 'firebase/firestore';
import { db } from './firebase';

// Single source of truth for "do we have network?": the browser's signal plus
// a simulated outage ("Simular sin señal", Ola 8) for demos and testing.
// While simulated, Firestore goes offline too, so the whole offline path runs
// exactly as in a site without coverage.

const KEY = 'eb.simulateOffline';
const listeners = new Set<() => void>();

let simulated = (() => {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

function emit() {
  for (const l of listeners) l();
}

export function isOnline(): boolean {
  return navigator.onLine && !simulated;
}

export function isSimulatingOffline(): boolean {
  return simulated;
}

export function subscribeConnectivity(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export async function setSimulateOffline(on: boolean): Promise<void> {
  simulated = on;
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  if (db) await (on ? disableNetwork(db as Firestore) : enableNetwork(db as Firestore));
  emit();
  // Coming back online fires the same event a real reconnection does, so the
  // offline queue sends itself.
  if (!on) window.dispatchEvent(new Event('online'));
}

/** Throws the same kind of error a real outage produces (queued by callers). */
export function assertOnline(): void {
  if (simulated) throw Object.assign(new Error('Sin conexión (simulada)'), { code: 'unavailable' });
}

// Restore a simulated outage that survived a reload of the tab.
if (simulated && db) void disableNetwork(db as Firestore);
