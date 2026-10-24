import { describe, it, expect } from 'vitest';
import { resolvePermissions, canUserApprove, isColombiaExpense } from './permissions';

describe('resolvePermissions', () => {
  it('grants nothing to an anonymous user', () => {
    expect(resolvePermissions(null)).toEqual({
      canApprove: false,
      canDelete: false,
      isColombiaApprover: false,
      canExport: false,
    });
  });

  it('defaults admins to approve/delete/export but not Colombia approver', () => {
    expect(resolvePermissions({ role: 'admin' })).toEqual({
      canApprove: true,
      canDelete: true,
      isColombiaApprover: false,
      canExport: true,
    });
  });

  it('lets explicit flags override role defaults', () => {
    const perms = resolvePermissions({
      role: 'professional',
      permissions: { canApprove: true, isColombiaApprover: true },
    });
    expect(perms.canApprove).toBe(true);
    expect(perms.isColombiaApprover).toBe(true);
    expect(perms.canDelete).toBe(false);
  });
});

describe('canUserApprove', () => {
  const copExpense = { currency: 'COP' };
  const usdExpense = { currency: 'USD' };

  it('requires a Colombia approver for COP expenses', () => {
    expect(canUserApprove(resolvePermissions({ role: 'admin' }), copExpense)).toBe(false);
    expect(
      canUserApprove(resolvePermissions({ role: 'admin', permissions: { isColombiaApprover: true } }), copExpense)
    ).toBe(true);
  });

  it('requires canApprove for non-COP expenses', () => {
    expect(canUserApprove(resolvePermissions({ role: 'admin' }), usdExpense)).toBe(true);
    expect(canUserApprove(resolvePermissions({ role: 'professional' }), usdExpense)).toBe(false);
  });

  it('treats a missing currency as COP', () => {
    expect(isColombiaExpense({})).toBe(true);
  });
});
