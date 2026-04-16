import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

const DEFAULT_BINDINGS = [
  { keys: ['J'], label: 'Bajar de fila' },
  { keys: ['K'], label: 'Subir de fila' },
  { keys: ['X'], label: 'Seleccionar fila enfocada' },
  { keys: ['A'], label: 'Aprobar fila enfocada' },
  { keys: ['R'], label: 'Rechazar fila enfocada' },
  { keys: ['E'], label: 'Editar fila enfocada' },
  { keys: ['Shift', 'A'], label: 'Aprobar seleccionados' },
  { keys: ['Esc'], label: 'Limpiar selección y foco' },
  { keys: ['?'], label: 'Abrir esta ayuda' },
];

function KeyCap({ k }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 text-[11px] font-semibold font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-700 shadow-sm">
      {k}
    </kbd>
  );
}

export default function KeyboardShortcutsModal({ isOpen, onClose, bindings = DEFAULT_BINDINGS }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h3 id="shortcuts-title" className="font-bold text-gray-800 flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-brand-600" aria-hidden="true" />
            Atajos de teclado
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="p-4 space-y-2">
          {bindings.map((b, i) => (
            <li key={i} className="flex items-center justify-between text-sm py-1">
              <span className="text-slate-700">{b.label}</span>
              <span className="flex items-center gap-1">
                {b.keys.map((k, j) => (
                  <span key={j} className="flex items-center gap-1">
                    {j > 0 && <span className="text-slate-400 text-xs">+</span>}
                    <KeyCap k={k} />
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="px-4 pb-4 text-[11px] text-slate-400">
          Los atajos se desactivan mientras escribes en un campo de texto.
        </div>
      </div>
    </div>
  );
}
