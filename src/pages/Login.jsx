import { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { useNavigate } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export default function Login() {
  const { login, resetPassword, currentUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(''); // New for conversion
  const [confirmPassword, setConfirmPassword] = useState('');

  // Fix: Navigate only when currentUser is set to avoid race conditions
  useEffect(() => {
    if (currentUser) {
       navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isRegistering) {
        // Validation
        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        if (password.length < 6) {
             setError("La contraseña debe tener al menos 6 caracteres.");
             return;
        }
        if (!displayName.trim()) {
            setError("Por favor ingresa tu nombre completo.");
            return;
        }

        try {
            // 1. Create Auth User
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Update Profile Name
            await updateProfile(user, {
                displayName: displayName
            });

            // 3. Create Firestore Document Immediately
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                email: email,
                displayName: displayName,
                role: 'professional', // Default Role
                balance: 0,
                createdAt: new Date().toISOString()
            });

            // Auto-login happens by default with Firebase, useEffect will redirect
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setError("Este correo ya está registrado.");
            } else {
                setError("Error al registrar: " + err.message);
            }
        }
    } else {
        // Login Flow
        try {
            await login(email, password);
            // Navigation handled by useEffect
        } catch (err) {
            setError('Error al iniciar sesión: ' + err.message);
        }
    }
  };

  const handleResetPassword = async () => {
      if (!email) {
          setError("Por favor ingresa tu correo electrónico para recuperar la contraseña.");
          return;
      }
      try {
          setError('');
          await resetPassword(email);
          alert(`Se ha enviado un correo de recuperación a ${email}`);
      } catch (err) {
          setError("Error al enviar correo: " + err.message);
      }
  };

  const toggleMode = () => {
      setIsRegistering(!isRegistering);
      setError('');
      setPassword('');
      setConfirmPassword('');
      // Keep email if typed
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="SPI Smart Expense" className="h-24 w-auto" />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-gray-800">
            {isRegistering ? 'Crear Cuenta' : 'Smart Expense'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
            {isRegistering ? 'Regístrate para gestionar tus rendiciones' : 'Inicia sesión para continuar'}
        </p>
        
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm text-left">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 mb-6 text-left">
            {isRegistering && (
                <div className="animate-fadeIn">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                    <input 
                        type="text" 
                        required
                        className="w-full border border-gray-300 rounded p-2"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="Ej: Juan Pérez"
                    />
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                <input 
                    type="email" 
                    required
                    className="w-full border border-gray-300 rounded p-2"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="ejemplo@spiamericas.com"
                />
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input 
                    type="password" 
                    required
                    className="w-full border border-gray-300 rounded p-2"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••"
                />
            </div>

            {isRegistering && (
                <div className="animate-fadeIn">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Contraseña</label>
                    <input 
                        type="password" 
                        required
                        className="w-full border border-gray-300 rounded p-2"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••"
                    />
                </div>
            )}

            {!isRegistering && (
                <div className="text-right">
                    <button type="button" onClick={handleResetPassword} className="text-sm text-blue-600 hover:underline">
                        ¿Olvidaste tu contraseña?
                    </button>
                </div>
            )}
            
            <button
                type="submit"
                className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition duration-200 flex items-center justify-center"
            >
                {isRegistering ? (
                    <><UserPlus className="w-4 h-4 mr-2" /> Registrarse</>
                ) : (
                    <><LogIn className="w-4 h-4 mr-2" /> Iniciar Sesión</>
                )}
            </button>
        </form>

        <div className="mt-6 border-t pt-4">
            <p className="text-sm text-gray-600 mb-2">
                {isRegistering ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
            </p>
            <button 
                onClick={toggleMode}
                className="text-blue-600 font-semibold hover:underline"
            >
                {isRegistering ? 'Inicia Sesión aquí' : 'Regístrate aquí'}
            </button>
        </div>
        
        <p className="mt-8 text-xs text-gray-400">© 2026 SPI Americas. Todos los derechos reservados.</p>
      </div>
    </div>
  );
}
