#!/usr/bin/env node
/**
 * Uso:
 *   node scripts/setUserPassword.cjs <email> <nuevaPassword>
 *
 * Requisitos:
 *   1. npm install --save-dev firebase-admin
 *   2. Descargar la service account key desde:
 *        Firebase Console → Project Settings → Service Accounts → Generate new private key
 *      y guardarla como scripts/serviceAccountKey.json (NO commitear).
 *
 * La nueva password debe tener al menos 6 caracteres (requisito de Firebase Auth).
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('Uso: node scripts/setUserPassword.js <email> <nuevaPassword>');
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error('La password debe tener al menos 6 caracteres.');
  process.exit(1);
}

const keyPath = path.resolve(__dirname, 'serviceAccountKey.json');

let serviceAccount;
try {
  serviceAccount = require(keyPath);
} catch (err) {
  console.error(`No se pudo cargar ${keyPath}`);
  console.error('Descarga la service account key desde Firebase Console y guárdala ahí.');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount),
});

(async () => {
  try {
    const auth = getAuth();
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password: newPassword });
    console.log(`Password actualizada para ${email} (uid: ${user.uid}).`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
