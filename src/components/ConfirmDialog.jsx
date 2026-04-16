import { useEffect } from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';

const TONE_STYLES = {
  primary: {
    button: 'bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500',
    iconColor: 'text-brand-600',
    Icon: CheckCircle,
  },
  danger: {
    button: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
    iconColor: 'text-red-500',
    Icon: AlertTriangle,
  },
};

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmTone = 'primary',
  onConfirm,
  onClose,
  children,
  confirmDisabled = false,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tone = TONE_STYLES[confirmTone] || TONE_STYLES.primary;
  const Icon = tone.Icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start p-4 border-b">
          <h3 id="confirm-dialog-title" className="font-bold text-gray-800 flex items-center">
            <Icon className={`w-5 h-5 mr-2 ${tone.iconColor}`} aria-hidden="true" />
            {title}
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

        <div className="p-4 space-y-4">
          {description && (
            <div className="text-sm text-gray-700 whitespace-pre-line">{description}</div>
          )}
          {children}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className={`px-4 py-2 text-white font-medium rounded-lg shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition ${tone.button}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
