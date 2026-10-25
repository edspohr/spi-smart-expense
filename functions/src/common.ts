import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineInt, defineString } from 'firebase-functions/params';

// Per-project parameters: override in functions/.env.<projectId> (committed)
// so each tenant deployment carries its own values without code changes.
// FUNCTIONS_REGION must match the tenant's Firestore location (triggers are
// routed there) and the client's `functionsRegion` in tenants/<id>.json.
export const FUNCTIONS_REGION = defineString('FUNCTIONS_REGION', { default: 'us-central1' });
export const TENANT_ID = defineString('TENANT_ID', { default: 'spi' });
// Tenant base currency; foreign-currency expenses compare `amountCOP` (the
// stored base-currency equivalent, TD-026) against PIN thresholds.
export const BASE_CURRENCY = defineString('BASE_CURRENCY', { default: 'COP' });
export const GEMINI_DAILY_LIMIT_USER = defineInt('GEMINI_DAILY_LIMIT_USER', { default: 60 });
export const GEMINI_DAILY_LIMIT_TENANT = defineInt('GEMINI_DAILY_LIMIT_TENANT', { default: 1500 });

export type Role = 'superadmin' | 'admin' | 'assistant' | 'professional';

export interface AppClaims {
  role?: Role;
  tenantId?: string;
  active?: boolean;
  canApprove?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  isColombiaApprover?: boolean;
}

export interface Actor {
  uid: string;
  name: string;
}

export function requireAuth(req: CallableRequest): { uid: string; claims: AppClaims; actor: Actor } {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const token = req.auth.token as Record<string, unknown>;
  const claims = token as AppClaims;
  if (claims.active === false) throw new HttpsError('permission-denied', 'Tu cuenta está desactivada.');
  const name =
    (typeof token.name === 'string' && token.name) ||
    (typeof token.email === 'string' && token.email) ||
    req.auth.uid;
  return { uid: req.auth.uid, claims, actor: { uid: req.auth.uid, name } };
}

export function isAdminRole(role: Role | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function requireString(value: unknown, field: string, max = 2000): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpsError('invalid-argument', `Falta el campo ${field}.`);
  }
  if (value.length > max) throw new HttpsError('invalid-argument', `El campo ${field} es demasiado largo.`);
  return value.trim();
}

export const nowIso = () => new Date().toISOString();
