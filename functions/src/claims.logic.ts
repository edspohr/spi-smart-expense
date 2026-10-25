// Derives the custom claims for a users/{uid} document. Shared by the
// Firestore trigger and the backfill migration script, so both always agree.

export type Role = 'superadmin' | 'admin' | 'assistant' | 'professional';

export const ROLES: readonly Role[] = ['superadmin', 'admin', 'assistant', 'professional'];

export interface UserClaims {
  role: Role;
  tenantId: string;
  baseCurrency: string;
  active: boolean;
  canApprove: boolean;
  canDelete: boolean;
  canExport: boolean;
  isColombiaApprover: boolean;
}

export function claimsFromUserDoc(data: Record<string, unknown> | undefined, tenantId: string, baseCurrency = 'COP'): UserClaims {
  const role = ROLES.includes(data?.role as Role) ? (data?.role as Role) : 'professional';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const perms = (data?.permissions ?? {}) as Record<string, unknown>;
  const flag = (key: string, fallback: boolean) => (typeof perms[key] === 'boolean' ? (perms[key] as boolean) : fallback);
  return {
    role,
    tenantId,
    baseCurrency,
    active: data?.active !== false,
    canApprove: flag('canApprove', isAdmin),
    canDelete: flag('canDelete', isAdmin),
    canExport: flag('canExport', isAdmin),
    isColombiaApprover: flag('isColombiaApprover', false),
  };
}

export function claimsEqual(a: Record<string, unknown> | undefined, b: UserClaims): boolean {
  if (!a) return false;
  return (Object.keys(b) as (keyof UserClaims)[]).every((k) => a[k] === b[k]);
}
