import { sendPasswordResetEmail } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { auth } from './firebase';
import { callFunction } from './functions';
import { withPin } from './pin';
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
  hasPin: boolean;
  pinDisabled: boolean;
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
  const res = await withPin('invitar a una persona', (pin) =>
    callFunction<typeof input & { pin?: string }, { uid: string; email: string }>('adminInviteUser', { ...input, ...(pin ? { pin } : {}) }),
  );
  await sendPasswordSetupEmail(res.email);
  return res;
}

export function sendPasswordSetupEmail(email: string): Promise<void> {
  return sendPasswordResetEmail(auth as Auth, email);
}

export function updateUser(uid: string, patch: UserPatch) {
  return withPin('cambiar los permisos de un usuario', (pin) =>
    callFunction<UserPatch & { uid: string; pin?: string }, { ok: boolean; changed: boolean }>('adminUpdateUser', { uid, ...patch, ...(pin ? { pin } : {}) }),
  );
}

export function deleteUser(uid: string) {
  return withPin('eliminar un usuario', (pin) => callFunction<{ uid: string; pin?: string }, { ok: boolean }>('adminDeleteUser', { uid, ...(pin ? { pin } : {}) }));
}

export interface SettingsPatch {
  security?: { pinEnabled?: boolean; pinApprovalThreshold?: number | null; pinActions?: Record<string, boolean> };
  modules?: Record<string, boolean>;
  ai?: { dailyLimitUser?: number; dailyLimitTenant?: number; localFirst?: boolean };
  offline?: { localReader?: boolean; shadowRead?: boolean };
  learning?: { shareDerived: boolean; termsVersion?: string };
  approvalPolicy?: Partial<{
    mode: 'single' | 'levels';
    autoApproveBelow: number | null;
    managerApproval: boolean;
    secondSignatureAbove: number | null;
    allowDelegation: boolean;
    staleReminders: boolean;
    staleDays: number;
  }>;
}

export function updateSettings(patch: SettingsPatch) {
  return withPin('cambiar los ajustes', (pin) =>
    callFunction<SettingsPatch & { pin?: string }, { ok: boolean }>('adminUpdateSettings', { ...patch, ...(pin ? { pin } : {}) }),
  );
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
