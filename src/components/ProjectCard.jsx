import { Link } from 'react-router-dom';
import { formatCurrency } from '../utils/format';

// Muted palette cycled deterministically by category name.
const COLOR_PALETTE = [
  'bg-brand-500', 'bg-slate-400', 'bg-brand-300',
  'bg-slate-600', 'bg-brand-700', 'bg-slate-300',
];

function colorForCategory(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

function renderTotals(totalByCurrency) {
  const order = ['COP', 'USD', 'CLP'];
  const keys = [
    ...order.filter(c => totalByCurrency[c] !== undefined),
    ...Object.keys(totalByCurrency).filter(c => !order.includes(c)),
  ];
  if (keys.length === 0) return <p className="text-3xl font-bold text-slate-300">—</p>;
  return (
    <div className="flex flex-col leading-tight">
      {keys.map((c, i) => (
        <span key={c} className={i === 0 ? 'text-3xl font-bold text-slate-900' : 'text-sm font-medium text-slate-400 mt-1'}>
          {formatCurrency(totalByCurrency[c], c)}
          <span className="text-xs font-normal ml-1 text-slate-400">{c}</span>
        </span>
      ))}
    </div>
  );
}

function relativeDays(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
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

export default function ProjectCard({
  title,
  subtitle,
  totalByCurrency,
  categories,
  lastActivityDate,
  href,
}) {
  const topCategories = categories.slice(0, 3);
  const overflowCount = Math.max(0, categories.length - 3);
  const relative = relativeDays(lastActivityDate);

  const content = (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 transition hover:shadow-sm hover:border-slate-200 h-full flex flex-col">
      <div className="mb-4">
        <h3 className="font-bold text-slate-900 text-lg leading-tight truncate" title={title}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-0.5 truncate" title={subtitle}>{subtitle}</p>
        )}
      </div>

      <div className="mb-4">
        {renderTotals(totalByCurrency)}
      </div>

      {categories.length > 0 ? (
        <>
          <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-100 mb-2">
            {categories.map(c => (
              <div
                key={c.name}
                className={`h-full ${colorForCategory(c.name)}`}
                style={{ width: `${c.pct}%` }}
                title={`${c.name}: ${c.pct.toFixed(0)}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium">
            {topCategories.map(c => (
              <span key={c.name} className="inline-flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${colorForCategory(c.name)}`} aria-hidden="true" />
                <span className="truncate max-w-[140px]">{c.name}</span>
                <span className="text-slate-400">{c.pct.toFixed(0)}%</span>
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="text-slate-400">+{overflowCount} más</span>
            )}
          </div>
        </>
      ) : (
        <div className="text-xs text-slate-400 italic">Sin desglose de categorías</div>
      )}

      <div className="mt-auto pt-4 text-xs text-slate-400 font-normal">
        {relative ? `Último gasto: ${relative}` : 'Sin actividad reciente'}
      </div>
    </div>
  );

  if (!href) return content;
  return (
    <Link
      to={href}
      className="block focus-ring rounded-2xl"
      aria-label={`Ver reportes de ${title}`}
    >
      {content}
    </Link>
  );
}
