import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import FocusableModal from './FocusableModal';

export default function RejectionModal({ isOpen, onClose, onConfirm, expense }) {
  const [reason, setReason] = useState('');

  if (!expense) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Debes ingresar un motivo.");
      return;
    }
    onConfirm(expense, reason);
    setReason('');
    onClose();
  };

  return (
    <FocusableModal isOpen={isOpen} onClose={onClose} ariaLabelledBy="rejection-modal-title">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <h3 id="rejection-modal-title" className="font-bold text-gray-800 flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-500 mr-2" aria-hidden="true" />
            Rechazar Rendición
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-600 focus-ring rounded"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-gray-50 p-3 rounded text-sm text-gray-600">
            <p><strong>Usuario:</strong> {expense?.userName}</p>
            <p><strong>Monto:</strong> ${expense?.amount}</p>
            <p><strong>Detalle:</strong> {expense?.description}</p>
          </div>

          <div>
            <label htmlFor="rejection-reason" className="block text-sm font-semibold text-gray-700 mb-2">Motivo del Rechazo *</label>
            <textarea
              id="rejection-reason"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-red-500 focus:border-red-500"
              rows="3"
              placeholder="Ej: Recibo ilegible, gasto no corresponde al proyecto..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg focus-ring transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 text-white font-medium hover:bg-red-700 rounded-lg shadow-md focus-ring transition"
            >
              Confirmar Rechazo
            </button>
          </div>
        </form>
      </div>
    </FocusableModal>
  );
}
