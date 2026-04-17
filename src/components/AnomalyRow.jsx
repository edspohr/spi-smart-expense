import { AlertTriangle, ReceiptText, DollarSign, Copy, TrendingUp, ChevronRight } from 'lucide-react';

const TYPE_META = {
  'missing-receipt': { Icon: ReceiptText, iconClass: 'text-amber-500', label: 'Sin comprobante' },
  'trm-missing':     { Icon: DollarSign,  iconClass: 'text-red-500',   label: 'USD sin TRM' },
  'duplicate':       { Icon: Copy,        iconClass: 'text-red-500',   label: 'Posible duplicado' },
  'outlier':         { Icon: TrendingUp,  iconClass: 'text-amber-500', label: 'Monto atípico' },
};

export default function AnomalyRow({ type, description, onClick }) {
  const meta = TYPE_META[type] || { Icon: AlertTriangle, iconClass: 'text-amber-500', label: 'Anomalía' };
  const Icon = meta.Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${meta.label}: ${description}`}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left focus-ring transition"
    >
      <Icon className={`shrink-0 w-4 h-4 ${meta.iconClass}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{meta.label}</p>
        <p className="text-sm text-slate-600 truncate">{description}</p>
      </div>
      <ChevronRight className="shrink-0 w-4 h-4 text-slate-300" aria-hidden="true" />
    </button>
  );
}
