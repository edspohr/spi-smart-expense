import type { FirebaseApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { app, useEmulators } from './firebase';
import { tenant } from './tenant';

const firebaseApp = app as FirebaseApp | undefined;

export const functions = firebaseApp ? getFunctions(firebaseApp, tenant.functionsRegion) : null;

if (functions && useEmulators) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// Transport-level failures get a generic Spanish message; HttpsError
// messages thrown by our functions are already user-facing Spanish.
const TRANSPORT_MESSAGES: Record<string, string> = {
  'functions/unauthenticated': 'Tu sesión expiró. Vuelve a iniciar sesión.',
  'functions/unavailable': 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
  'functions/deadline-exceeded': 'El servidor tardó demasiado en responder. Intenta de nuevo.',
  'functions/internal': 'Ocurrió un error en el servidor. Intenta de nuevo.',
};

export class CallableError extends Error {
  code: string;
  details: Record<string, unknown> | undefined;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function callFunction<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  if (!functions) throw new CallableError('functions/unavailable', TRANSPORT_MESSAGES['functions/unavailable'] as string);
  try {
    const result = await httpsCallable<TReq, TRes>(functions, name)(data);
    return result.data;
  } catch (err) {
    const { code = 'functions/internal', message, details } = err as { code?: string; message?: string; details?: Record<string, unknown> };
    const transport = TRANSPORT_MESSAGES[code];
    // The SDK reports an unreachable server as 'internal' with message 'internal'.
    const useServerMessage = message && message !== 'internal' && code !== 'functions/unauthenticated';
    // Some SDK/emulator paths append the HTTP status, e.g. "... [400]".
    const clean = useServerMessage ? message.replace(/\s*\[\d{3}\]$/, '') : transport ?? 'Error inesperado.';
    throw new CallableError(code, clean, details);
  }
}
