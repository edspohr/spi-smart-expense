import { useEffect } from 'react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/useAuth';
import { useTenantSettings } from '../context/SettingsContext';
import { isAdminRole, roleSatisfies } from '../lib/roles';
import { MODULE_LABELS } from '../lib/tenantSettings';

function Redirect({ to, message }) {
  useEffect(() => {
    // Fixed id: StrictMode runs effects twice in dev; one toast either way.
    if (message) toast.error(message, { id: `route-guard:${message}` });
  }, [message]);
  return <Navigate to={to} replace />;
}

// `requiredRole`: a role or list; requiring 'admin' also admits superadmins.
// `module`: a tenant module key that a superadmin may switch off at runtime.
export default function ProtectedRoute({ children, requiredRole, module }) {
  const { currentUser, userRole } = useAuth();
  const settings = useTenantSettings();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  // If user is logged in but has no role (e.g. Firestore creation failed)
  // Prevent infinite loop by showing a logout screen instead of redirecting
  if (!userRole) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
              <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
                  <h2 className="text-xl font-bold text-red-600 mb-4">Perfil no encontrado</h2>
                  <p className="text-gray-600 mb-6">
                      No se pudo cargar tu perfil. Esto suele pasar si las reglas de seguridad no permitieron crear tu usuario.
                  </p>
                  <p className="text-sm text-gray-500 mb-6 bg-gray-100 p-2 rounded">
                      Por favor, contacta al administrador para habilitar tu cuenta o revisa las reglas de Firebase.
                  </p>
                  <button
                      onClick={() => signOut(auth)}
                      className="w-full bg-brand-600 text-white py-2 px-4 rounded hover:bg-brand-700 transition"
                  >
                      Cerrar Sesión e Intentar de Nuevo
                  </button>
              </div>
          </div>
      );
  }

  const home = isAdminRole(userRole) ? '/admin' : '/dashboard';

  if (requiredRole && !roleSatisfies(userRole, requiredRole)) {
    return <Redirect to={home} message="No tienes permiso para ver esa sección." />;
  }

  if (module && settings.modules[module] === false) {
    return <Redirect to={home} message={`El módulo ${MODULE_LABELS[module] ?? module} está desactivado.`} />;
  }

  return children;
}
