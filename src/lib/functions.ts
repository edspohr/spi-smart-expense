import type { FirebaseApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { app, useEmulators } from './firebase';
import { tenant } from './tenant';

const firebaseApp = app as FirebaseApp | undefined;

export const functions = firebaseApp ? getFunctions(firebaseApp, tenant.functionsRegion) : null;

if (functions && useEmulators) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

const GENERIC_MESSAGES: Record<string, string> = {
  'functions/unauthenticated': 'Tu sesión expiró. Vuelve a iniciar sesión.',
  'functions/unavailable': 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
  'functions/deadline-exceeded': 'El servidor tardó demasiado en responder. Intenta de nuevo.',
  'functions/internal': 'Ocurrió un error en el servidor. Intenta de nuevo.',
};

export class CallableError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Thin wrapper around httpsCallable: server-side HttpsError messages are
// already in Spanish, so they are surfaced as-is; transport failures get a
// generic Spanish message.
export async function callFunction<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  if (!functions) throw new CallableError('functions/unavailable', GENERIC_MESSAGES['functions/unavailable'] as string);
  try {
    const result = await httpsCallable<TReq, TRes>(functions, name)(data);
    return result.data;
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'functions/internal';
    const serverMessage = (err as { message?: string }).message;
    const generic = GENERIC_MESSAGES[code];
    const message = generic && !['functions/unauthenticated'].includes(code) ? generic : serverMessage || generic || 'Error inesperado.';
    throw new CallableError(code, code === 'functions/unauthenticated' ? (generic as string) : message);
  }
}
