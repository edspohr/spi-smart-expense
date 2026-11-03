import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ db: {} }));
vi.mock('./localReader/dictionary', () => ({ merchantDictionaryInfo: () => ({ count: 0 }), refreshMerchantDictionary: vi.fn() }));

const { shouldAutoPrepare } = await import('./fieldReady');

const never = { readyAt: null, engines: false, dictionary: 0, projects: 0 };
const fresh = { readyAt: new Date().toISOString(), engines: true, dictionary: 3, projects: 2 };
const old = { ...fresh, readyAt: new Date(Date.now() - 13 * 3_600_000).toISOString() };
const base = { localReader: true, signedIn: true, online: true, installed: true, metered: false, status: never };

describe('shouldAutoPrepare', () => {
  it('prepares the installed app the first time it opens with a session', () => {
    expect(shouldAutoPrepare(base)).toBe('first');
  });

  it('never downloads unasked in a browser tab', () => {
    expect(shouldAutoPrepare({ ...base, installed: false })).toBeNull();
  });

  it('waits for wifi before the first download when the phone reports mobile data', () => {
    expect(shouldAutoPrepare({ ...base, metered: true })).toBeNull();
  });

  it('retries the first download when the engines did not land', () => {
    expect(shouldAutoPrepare({ ...base, status: { ...fresh, engines: false } })).toBe('first');
  });

  it('refreshes a kit older than 12 h, installed or not', () => {
    expect(shouldAutoPrepare({ ...base, installed: false, status: old })).toBe('refresh');
    expect(shouldAutoPrepare({ ...base, status: fresh })).toBeNull();
  });

  it('does nothing when the tenant has the reader off, offline or signed out', () => {
    expect(shouldAutoPrepare({ ...base, localReader: false })).toBeNull();
    expect(shouldAutoPrepare({ ...base, online: false })).toBeNull();
    expect(shouldAutoPrepare({ ...base, signedIn: false })).toBeNull();
  });
});
