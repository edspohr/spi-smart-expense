import { motion as Motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Download, X } from 'lucide-react';

export default function BulkActionBar({
  selectedCount,
  mode = 'full',
  onBulkApprove,
  onBulkReject,
  onExportSelection,
  onClear,
  disabled = false,
}) {
  const show = selectedCount > 0;

  return (
    <AnimatePresence>
      {show && (
        <Motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-x-0 bottom-4 md:bottom-6 z-40 flex justify-center px-4 pointer-events-none"
          role="region"
          aria-label="Acciones en lote"
        >
          <div className="pointer-events-auto bg-white shadow-glass ring-1 ring-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 max-w-3xl w-full md:w-auto">
            <span className="text-sm font-semibold text-slate-800">
              {selectedCount} seleccionad{selectedCount === 1 ? 'a' : 'as'}
            </span>
            <span className="hidden md:block h-5 w-px bg-slate-200" aria-hidden="true" />

            <div className="flex flex-wrap items-center gap-2 flex-1">
              {mode === 'full' && (
                <>
                  <button
                    type="button"
                    onClick={onBulkApprove}
                    disabled={disabled}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 transition"
                  >
                    <CheckCircle className="w-4 h-4" aria-hidden="true" />
                    Aprobar Seleccionados
                  </button>
                  <button
                    type="button"
                    onClick={onBulkReject}
                    disabled={disabled}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition"
                  >
                    <XCircle className="w-4 h-4" aria-hidden="true" />
                    Rechazar Seleccionados
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onExportSelection}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 transition"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Exportar Selección
              </button>
            </div>

            <button
              type="button"
              onClick={onClear}
              className="text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition"
              aria-label="Limpiar selección"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}
