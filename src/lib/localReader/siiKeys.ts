// Ola 10: SII public-key registry for the browser.
//
// Each real key lives in `functions/sii-keys/<IDK>.pem`, shared with the
// server (functions/src/fiscal.ts). The glob below pulls every
// file at build time (Vite inlines the strings), so this module ships with
// nothing extra over its PEM payload — the first verifyTed() with a given
// IDK imports and caches the CryptoKey.
//
// When the registry is empty (no PEMs committed yet, as during Ola 10
// kickoff), every TED check returns status 'error' with "clave SII no
// disponible". That is the designed fail-safe: the UI shows "verificación
// pendiente" and the server retries on sync once keys land.

import type { TedKeyProvider } from '../../../functions/src/tedVerify.logic';

const pemModules = import.meta.glob('../../../functions/sii-keys/*.pem', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const pemByIdk: Record<string, string> = {};
for (const [path, pem] of Object.entries(pemModules)) {
  const match = path.match(/\/(\d+)\.pem$/);
  if (match) pemByIdk[match[1]!] = pem;
}

const keyCache = new Map<string, Promise<CryptoKey | null>>();

async function loadKey(pem: string): Promise<CryptoKey | null> {
  try {
    const b64 = pem
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');
    const der = base64ToBytes(b64);
    return await globalThis.crypto.subtle.importKey(
      'spki',
      der.buffer as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
      false,
      ['verify'],
    );
  } catch (err) {
    console.warn('[siiKeys] no se pudo importar PEM del SII', err);
    return null;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const siiKeyProvider: TedKeyProvider = {
  async getSiiPublicKey(idk: string): Promise<CryptoKey | null> {
    const pem = pemByIdk[idk];
    if (!pem) return null;
    let pending = keyCache.get(idk);
    if (!pending) {
      pending = loadKey(pem);
      keyCache.set(idk, pending);
    }
    return pending;
  },
};

/** Returns the IDKs for which a public key is currently shipped. */
export function siiKeyIdks(): string[] {
  return Object.keys(pemByIdk).sort();
}
