import { Link, useLocation } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useTenantSettings } from '../context/SettingsContext';

// Nudges people without a PIN once the tenant enables it. Only shown to
// roles that perform protected actions.
export default function PinSetupBanner() {
  const { profile, userRole } = useAuth() as unknown as { profile: { hasPin?: boolean; pinDisabled?: boolean } | null; userRole: string | null };
  const { security } = useTenantSettings();
  const location = useLocation();

  const needsPin = !profile?.hasPin || profile?.pinDisabled;
  const doesProtectedWork = userRole === 'admin' || userRole === 'superadmin' || userRole === 'assistant';
  if (!security.pinEnabled || !needsPin || !doesProtectedWork || location.pathname === '/dashboard/mi-espacio') return null;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-sm text-amber-800">
          Tu organización exige un PIN de 4 dígitos para aprobar, eliminar o exportar.{' '}
          {profile?.pinDisabled ? 'Tu PIN quedó desactivado; crea uno nuevo.' : 'Créalo ahora para no interrumpir tu trabajo.'}
        </p>
      </div>
      <Link
        to="/dashboard/mi-espacio#seguridad"
        className="shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-amber-700 focus-ring"
      >
        Crear PIN
      </Link>
    </div>
  );
}
