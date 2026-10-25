import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Loader2 } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { disablePush, enablePush, isPushSupported, storedToken } from '../lib/push';

// Mi Espacio: opt in to push notifications on this device.
export default function PushCard() {
  const { currentUser } = useAuth() as unknown as { currentUser: { uid: string } | null };
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(() => storedToken() !== null && typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isPushSupported().then(setSupported).catch(() => setSupported(false));
  }, []);

  if (!supported || !currentUser) return null;

  async function toggle(next: boolean) {
    if (!currentUser) return;
    setBusy(true);
    try {
      if (next) await enablePush(currentUser.uid);
      else await disablePush(currentUser.uid);
      setEnabled(next);
      toast.success(next ? 'Notificaciones activadas en este dispositivo.' : 'Notificaciones desactivadas en este dispositivo.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';

  return (
    <section className="flex items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-soft border border-slate-100">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-4 w-4 text-zinc-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-zinc-800">Notificaciones en este dispositivo</p>
          <p className="text-xs text-zinc-500">
            {blocked
              ? 'El navegador las tiene bloqueadas. Actívalas desde la configuración del sitio.'
              : 'Aprobaciones, rechazos y rendiciones que esperan tu firma, aunque la app esté cerrada.'}
          </p>
        </div>
      </div>
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-label="Guardando" />
      ) : (
        <input
          type="checkbox"
          checked={enabled}
          disabled={blocked}
          onChange={(e) => toggle(e.target.checked)}
          className="h-5 w-5 rounded border-zinc-300 text-brand-600 focus-ring disabled:opacity-50"
          aria-label="Activar notificaciones en este dispositivo"
        />
      )}
    </section>
  );
}
