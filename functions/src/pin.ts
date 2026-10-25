import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { nowIso, requireAuth } from './common';
import {
  PIN_ACTIONS,
  PinFormatError,
  RESPONSIBILITY_TEXT,
  RESPONSIBILITY_VERSION,
  evaluateAttempt,
  newPinRecord,
  pinPolicyFrom,
  pinRequired,
  validatePin,
  type PinAction,
  type PinPolicy,
  type PinRecord,
} from './pin.logic';

// Personal 4-digit PIN that authorises sensitive actions, verified only here.
//   userPins/{uid}  { hash, salt, setAt, failed, lockedUntil, disabled }   server-only
//   pinLog/{id}     { uid, userName, action, ref, ok, reason, at }        audit (superadmin read)
//   users/{uid}     hasPin, pinSetAt, pinAcceptVersion, pinDisabled       for the UI
// Callables pass the PIN as `data.pin`; a missing or wrong PIN throws
// failed-precondition with details.pin = required | invalid | locked |
// disabled | unset, which the client's withPin() turns into a prompt.

const ACTION_LABELS: Record<PinAction | 'verify', string> = {
  approve: 'aprobar',
  reject: 'rechazar',
  delete: 'eliminar',
  export: 'exportar',
  users: 'gestionar usuarios',
  settings: 'cambiar ajustes',
  verify: 'confirmar',
};

async function log(uid: string, userName: string, action: string, ok: boolean, extra: Record<string, unknown> = {}) {
  await getFirestore().collection('pinLog').add({ uid, userName, action, ok, at: nowIso(), ...extra });
}

export async function loadPinPolicy(): Promise<PinPolicy> {
  return pinPolicyFrom((await getFirestore().doc('settings/tenant').get()).data());
}

async function verify(req: CallableRequest, action: string, ref: string | null): Promise<void> {
  const { uid, actor } = requireAuth(req);
  const db = getFirestore();
  const pinRef = db.doc(`userPins/${uid}`);
  const snap = await pinRef.get();
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'Aún no tienes PIN. Créalo en Mi Espacio → Seguridad.', { pin: 'unset' });
  }
  const pin = typeof req.data?.pin === 'string' ? req.data.pin : '';
  if (!pin) throw new HttpsError('failed-precondition', 'Ingresa tu PIN para confirmar.', { pin: 'required' });

  const outcome = evaluateAttempt(snap.data() as PinRecord, pin, Date.now());
  if (outcome.update) await pinRef.update(outcome.update);
  const base = { ref, ...(outcome.status !== 'ok' ? { reason: outcome.status } : {}) };
  await log(uid, actor.name, action, outcome.status === 'ok', base);

  switch (outcome.status) {
    case 'ok':
      return;
    case 'invalid':
      throw new HttpsError(
        'failed-precondition',
        `PIN incorrecto. Te ${outcome.remaining === 1 ? 'queda 1 intento' : `quedan ${outcome.remaining} intentos`} antes del bloqueo.`,
        { pin: 'invalid' },
      );
    case 'locked':
      throw new HttpsError('failed-precondition', `PIN bloqueado por intentos fallidos. Intenta en ${outcome.minutesLeft} min.`, { pin: 'locked' });
    case 'locked-now':
      throw new HttpsError('failed-precondition', 'PIN bloqueado 15 minutos por intentos fallidos.', { pin: 'locked' });
    case 'disabled-now':
      await db.doc(`users/${uid}`).set({ pinDisabled: true }, { merge: true });
      throw new HttpsError('failed-precondition', 'PIN desactivado por demasiados intentos. Crea uno nuevo en Mi Espacio.', { pin: 'disabled' });
    case 'disabled':
      throw new HttpsError('failed-precondition', 'Tu PIN está desactivado por intentos fallidos. Crea uno nuevo en Mi Espacio.', { pin: 'disabled' });
  }
}

// Called at the top of sensitive callables. No-op unless the tenant enabled
// the PIN and protects this action (and, for approvals, the amount reaches
// the threshold).
export async function requirePinFor(
  req: CallableRequest,
  action: PinAction,
  opts: { ref?: string; amount?: number | null; policy?: PinPolicy } = {},
): Promise<void> {
  const policy = opts.policy ?? (await loadPinPolicy());
  if (!pinRequired(policy, action, opts.amount)) return;
  await verify(req, action, opts.ref ?? null);
}

// The person creates or replaces their own PIN, accepting the versioned
// responsibility statement. A valid session (password/Google) is the proof
// of identity; replacing an existing PIN works even when it is locked.
export const setOwnPin = onCall(async (req) => {
  const { uid, actor } = requireAuth(req);
  const pin = String(req.data?.pin ?? '');
  try {
    validatePin(pin);
  } catch (e) {
    if (e instanceof PinFormatError) throw new HttpsError('invalid-argument', e.message);
    throw e;
  }
  if (req.data?.accept !== true || req.data?.version !== RESPONSIBILITY_VERSION) {
    throw new HttpsError('failed-precondition', 'Debes aceptar la declaración de responsabilidad.');
  }
  const db = getFirestore();
  const now = Date.now();
  await db.doc(`userPins/${uid}`).set(newPinRecord(pin, now));
  await db.doc(`users/${uid}`).set(
    { hasPin: true, pinSetAt: nowIso(), pinAcceptVersion: RESPONSIBILITY_VERSION, pinDisabled: false },
    { merge: true },
  );
  await log(uid, actor.name, 'pin_creado', true, {
    ref: null,
    acceptText: RESPONSIBILITY_TEXT,
    acceptVersion: RESPONSIBILITY_VERSION,
    userAgent: String(req.rawRequest?.headers['user-agent'] ?? '').slice(0, 200),
  });
  return { ok: true };
});

// Client-side confirmations (e.g. exports, which run in the browser).
export const verifyPin = onCall(async (req) => {
  const action = String(req.data?.action ?? 'verify');
  if (!(PIN_ACTIONS as readonly string[]).includes(action)) throw new HttpsError('invalid-argument', 'Acción no válida.');
  const ref = req.data?.ref != null ? String(req.data.ref).slice(0, 80) : null;
  await requirePinFor(req, action as PinAction, { ref: ref ?? undefined });
  return { ok: true, label: ACTION_LABELS[action as PinAction] };
});

export const adminResetPin = onCall(async (req) => {
  const { claims, actor } = requireAuth(req);
  if (claims.role !== 'superadmin') throw new HttpsError('permission-denied', 'Solo un superadministrador puede restablecer un PIN.');
  const uid = String(req.data?.uid ?? '');
  if (!uid) throw new HttpsError('invalid-argument', 'Falta el usuario.');
  await requirePinFor(req, 'users', { ref: uid });
  const db = getFirestore();
  await db.doc(`userPins/${uid}`).delete();
  await db.doc(`users/${uid}`).set({ hasPin: false, pinDisabled: false }, { merge: true });
  await log(uid, actor.name, 'pin_restablecido', true, { ref: uid, byUid: actor.uid });
  return { ok: true };
});

export const adminListPinLog = onCall(async (req) => {
  const { claims } = requireAuth(req);
  if (claims.role !== 'superadmin') throw new HttpsError('permission-denied', 'Solo un superadministrador puede ver el registro.');
  const snap = await getFirestore().collection('pinLog').orderBy('at', 'desc').limit(100).get();
  return {
    entries: snap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, uid: x.uid, userName: x.userName ?? x.uid, action: x.action, ok: x.ok === true, reason: x.reason ?? null, ref: x.ref ?? null, at: x.at };
    }),
  };
});
