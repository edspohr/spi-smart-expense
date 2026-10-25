import { describe, it, expect } from 'vitest';
import { buildUserPatch, normalizeEmail, validateInviteRole, ValidationError } from './users.logic';

const ctx = { targetUid: 'u2', actorUid: 'super1', currentRole: 'professional' as const, currentActive: true, superadminCount: 1 };

describe('normalizeEmail / validateInviteRole', () => {
  it('lowercases and trims valid emails, rejects junk', () => {
    expect(normalizeEmail('  Ana@SPI.cl ')).toBe('ana@spi.cl');
    expect(() => normalizeEmail('no-at-sign')).toThrow(ValidationError);
  });

  it('never lets an invitation grant superadmin', () => {
    expect(validateInviteRole('admin')).toBe('admin');
    expect(() => validateInviteRole('superadmin')).toThrow(/superadministrador/);
  });
});

describe('buildUserPatch', () => {
  it('promotes another user to superadmin', () => {
    expect(buildUserPatch({ role: 'superadmin' }, ctx)).toEqual({ role: 'superadmin' });
  });

  it('forbids self-demotion and self-deactivation', () => {
    const self = { ...ctx, targetUid: 'super1', currentRole: 'superadmin' as const, superadminCount: 2 };
    expect(() => buildUserPatch({ role: 'admin' }, self)).toThrow(/ti mismo/);
    expect(() => buildUserPatch({ active: false }, self)).toThrow(/ti mismo/);
  });

  it('keeps at least one superadmin', () => {
    const lastSuper = { ...ctx, currentRole: 'superadmin' as const, superadminCount: 1 };
    expect(() => buildUserPatch({ role: 'admin' }, lastSuper)).toThrow(/al menos un/);
    expect(() => buildUserPatch({ active: false }, lastSuper)).toThrow(/al menos un/);
    expect(buildUserPatch({ role: 'admin' }, { ...lastSuper, superadminCount: 2 })).toEqual({ role: 'admin' });
  });

  it('omits no-op changes and validates managers and permissions', () => {
    expect(buildUserPatch({ role: 'professional', active: true }, ctx)).toEqual({});
    expect(buildUserPatch({ managerUid: '' }, ctx)).toEqual({ managerUid: null });
    expect(() => buildUserPatch({ managerUid: 'u2' }, ctx)).toThrow(/propio responsable/);
    expect(buildUserPatch({ permissions: { canApprove: true } }, ctx)).toEqual({ permissions: { canApprove: true } });
    expect(() => buildUserPatch({ permissions: { isGod: true } }, ctx)).toThrow(/Permiso no válido/);
  });
});
