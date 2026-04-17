import { useState, useEffect } from 'react';
import { X, FileText, CreditCard } from 'lucide-react';
import FocusableModal from './FocusableModal';

function isPdf(url) {
  if (!url) return false;
  return url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('%2fpdf') || url.toLowerCase().includes('application%2fpdf');
}

function MediaViewer({ url, label }) {
  if (!url) return null;
  if (isPdf(url)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <FileText className="w-16 h-16 text-gray-300" aria-hidden="true" />
        <p className="text-gray-500 text-sm">Este archivo es un PDF</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium focus-ring transition"
        >
          Abrir PDF
        </a>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={label}
      className="max-h-[70vh] max-w-full object-contain rounded-lg"
    />
  );
}

export default function ImageLightbox({ isOpen, onClose, receiptUrl, voucherUrl }) {
  const hasReceipt = !!receiptUrl;
  const hasVoucher = !!voucherUrl;
  const hasBoth = hasReceipt && hasVoucher;

  const [activeTab, setActiveTab] = useState('recibo');
  // Derive effective tab — fall back if selected tab has no content
  const effectiveTab = (activeTab === 'recibo' && hasReceipt) || !hasVoucher ? 'recibo' : 'voucher';

  // Left/Right arrows switch between Recibo/Voucher tabs when both exist (clamp at ends).
  useEffect(() => {
    if (!isOpen || !hasBoth) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        setActiveTab('recibo');
      } else if (e.key === 'ArrowRight') {
        setActiveTab('voucher');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, hasBoth]);

  const currentUrl = effectiveTab === 'recibo' ? receiptUrl : voucherUrl;

  return (
    <FocusableModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Visor de comprobantes"
      overlayClassName="bg-black/75 backdrop-blur-sm"
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-2xl">
          {hasBoth ? (
            <div className="flex gap-1 bg-gray-200 p-1 rounded-lg" role="tablist" aria-label="Comprobantes">
              <button
                type="button"
                role="tab"
                aria-selected={effectiveTab === 'recibo'}
                onClick={() => setActiveTab('recibo')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium focus-ring transition ${
                  effectiveTab === 'recibo'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                Recibo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={effectiveTab === 'voucher'}
                onClick={() => setActiveTab('voucher')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium focus-ring transition ${
                  effectiveTab === 'voucher'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CreditCard className="w-4 h-4" aria-hidden="true" />
                Voucher
              </button>
            </div>
          ) : (
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              {hasReceipt ? (
                <><FileText className="w-4 h-4 text-blue-500" aria-hidden="true" /> Recibo</>
              ) : hasVoucher ? (
                <><CreditCard className="w-4 h-4 text-purple-500" aria-hidden="true" /> Voucher</>
              ) : null}
            </h3>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full focus-ring transition-colors ml-4"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-gray-500" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex items-center justify-center bg-zinc-100 p-6 min-h-[300px]">
          {!hasReceipt && !hasVoucher ? (
            <div className="flex flex-col items-center gap-3 text-gray-400 py-12">
              <FileText className="w-14 h-14 text-gray-300" aria-hidden="true" />
              <p className="text-sm">Sin comprobante adjunto</p>
            </div>
          ) : (
            <MediaViewer
              url={currentUrl}
              label={effectiveTab === 'recibo' ? 'Recibo' : 'Voucher'}
            />
          )}
        </div>

        {/* Footer */}
        {currentUrl && (
          <div className="px-6 py-3 border-t bg-gray-50 rounded-b-2xl flex justify-end">
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline focus-ring rounded"
            >
              Abrir en nueva pestaña
            </a>
          </div>
        )}
      </div>
    </FocusableModal>
  );
}
