import { describe, it, expect } from 'vitest';
import { DISABLE_AT, LOCK_AT, LOCK_MS, PinFormatError, evaluateAttempt, newPinRecord, pinPolicyFrom, pinRequired, validatePin } from './pin.logic';

describe('validatePin', () => {
  it('accepts a random 4-digit PIN', () => {
    expect(() => validatePin('4829')).not.toThrow();
  });

  it('rejects wrong formats and guessable PINs', () => {
    for (const pin of ['123', '12a4', '1111', '1234', '9876', '2026', '1990', '2580']) {
      expect(() => validatePin(pin), pin).toThrow(PinFormatError);
    }
  });
});

describe('evaluateAttempt', () => {
  const now = 1_000_000;
  const record = newPinRecord('4829', now);

  it('accepts the right PIN and resets failures', () => {
    expect(evaluateAttempt(record, '4829', now)).toEqual({ status: 'ok', update: null });
    expect(evaluateAttempt({ ...record, failed: 3 }, '4829', now)).toEqual({ status: 'ok', update: { failed: 0, lockedUntil: 0 } });
  });

  it('counts failures, locks at 5 and disables at 10', () => {
    expect(evaluateAttempt(record, '0000', now)).toMatchObject({ status: 'invalid', remaining: LOCK_AT - 1 });
    expect(evaluateAttempt({ ...record, failed: LOCK_AT - 1 }, '0000', now)).toEqual({
      status: 'locked-now',
      update: { failed: LOCK_AT, lockedUntil: now + LOCK_MS },
    });
    expect(evaluateAttempt({ ...record, failed: DISABLE_AT - 1 }, '0000', now)).toMatchObject({ status: 'disabled-now' });
  });

  it('refuses even the right PIN while locked or disabled', () => {
    expect(evaluateAttempt({ ...record, lockedUntil: now + 60_000 }, '4829', now)).toMatchObject({ status: 'locked', minutesLeft: 1 });
    expect(evaluateAttempt({ ...record, disabled: true }, '4829', now)).toMatchObject({ status: 'disabled' });
    expect(evaluateAttempt({ ...record, lockedUntil: now - 1 }, '4829', now).status).toBe('ok');
  });
});

describe('pin policy', () => {
  it('requires nothing while disabled', () => {
    expect(pinRequired(pinPolicyFrom(undefined), 'approve', 1e9)).toBe(false);
  });

  it('applies the approval threshold and per-action switches', () => {
    const policy = pinPolicyFrom({ security: { pinEnabled: true, pinApprovalThreshold: 500000, pinActions: { export: false } } });
    expect(pinRequired(policy, 'approve', 100000)).toBe(false);
    expect(pinRequired(policy, 'approve', 500000)).toBe(true);
    expect(pinRequired(policy, 'reject', null)).toBe(true);
    expect(pinRequired(policy, 'export')).toBe(false);
    expect(pinRequired(policy, 'users')).toBe(true);
  });

  it('protects every approval when no threshold is set', () => {
    const policy = pinPolicyFrom({ security: { pinEnabled: true } });
    expect(pinRequired(policy, 'approve', 1)).toBe(true);
  });
});
