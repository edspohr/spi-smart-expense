import type { FirebaseApp } from 'firebase/app';
import { arrayRemove, arrayUnion, doc, updateDoc, type Firestore } from 'firebase/firestore';
import { app, db } from './firebase';

// Web push opt-in. The browser permission is only requested when the person
// turns push on in Mi Espacio — never on load. Requires the tenant's Web Push
// certificate (VAPID public key) in VITE_FCM_VAPID_KEY and an active service
// worker (production build / installed app).

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined;
const TOKEN_KEY = 'expense-buddy:fcm-token';

export async function isPushSupported(): Promise<boolean> {
  if (!VAPID_KEY || typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const { isSupported } = await import('firebase/messaging');
  return isSupported();
}

export function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function enablePush(uid: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Debes permitir las notificaciones en el navegador para activarlas.');
  const { getMessaging, getToken } = await import('firebase/messaging');
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app as FirebaseApp), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('No se pudo registrar este dispositivo.');
  await updateDoc(doc(db as Firestore, 'users', uid), { fcmTokens: arrayUnion(token) });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private mode: the device still works, it just won't remember its state.
  }
}

export async function disablePush(uid: string): Promise<void> {
  const token = storedToken();
  const { deleteToken, getMessaging } = await import('firebase/messaging');
  try {
    await deleteToken(getMessaging(app as FirebaseApp));
  } catch {
    // Token may already be gone; removing it from the profile is what matters.
  }
  if (token) await updateDoc(doc(db as Firestore, 'users', uid), { fcmTokens: arrayRemove(token) });
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}
