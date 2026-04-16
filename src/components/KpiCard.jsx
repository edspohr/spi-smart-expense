import { forwardRef } from 'react';

const TONE_STYLES = {
  neutral: {
    border: 'border-l-slate-300',
    iconBg: 'bg-slate-100 text-slate-600',
    deltaText: 'text-slate-500',
  },
  positive: {
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100 text-emerald-600',
    deltaText: 'text-emerald-600',
  },
  warning: {
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-100 text-amber-600',
    deltaText: 'text-amber-600',
  },
  danger: {
    border: 'border-l-red-500',
    iconBg: 'bg-red-100 text-red-600',
    deltaText: 'text-red-600',
  },
};

const KpiCard = forwardRef(function KpiCard(
  { label, value, delta, tone = 'neutral', icon: Icon, onClick, ariaLabel },
  ref
) {
  const toneStyle = TONE_STYLES[tone] || TONE_STYLES.neutral;
  const baseClasses = `bg-white p-5 rounded-2xl shadow-soft border border-slate-100 border-l-4 ${toneStyle.border} flex flex-col justify-between h-full text-left transition`;
  const interactiveClasses = onClick
    ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2'
    : '';

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          {label}
        </h3>
        {Icon && (
          <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${toneStyle.iconBg}`}>
            <Icon className="w-4 h-4" />
          </span>
        )}
      </div>
      <div className="mt-3">
        {typeof value === 'string' || typeof value === 'number' ? (
          <p className="text-3xl font-extrabold text-slate-800 leading-tight">{value}</p>
        ) : (
          <div className="text-slate-800">{value}</div>
        )}
        {delta && (
          <p className={`mt-1 text-xs font-semibold ${toneStyle.deltaText}`}>{delta}</p>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || label}
        className={`${baseClasses} ${interactiveClasses}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div ref={ref} className={baseClasses}>
      {content}
    </div>
  );
});

export default KpiCard;
