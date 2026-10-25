import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { TENANT_ID, nowIso, requireAuth } from './common';
import type { Role } from './claims.logic';
import { ValidationError, buildUserPatch, normalizeEmail, validateDisplayName, validateInviteRole } from './users.logic';

// User management for superadmins. users/{uid} is the source of truth; the
// onUserWritten trigger mirrors role/permissions/active into custom claims,
// so these callables only write the document plus the Auth-side effects
// (account creation, disabling, token revocation).

function requireSuperadmin(req: CallableRequest) {
  const auth = requireAuth(req);
  if (auth.claims.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo un superadministrador puede gestionar usuarios.');
  }
  return auth;
}

function asHttps(err: unknown): never {
  if (err instanceof ValidationError) throw new HttpsError('invalid-argument', err.message);
  throw err;
}

async function activeSuperadminCount(): Promise<number> {
  const snap = await getFirestore().collection('users').where('role', '==', 'superadmin').get();
  return snap.docs.filter((d) => d.data().active !== false).length;
}

// Accounts created by adminInviteUser report lastSignInTime == creationTime
// (Auth emulator) or null (production) until the person actually signs in;
// lastRefreshTime is the best "last active" signal when present.
function lastSeen(user: UserRecord | undefined): string | null {
  if (!user) return null;
  const { lastRefreshTime, lastSignInTime, creationTime } = user.metadata;
  if (lastRefreshTime) return new Date(lastRefreshTime).toISOString();
  if (lastSignInTime && lastSignInTime !== creationTime) return new Date(lastSignInTime).toISOString();
  return null;
}

export const adminListUsers = onCall(async (req) => {
  requireSuperadmin(req);
  const [docs, authList] = await Promise.all([
    getFirestore().collection('users').get(),
    getAuth().listUsers(1000),
  ]);
  const authById = new Map(authList.users.map((u) => [u.uid, u]));
  return {
    users: docs.docs.map((d) => {
      const data = d.data();
      const a = authById.get(d.id);
      return {
        uid: d.id,
        email: data.email ?? a?.email ?? null,
        displayName: data.displayName ?? a?.displayName ?? '',
        role: data.role ?? 'professional',
        active: data.active !== false,
        managerUid: data.managerUid ?? null,
        permissions: data.permissions ?? {},
        requiresApproval: data.requiresApproval ?? null,
        invitedAt: data.invitedAt ?? null,
        createdAt: data.createdAt ?? a?.metadata.creationTime ?? null,
        lastSignInAt: lastSeen(a),
        providers: a?.providerData.map((p) => p.providerId) ?? [],
        hasAuthAccount: Boolean(a),
      };
    }),
  };
});

// Creates the Auth account (throwaway password) and the users doc. The
// client then sends Firebase's native "set your password" email with
// sendPasswordResetEmail, so nobody has to share a password.
export const adminInviteUser = onCall(async (req) => {
  const { actor } = requireSuperadmin(req);
  let email: string;
  let displayName: string;
  let role: Role;
  try {
    email = normalizeEmail(req.data?.email);
    displayName = validateDisplayName(req.data?.displayName);
    role = validateInviteRole(req.data?.role ?? 'professional');
  } catch (e) {
    asHttps(e);
  }
  const managerUid = typeof req.data?.managerUid === 'string' && req.data.managerUid ? req.data.managerUid : null;

  const auth = getAuth();
  const db = getFirestore();
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    if ((await db.doc(`users/${uid}`).get()).exists) {
      throw new HttpsError('already-exists', 'Ese correo ya tiene usuario. Edítalo desde la lista.');
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    uid = (await auth.createUser({ email, displayName, password: randomBytes(24).toString('base64url') })).uid;
  }

  await db.doc(`users/${uid}`).set({
    uid,
    email,
    displayName,
    role,
    active: true,
    managerUid,
    tenantId: TENANT_ID.value(),
    balance: 0,
    invitedAt: nowIso(),
    invitedByUid: actor.uid,
    invitedByName: actor.name,
    createdAt: nowIso(),
  });
  return { uid, email };
});

