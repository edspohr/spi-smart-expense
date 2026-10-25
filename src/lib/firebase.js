import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  connectStorageEmulator,
} from "firebase/storage";

// `npm run dev:emu` points the SDKs at the local Emulator Suite so test
// accounts and data never touch a client's production project.
const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured =
  firebaseConfig.apiKey && firebaseConfig.apiKey !== "your_api_key";

/** @type {import('firebase/app').FirebaseApp | undefined} */
let app;
/** @type {import('firebase/auth').Auth | undefined} */
let auth;
/** @type {GoogleAuthProvider | undefined} */
let googleProvider;
/** @type {import('firebase/firestore').Firestore | undefined} */
let db;
/** @type {import('firebase/storage').FirebaseStorage | undefined} */
let storage;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    // App Check (reCAPTCHA Enterprise). Optional until the site key is
    // registered in the Firebase console; enforcement is toggled there.
    const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    if (recaptchaKey && !useEmulators) {
      if (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
      }
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    // IndexedDB cache: already-loaded expenses and projects render offline
    // (read-only) and the installed app opens instantly on flaky networks.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    storage = getStorage(app);
    if (useEmulators) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
    }
  } catch (e) {
    console.error("Firebase init error:", e);
  }
}

export async function uploadReceiptImage(file, userId) {
  if (!storage) throw new Error("Firebase Storage not initialized");

  // Create a unique filename
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const extension = file.name.split(".").pop();
  const filename = `${timestamp}_${random}.${extension}`;
  const path = `receipts/${userId}/${filename}`;

  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);

  return downloadURL;
}

export { app, auth, googleProvider, db, storage, isConfigured, useEmulators };
