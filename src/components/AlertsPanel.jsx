import { Link } from 'react-router-dom';
import { AlertTriangle, AlertOctagon, Info, CheckCircle2, ChevronRight } from 'lucide-react';

const SEVERITY_STYLES = {
  danger: {
    dot: 'bg-red-500',
    icon: AlertOctagon,
    iconColor: 'text-red-500',
  },
  warning: {
    dot: 'bg-amber-500',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  info: {
    dot: 'bg-brand-500',
    icon: Info,
    iconColor: 'text-brand-500',
  },
};

function AlertRow({ alert }) {
  const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
  const Icon = style.icon;

  const rowContent = (
    <>
      <span className={`shrink-0 mt-1.5 w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" />
      <Icon className={`shrink-0 w-4 h-4 mt-0.5 ${style.iconColor}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{alert.title}</p>
        {alert.description && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{alert.description}</p>
        )}
      </div>
      {alert.href && (
        <ChevronRight className="shrink-0 w-4 h-4 text-slate-400" aria-hidden="true" />
      )}
    </>
  );

  const rowClasses =
    'flex items-start gap-3 px-3 py-2.5 rounded-xl transition';

  if (alert.href) {
    return (
      <Link
        to={alert.href}
        className={`${rowClasses} hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}
      >
        {rowContent}
      </Link>
    );
  }

  return <div className={rowClasses}>{rowContent}</div>;
}

export default function AlertsPanel({ alerts = [], maxVisible = 5, overflowHref = '/admin/approvals' }) {
  const totalCount = alerts.length;
  const visible = alerts.slice(0, maxVisible);
  const overflowCount = Math.max(0, totalCount - maxVisible);

  if (totalCount === 0) {
    return (
      <div className="bg-white p-5 rounded-2xl shadow-soft border border-slate-100 h-full flex flex-col">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Alertas</h3>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">Todo en orden.</p>
          <p className="text-xs text-slate-500 mt-0.5">No hay alertas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-2xl shadow-soft border border-slate-100 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800">Alertas</h3>
        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          {totalCount}
        </span>
      </div>
      <ul className="space-y-1 flex-1">
        {visible.map(alert => (
          <li key={alert.id}>
            <AlertRow alert={alert} />
          </li>
        ))}
      </ul>
      {overflowCount > 0 && (
        <Link
          to={overflowHref}
          className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          Ver todas ({totalCount})
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