export const adminUpdateUser = onCall(async (req) => {
  const { actor } = requireSuperadmin(req);
  const uid = typeof req.data?.uid === 'string' ? req.data.uid : '';
  if (!uid) throw new HttpsError('invalid-argument', 'Falta el usuario.');

  const db = getFirestore();
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
  const current = snap.data() ?? {};

  let patch;
  try {
    patch = buildUserPatch(req.data ?? {}, {
      targetUid: uid,
      actorUid: actor.uid,
      currentRole: (current.role ?? 'professional') as Role,
      currentActive: current.active !== false,
      superadminCount: await activeSuperadminCount(),
    });
  } catch (e) {
    asHttps(e);
  }
  if (Object.keys(patch).length === 0) return { ok: true, changed: false };

  const auth = getAuth();
  if (patch.active !== undefined) {
    await auth.updateUser(uid, { disabled: !patch.active });
    if (!patch.active) await auth.revokeRefreshTokens(uid);
  }
  if (patch.displayName) await auth.updateUser(uid, { displayName: patch.displayName });

  await ref.set({ ...patch, updatedAt: nowIso(), updatedByUid: actor.uid, updatedByName: actor.name }, { merge: true });
  return { ok: true, changed: true };
});

// Deleting would orphan expenses and allocations that reference the uid, so
// it is only allowed for users with no financial history; otherwise the UI
// offers deactivation.
export const adminDeleteUser = onCall(async (req) => {
  const { actor } = requireSuperadmin(req);
  const uid = typeof req.data?.uid === 'string' ? req.data.uid : '';
  if (!uid) throw new HttpsError('invalid-argument', 'Falta el usuario.');
  if (uid === actor.uid) throw new HttpsError('failed-precondition', 'No puedes eliminar tu propia cuenta.');

  const db = getFirestore();
  const [expenses, allocations] = await Promise.all([
    db.collection('expenses').where('userId', '==', uid).limit(1).get(),
    db.collection('allocations').where('userId', '==', uid).limit(1).get(),
  ]);
  if (!expenses.empty || !allocations.empty) {
    throw new HttpsError('failed-precondition', 'El usuario tiene rendiciones o asignaciones. Desactívalo en lugar de eliminarlo.');
  }
  const target = await db.doc(`users/${uid}`).get();
  if (target.data()?.role === 'superadmin' && (await activeSuperadminCount()) <= 1) {
    throw new HttpsError('failed-precondition', 'Debe quedar al menos un superadministrador.');
  }

  try {
    await getAuth().deleteUser(uid);
  } catch {
    // Doc-only users (no Auth account) are fine to delete.
  }
  await db.doc(`users/${uid}`).delete();
  return { ok: true };
});

// Runtime tenant settings live in settings/tenant (rules: superadmin write,
// any active user read). Only whitelisted keys are accepted.
const MODULE_KEYS = ['bulkUpload', 'reports', 'reconciliation', 'balances'] as const;

export const adminUpdateSettings = onCall(async (req) => {
  const { actor } = requireSuperadmin(req);
  const input = req.data ?? {};
  const update: Record<string, unknown> = {};

  if (input.security !== undefined) {
    if (typeof input.security?.pinEnabled !== 'boolean') throw new HttpsError('invalid-argument', 'Valor de PIN no válido.');
    update['security.pinEnabled'] = input.security.pinEnabled;
  }
  if (input.modules !== undefined) {
    for (const [key, value] of Object.entries(input.modules as Record<string, unknown>)) {
      if (!MODULE_KEYS.includes(key as (typeof MODULE_KEYS)[number]) || typeof value !== 'boolean') {
        throw new HttpsError('invalid-argument', `Módulo no válido: ${key}.`);
      }
      update[`modules.${key}`] = value;
    }
  }
  if (input.ai !== undefined) {
    for (const key of ['dailyLimitUser', 'dailyLimitTenant'] as const) {
      const value = input.ai?.[key];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 0 || value > 100000) {
        throw new HttpsError('invalid-argument', 'El límite de IA debe ser un entero entre 0 y 100000.');
      }
      update[`ai.${key}`] = value;
    }
  }
  if (Object.keys(update).length === 0) throw new HttpsError('invalid-argument', 'No hay cambios.');

  const ref = getFirestore().doc('settings/tenant');
  const meta = { updatedAt: nowIso(), updatedByUid: actor.uid, updatedByName: actor.name };
  const existing = await ref.get();
  if (existing.exists) await ref.update({ ...update, ...meta });
  else {
    // update() needs an existing doc; seed it with nested objects instead.
    const seeded: Record<string, Record<string, unknown>> = {};
    for (const [path, value] of Object.entries(update)) {
      const [group, key] = path.split('.') as [string, string];
      seeded[group] = { ...(seeded[group] ?? {}), [key]: value };
    }
    await ref.set({ ...seeded, ...meta });
  }
  return { ok: true };
});
