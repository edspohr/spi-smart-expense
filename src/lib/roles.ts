import type { Role } from '../types/models';

// Hierarchy: superadmin > admin > assistant > professional. A superadmin can
// do everything an admin can, plus manage users and tenant settings.
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Superadministrador',
  admin: 'Administrador',
  assistant: 'Asistente',
  professional: 'Profesional',
};

export const ASSIGNABLE_ROLES: Role[] = ['professional', 'assistant', 'admin', 'superadmin'];

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function isSuperadmin(role: string | null | undefined): boolean {
  return role === 'superadmin';
}

// Route guard semantics: requiring 'admin' also admits superadmins.
export function roleSatisfies(role: string | null | undefined, required: string | string[]): boolean {
  if (!role) return false;
  const list = Array.isArray(required) ? required : [required];
  if (list.includes(role)) return true;
  return role === 'superadmin' && list.includes('admin');
}
