import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { logger } from '../lib/logger';
import { tenant } from '../lib/tenant';

// Shown when the service worker has a newer build waiting. registerType is
// 'prompt', so nothing changes until the user taps "Recargar".
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      logger.warn('[sw] register error', err);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 bg-white border border-brand-200 rounded-2xl shadow-soft p-4"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-brand-600" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-800">Actualización disponible</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Hay una versión nueva de {tenant.shortName}. Recarga para usarla.
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="px-3 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 focus-ring min-h-[40px]"
        >
          Ahora no
        </button>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow focus-ring min-h-[40px]"
        >
          Recargar
        </button>
      </div>
    </div>
  );
}
