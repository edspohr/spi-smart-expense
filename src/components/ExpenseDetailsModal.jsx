import { X, Calendar, Clock, MapPin, FileText, CreditCard, Building, User, Tag, DollarSign, Hash } from 'lucide-react';
import { formatCurrency } from '../utils/format';

export default function ExpenseDetailsModal({ isOpen, onClose, expense }) {
  if (!isOpen || !expense) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Detalle del Gasto
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Usuario</p>
                  <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-600" />
                      <span className="font-medium text-gray-800">{expense.userName}</span>
                  </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Monto Total</p>
                  <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-green-600" />
                      <span className="font-mono font-bold text-xl text-green-700">
                        {formatCurrency(expense.amount)} <span className="text-sm text-gray-500">{expense.currency}</span>
                      </span>
                  </div>
              </div>
          </div>

          {/* Main Details */}
          <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-900 border-b pb-2">Información de la Factura</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                  <div>
                      <label className="text-xs text-gray-500 block mb-1">Comercio / Proveedor</label>
                      <div className="flex items-center gap-2 font-medium text-gray-800">
                          <Building className="w-4 h-4 text-gray-400" />
                          {expense.merchant || 'N/A'}
                      </div>
                  </div>
                  <div>
                      <label className="text-xs text-gray-500 block mb-1">NIT / ID Fiscal</label>
                      <div className="flex items-center gap-2 text-gray-700">
                          <Hash className="w-4 h-4 text-gray-400" />
                          {expense.taxId || 'N/A'}
                      </div>
                  </div>

                  <div>
                      <label className="text-xs text-gray-500 block mb-1">Fecha & Hora</label>
                      <div className="flex items-center gap-2 text-gray-700">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {expense.date}
                          {expense.time && <span className="flex items-center gap-1 ml-2 text-gray-500"><Clock className="w-3 h-3" /> {expense.time}</span>}
                      </div>
                  </div>
                   <div>
                      <label className="text-xs text-gray-500 block mb-1">No. Factura</label>
                      <div className="font-mono text-gray-700">
                          {expense.invoiceNumber || 'N/A'}
                      </div>
                  </div>

                  <div className="md:col-span-2">
                       <label className="text-xs text-gray-500 block mb-1">Dirección / Ciudad</label>
                       <div className="flex items-center gap-2 text-gray-700">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          {expense.address || 'Sin dirección'}{expense.city ? `, ${expense.city}` : ''}
                       </div>
                  </div>
              </div>
          </div>
          
          {/* Payment & Classification */}
          <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-900 border-b pb-2">Clasificación y Pago</h4>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Evento</label>
                        <span className="font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded text-sm">
                            {expense.eventName || 'N/A'}
                        </span>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Proyecto (Centro Costo)</label>
                        <span className="text-sm text-gray-700">
                            {expense.projectName || 'Sin Asignar'}
                        </span>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Categoría</label>
                        <div className="flex items-center gap-2">
                             <Tag className="w-4 h-4 text-gray-400" />
                             {expense.category}
                        </div>
                    </div>
                     <div>
                        <label className="text-xs text-gray-500 block mb-1">Medio de Pago</label>
                        <div className="flex items-center gap-2 text-gray-700">
                             <CreditCard className="w-4 h-4 text-gray-400" />
                             {expense.paymentMethod || 'N/A'} 
                             {expense.cardLast4 && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded ml-2">**** {expense.cardLast4}</span>}
                        </div>
                    </div>
               </div>
          </div>
            
          {/* Description */}
           <div className="bg-gray-50 p-4 rounded-xl">
               <label className="text-xs font-bold text-gray-400 uppercase mb-1">Descripción / Notas</label>
               <p className="text-sm text-gray-700 italic">"{expense.description}"</p>
           </div>
           
           {/* Files Links */}
           <div className="flex gap-4 pt-2">
               {expense.receiptUrl && (
                   <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg text-center text-sm font-medium transition flex items-center justify-center gap-2">
                       <FileText className="w-4 h-4" /> Recibo
                   </a>
               )}
               {expense.voucherUrl && (
                    <a href={expense.voucherUrl} target="_blank" rel="noopener noreferrer" className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 py-2 rounded-lg text-center text-sm font-medium transition flex items-center justify-center gap-2">
                        <CreditCard className="w-4 h-4" /> Voucher
                    </a>
               )}
           </div>

        </div>
        
        <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-end">
            <button onClick={onClose} className="bg-white border border-gray-300 text-gray-700 font-medium py-2 px-6 rounded-lg hover:bg-gray-50 transition">
                Cerrar
            </button>
        </div>
      </div>
    </div>
  );
}
