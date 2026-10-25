import { sendPasswordResetEmail } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { auth } from './firebase';
import { callFunction } from './functions';
import type { Role } from '../types/models';

export interface ManagedUser {
  uid: string;
  email: string | null;
  displayName: string;
  role: Role;
  active: boolean;
  managerUid: string | null;
  permissions: Record<string, boolean>;
  requiresApproval: boolean | null;
  invitedAt: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  providers: string[];
  hasAuthAccount: boolean;
}

export interface UserPatch {
  role?: Role;
  displayName?: string;
  managerUid?: string | null;
  active?: boolean;
  permissions?: Record<string, boolean>;
  requiresApproval?: boolean;
}

export async function listUsers(): Promise<ManagedUser[]> {
  const res = await callFunction<Record<string, never>, { users: ManagedUser[] }>('adminListUsers', {});
  return res.users;
}

// Invitation = account created server-side + Firebase's native email to set
// a password. Re-sending is just another reset email.
export async function inviteUser(input: { email: string; displayName: string; role: Role; managerUid?: string | null }) {
  const res = await callFunction<typeof input, { uid: string; email: string }>('adminInviteUser', input);
  await sendPasswordSetupEmail(res.email);
  return res;
}

export function sendPasswordSetupEmail(email: string): Promise<void> {
  return sendPasswordResetEmail(auth as Auth, email);
}

export function updateUser(uid: string, patch: UserPatch) {
  return callFunction<UserPatch & { uid: string }, { ok: boolean; changed: boolean }>('adminUpdateUser', { uid, ...patch });
}

export function deleteUser(uid: string) {
  return callFunction<{ uid: string }, { ok: boolean }>('adminDeleteUser', { uid });
}

export function updateSettings(patch: {
  security?: { pinEnabled: boolean };
  modules?: Record<string, boolean>;
  ai?: { dailyLimitUser?: number; dailyLimitTenant?: number };
}) {
  return callFunction<typeof patch, { ok: boolean }>('adminUpdateSettings', patch);
}

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'El correo no es válido.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu red.',
};

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  return AUTH_ERRORS[code] ?? (err as Error)?.message ?? 'Error inesperado.';
}
