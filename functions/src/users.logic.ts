// Validation for superadmin user-management requests. Pure so it can be
// unit-tested; the callables in users.ts add the Firebase side effects.

import { ROLES, type Role } from './claims.logic';

export const INVITABLE_ROLES: readonly Role[] = ['admin', 'assistant', 'professional'];

export interface UserPatchInput {
  role?: unknown;
  displayName?: unknown;
  managerUid?: unknown;
  active?: unknown;
  permissions?: unknown;
  requiresApproval?: unknown;
}

export interface UserPatch {
  role?: Role;
  displayName?: string;
  managerUid?: string | null;
  active?: boolean;
  permissions?: Record<string, boolean>;
  requiresApproval?: boolean;
}

const PERMISSION_KEYS = ['canApprove', 'canDelete', 'canExport', 'isColombiaApprover'] as const;

export class ValidationError extends Error {}

export function normalizeEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('Correo no válido.');
  return email;
}

export function validateDisplayName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 2 || name.length > 80) throw new ValidationError('Indica un nombre de 2 a 80 caracteres.');
  return name;
}

export function validateInviteRole(value: unknown): Role {
  if (!INVITABLE_ROLES.includes(value as Role)) {
    throw new ValidationError('Rol no válido para invitar. Para crear un superadministrador, invita y luego promueve.');
  }
  return value as Role;
}

// `actorUid` is the superadmin making the change. `superadminCount` is the
// number of active superadmins before the change (to keep at least one).
export function buildUserPatch(
  input: UserPatchInput,
  ctx: { targetUid: string; actorUid: string; currentRole: Role; currentActive: boolean; superadminCount: number },
): UserPatch {
  const patch: UserPatch = {};
  const isSelf = ctx.targetUid === ctx.actorUid;

  if (input.role !== undefined) {
    if (!ROLES.includes(input.role as Role)) throw new ValidationError('Rol no válido.');
    const role = input.role as Role;
    if (isSelf && role !== 'superadmin') throw new ValidationError('No puedes quitarte a ti mismo el rol de superadministrador.');
    if (ctx.currentRole === 'superadmin' && role !== 'superadmin' && ctx.superadminCount <= 1) {
      throw new ValidationError('Debe quedar al menos un superadministrador.');
    }
    if (role !== ctx.currentRole) patch.role = role;
  }

  if (input.displayName !== undefined) patch.displayName = validateDisplayName(input.displayName);

  if (input.managerUid !== undefined) {
    if (input.managerUid === null || input.managerUid === '') patch.managerUid = null;
    else if (typeof input.managerUid === 'string') {
      if (input.managerUid === ctx.targetUid) throw new ValidationError('Un usuario no puede ser su propio responsable.');
      patch.managerUid = input.managerUid;
    } else throw new ValidationError('Responsable no válido.');
  }

  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new ValidationError('Estado no válido.');
    if (isSelf && !input.active) throw new ValidationError('No puedes desactivarte a ti mismo.');
    if (!input.active && ctx.currentRole === 'superadmin' && ctx.currentActive && ctx.superadminCount <= 1) {
      throw new ValidationError('Debe quedar al menos un superadministrador activo.');
    }
    if (input.active !== ctx.currentActive) patch.active = input.active;
  }

  if (input.permissions !== undefined) {
    if (typeof input.permissions !== 'object' || input.permissions === null) throw new ValidationError('Permisos no válidos.');
    const perms: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(input.permissions as Record<string, unknown>)) {
      if (!PERMISSION_KEYS.includes(key as (typeof PERMISSION_KEYS)[number]) || typeof value !== 'boolean') {
        throw new ValidationError(`Permiso no válido: ${key}.`);
      }
      perms[key] = value;
    }
    patch.permissions = perms;
  }

  if (input.requiresApproval !== undefined) {
    if (typeof input.requiresApproval !== 'boolean') throw new ValidationError('Valor no válido.');
    patch.requiresApproval = input.requiresApproval;
  }

  return patch;
}
