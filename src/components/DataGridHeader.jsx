import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export default function DataGridHeader({
  label,
  sortable = false,
  sortKey,
  sortState,
  onSortChange,
  className = '',
  align = 'left',
}) {
  const isActive = sortable && sortState?.key === sortKey;
  const dir = isActive ? sortState?.dir : null;

  const handleClick = () => {
    if (!sortable) return;
    if (!isActive) {
      onSortChange({ key: sortKey, dir: 'asc' });
    } else if (dir === 'asc') {
      onSortChange({ key: sortKey, dir: 'desc' });
    } else {
      onSortChange({ key: null, dir: null });
    }
  };

  const Icon = !isActive ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (!sortable) {
    return (
      <th scope="col" className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${alignClass} ${className}`}>
        {label}
      </th>
    );
  }

  return (
    <th scope="col" className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${alignClass} ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Ordenar por ${label}`}
        aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className="inline-flex items-center gap-1.5 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded transition"
      >
        <span>{label}</span>
        <Icon
          className={`w-3.5 h-3.5 transition ${isActive ? 'text-brand-600' : 'text-gray-300'}`}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}
