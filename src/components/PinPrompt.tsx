import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X } from 'lucide-react';
import { usePinPrompt } from '../lib/pin';

// Global PIN dialog opened by withPin(). Mounted once in main.jsx.
export default function PinPrompt() {
  const prompt = usePinPrompt();
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prompt.open) {
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [prompt.open, prompt.error]);

  if (!prompt.open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d{4}$/.test(pin)) prompt.resolve?.(pin);
  };
  const cancel = () => prompt.resolve?.(null);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-zinc-900/50 backdrop-blur-sm p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-prompt-title"
      onKeyDown={(e) => e.key === 'Escape' && cancel()}
    >
      <form onSubmit={submit} className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-soft space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
              <KeyRound className="h-4 w-4 text-brand-600" aria-hidden="true" />
            </div>
            <div>
              <h2 id="pin-prompt-title" className="text-base font-bold text-zinc-800">
                Ingresa tu PIN
              </h2>
              <p className="text-xs text-zinc-500">Para {prompt.reason}</p>
            </div>
          </div>
          <button type="button" onClick={cancel} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-ring" aria-label="Cancelar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-center text-2xl tracking-[0.6em] font-semibold focus-ring"
          aria-label="PIN de 4 dígitos"
          aria-invalid={Boolean(prompt.error)}
          aria-describedby={prompt.error ? 'pin-prompt-error' : undefined}
        />
        {prompt.error && (
          <p id="pin-prompt-error" className="text-sm text-red-600" role="alert">
            {prompt.error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={cancel} className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 focus-ring">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pin.length !== 4}
            className="flex-1 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-700 focus-ring disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
