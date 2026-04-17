import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatCurrency } from '../utils/format';

const VISIBLE_DEFAULT = 10;

function relativeDays(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(d);
  then.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 30) return `hace ${diffDays} días`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(diffDays / 365);
  return `hace ${years} año${years === 1 ? '' : 's'}`;
}

function renderMonthTotals(byCurrency) {
  const order = ['COP', 'USD', 'CLP'];
  const keys = [
    ...order.filter(c => byCurrency[c] !== undefined),
    ...Object.keys(byCurrency).filter(c => !order.includes(c)),
  ];
  if (keys.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-col leading-tight">
      {keys.map((c, i) => (
        <span key={c} className={i === 0 ? 'text-sm font-semibold text-slate-700' : 'text-[11px] text-slate-400'}>
          {formatCurrency(byCurrency[c], c)}
          <span className="text-[10px] font-normal ml-1 text-slate-400">{c}</span>
        </span>
      ))}
    </div>
  );
}

export default function TeamTable({ rows }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, VISIBLE_DEFAULT);
  const overflow = Math.max(0, rows.length - VISIBLE_DEFAULT);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Persona</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Última rendición</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Este mes</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-right">Rendiciones</th>
            <th className="px-5 py-3 w-8" aria-hidden="true" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visible.map(row => (
            <tr key={row.id} className="hover:bg-slate-50 transition">
              <td className="px-5 py-3">
                <Link
                  to={`/admin/users/${row.id}`}
                  className="block focus-ring rounded"
                  aria-label={`Ver detalles de ${row.displayName}`}
                >
                  <div className="text-sm font-semibold text-slate-800 truncate max-w-[280px]">{row.displayName || 'Sin nombre'}</div>
                  {row.email && <div className="text-xs text-slate-400 truncate max-w-[280px]">{row.email}</div>}
                </Link>
              </td>
              <td className="px-5 py-3 text-sm text-slate-500">{relativeDays(row.lastActivityDate)}</td>
              <td className="px-5 py-3">{renderMonthTotals(row.thisMonthByCurrency)}</td>
              <td className="px-5 py-3 text-right text-sm font-semibold text-slate-700">{row.count}</td>
              <td className="px-5 py-3 text-right">
                <Link
                  to={`/admin/users/${row.id}`}
                  className="inline-flex items-center justify-center p-1 rounded text-slate-300 hover:text-slate-600 focus-ring"
                  aria-label={`Abrir ${row.displayName}`}
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {overflow > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 focus-ring rounded px-2 py-1"
          >
            {expanded ? 'Mostrar solo los 10 más recientes' : `Ver todas (${rows.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
