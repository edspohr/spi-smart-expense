import { useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import Layout from '../components/Layout';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';
import { logger } from '../lib/logger';

// Cryptographically-random password. 12 chars, alphanumeric + common
// symbols. Shown to the admin exactly once at creation time; the user is
// forced to reset it on first login (forcePasswordChange flag).
function generateInitialPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join('');
}

// 1. Re-initialize a SECONDARY app instance to avoid logging out the current admin
// We use the same config from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Named secondary app so we can call createUserWithEmailAndPassword without
// signing the current admin out. Re-initialization throws during Vite HMR;
// swallowing that error is deliberate control flow, not silence.
let secondaryApp;
try {
    secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
} catch (err) {
    logger.debug('AdminUserSeeder: SecondaryApp already initialized (HMR)', err);
}

export default function AdminUserSeeder() {
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [credentials, setCredentials] = useState([]);

  const addLog = (msg) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

  const handleCreateAccounts = async () => {
    if (!confirm(
      "Esto creará cuentas de Authentication para los usuarios sin cuenta.\n" +
      "A cada uno se le asignará una contraseña temporal aleatoria y deberán " +
      "cambiarla en su primer inicio de sesión. ¿Continuar?"
    )) return;

    setProcessing(true);
    setLogs([]);
    setCredentials([]);
    addLog("Iniciando creación de cuentas...");
    const createdCreds = [];

    try {
        // 1. Get Users from Firestore (The profiles we just seeded)
        const snap = await getDocs(collection(db, "users"));
        const users = snap.docs.map(d => ({id: d.id, ...d.data()}));

        addLog(`Encontrados ${users.length} perfiles en base de datos.`);

        // 2. Get Auth instance of SECONDARY app
        // This allows creating users without kicking out the current Admin
        const secondaryAuth = getAuth(secondaryApp);

        for (const user of users) {
            if (!user.email) {
                addLog(`SALTADO: Usuario ${user.displayName} no tiene email.`);
                continue;
            }

            try {
                addLog(`Creando cuenta para: ${user.email}...`);

                // 1. Create User with per-user random password
                const tempPassword = generateInitialPassword();
                const credential = await createUserWithEmailAndPassword(
                    secondaryAuth, user.email, tempPassword,
                );
                const authUser = credential.user;

                // 2. Update Profile (Display Name)
                if (user.displayName) {
                    await updateProfile(authUser, { displayName: user.displayName });
                }

                // 3. Migrate Firestore Doc — mark forcePasswordChange so the
                //    user is required to rotate on first login.
                const realUid = authUser.uid;
                const userRef = doc(db, "users", user.id);

                addLog(`Migrando Doc ID de ${user.id} a ${realUid}...`);

                const newDocRef = doc(db, "users", realUid);
                const migratedProfile = { ...user, uid: realUid, forcePasswordChange: true };
                await updateDoc(newDocRef, migratedProfile).catch(async () => {
                     await setDoc(newDocRef, migratedProfile);
                });

                if (user.id !== realUid) {
                    await deleteDoc(userRef);
                }

                // 4. Migrate References (Expenses, Allocations)
                const batchOps = writeBatch(db);

                const allocQ = query(collection(db, "allocations"), where("userId", "==", user.id));
                const allocSnap = await getDocs(allocQ);
                allocSnap.docs.forEach(d => batchOps.update(d.ref, { userId: realUid }));

                const expQ = query(collection(db, "expenses"), where("userId", "==", user.id));
                const expSnap = await getDocs(expQ);
                expSnap.docs.forEach(d => batchOps.update(d.ref, { userId: realUid }));

                await batchOps.commit();

                createdCreds.push({ email: user.email, password: tempPassword });
                addLog(`✅ ÉXITO: ${user.email} creado y migrado.`);

            } catch (authError) {
                if (authError.code === 'auth/email-already-in-use') {
                    addLog(`⚠ YA EXISTE: ${user.email} (Auth). No se modificó.`);
                } else {
                    addLog(`❌ ERROR: ${user.email} - ${authError.message}`);
                    logger.error('AdminUserSeeder: create failed', authError, { email: user.email });
                }
            }
        }

        secondaryAuth.signOut(); // Cleanup

    } catch (e) {
        addLog(`CRITICAL ERROR: ${e.message}`);
        logger.error('AdminUserSeeder: run failed', e);
    } finally {
        setCredentials(createdCreds);
        setProcessing(false);
    }
  };

  // Manual User Creation Function
  const [newUser, setNewUser] = useState({ displayName: '', email: '', role: 'professional' });
  const handleCreateSingleUser = async (e) => {
      e.preventDefault();
      if (!newUser.email || !newUser.displayName) return;
      
      setProcessing(true);
      try {
          // 1. Create in Firestore
          // Generate a simple ID or letting Firestore do it? 
          // Seeder uses custom IDs like 'user_xxx'. Let's stick to auth-like or random.
          // Let's use a random ID for Firestore doc first, then the Seeder logic below will migrate it to Auth UID.
          // OR we can just wait for Seeder to pick it up.
          
          const tempId = `user_${newUser.email.split('@')[0]}_${Date.now().toString().slice(-4)}`;
          
          await setDoc(doc(db, "users", tempId), {
              ...newUser,
              balance: 0,
              forcePasswordChange: true,
              createdAt: new Date().toISOString()
          });

          addLog(`✅ Usuario Firestore creado: ${newUser.displayName} (${tempId})`);
          addLog("Ahora presiona 'Crear Cuentas' arriba para generar su acceso (Auth).");
          setNewUser({ displayName: '', email: '', role: 'professional' });
      } catch (e) {
          console.error(e);
          addLog("Error creando usuario: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  return (
    <Layout title="Administración de Usuarios">
        <div className="bg-white p-6 rounded-lg shadow-sm max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-4">Provisión Masiva de Cuentas</h2>
            
            <div className="bg-yellow-50 p-4 rounded border border-yellow-200 mb-6 text-sm text-yellow-800">
                <p className="font-bold">Instrucciones:</p>
                <ol className="list-decimal ml-5 mt-2 space-y-1">
                    <li>Asegúrate de haber presionado "Generar Datos de Prueba" antes de esto (para tener los perfiles base).</li>
                    <li>Este proceso creará cuentas de Email/Password con una contraseña temporal aleatoria por usuario.</li>
                    <li>Migrará automáticamente los perfiles de Firestore para coincidir con los nuevos UIDs.</li>
                    <li>Al terminar, aparecerán las credenciales <b>una sola vez</b>. Cópialas antes de recargar.</li>
                    <li>Cada usuario deberá cambiar su contraseña en el primer inicio de sesión.</li>
                </ol>
            </div>

            <button
                onClick={handleCreateAccounts}
                disabled={processing}
                className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
            >
                {processing ? 'Procesando...' : 'Crear Cuentas y Unificar'}
            </button>

            {credentials.length > 0 && (
                <div className="mt-6 border border-red-300 bg-red-50 rounded p-4">
                    <p className="text-sm font-bold text-red-800 mb-2">
                        Credenciales temporales (visibles una sola vez):
                    </p>
                    <p className="text-xs text-red-700 mb-3">
                        Cópialas ahora — al recargar la página desaparecen. Envíalas por un canal seguro; cada usuario deberá rotarlas al iniciar sesión.
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            const text = credentials
                                .map(c => `${c.email}\t${c.password}`)
                                .join('\n');
                            navigator.clipboard.writeText(text).catch(err =>
                                logger.warn('AdminUserSeeder: clipboard write failed', err));
                        }}
                        className="mb-3 text-xs px-3 py-1 bg-white border border-red-300 rounded hover:bg-red-100"
                    >
                        Copiar todo (email TAB password)
                    </button>
                    <div className="bg-white border border-red-200 rounded max-h-48 overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-red-100 text-red-900">
                                <tr>
                                    <th className="text-left px-2 py-1">Email</th>
                                    <th className="text-left px-2 py-1">Contraseña temporal</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono">
                                {credentials.map((c) => (
                                    <tr key={c.email} className="border-t border-red-100">
                                        <td className="px-2 py-1">{c.email}</td>
                                        <td className="px-2 py-1">{c.password}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="font-bold text-gray-700 mb-4">Agregar Nuevo Usuario (Firestore)</h3>
                <form onSubmit={handleCreateSingleUser} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-600">Nombre</label>
                        <input 
                            type="text" 
                            required
                            className="w-full border p-2 rounded"
                            value={newUser.displayName}
                            onChange={e => setNewUser({...newUser, displayName: e.target.value})}
                            placeholder="Ej: Terreno"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600">Email</label>
                        <input 
                            type="email" 
                            required
                            className="w-full border p-2 rounded"
                            value={newUser.email}
                            onChange={e => setNewUser({...newUser, email: e.target.value})}
                            placeholder="Ej: terreno@etfa-ruido.cl"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600">Rol</label>
                        <select 
                            className="w-full border p-2 rounded"
                            value={newUser.role}
                            onChange={e => setNewUser({...newUser, role: e.target.value})}
                        >
                            <option value="professional">Profesional</option>
                            <option value="admin">Administrador</option>
                            <option value="assistant">Asistente</option>
                        </select>
                    </div>
                    <button 
                        type="submit"
                        disabled={processing}
                        className="w-full bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700 disabled:opacity-50"
                    >
                        Agregar a la Base de Datos
                    </button>
                </form>
            </div>

            <div className="mt-6 bg-gray-900 text-green-400 p-4 rounded font-mono text-xs h-64 overflow-y-auto">
                {logs.length === 0 ? <p className="text-gray-500">// Esperando iniciar...</p> : logs.map((l, i) => <p key={i}>{l}</p>)}
            </div>
        </div>
    </Layout>
  );
}
