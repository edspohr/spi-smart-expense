import { useSyncExternalStore } from 'react';
import { callFunction } from './functions';

// Per-action PIN (functions/src/pin.ts). The server decides when it is
// required; the client only reacts: withPin() runs a callable, and when the
// server answers details.pin = required | invalid it opens the global
// <PinPrompt/> and retries. A verified PIN is remembered in memory for two
// minutes so a burst of approvals asks once.

export type PinAction = 'approve' | 'reject' | 'delete' | 'export' | 'users' | 'settings';

interface PromptState {
  open: boolean;
  reason: string;
  error?: string;
  resolve?: (pin: string | null) => void;
}

let state: PromptState = { open: false, reason: '' };
let pending: Promise<string | null> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const peekPinPrompt = (): PromptState => state;

export function usePinPrompt(): PromptState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// Concurrent calls (bulk approvals) share one prompt.
function requestPin(reason: string, error?: string): Promise<string | null> {
  if (pending && !error) return pending;
  pending = new Promise((resolve) => {
    state = {
      open: true,
      reason,
      error,
      resolve: (pin) => {
        state = { open: false, reason: '' };
        pending = null;
        emit();
        resolve(pin);
      },
    };
    emit();
  });
  return pending;
}

const CACHE_MS = 2 * 60_000;
let cached: { pin: string; at: number } | null = null;
const freshCache = () => (cached && Date.now() - cached.at < CACHE_MS ? cached.pin : undefined);
export const forgetPin = () => {
  cached = null;
};

type PinState = 'required' | 'invalid' | 'locked' | 'disabled' | 'unset';
export const pinStateOf = (e: unknown): PinState | undefined =>
  (e as { details?: { pin?: PinState } })?.details?.pin;

export class PinCancelled extends Error {
  constructor() {
    super('Acción cancelada: no se ingresó el PIN.');
  }
}

export async function withPin<T>(reason: string, call: (pin?: string) => Promise<T>): Promise<T> {
  let pin = freshCache();
  let error: string | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const result = await call(pin);
      if (pin) cached = { pin, at: Date.now() };
      return result;
    } catch (e) {
      const s = pinStateOf(e);
      if (s !== 'required' && s !== 'invalid') {
        if (s) cached = null;
        throw e;
      }
      if (s === 'invalid') {
        cached = null;
        error = (e as Error).message;
      }
      const entered = await requestPin(reason, error);
      if (!entered) throw new PinCancelled();
      pin = entered;
    }
  }
  throw new Error('Demasiados intentos de PIN.');
}

// For actions that run in the browser (exports): the server verifies the PIN
// when the tenant protects the action, otherwise it answers ok immediately.
export function confirmPin(action: PinAction, reason: string, ref?: string): Promise<void> {
  return withPin(reason, (pin) => callFunction('verifyPin', { action, ref, pin })).then(() => undefined);
}

// Mirrors functions/src/pin.logic.ts — the server checks the version.
export const RESPONSIBILITY_VERSION = 'v1-2026-10-25';
export const RESPONSIBILITY_TEXT =
  'Declaro que este PIN es personal e intransferible y que todo lo que se autorice con mi cuenta y mi PIN es de mi plena responsabilidad.';

export async function setOwnPin(pin: string): Promise<void> {
  await callFunction('setOwnPin', { pin, accept: true, version: RESPONSIBILITY_VERSION });
  cached = { pin, at: Date.now() };
}

export function resetUserPin(uid: string): Promise<{ ok: boolean }> {
  return withPin('restablecer el PIN de otra persona', (pin) => callFunction('adminResetPin', { uid, pin }));
}

export interface PinLogEntry {
  id: string;
  uid: string;
  userName: string;
  action: string;
  ok: boolean;
  reason: string | null;
  ref: string | null;
  at: string;
}

export async function listPinLog(): Promise<PinLogEntry[]> {
  return (await callFunction<Record<string, never>, { entries: PinLogEntry[] }>('adminListPinLog', {})).entries;
}

// Exports run in the browser; when the tenant protects them, confirm the PIN
// with the server first. Returns false if the person cancelled.
export async function ensureExportAllowed(security: { pinEnabled: boolean; pinActions: Record<PinAction, boolean> }): Promise<boolean> {
  if (!security.pinEnabled || !security.pinActions.export) return true;
  try {
    await confirmPin('export', 'exportar el reporte');
    return true;
  } catch (e) {
    if (e instanceof PinCancelled) return false;
    throw e;
  }
}
