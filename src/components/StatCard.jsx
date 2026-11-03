// Compact KPI tile for the admin dashboard: icon + label on one line, the
// value below, an optional one-line subtitle. Clickable when `onClick` is set.
export default function StatCard({
  label,
  icon: Icon,
  iconBgClass = 'bg-slate-50',
  iconColorClass = 'text-slate-600',
  value,
  subtitle,
  onClick,
  ariaLabel,
}) {
  const base = 'bg-white border border-slate-100 rounded-xl p-3 sm:p-4 transition h-full flex flex-col text-left min-w-0';
  const interactive = onClick ? 'cursor-pointer hover:shadow-sm hover:border-slate-200 focus-ring' : '';

  const body = (
    <>
      <div className="flex items-center gap-2 mb-2 min-w-0">
        {Icon && (
          <span className={`shrink-0 w-7 h-7 rounded-lg ${iconBgClass} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${iconColorClass}`} aria-hidden="true" />
          </span>
        )}
        <p className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide leading-tight line-clamp-2">
          {label}
        </p>
      </div>
      {typeof value === 'string' || typeof value === 'number' ? (
        <p className="text-lg sm:text-2xl font-bold text-slate-900 leading-tight truncate">{value}</p>
      ) : (
        <div className="text-slate-900 min-w-0">{value}</div>
      )}
      {subtitle && (
        <p className="text-xs text-slate-500 mt-auto pt-1 leading-snug line-clamp-2" title={typeof subtitle === 'string' ? subtitle : undefined}>{subtitle}</p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || label}
        className={`${base} ${interactive}`}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
