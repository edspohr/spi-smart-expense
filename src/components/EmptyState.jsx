import { Link } from 'react-router-dom';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  small = false,
  className = '',
}) {
  const sizes = small
    ? { wrap: 'py-6 px-4', icon: 'w-8 h-8', title: 'text-sm font-semibold', desc: 'text-xs' }
    : { wrap: 'py-10 px-6', icon: 'w-12 h-12', title: 'text-base font-semibold', desc: 'text-sm' };

  return (
    <div className={`flex flex-col items-center justify-center text-center ${sizes.wrap} ${className}`}>
      {Icon && <Icon className={`${sizes.icon} text-slate-300 mb-3`} aria-hidden="true" />}
      {title && <p className={`${sizes.title} text-slate-700`}>{title}</p>}
      {description && <p className={`${sizes.desc} text-slate-500 mt-1 max-w-md`}>{description}</p>}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link
              to={action.href}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 focus-ring transition"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 focus-ring transition"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
