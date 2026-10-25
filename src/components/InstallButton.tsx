import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share, MoreVertical, X } from 'lucide-react';
import { promptInstall, useInstallMode } from '../lib/install';
import { tenant } from '../lib/tenant';

interface InstallButtonProps {
  variant?: 'pill' | 'menu';
  className?: string;
}

// Permanent "Instalar app" entry point. Android/desktop Chrome and Edge get
// the native prompt; iOS and other browsers get the manual steps. Renders
// nothing once the app is installed — it is never dismissed otherwise.
export default function InstallButton({ variant = 'pill', className = '' }: InstallButtonProps) {
  const mode = useInstallMode();
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (!help) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [help]);

  if (mode === 'hidden') return null;

  async function handleClick() {
    if (mode === 'prompt') {
      const accepted = await promptInstall();
      if (accepted) return;
    }
    setHelp(true);
  }

  const label = 'Instalar app';

  return (
    <>
      {variant === 'menu' ? (
        <button
          type="button"
          onClick={handleClick}
          className={`w-full flex items-center py-2.5 px-4 rounded-full text-zinc-500 hover:bg-brand-50 hover:text-brand-700 transition duration-200 font-medium text-sm focus-ring ${className}`}
        >
          <Download className="w-4 h-4 mr-3" aria-hidden="true" />
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          aria-label={`Instalar ${tenant.shortName} como aplicación`}
          className={`inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition focus-ring min-h-[36px] ${className}`}
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          {label}
        </button>
      )}

      {help &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] bg-zinc-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={() => setHelp(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-help-title"
          >
            <div
              className="w-full max-w-sm max-h-[85dvh] overflow-y-auto bg-white rounded-2xl shadow-soft p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="install-help-title" className="text-base font-bold text-zinc-800">
                    Instalar {tenant.shortName}
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Queda como un ícono más y abre a pantalla completa.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHelp(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 focus-ring"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {mode === 'ios' ? (
                <ol className="space-y-2 text-sm text-zinc-700 list-decimal pl-5">
                  <li>
                    Abre esta página en <strong>Safari</strong> (otros navegadores de iPhone no permiten instalar).
                  </li>
                  <li>
                    Toca <strong>Compartir</strong>{' '}
                    <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden="true" /> en la barra inferior.
                  </li>
                  <li>
                    Elige <strong>«Agregar a inicio»</strong> y confirma con <strong>Agregar</strong>.
                  </li>
                </ol>
              ) : (
                <ol className="space-y-2 text-sm text-zinc-700 list-decimal pl-5">
                  <li>
                    Abre el menú del navegador (<MoreVertical className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden="true" />{' '}
                    arriba a la derecha en Chrome o Edge).
                  </li>
                  <li>
                    Elige <strong>«Instalar app»</strong> o <strong>«Agregar a la pantalla principal»</strong>.
                  </li>
                </ol>
              )}

              <p className="text-xs text-zinc-500">
                La primera vez dentro de la app instalada puede pedirte iniciar sesión de nuevo.
              </p>
              <button
                type="button"
                onClick={() => setHelp(false)}
                className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 focus-ring min-h-[44px]"
              >
                Entendido
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
