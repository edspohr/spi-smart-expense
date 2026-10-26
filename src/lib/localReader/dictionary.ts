import { callFunction } from '../functions';
import type { MerchantDictionary } from './merge';

// The tenant's merchant dictionary (tax id → merchant name and category),
// built server-side from approved expenses and cached on the device so the
// offline reader can name the merchant and pick the category.

const KEY = 'eb.merchantDictionary.v1';

interface Stored {
  updatedAt: string;
  entries: MerchantDictionary;
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export function getMerchantDictionary(): MerchantDictionary {
  return read()?.entries ?? {};
}

export function merchantDictionaryInfo(): { count: number; updatedAt: string | null } {
  const s = read();
  return { count: s ? Object.keys(s.entries).length : 0, updatedAt: s?.updatedAt ?? null };
}

export async function refreshMerchantDictionary(): Promise<number> {
  const { entries } = await callFunction<Record<string, never>, { entries: MerchantDictionary }>('getMerchantDictionary', {});
  try {
    localStorage.setItem(KEY, JSON.stringify({ updatedAt: new Date().toISOString(), entries }));
  } catch {
    /* storage full or blocked: the reader still works without names */
  }
  return Object.keys(entries).length;
}
