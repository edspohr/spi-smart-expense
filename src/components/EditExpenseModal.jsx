import { useState, useEffect } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { toast } from 'sonner';
import { fetchTRM, calculateCOPEquivalent } from '../lib/exchangeRate';
import { formatCurrency } from '../utils/format';
import { CATEGORIES_COMMON, PAYMENT_METHODS, CARD_BRANDS, CARD_COMPANIES, CURRENCIES } from '../lib/constants';

export default function EditExpenseModal({ isOpen, onClose, expense, onSave }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: expense?.date || '',
    time: expense?.time || '',
    merchant: expense?.merchant || '',
    taxId: expense?.taxId || '',
    invoiceNumber: expense?.invoiceNumber || '',
    address: expense?.address || '',
    city: expense?.city || '',
    phone: expense?.phone || '',
    amount: expense?.amount ?? '',
    currency: expense?.currency || 'COP',
    category: expense?.category || '',
    paymentMethod: expense?.paymentMethod || '',
    cardLast4: expense?.cardLast4 || '',
    cardCompany: expense?.cardCompany || '',
    cardBrand: expense?.cardBrand || '',
    description: expense?.description || '',
    eventName: expense?.eventName || '',
  });

  const [trmState, setTrmState] = useState({ trm: null, source: null, fetchedAt: null, loading: false });

  // Fetch TRM when editing a USD expense (or when currency/date changes)
  useEffect(() => {
    if (!isOpen || form.currency !== 'USD') {
      setTrmState({ trm: null, source: null, fetchedAt: null, loading: false });
      return;
    }
    let cancelled = false;
    setTrmState(prev => ({ ...prev, loading: true }));
    fetchTRM(form.date).then(result => {
      if (!cancelled) setTrmState({ ...result, loading: false });
    });
    return () => { cancelled = true; };
  }, [isOpen, form.currency, form.date]);

  if (!isOpen || !expense) return null;

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    const newAmount = Number(form.amount);
    if (isNaN(newAmount) || newAmount <= 0) {
      toast.error("Ingrese un monto válido.");
      return;
    }

    setSaving(true);
    try {
      const updates = {
        date: form.date,
        time: form.time || null,
        merchant: form.merchant,
        taxId: form.taxId || null,
        invoiceNumber: form.invoiceNumber || null,
        address: form.address || null,
        city: form.city || null,
        phone: form.phone || null,
        amount: newAmount,
        currency: form.currency,
        category: form.category,
        paymentMethod: form.paymentMethod || null,
        cardLast4: form.cardLast4 || null,
        cardBrand: form.cardBrand || null,
        cardCompany: form.cardCompany || null,
        description: form.description,
        eventName: form.eventName ? form.eventName.toUpperCase() : '',
        trm: form.currency === 'USD' ? (trmState.trm || null) : null,
        amountCOP: form.currency === 'USD' ? calculateCOPEquivalent(newAmount, trmState.trm) : null,
        trmSource: form.currency === 'USD' ? (trmState.source || null) : null,
      };

      const expenseRef = doc(db, "expenses", expense.id);
      await updateDoc(expenseRef, updates);

      // Adjust balance if amount changed
      const oldAmount = Number(expense.amount);
      const diff = newAmount - oldAmount;
      if (diff !== 0 && !expense.isCompanyExpense && expense.userId) {
        const userRef = doc(db, "users", expense.userId);
        await updateDoc(userRef, { balance: increment(diff) });
      }

      toast.success("Rendición actualizada exitosamente.");
      onSave({ ...expense, ...updates });
      onClose();
    } catch (err) {
      console.error("Error updating expense:", err);
      toast.error("Error al guardar los cambios: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Editar Rendición
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="p-6 space-y-6">

            {/* Receipt / Voucher thumbnails (read-only reference) */}
            {(expense.receiptUrl || expense.voucherUrl) && (
              <div className="flex gap-3">
                {expense.receiptUrl && (
                  <a
                    href={expense.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg text-center text-sm font-medium transition flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" /> Ver Recibo
                  </a>
                )}
                {expense.voucherUrl && (
                  <a
                    href={expense.voucherUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 py-2 rounded-lg text-center text-sm font-medium transition flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" /> Ver Voucher
                  </a>
                )}
              </div>
            )}

            {/* Fecha / Hora / Evento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Fecha *</label>
                <input type="date" required className={inputClass} value={form.date} onChange={set('date')} />
              </div>
              <div>
                <label className={labelClass}>Hora</label>
                <input type="time" className={inputClass} value={form.time} onChange={set('time')} />
              </div>
              <div>
                <label className={labelClass}>Evento</label>
                <input
                  type="text"
                  className={inputClass + " uppercase"}
                  value={form.eventName}
                  onChange={(e) => setForm(prev => ({ ...prev, eventName: e.target.value.toUpperCase() }))}
                  placeholder="Ej: FERIA CHICAGO 2026"
                />
              </div>
            </div>

            {/* Comercio / NIT / No. Factura */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Comercio / Proveedor *</label>
                <input type="text" required className={inputClass} value={form.merchant} onChange={set('merchant')} placeholder="Ej: Restaurante La 68" />
              </div>
              <div>
                <label className={labelClass}>NIT / ID Fiscal</label>
                <input type="text" className={inputClass} value={form.taxId} onChange={set('taxId')} placeholder="Ej: 900.123.456-7" />
              </div>
              <div>
                <label className={labelClass}>No. Factura</label>
                <input type="text" className={inputClass} value={form.invoiceNumber} onChange={set('invoiceNumber')} placeholder="Ej: FE-00123" />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input type="text" className={inputClass} value={form.phone} onChange={set('phone')} />
              </div>
            </div>

            {/* Dirección / Ciudad */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Dirección</label>
                <input type="text" className={inputClass} value={form.address} onChange={set('address')} />
              </div>
              <div>
                <label className={labelClass}>Ciudad</label>
                <input type="text" className={inputClass} value={form.city} onChange={set('city')} />
              </div>
            </div>

            {/* Categoría y Pago */}
            {(() => {
              const isCardPayment = form.paymentMethod === 'Credit Card' || form.paymentMethod === 'Debit Card';
              const mutedSelectClass = 'w-full border border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed rounded-lg p-2.5 text-sm outline-none';
              return (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-4">
                  <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Clasificación y Pago</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Categoría</label>
                      <select className={inputClass} value={form.category} onChange={set('category')}>
                        <option value="">Seleccionar...</option>
                        {CATEGORIES_COMMON.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Medio de Pago</label>
                      <select className={inputClass} value={form.paymentMethod} onChange={set('paymentMethod')}>
                        <option value="">Seleccionar...</option>
                        {PAYMENT_METHODS.map(pm => (
                          <option key={pm.value} value={pm.value}>{pm.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`${labelClass} ${isCardPayment ? '' : 'text-gray-400'}`}>Marca Tarjeta</label>
                      <select
                        disabled={!isCardPayment}
                        className={isCardPayment ? inputClass : mutedSelectClass}
                        value={form.cardBrand}
                        onChange={set('cardBrand')}
                      >
                        <option value="">Seleccionar...</option>
                        {CARD_BRANDS.map(cb => (
                          <option key={cb.value} value={cb.value}>{cb.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Empresa Tarjeta</label>
                      <select className={inputClass} value={form.cardCompany} onChange={set('cardCompany')}>
                        <option value="">Seleccionar...</option>
                        {CARD_COMPANIES.map(cc => (
                          <option key={cc.value} value={cc.value}>{cc.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Tarjeta (Últimos 4)</label>
                      <input
                        type="text"
                        maxLength={4}
                        className={inputClass}
                        value={form.cardLast4}
                        onChange={set('cardLast4')}
                        placeholder="1234"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Monto / Moneda */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Moneda</label>
                <select className={inputClass} value={form.currency} onChange={set('currency')}>
                  {CURRENCIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Monto *</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  className={inputClass + " font-mono text-lg"}
                  value={form.amount}
                  onChange={set('amount')}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* TRM Info Box (USD expenses only) */}
            {form.currency === 'USD' && (
              <div className={`p-3 rounded-lg border text-sm ${trmState.trm ? 'bg-blue-50 border-blue-100' : trmState.loading ? 'bg-blue-50 border-blue-100' : 'bg-yellow-50 border-yellow-200'}`}>
                {trmState.loading ? (
                  <div className="flex items-center gap-2 text-blue-700">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs">Obteniendo TRM...</span>
                  </div>
                ) : trmState.trm ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-blue-800 text-xs font-medium">
                        TRM del día: <span className="font-mono">{formatCurrency(trmState.trm, 'COP')}</span> COP/USD
                      </p>
                      {form.amount > 0 && (
                        <p className="text-blue-700 text-xs">
                          Equivalente: <span className="font-mono font-bold">{formatCurrency(calculateCOPEquivalent(form.amount, trmState.trm))}</span> COP
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTrmState(prev => ({ ...prev, loading: true }));
                        fetchTRM(form.date).then(r => setTrmState({ ...r, loading: false }));
                      }}
                      className="text-xs text-blue-600 font-bold hover:underline whitespace-nowrap"
                    >
                      Actualizar TRM
                    </button>
                  </div>
                ) : (
                  <p className="text-yellow-800 text-xs">⚠️ No se pudo obtener la TRM. El gasto se guardará sin conversión.</p>
                )}
              </div>
            )}

            {/* Descripción */}
            <div>
              <label className={labelClass}>Descripción / Notas</label>
              <textarea
                rows={3}
                className={inputClass + " resize-none"}
                value={form.description}
                onChange={set('description')}
                placeholder="Detalle adicional del gasto..."
              />
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="bg-white border border-gray-300 text-gray-700 font-medium py-2 px-6 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
