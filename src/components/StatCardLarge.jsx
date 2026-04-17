export default function StatCardLarge({
  label,
  icon: Icon,
  iconBgClass = 'bg-slate-50',
  iconColorClass = 'text-slate-600',
  value,
  subtitle,
  onClick,
  ariaLabel,
}) {
  const base = 'bg-white border border-slate-100 rounded-2xl p-6 transition hover:shadow-sm h-full flex flex-col text-left';
  const interactive = onClick ? 'cursor-pointer focus-ring' : '';

  const body = (
    <>
      <div className={`w-12 h-12 rounded-2xl ${iconBgClass} flex items-center justify-center mb-5`}>
        {Icon && <Icon className={`w-6 h-6 ${iconColorClass}`} aria-hidden="true" />}
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="mb-1">
        {typeof value === 'string' || typeof value === 'number' ? (
          <p className="text-3xl font-bold text-slate-900 leading-tight">{value}</p>
        ) : (
          <div className="text-slate-900">{value}</div>
        )}
      </div>
      {subtitle && (
        <p className="text-sm text-slate-500 mt-auto pt-2">{subtitle}</p>
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
