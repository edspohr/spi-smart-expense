// Pure PIN rules (ported from Comandas functions/src/pin.ts): format, weak
// PIN detection, hashing and the lockout state machine. No Firebase imports.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const RESPONSIBILITY_VERSION = 'v1-2026-10-25';
export const RESPONSIBILITY_TEXT =
  'Declaro que este PIN es personal e intransferible y que todo lo que se autorice con mi cuenta y mi PIN es de mi plena responsabilidad.';

export const LOCK_AT = 5;
export const DISABLE_AT = 10;
export const LOCK_MS = 15 * 60_000;
const PIN_RE = /^\d{4}$/;

export type PinAction = 'approve' | 'reject' | 'delete' | 'export' | 'users' | 'settings';
export const PIN_ACTIONS: readonly PinAction[] = ['approve', 'reject', 'delete', 'export', 'users', 'settings'];

export class PinFormatError extends Error {}

export function validatePin(pin: string): void {
  if (!PIN_RE.test(pin)) throw new PinFormatError('El PIN debe tener 4 dígitos.');
  const obvious =
    /^(\d)\1{3}$/.test(pin) ||
    '0123456789'.includes(pin) ||
    '9876543210'.includes(pin) ||
    /^(19|20)\d\d$/.test(pin) ||
    ['1212', '1122', '2580', '0852'].includes(pin);
  if (obvious) throw new PinFormatError('Ese PIN es muy fácil de adivinar. Elige otro (no repetido, correlativo ni un año).');
}

export function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString('base64');
}

export function newPinRecord(pin: string, now: number) {
  const salt = randomBytes(16).toString('base64');
  return { hash: hashPin(pin, salt), salt, setAt: now, failed: 0, lockedUntil: 0, disabled: false };
}

export interface PinRecord {
  hash: string;
  salt: string;
  setAt: number;
  failed?: number;
  lockedUntil?: number;
  disabled?: boolean;
}

export type PinOutcome =
  | { status: 'ok'; update: Partial<PinRecord> | null }
  | { status: 'disabled'; update: null }
  | { status: 'locked'; minutesLeft: number; update: null }
  | { status: 'invalid'; remaining: number; update: Partial<PinRecord> }
  | { status: 'locked-now'; update: Partial<PinRecord> }
  | { status: 'disabled-now'; update: Partial<PinRecord> };

export function evaluateAttempt(record: PinRecord, pin: string, now: number): PinOutcome {
  if (record.disabled) return { status: 'disabled', update: null };
  if ((record.lockedUntil ?? 0) > now) {
    return { status: 'locked', minutesLeft: Math.ceil(((record.lockedUntil ?? 0) - now) / 60_000), update: null };
  }
  const ok = PIN_RE.test(pin) && timingSafeEqual(Buffer.from(hashPin(pin, record.salt)), Buffer.from(record.hash));
  if (ok) return { status: 'ok', update: record.failed ? { failed: 0, lockedUntil: 0 } : null };

  const failed = (record.failed ?? 0) + 1;
  if (failed >= DISABLE_AT) return { status: 'disabled-now', update: { failed, lockedUntil: 0, disabled: true } };
  if (failed >= LOCK_AT) return { status: 'locked-now', update: { failed, lockedUntil: now + LOCK_MS } };
  return { status: 'invalid', remaining: LOCK_AT - failed, update: { failed } };
}

export interface PinPolicy {
  pinEnabled: boolean;
  pinApprovalThreshold: number | null;
  pinActions: Record<PinAction, boolean>;
}

export function pinPolicyFrom(settingsDoc: Record<string, unknown> | undefined): PinPolicy {
  const security = (settingsDoc?.security ?? {}) as Record<string, unknown>;
  const actions = (security.pinActions ?? {}) as Record<string, unknown>;
  const threshold = security.pinApprovalThreshold;
  return {
    pinEnabled: security.pinEnabled === true,
    pinApprovalThreshold: typeof threshold === 'number' && threshold >= 0 ? threshold : null,
    pinActions: Object.fromEntries(PIN_ACTIONS.map((a) => [a, actions[a] !== false])) as Record<PinAction, boolean>,
  };
}

// Whether `action` needs a PIN under `policy`. `amount` is the expense amount
// in the tenant base currency, or null when unknown (foreign currency without
// a rate) — unknown amounts are treated as above any threshold.
export function pinRequired(policy: PinPolicy, action: PinAction, amount?: number | null): boolean {
  if (!policy.pinEnabled || !policy.pinActions[action]) return false;
  if ((action === 'approve' || action === 'reject') && policy.pinApprovalThreshold !== null && amount !== null && amount !== undefined) {
    return amount >= policy.pinApprovalThreshold;
  }
  return true;
}
