import { describe, it, expect } from 'vitest';
import { isAdminRole, isSuperadmin, roleSatisfies } from './roles';

describe('roles', () => {
  it('treats superadmin as an admin but not the reverse', () => {
    expect(isAdminRole('superadmin')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isSuperadmin('admin')).toBe(false);
  });

  it('route guards admit superadmins wherever admins are allowed', () => {
    expect(roleSatisfies('superadmin', 'admin')).toBe(true);
    expect(roleSatisfies('superadmin', ['professional', 'admin'])).toBe(true);
    expect(roleSatisfies('admin', 'superadmin')).toBe(false);
    expect(roleSatisfies('professional', 'admin')).toBe(false);
    expect(roleSatisfies(null, 'professional')).toBe(false);
  });
});
