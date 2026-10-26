import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { getDemoRole } from '../lib/demoSignIn';
import { tenant } from '../lib/tenant';

// Always-visible bar for one-click demo sessions: says which profile the
// visitor is trying and takes them back to the landing to pick another one.
// Renders nothing for real users (no demo flag) or tenants without a demo.
export default function DemoBar() {
  const { logout, currentUser } = useAuth() as unknown as { logout: () => Promise<void>; currentUser: { displayName?: string | null } | null };
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const role = getDemoRole();
  const demo = tenant.landing?.demo;
  if (!role || !demo) return null;

  const label = demo.roles.find((r) => r.role === role)?.label ?? 'Demo';

  const backToLanding = async () => {
    setLeaving(true);
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div role="region" aria-label="Modo demo" className="z-30 flex items-center gap-3 bg-cta-600 px-4 py-2 text-cta-fg sm:px-8">
      <Eye className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-bold">Modo demo</span>
        <span className="hidden sm:inline">
          {' '}· estás viendo la app como <strong>{label}</strong>
          {currentUser?.displayName ? ` (${currentUser.displayName})` : ''}
        </span>
      </p>
      <button
        type="button"
        onClick={backToLanding}
        disabled={leaving}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-70 focus-ring sm:text-sm"
      >
        {leaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowLeft className="h-4 w-4" aria-hidden />}
        <span className="hidden sm:inline">Volver al inicio y elegir otro perfil</span>
        <span className="sm:hidden">Cambiar perfil</span>
      </button>
    </div>
  );
}
