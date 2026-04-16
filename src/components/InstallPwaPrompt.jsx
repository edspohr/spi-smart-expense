import { useState, useEffect } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';
import {
  triggerInstall,
  markDismissed,
  shouldShowAndroidPrompt,
  shouldShowIOSPrompt,
} from '../lib/pwa';

export default function InstallPwaPrompt() {
  const [variant, setVariant] = useState(null);

  useEffect(() => {
    function compute() {
      if (shouldShowAndroidPrompt()) setVariant('android');
      else if (shouldShowIOSPrompt()) setVariant('ios');
      else setVariant(null);
    }
    compute();

    // The early listener in main.jsx dispatches this once beforeinstallprompt
    // fires, so the banner can appear even if we mounted before the event.
    const onReady = () => compute();
    window.addEventListener('spi:pwa-ready', onReady);

    const onInstalled = () => {
      markDismissed();
      setVariant(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('spi:pwa-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!variant) return null;

  const handleDismiss = () => {
    markDismissed();
    setVariant(null);
  };

  const handleInstall = async () => {
    await triggerInstall();
    // Record the interaction regardless of outcome — the user has engaged
    // with the native prompt and shouldn't be asked again for 7 days.
    markDismissed();
    setVariant(null);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-4 pt-2 pointer-events-none"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto mx-auto max-w-md bg-white border border-slate-200 rounded-2xl shadow-lg px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
            <Download className="w-5 h-5 text-brand-600" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            {variant === 'android' ? (
              <>
                <p className="text-sm font-semibold text-slate-800">
                  Instala Smart Expense en tu teléfono
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Acceso rápido sin abrir el navegador.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-800">
                  Instala Smart Expense en tu iPhone
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Toca <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-label="Compartir" /> Compartir y luego "Agregar a pantalla de inicio" <Plus className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden="true" />.
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label="Cerrar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 min-h-[44px]"
          >
            {variant === 'android' ? 'Más tarde' : 'Entendido'}
          </button>
          {variant === 'android' && (
            <button
              type="button"
              onClick={handleInstall}
              className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 min-h-[44px]"
            >
              Instalar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
